from flask import Flask, render_template, request, redirect, url_for
from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, FileField, SubmitField
from wtforms.validators import DataRequired, Email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
import smtplib
import time
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'

class EmailForm(FlaskForm):
    sender = StringField('Sender', validators=[DataRequired(), Email()])
    subject = StringField('Subject', validators=[DataRequired()])
    recipients = TextAreaField('Recipients', validators=[DataRequired()])
    message = TextAreaField('Message', validators=[DataRequired()])
    image = FileField('Image')
    submit = SubmitField('Send')

def send_email(sender, subject, recipients, message, image_path):
    smtp_server = 'smtp.yourprovider.com'
    smtp_port = 587
    smtp_user = 'your_email@example.com'
    smtp_password = 'your_password'

    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()
    server.login(smtp_user, smtp_password)

    recipient_list = recipients.split(',')
    for i in range(0, len(recipient_list), 100):
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = ', '.join(recipient_list[i:i+100])
        msg['Subject'] = subject

        msg.attach(MIMEText(message, 'html'))

        if image_path:
            with open(image_path, 'rb') as img:
                msg.attach(MIMEImage(img.read()))

        server.sendmail(sender, recipient_list[i:i+100], msg.as_string())
        time.sleep(2)  # Small delay to avoid spamming the server

    server.quit()

@app.route('/', methods=['GET', 'POST'])
def index():
    form = EmailForm()
    if form.validate_on_submit():
        sender = form.sender.data
        subject = form.subject.data
        recipients = form.recipients.data
        message = form.message.data
        image = form.image.data
        image_path = None

        if image:
            image_path = os.path.join('static', image.filename)
            image.save(image_path)

        send_email(sender, subject, recipients, message, image_path)
        return redirect(url_for('success'))

    return render_template('index.html', form=form)

@app.route('/success')
def success():
    return 'Emails sent successfully!'

if __name__ == '__main__':
    app.run(debug=True)
