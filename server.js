const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração do multer para upload de arquivos
const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuração do nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true para 465, false para outras portas
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

app.post('/send-emails', upload.array('attachments'), (req, res) => {
    const sender = req.body.sender;
    const subject = req.body.subject;
    const recipients = req.body.recipients.split(',');
    const message = req.body.message;

    const chunkSize = 100;
    let promises = [];
    let attachments = req.files.map(file => {
        return {
            filename: file.originalname,
            path: file.path,
            contentType: file.mimetype
        };
    });

    for (let i = 0; i < recipients.length; i += chunkSize) {
        const chunk = recipients.slice(i, i + chunkSize);
        const mailOptions = {
            from: sender,
            to: chunk,
            subject: subject,
            html: message,
            bcc: chunk,
            attachments: attachments
        };

        promises.push(transporter.sendMail(mailOptions));
    }

    Promise.all(promises)
        .then(() => {
            // Remover arquivos temporários
            req.files.forEach(file => fs.unlinkSync(file.path));
            res.json({ message: 'E-mails enviados com sucesso!' });
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ message: 'Erro ao enviar e-mails.' });
        });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
