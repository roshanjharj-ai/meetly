# email_service.py
import smtplib
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME") # Your email address
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD") # Your App Password or email password

async def send_verification_email(recipient_email: str, code: str, room: str):
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("⚠️ SMTP credentials not configured. Cannot send email.")
        # In a real app, raise an exception or handle this more robustly
        return

    subject = f"Your Verification Code for Meeting Room: {room}"
    body = f"""
    Hello,

    Your verification code to join the meeting room '{room}' is:

    {code}

    This code is valid for 10 minutes.

    If you did not request this, please ignore this email.

    Thanks,
    AI Meeting Bot
    """

    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = SMTP_USERNAME
    msg['To'] = recipient_email

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls() # Secure the connection
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_USERNAME, recipient_email, msg.as_string())
        server.quit()
        print(f"✅ Verification email sent to {recipient_email} for room {room}")
    except Exception as e:
        print(f"❌ Failed to send email to {recipient_email}: {e}")
        # Consider raising an exception here to signal failure