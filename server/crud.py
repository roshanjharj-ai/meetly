from sqlalchemy.orm import Session, joinedload
import models
import schemas
import auth
import random
import string
from typing import List, Optional
import json
from sqlalchemy import desc

# --- User CRUD ---
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    truncated_password = user.password[:72]
    print("Truncated Password:", truncated_password)
    hashed_password = auth.get_password_hash(truncated_password)
    db_user = models.User(email=user.email, hashed_password=hashed_password, full_name=user.full_name, user_name=user.user_name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user(db: Session, user: models.User, update_data: schemas.UserUpdate):
    # Get the update data as a dictionary, excluding unset values
    update_dict = update_data.model_dump(exclude_unset=True)
    
    # Update the user object with new values
    for key, value in update_dict.items():
        setattr(user, key, value)
        
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def create_oauth_user(db: Session, user: schemas.UserBase, provider: str, provider_id: str):
    db_user = models.User(email=user.email, full_name=user.full_name, provider=provider, provider_id=provider_id)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Meeting CRUD ---

def is_participant_invited(db: Session, room_id_or_link: str, email: str) -> bool:
    """Checks if a user with the given email is a participant in the specified meeting."""
    # Try finding the meeting by ID first, then by link if ID fails or isn't numeric
    meeting = None
    try:
        meeting = db.query(models.Meeting).filter(models.Meeting.meeting_link == room_id_or_link).first()
    except ValueError:
        pass # Not a valid integer ID

    if not meeting:
        # Fallback to checking by meeting_link if ID search failed
        meeting = db.query(models.Meeting).filter(models.Meeting.meeting_link == room_id_or_link).first()

    if not meeting:
        print(f"Meeting not found for room identifier: {room_id_or_link}")
        return False

    # Check if any participant in the meeting has the matching email
    for participant in meeting.participants:
        if participant.email.lower() == email.lower():
            return True

    print(f"User {email} not found in participants for meeting {room_id_or_link}")
    return False

def get_meetings(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Meeting).options(joinedload(models.Meeting.participants)).offset(skip).limit(limit).all()


def generate_room_id():
  """Generates a random room ID in the format CC-CCCC (uppercase letters)."""
  
  # Define the character set (uppercase letters)
  chars = string.ascii_uppercase 
  
  # Generate the first part (2 letters)
  part1 = ''.join(random.choice(chars) for _ in range(2))
  
  # Generate the second part (4 letters)
  part2 = ''.join(random.choice(chars) for _ in range(4))
  
  # Combine with a hyphen
  room_id = f"{part1}-{part2}"
  
  return room_id


def get_meeting_by_id(db: Session, meeting_id: int):
    """Helper function to get a single meeting by its ID."""
    return db.query(models.Meeting).filter(models.Meeting.id == meeting_id).first()


def create_meeting(db: Session, meeting: schemas.MeetingCreate):
    db_meeting = models.Meeting(
        subject=meeting.subject,
        agenda=meeting.agenda,
        date_time=meeting.date_time,
        meeting_link=generate_room_id()
    )
    participants = db.query(models.Participant).filter(models.Participant.id.in_(meeting.participant_ids)).all()
    db_meeting.participants.extend(participants)
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def update_meeting(db: Session, meeting_id: int, meeting_update: schemas.MeetingCreate):
    """Updates an existing meeting."""
    db_meeting = get_meeting_by_id(db, meeting_id)
    if not db_meeting:
        return None

    # Get update data from the pydantic model
    update_data = meeting_update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        if key == "participant_ids":
            # Special handling to update the participant relationships
            participants = db.query(models.Participant).filter(models.Participant.id.in_(value)).all()
            db_meeting.participants = participants
        else:
            setattr(db_meeting, key, value)
            
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def delete_meeting(db: Session, meeting_id: int):
    """Deletes a meeting by its ID."""
    db_meeting = get_meeting_by_id(db, meeting_id)
    if db_meeting:
        db.delete(db_meeting)
        db.commit()
    return db_meeting

# --- Participant CRUD ---
def get_participant_by_id(db: Session, participant_id: int):
    """Helper function to get a single participant by their ID."""
    return db.query(models.Participant).filter(models.Participant.id == participant_id).first()


def get_participants(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Participant).offset(skip).limit(limit).all()

def create_participant(db: Session, participant: schemas.ParticipantCreate):
    db_participant = models.Participant(**participant.model_dump())
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

def update_participant(db: Session, participant_id: int, participant_update: schemas.ParticipantCreate):
    """Updates an existing participant."""
    db_participant = get_participant_by_id(db, participant_id)
    if not db_participant:
        return None

    update_data = participant_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_participant, key, value)
        
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

def delete_participant(db: Session, participant_id: int):
    """Deletes a participant by their ID."""
    db_participant = get_participant_by_id(db, participant_id)
    if db_participant:
        db.delete(db_participant)
        db.commit()
    return db_participant

# --- Bot Configuration CRUD ---

def get_bot_by_id(db: Session, bot_id: int):
    return db.query(models.BotConfig).filter(models.BotConfig.id == bot_id).first()

def get_bot_configs(db: Session):
    return db.query(models.BotConfig).all()

def create_bot_config(db: Session, bot: schemas.BotConfigCreate, user_id: int):
    db_bot = models.BotConfig(
        **bot.model_dump(),
        user_id=user_id,
        status="Offline", # Default status
    )
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot

def update_bot_config(db: Session, bot_id: int, bot_update: schemas.BotConfigUpdate):
    db_bot = get_bot_by_id(db, bot_id)
    if not db_bot:
        return None
        
    update_data = bot_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_bot, key, value)
        
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot

def delete_bot_config(db: Session, bot_id: int):
    db_bot = get_bot_by_id(db, bot_id)
    if db_bot:
        db.delete(db_bot)
        db.commit()
    return db_bot

# --- Bot Activity CRUD ---
def get_bot_activities(db: Session, bot_id: int, skip: int = 0, limit: int = 10):
    """Retrieves the most recent activities for a specific bot."""
    return db.query(models.BotActivity).filter(models.BotActivity.bot_id == bot_id).order_by(models.BotActivity.timestamp.desc()).offset(skip).limit(limit).all()

def create_bot_activity(db: Session, activity: schemas.BotActivityCreate):
    """Creates a new activity log for a bot."""
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

# --- Meeting State CRUD ---
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

# --- NEW: Chat Message CRUD ---

def create_chat_message(db: Session, room_id: str, message: schemas.ChatMessagePayload):
    """Saves a chat message to the database."""
    
    # Extract data from Pydantic model, handling aliases and attachments
    message_data = message.model_dump(by_alias=True, exclude_none=True)
    
    # Handle attachments: convert list of AttachmentPayloads to JSON string
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
    """Retrieves chat history for a room, ordered by timestamp."""
    
    db_messages = db.query(models.ChatMessage)\
        .filter(models.ChatMessage.room_id == room_id)\
        .order_by(desc(models.ChatMessage.timestamp))\
        .offset(skip)\
        .limit(limit)\
        .all()
        
    # Reverse the order to show oldest first (like a chat) and convert to ChatMessagePayload schema
    messages = []
    for db_msg in reversed(db_messages):
        # Convert DB model back to client payload schema
        attachments = []
        if db_msg.attachments_json:
            try:
                # Assuming attachments_json stores the list of AttachmentPayloads as JSON
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