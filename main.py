from flask import Flask, request, render_template_string
import win32com.client as win32
import time

app = Flask(__name__)

@app.route('/')
def index():
    return render_template_string(open('index.html').read())

@app.route('/send_emails', methods=['POST'])
def send_emails():
    subject = request.form['subject']
    emails = request.form['emails'].split(',')
    message = request.form['message']
    
    chunk_size = 500
    outlook = win32.Dispatch('outlook.application')
    
    for i in range(0, len(emails), chunk_size):
        chunk = emails[i:i+chunk_size]
        mail = outlook.CreateItem(0)
        mail.Subject = subject
        mail.Body = message
        mail.To = ''
        mail.BCC = ';'.join(chunk)
        mail.Send()
        time.sleep(1)  # Pequena pausa para evitar problemas de desempenho

    return 'Emails enviados com sucesso!'

if __name__ == '__main__':
    app.run(debug=True)
