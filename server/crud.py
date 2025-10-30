# crud.py
from sqlalchemy.orm import Session, joinedload
import models
import schemas
import auth
import random
import string
import secrets
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from typing import List, Optional
import json
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError

TOKEN_EXPIRY_MINUTES = 60

# --- Helper: Get Customer by Slug (NEW) ---
def get_customer_by_slug(db: Session, url_slug: str):
    return db.query(models.Customer).filter(models.Customer.url_slug == url_slug).first()

# --- User CRUD (Customer-Scoped) ---

def get_user_by_email_and_customer(db: Session, customer_id: int, email: str):
    return db.query(models.User).filter(
        models.User.customer_id == customer_id, 
        models.User.email == email
    ).first()

def get_user_by_email(db: Session, email: str):
    # Used for global login (pre-auth), returns user object which contains customer_id
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    try:
        truncated_password = user.password[:72]
        hashed_password = auth.get_password_hash(truncated_password)
        db_user = models.User(
            customer_id=user.customer_id,
            email=user.email, 
            hashed_password=hashed_password, 
            full_name=user.full_name, 
            user_name=user.user_name,
            user_type='Member' # Default to Member, Admin set manually or via specific process
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise ValueError("User with this email or username already exists for this customer.")


def update_user(db: Session, user: models.User, update_data: schemas.UserUpdate):
    # The 'user' object is already scoped to the customer via get_current_user
    update_dict = update_data.model_dump(exclude_unset=True)
    
    for key, value in update_dict.items():
        setattr(user, key, value)
        
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def enrich_user_response(db: Session, user: models.User) -> schemas.User:
    # Use the customer getter which already eager-loads the license
    customer = get_customer_by_id(db, user.customer_id)
    
    enriched_user = schemas.User.model_validate(user)
    
    if customer:
        enriched_user.customer_slug = customer.url_slug
        
        # --- FIX: Set license_status ---
        if customer.license:
            # We must explicitly call the license check to update the status if expired
            is_active = check_license_active(db, user.customer_id) 
            
            # Re-fetch license data after potential update
            license_data = customer.license 
            
            enriched_user.license_status = license_data.status
        else:
            # Default behavior if no license record exists (should return "False" if active check is called)
            enriched_user.license_status = "NOT_LICENSED"
    
    return enriched_user


# --- Meeting CRUD (Customer-Scoped) ---

def get_meeting_by_id_and_customer(db: Session, customer_id: int, meeting_id: int):
    """Helper function to get a single meeting by its ID, scoped by customer."""
    return db.query(models.Meeting).filter(
        models.Meeting.customer_id == customer_id,
        models.Meeting.id == meeting_id
    ).first()

def is_participant_invited(db: Session, room_id_or_link: str, email: str) -> bool:
    """Checks if a user with the given email is a participant in the specified meeting."""
    meeting = db.query(models.Meeting).filter(models.Meeting.meeting_link == room_id_or_link).first()

    if not meeting:
        return False

    for participant in meeting.participants:
        if participant.email.lower() == email.lower():
            return True
    return False

def get_meetings(db: Session, customer_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Meeting).filter(models.Meeting.customer_id == customer_id).options(
        joinedload(models.Meeting.participants)
    ).order_by(models.Meeting.date_time.desc()).offset(skip).limit(limit).all()


def generate_room_id():
  """Generates a random room ID in the format CC-CCCC (uppercase letters)."""
  chars = string.ascii_uppercase 
  part1 = ''.join(random.choice(chars) for _ in range(2))
  part2 = ''.join(random.choice(chars) for _ in range(4))
  return f"{part1}-{part2}"


def create_meeting(db: Session, customer_id: int, meeting: schemas.MeetingCreate):
    config_json = json.dumps(meeting.config.model_dump(by_alias=True)) if meeting.config else None 
    
    db_meeting = models.Meeting(
        customer_id=customer_id,
        subject=meeting.subject,
        agenda=meeting.agenda,
        date_time=meeting.date_time,
        meeting_link=generate_room_id(),
        meeting_type=meeting.meeting_type,
        config_json=config_json
    )
    participants = db.query(models.Participant).filter(
        models.Participant.id.in_(meeting.participant_ids),
        models.Participant.customer_id == customer_id
    ).all()
    
    db_meeting.participants.extend(participants)
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def update_meeting(db: Session, customer_id: int, meeting_id: int, meeting_update: schemas.MeetingCreate):
    """Updates an existing meeting, scoped by customer."""
    db_meeting = get_meeting_by_id_and_customer(db, customer_id, meeting_id)
    if not db_meeting:
        return None

    update_data = meeting_update.model_dump(exclude_unset=True)
    config_json = json.dumps(meeting_update.config.model_dump(by_alias=True)) if meeting_update.config else None

    for key, value in update_data.items():
        if key == "participant_ids":
            participants = db.query(models.Participant).filter(
                models.Participant.id.in_(value),
                models.Participant.customer_id == customer_id
            ).all()
            db_meeting.participants = participants
        elif key == "config":
            db_meeting.config_json = config_json
        else:
            setattr(db_meeting, key, value)
            
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def delete_meeting(db: Session, customer_id: int, meeting_id: int):
    """Deletes a meeting by its ID, scoped by customer."""
    db_meeting = get_meeting_by_id_and_customer(db, customer_id, meeting_id)
    if db_meeting:
        db.delete(db_meeting)
        db_state = db.query(models.MeetingState).filter(models.MeetingState.room_id == db_meeting.meeting_link).first()
        if db_state: db.delete(db_state)
        db.commit()
    return db_meeting

# --- Participant CRUD (Customer-Scoped) ---
def get_participant_by_id_and_customer(db: Session, customer_id: int, participant_id: int):
    """Helper function to get a single participant by their ID, scoped by customer."""
    return db.query(models.Participant).filter(
        models.Participant.customer_id == customer_id,
        models.Participant.id == participant_id
    ).first()

def get_participants(db: Session, customer_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Participant).filter(models.Participant.customer_id == customer_id).offset(skip).limit(limit).all()

def create_participant(db: Session, customer_id: int, participant: schemas.ParticipantCreate):
    try:
        db_participant = models.Participant(
            customer_id=customer_id,
            **participant.model_dump()
        )
        db.add(db_participant)
        db.commit()
        db.refresh(db_participant)
        return db_participant
    except IntegrityError:
        db.rollback()
        raise ValueError("Participant with this email already exists for this customer.")

def update_participant(db: Session, customer_id: int, participant_id: int, participant_update: schemas.ParticipantCreate):
    """Updates an existing participant, scoped by customer."""
    db_participant = get_participant_by_id_and_customer(db, customer_id, participant_id)
    if not db_participant:
        return None

    update_data = participant_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_participant, key, value)
        
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

def delete_participant(db: Session, customer_id: int, participant_id: int):
    """Deletes a participant by their ID, scoped by customer."""
    db_participant = get_participant_by_id_and_customer(db, customer_id, participant_id)
    if db_participant:
        db.delete(db_participant)
        db.commit()
    return db_participant

# --- Bot Configuration CRUD (Customer-Scoped) ---

def get_bot_by_id_and_customer(db: Session, customer_id: int, bot_id: int):
    return db.query(models.BotConfig).filter(
        models.BotConfig.customer_id == customer_id,
        models.BotConfig.id == bot_id
    ).first()

def get_bot_configs(db: Session, customer_id: int):
    return db.query(models.BotConfig).filter(models.BotConfig.customer_id == customer_id).all()

def create_bot_config(db: Session, customer_id: int, bot: schemas.BotConfigCreate, user_id: int):
    try:
        db_bot = models.BotConfig(
            customer_id=customer_id,
            **bot.model_dump(),
            user_id=user_id,
            status="Offline",
        )
        db.add(db_bot)
        db.commit()
        db.refresh(db_bot)
        return db_bot
    except IntegrityError:
        db.rollback()
        raise ValueError("Bot with this name already exists for this customer.")

def update_bot_config(db: Session, customer_id: int, bot_id: int, bot_update: schemas.BotConfigUpdate):
    db_bot = get_bot_by_id_and_customer(db, customer_id, bot_id)
    if not db_bot:
        return None
        
    update_data = bot_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_bot, key, value)
        
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot

def delete_bot_config(db: Session, customer_id: int, bot_id: int):
    db_bot = get_bot_by_id_and_customer(db, customer_id, bot_id)
    if db_bot:
        db.delete(db_bot)
        db.commit()
    return db_bot

# --- Bot Activity CRUD & Meeting State CRUD (Existing Working Functions) ---
def get_bot_by_id(db: Session, bot_id: int):
    return db.query(models.BotConfig).filter(models.BotConfig.id == bot_id).first()

def get_bot_activities(db: Session, bot_id: int, skip: int = 0, limit: int = 10):
    return db.query(models.BotActivity).filter(models.BotActivity.bot_id == bot_id).order_by(models.BotActivity.timestamp.desc()).offset(skip).limit(limit).all()

def create_bot_activity(db: Session, activity: schemas.BotActivityCreate):
    db_activity = models.BotActivity(
        bot_id=activity.bot_id,
        activity_type=activity.activity_type,
        content=activity.content,
        task_status=activity.task_status
    )
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    return db_activity

def get_meeting_state(db: Session, room_id: str):
    return db.query(models.MeetingState).filter(models.MeetingState.room_id == room_id).first()

def create_or_update_meeting_state(db: Session, state: schemas.MeetingState):
    db_state = get_meeting_state(db, state.room_id)
    if db_state:
        if state.meeting_subject is not None:
             db_state.meeting_subject = state.meeting_subject
        if state.is_recording is not None:
             db_state.is_recording = state.is_recording
        if state.bot_id is not None:
             db_state.bot_id = state.bot_id
        db_state.last_active = state.last_active
    else:
        db_state = models.MeetingState(**state.model_dump())
        db.add(db_state)
        
    db.commit()
    db.refresh(db_state)
    return db_state

def create_chat_message(db: Session, room_id: str, message: schemas.ChatMessagePayload):
    message_data = message.model_dump(by_alias=True, exclude_none=True)
    attachments_json = None
    if message_data.get("attachments"):
        attachments_json = json.dumps([att for att in message_data["attachments"] if att.get("name")])
    
    db_message = models.ChatMessage(
        room_id=room_id,
        from_user=message_data["from"],
        to_user=message_data.get("to"),
        text_content=message_data.get("text"),
        attachments_json=attachments_json,
        client_id=message_data["id"],
        client_ts=message_data["ts"]
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def get_chat_history(db: Session, room_id: str, skip: int = 0, limit: int = 50) -> List[schemas.ChatMessagePayload]:
    db_messages = db.query(models.ChatMessage)\
        .filter(models.ChatMessage.room_id == room_id)\
        .order_by(desc(models.ChatMessage.timestamp))\
        .offset(skip)\
        .limit(limit)\
        .all()
        
    messages = []
    for db_msg in reversed(db_messages):
        attachments = []
        if db_msg.attachments_json:
            try:
                attachments = json.loads(db_msg.attachments_json)
            except json.JSONDecodeError:
                pass

        messages.append(schemas.ChatMessagePayload(
            id=db_msg.client_id,
            from_user=db_msg.from_user,
            text=db_msg.text_content,
            attachments=attachments,
            ts=db_msg.client_ts,
            to_user=db_msg.to_user
        ))
        
    return messages


# --- Password Reset Logic (Existing Working Functions) ---
def create_reset_token(db: Session, user_id: int):
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user_id
    ).delete()
    
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)

    db_token = models.PasswordResetToken(
        user_id=user_id,
        token=token,
        expires_at=expires_at
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token

def get_user_by_reset_token(db: Session, token: str):
    now = datetime.now(timezone.utc)
    db_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == token,
        models.PasswordResetToken.expires_at > now
    ).first()
    
    if db_token:
        return db_token.user
    return None

def invalidate_reset_token(db: Session, token: str):
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == token
    ).delete()
    db.commit()

def update_user_password(db: Session, user_id: int, new_password: str):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        truncated_password = new_password[:72]
        db_user.hashed_password = auth.get_password_hash(truncated_password)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return True
    return False

# --- Customer/Organization CRUD ---

def get_customer_by_id(db: Session, customer_id: int):
    return db.query(models.Customer).options(joinedload(models.Customer.license)).filter(models.Customer.id == customer_id).first()

def update_customer(db: Session, customer_id: int, customer_update: schemas.CustomerBase):
    db_customer = get_customer_by_id(db, customer_id)
    if not db_customer:
        return None
        
    update_data = customer_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_customer, key, value)
        
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

def delete_customer(db: Session, customer_id: int):
    db_customer = get_customer_by_id(db, customer_id)
    if db_customer:
        db.delete(db_customer)
        db.commit()
    return db_customer

# --- User Management for Admin ---

def get_all_users_by_customer(db: Session, customer_id: int):
    return db.query(models.User).filter(models.User.customer_id == customer_id).all()

def remove_user_by_id(db: Session, customer_id: int, user_id: int):
    db_user = db.query(models.User).filter(
        models.User.customer_id == customer_id,
        models.User.id == user_id
    ).first()
    
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user


# --- SuperAdmin-level CRUD (Global Scope) ---

def get_all_customers(db: Session):
    return db.query(models.Customer).options(joinedload(models.Customer.license)).all()

def update_user_globally(db: Session, user_id: int, update_data: schemas.SuperAdminUserUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
        
    update_dict = update_data.model_dump(exclude_unset=True)
    
    if 'user_type' in update_dict:
        db_user.user_type = update_dict['user_type']
        
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user_globally(db: Session, user_id: int):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user

def create_customer_globally(db: Session, customer: schemas.CustomerCreateAdmin):
    try:
        db_customer = models.Customer(
            name=customer.name,
            url_slug=customer.url_slug,
            logo_url=customer.logo_url,
            email_sender_name=customer.email_sender_name,
            default_meeting_name=customer.default_meeting_name
        )
        db.add(db_customer)
        db.commit()
        db.refresh(db_customer)
        return db_customer
    except IntegrityError:
        db.rollback()
        raise ValueError("Customer with this name or slug already exists.")


def update_customer_globally(db: Session, customer_id: int, customer_update: schemas.CustomerUpdateAdmin):
    return update_customer(db, customer_id, customer_update)

def delete_customer_globally(db: Session, customer_id: int):
    return delete_customer(db, customer_id)

def get_bots_by_customer_id_global(db: Session, customer_id: int):
    return db.query(models.BotConfig).filter(models.BotConfig.customer_id == customer_id).all()

def update_bot_status_by_id_global(db: Session, bot_id: int, new_status: str):
    db_bot = db.query(models.BotConfig).filter(models.BotConfig.id == bot_id).first()
    if db_bot:
        db_bot.status = new_status
        db.add(db_bot)
        db.commit()
        db.refresh(db_bot)
    return db_bot

def transfer_user_to_customer(db: Session, user_id: int, new_customer_id: int):
    """
    Transfers a user's customer_id and resets their role to 'Member'.
    """
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if not db_user:
        return None

    # 1. Update the user's foreign key
    db_user.customer_id = new_customer_id
    
    # 2. Reset the user's role to the lowest level (Member) in the new organization
    db_user.user_type = 'Member'
    
    # 3. Commit (IntegrityError will be raised if email conflict exists in main.py)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# --- License Management Functions ---

def calculate_expiry(start_date: datetime, value: int, unit: str) -> datetime:
    """Calculates the new expiry date based on the duration."""
    if unit == 'days':
        return start_date + timedelta(days=value)
    elif unit == 'months':
        return start_date + relativedelta(months=value)
    elif unit == 'years':
        return start_date + relativedelta(years=value)
    raise ValueError("Invalid duration unit.")

def get_license_by_customer(db: Session, customer_id: int) -> Optional[models.License]:
    return db.query(models.License).filter(models.License.customer_id == customer_id).first()

def create_or_update_license(db: Session, customer_id: int, user_id: int, license_data: schemas.LicenseBase):
    db_license = get_license_by_customer(db, customer_id)
    now = datetime.now(timezone.utc)
    
    if license_data.duration_unit == 'years':
        days_granted = license_data.duration_value * 365
    elif license_data.duration_unit == 'months':
        days_granted = license_data.duration_value * 30
    else:
        days_granted = license_data.duration_value

    new_expiry_date = calculate_expiry(now, license_data.duration_value, license_data.duration_unit)

    if db_license:
        db_license.status = license_data.status
        db_license.type = license_data.license_type
        db_license.expiry_date = new_expiry_date
        db_license.days_granted += days_granted
        db_license.updated_at = now
    else:
        db_license = models.License(
            customer_id=customer_id,
            license_key=secrets.token_urlsafe(64),
            status=license_data.status,
            type=license_data.license_type,
            start_date=now,
            expiry_date=new_expiry_date,
            days_granted=days_granted,
            created_by_user_id=user_id
        )
        db.add(db_license)

    db.commit()
    db.refresh(db_license)
    return db_license

def revoke_license(db: Session, customer_id: int):
    db_license = get_license_by_customer(db, customer_id)
    if db_license:
        db_license.status = 'Revoked'
        db_license.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_license)
    return db_license

def check_license_active(db: Session, customer_id: int) -> bool:
    """Checks if the customer's license is currently active and not expired, and updates status if necessary."""
    db_license = get_license_by_customer(db, customer_id)
    now = datetime.now(timezone.utc)
    
    if not db_license:
        return False 

    is_active_status = db_license.status == 'Active' or db_license.status == 'Trial'
    is_not_expired = db_license.expiry_date is None or db_license.expiry_date > now
    
    if (db_license.expiry_date and db_license.expiry_date <= now) and db_license.status != 'Expired':
        db_license.status = 'Expired'
        db.add(db_license)
        db.commit()
        return False 

    return is_active_status and is_not_expired

def log_superadmin_activity(db: Session, customer_id: int, activity_type: str, content: str):
    """Logs activity related to SuperAdmin actions."""
    print(f"[SUPERADMIN LOG] Customer {customer_id} ({activity_type}): {content}")
    pass
    
def get_license_requests(db: Session) -> List[schemas.SuperAdminActivityLog]:
    # Mocking retrieval of activity logs for the SuperAdmin UI
    return []