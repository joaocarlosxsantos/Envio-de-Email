from flask import Flask, request, render_template_string
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import threading

app = Flask(__name__)

HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Envio de E-mails</title>
</head>
<body>
    <form action="/send_emails" method="post" enctype="multipart/form-data">
        <label for="sender">Remetente:</label>
        <input type="email" id="sender" name="sender" required><br><br>
        
        <label for="subject">Assunto:</label>
        <input type="text" id="subject" name="subject" required><br><br>
        
        <label for="email_list">Lista de E-mails (separados por vírgula):</label><br>
        <textarea id="email_list" name="email_list" rows="10" cols="30" required></textarea><br><br>
        
        <label for="message">Mensagem:</label><br>
        <textarea id="message" name="message" rows="10" cols="30" required></textarea><br><br>
        
        <input type="submit" value="Enviar E-mails">
    </form>
    <div id="status"></div>
    
    <script>
        const form = document.querySelector('form');
        form.onsubmit = () => {
            document.getElementById('status').innerText = 'Enviando...';
        };
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

def send_email_chunk(sender, subject, email_list, message):
    try:
        server = smtplib.SMTP('smtp-mail.outlook.com', 587)
        server.starttls()
        server.login('joaocxs10@outlook.com', 'Jotafk@120')

        for i in range(0, len(email_list), 100):
            chunk = email_list[i:i + 100]
            msg = MIMEMultipart()
            msg['From'] = sender
            msg['Subject'] = subject
            msg.attach(MIMEText(message, 'html'))
            msg['Bcc'] = ', '.join(chunk)
            server.send_message(msg)
        
        server.quit()
    except Exception as e:
        print(f"Erro ao enviar e-mails: {e}")

@app.route('/send_emails', methods=['POST'])
def send_emails():
    sender = request.form['sender']
    subject = request.form['subject']
    email_list = request.form['email_list'].split(',')
    message = request.form['message']
    
    threading.Thread(target=send_email_chunk, args=(sender, subject, email_list, message)).start()
    
    return '<p>Todos os e-mails estão sendo enviados. Você receberá uma notificação quando o processo for concluído.</p>'

if __name__ == '__main__':
    app.run(debug=True)
