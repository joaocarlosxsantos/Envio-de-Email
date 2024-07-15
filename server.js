const http = require('http');
const url = require('url');
const fs = require('fs');
const nodemailer = require('nodemailer');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        fs.readFile('index.html', (err, data) => {
            if (err) {
                res.writeHead(500, {'Content-Type': 'text/plain'});
                res.end('Internal Server Error');
                return;
            }
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(data);
        });
    } else if (req.method === 'POST' && req.url === '/send_emails') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            const { from, subject, emails, message } = JSON.parse(body);
            const emailList = emails.split(',').map(email => email.trim());
            let batchCount = Math.ceil(emailList.length / 100);

            const transporter = nodemailer.createTransport({
                service: 'Outlook',
                auth: {
                    user: 'joaocxs10@outlook.com',
                    pass: 'Jotafk@120'
                }
            });

            (async function sendEmails() {
                for (let i = 0; i < batchCount; i++) {
                    let batch = emailList.slice(i * 100, (i + 1) * 100);
                    let mailOptions = {
                        from: from,
                        to: '',
                        bcc: batch.join(','),
                        subject: subject,
                        html: message
                    };

                    try {
                        await transporter.sendMail(mailOptions);
                    } catch (error) {
                        res.writeHead(500, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify({ success: false, error: error.message }));
                        return;
                    }
                }

                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ success: true }));
            })();
        });
    } else {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Not Found');
    }
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
