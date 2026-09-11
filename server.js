'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Carrega variáveis do .env manualmente (sem dependência extra / sem precisar
// de acesso à internet para instalar pacotes). Formato simples KEY=VALUE.
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}
loadEnvFile(path.join(__dirname, '.env'));

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const HOSTNAME = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '3000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '90', 10);
const BATCH_DELAY_MS = parseInt(process.env.BATCH_DELAY_MS || '1500', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8'
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Transporte de e-mail
// ---------------------------------------------------------------------------
function createTransporter() {
    if (process.env.EMAIL_TRANSPORT === 'json') {
        // Modo de teste: não envia de verdade, só "simula" (usado em testes locais)
        return nodemailer.createTransport({ jsonTransport: true });
    }

    if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }

    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'Outlook',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

// ---------------------------------------------------------------------------
// Utilitários de e-mail
// ---------------------------------------------------------------------------
function parseEmailList(raw) {
    const tokens = String(raw)
        .split(/[,;\n\r]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const seen = new Set();
    const valid = [];
    const invalid = [];

    for (const token of tokens) {
        const key = token.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (EMAIL_REGEX.test(token)) {
            valid.push(token);
        } else {
            invalid.push(token);
        }
    }

    return { valid, invalid };
}

// Evita "spoofing": o endereço autenticado (EMAIL_USER) é sempre o remetente
// real; se o usuário digitar "Nome <email>" mantemos o nome de exibição.
function resolveFrom(inputFrom) {
    const envUser = process.env.EMAIL_USER || '';
    if (!inputFrom) return envUser;

    const match = String(inputFrom).match(/^(.*)<(.+)>\s*$/);
    if (match) {
        const displayName = match[1].trim().replace(/"/g, '');
        return displayName ? `"${displayName}" <${envUser}>` : envUser;
    }

    if (EMAIL_REGEX.test(inputFrom) && inputFrom.trim().toLowerCase() !== envUser.toLowerCase()) {
        // Endereço diferente do autenticado: provedores rejeitariam por
        // spoofing, então usamos o nome digitado como "display name".
        return `"${inputFrom.split('@')[0]}" <${envUser}>`;
    }

    return inputFrom;
}

// ---------------------------------------------------------------------------
// Arquivos estáticos
// ---------------------------------------------------------------------------
function serveStatic(req, res) {
    const reqPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const safeSuffix = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safeSuffix);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

// ---------------------------------------------------------------------------
// Envio de e-mails (streaming de progresso em NDJSON)
// ---------------------------------------------------------------------------
function handleSendEmails(req, res) {
    let body = '';
    let tooLarge = false;
    const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15MB de folga para listas grandes

    req.on('data', (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
            tooLarge = true;
            req.destroy();
        }
    });

    req.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao ler a requisição.' }));
        }
    });

    req.on('end', async () => {
        if (tooLarge) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Lista de e-mails muito grande.' }));
            return;
        }

        let payload;
        try {
            payload = JSON.parse(body);
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'JSON inválido enviado ao servidor.' }));
            return;
        }

        const { from, subject, emails, message } = payload || {};

        if (!subject || !emails || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Preencha assunto, lista de e-mails e mensagem.' }));
            return;
        }

        const isTestMode = process.env.EMAIL_TRANSPORT === 'json';
        if (!isTestMode && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Credenciais de e-mail não configuradas no servidor. Configure EMAIL_USER e EMAIL_PASS no arquivo .env.'
            }));
            return;
        }

        const { valid, invalid } = parseEmailList(emails);

        if (valid.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Nenhum e-mail válido foi encontrado na lista.' }));
            return;
        }

        const totalBatches = Math.ceil(valid.length / BATCH_SIZE);
        const fromAddress = resolveFrom(from);
        let transporter;

        try {
            transporter = createTransporter();
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao configurar o serviço de e-mail: ' + err.message }));
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        });

        res.write(JSON.stringify({
            type: 'start',
            total: valid.length,
            totalBatches,
            invalidCount: invalid.length,
            invalidSample: invalid.slice(0, 5)
        }) + '\n');

        let sentCount = 0;

        for (let i = 0; i < totalBatches; i++) {
            const batch = valid.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

            try {
                await transporter.sendMail({
                    from: fromAddress,
                    to: fromAddress,
                    bcc: batch.join(','),
                    subject,
                    html: message
                });
                sentCount += batch.length;
                res.write(JSON.stringify({
                    type: 'progress',
                    batch: i + 1,
                    totalBatches,
                    sent: sentCount,
                    total: valid.length
                }) + '\n');
            } catch (error) {
                res.write(JSON.stringify({
                    type: 'error',
                    message: error.message,
                    sentBeforeError: sentCount
                }) + '\n');
                res.end();
                return;
            }

            if (i < totalBatches - 1 && BATCH_DELAY_MS > 0) {
                await sleep(BATCH_DELAY_MS);
            }
        }

        res.write(JSON.stringify({
            type: 'done',
            success: true,
            sent: sentCount,
            invalidCount: invalid.length
        }) + '\n');
        res.end();
    });
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
    try {
        if (req.method === 'POST' && req.url === '/send_emails') {
            handleSendEmails(req, res);
            return;
        }

        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, testMode: process.env.EMAIL_TRANSPORT === 'json' }));
            return;
        }

        if (req.method === 'GET') {
            serveStatic(req, res);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    } catch (err) {
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Erro interno no servidor.' }));
        } else {
            res.end();
        }
    }
});

server.listen(PORT, HOSTNAME, () => {
    console.log(`Servidor rodando em http://${HOSTNAME}:${PORT}/`);
    if (process.env.EMAIL_TRANSPORT === 'json') {
        console.log('Modo de teste ativo (EMAIL_TRANSPORT=json): nenhum e-mail real será enviado.');
    } else if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('Aviso: EMAIL_USER/EMAIL_PASS não configurados no .env — o envio real vai falhar até isso ser definido.');
    }
});
