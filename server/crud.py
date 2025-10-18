from sqlalchemy.orm import Session
import models
import schemas
import auth
import random
import string

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
    return db.query(models.Meeting).offset(skip).limit(limit).all()


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

# --- ADD THIS FUNCTION ---
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
    # --- FIX: Use .model_dump() instead of .dict() ---
    db_participant = models.Participant(**participant.model_dump())
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

# --- ADD THIS FUNCTION ---
def update_participant(db: Session, participant_id: int, participant_update: schemas.ParticipantCreate):
    """Updates an existing participant."""
    db_participant = get_participant_by_id(db, participant_id)
    if not db_participant:
        return None

    # Using ParticipantCreate schema, assuming ParticipantUpdate is similar
    update_data = participant_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_participant, key, value)
        
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

# --- ADD THIS FUNCTION ---
def delete_participant(db: Session, participant_id: int):
    """Deletes a participant by their ID."""
    db_participant = get_participant_by_id(db, participant_id)
    if db_participant:
        db.delete(db_participant)
        db.commit()
    return db_participant