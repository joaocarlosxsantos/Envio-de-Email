const express = require('express');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.post('/send-emails', (req, res) => {
    const sender = req.body.sender;
    const subject = req.body.subject;
    const recipients = req.body.recipients.split(',');
    const message = req.body.message;

    const chunkSize = 100;
    let promises = [];

    for (let i = 0; i < recipients.length; i += chunkSize) {
        const chunk = recipients.slice(i, i + chunkSize);
        const msg = {
            to: chunk,
            from: sender,
            subject: subject,
            html: message,
            bcc: chunk,
        };

        promises.push(sgMail.send(msg));
    }

    Promise.all(promises)
        .then(() => {
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
