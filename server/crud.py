from sqlalchemy.orm import Session
import models
import schemas
import auth

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
def get_meetings(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Meeting).offset(skip).limit(limit).all()

def create_meeting(db: Session, meeting: schemas.MeetingCreate):
    db_meeting = models.Meeting(
        subject=meeting.subject,
        agenda=meeting.agenda,
        date_time=meeting.date_time,
        meeting_link=meeting.meeting_link
    )
    participants = db.query(models.Participant).filter(models.Participant.id.in_(meeting.participant_ids)).all()
    db_meeting.participants.extend(participants)
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

# --- Participant CRUD ---
def get_participants(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Participant).offset(skip).limit(limit).all()

def create_participant(db: Session, participant: schemas.ParticipantCreate):
    db_participant = models.Participant(**participant.dict())
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant