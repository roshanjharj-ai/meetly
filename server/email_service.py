# email_service.py
import smtplib
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv
import asyncio
import urllib.parse  # <-- NEW: For encoding URL parameters
from typing import List # <-- NEW: For type hinting

load_dotenv()

# --- Existing Config ---
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME") 
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD") # Your 16-character App Password

# --- NEW Config ---
# Add this to your .env file, e.g., FRONTEND_BASE_URL=http://localhost:5173
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")


# --- Existing Verification Email Function (Sync) ---
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
        raise e

# --- Existing Verification Email Function (Async) ---
async def send_verification_email(recipient_email: str, code: str, room: str):
    """
    Asynchronous wrapper that runs the blocking email code in a thread.
    """
    print(f"Attempting to send verification email to {recipient_email}...")
    try:
        await asyncio.to_thread(
            _send_email_sync,
            recipient_email,
            code,
            room
        )
    except Exception as e:
        print(f"❌ Email sending thread failed: {e}")


# --- NEW: Sign-up Acknowledgment Function (Sync) ---
def _send_signup_email_sync(recipient_email: str, user_id: str, user_name: str):
    """
    Synchronous (blocking) function for sending a welcome email.
    """
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("⚠️ SMTP credentials not configured.")
        return

    subject = "Welcome to AI Meeting Bot!"
    body = f"""
    Hello {user_name},
    
    Welcome! Your account has been successfully created.
    
    You can now log in using your email:
    Email: {recipient_email}
    
    Your User ID for reference is: {user_id}
    
    We're excited to have you on board!
    
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
        print(f"✅ Welcome email sent to {recipient_email}")
    except Exception as e:
        print(f"❌ Failed to send welcome email to {recipient_email}: {e}")
        raise e

# --- NEW: Sign-up Acknowledgment Function (Async) ---
async def send_signup_email(recipient_email: str, user_id: str, user_name: str):
    """
    Asynchronous wrapper for sending a welcome email.
    """
    print(f"Attempting to send signup email to {recipient_email}...")
    try:
        await asyncio.to_thread(
            _send_signup_email_sync,
            recipient_email,
            user_id,
            user_name
        )
    except Exception as e:
        print(f"❌ Signup email sending thread failed: {e}")


# --- NEW: Meeting Invitation Function (Sync) ---
def _send_meeting_invite_sync(
    recipient_email: str, 
    recipient_name: str, 
    room_name: str, 
    meeting_time: str, 
    participants: List[str]
):
    """
    Synchronous (blocking) function for sending a meeting invitation.
    """
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("⚠️ SMTP credentials not configured.")
        return

    # 1. Generate the unique join link
    params = {
        "email": recipient_email,
        "user": recipient_name,
        "room": room_name
    }
    query_string = urllib.parse.urlencode(params)
    join_link = f"{FRONTEND_BASE_URL}/prejoin?{query_string}"

    # 2. Format participant list
    participants_str = ", ".join(participants)

    # 3. Create email content (HTML for a clickable link)
    subject = f"Invitation: AI Meeting - {room_name}"
    body = f"""
    <html>
    <head></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hello {recipient_name},</p>
        <p>You have been invited to join a meeting:</p>
        <table style="border: none; margin-left: 20px;">
            <tr>
                <td style="padding: 5px 10px 5px 0;"><strong>Room:</strong></td>
                <td style="padding: 5px 0;">{room_name}</td>
            </tr>
            <tr>
                <td style="padding: 5px 10px 5px 0;"><strong>Time:</strong></td>
                <td style="padding: 5px 0;">{meeting_time}</td>
            </tr>
            <tr>
                <td style="padding: 5px 10px 5px 0; vertical-align: top;"><strong>Participants:</strong></td>
                <td style="padding: 5px 0;">{participants_str}</td>
            </tr>
        </table>
        
        <p style="margin-top: 20px;">
            <a href="{join_link}" 
               style="background-color: #007bff; color: #ffffff; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
               Click Here to Join Meeting
            </a>
        </p>
        
        <p style="margin-top: 15px; font-size: 0.9em; color: #555;">
            Or copy and paste this link into your browser:
            <br>
            <code>{join_link}</code>
        </p>
        
        <p>Thanks,<br>AI Meeting Bot</p>
    </body>
    </html>
    """

    # We use 'html' as the subtype for MIMEText
    msg = MIMEText(body, 'html') 
    msg['Subject'] = subject
    msg['From'] = SMTP_USERNAME
    msg['To'] = recipient_email

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_USERNAME, recipient_email, msg.as_string())
        server.quit()
        print(f"✅ Meeting invite sent to {recipient_email} for room {room_name}")
    except Exception as e:
        print(f"❌ Failed to send meeting invite to {recipient_email}: {e}")
        raise e

# --- NEW: Meeting Invitation Function (Async) ---
async def send_meeting_invite(
    recipient_email: str, 
    recipient_name: str, 
    room_name: str, 
    meeting_time: str, 
    participants: List[str]
):
    """
    Asynchronous wrapper for sending a meeting invitation.
    """
    print(f"Attempting to send meeting invite to {recipient_email}...")
    try:
        await asyncio.to_thread(
            _send_meeting_invite_sync,
            recipient_email,
            recipient_name,
            room_name,
            meeting_time,
            participants
        )
    except Exception as e:
        print(f"❌ Meeting invite sending thread failed: {e}")