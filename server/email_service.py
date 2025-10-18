# email_service.py
import smtplib
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv
import asyncio  # <-- Import asyncio

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME") 
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD") # Your 16-character App Password

def _send_email_sync(recipient_email: str, code: str, room: str):
    """
    Synchronous (blocking) function to be run in a separate thread.
    """
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("⚠️ SMTP credentials not configured.")
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
        server.starttls() 
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_USERNAME, recipient_email, msg.as_string())
        server.quit()
        print(f"✅ Verification email sent to {recipient_email} for room {room}")
    except Exception as e:
        print(f"❌ Failed to send email to {recipient_email}: {e}")
        raise e # Re-raise exception to be caught by the async wrapper

async def send_verification_email(recipient_email: str, code: str, room: str):
    """
    Asynchronous wrapper that runs the blocking email code in a thread.
    """
    print(f"Attempting to send email to {recipient_email}...")
    try:
        # Use asyncio.to_thread to run the blocking function
        await asyncio.to_thread(
            _send_email_sync,
            recipient_email,
            code,
            room
        )
    except Exception as e:
        # Catch any exceptions from the thread
        print(f"❌ Email sending thread failed: {e}")