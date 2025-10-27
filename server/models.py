from sqlalchemy import BigInteger, Column, Integer, String, Text, DateTime, ForeignKey, Table, Boolean, func
from sqlalchemy.orm import relationship
from database import Base

meeting_participants = Table('meeting_participants', Base.metadata,
    Column('meeting_id', Integer, ForeignKey('meetings.id', ondelete="CASCADE"), primary_key=True),
    Column('participant_id', Integer, ForeignKey('participants.id', ondelete="CASCADE"), primary_key=True)
)

# --- NEW TABLE: Chat Transcripts ---
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=func.now())
    from_user = Column(String(255), nullable=False)
    to_user = Column(String(255), nullable=True)
    text_content = Column(Text, nullable=True)
    attachments_json = Column(Text, nullable=True)
    
    # CORRECTED: Ensure client_id is defined and unique
    client_id = Column(String(255), unique=True, nullable=False)
    client_ts = Column(BigInteger)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String)
    user_name = Column(String, unique=True, index=True, nullable=False)
    mobile = Column(String, nullable=True)
    picture = Column(Text, nullable=True)
    hashed_password = Column(String)
    provider = Column(String, default='local')
    provider_id = Column(String, unique=True, nullable=True)

    # Relationship to owned bot configurations
    bot_configs = relationship("BotConfig", back_populates="owner")

class Participant(Base):
    __tablename__ = "participants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    mobile = Column(String, nullable=True)

class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String, nullable=False)
    agenda = Column(Text, nullable=True)
    date_time = Column(DateTime(timezone=True), nullable=False)
    meeting_link = Column(String)
    participants = relationship("Participant", secondary=meeting_participants, backref="meetings")

# --- NEW TABLES FOR BOT MANAGEMENT ---

class BotConfig(Base):
    __tablename__ = "bot_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    pm_tool = Column(String(50), default="None", nullable=False) # e.g., 'ADO', 'monday', 'None'
    pm_tool_config = Column(Text) # Stores project ID/config JSON
    status = Column(String(50), default="Offline") # 'Ready', 'Attending', 'Offline'
    current_meeting_id = Column(String(255), nullable=True) # Room ID of the meeting it is currently attending
    current_meeting_subject = Column(String(255), nullable=True) # Meeting subject for easy lookup

    # Relationships
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE")) # Owner
    owner = relationship("User", back_populates="bot_configs")
    
    # Note: BotActivity and MeetingState rely on this model.

# NEW TABLE: Real-Time Meeting State
class MeetingState(Base):
    __tablename__ = "meeting_states"
    
    # The unique room link (e.g., CC-CCCC) is the primary key
    room_id = Column(String(255), primary_key=True, index=True) 
    
    meeting_subject = Column(String(255), nullable=True)
    is_recording = Column(Boolean, default=False)
    
    # Foreign key to the bot that is currently attending (ondelete SET NULL)
    bot_id = Column(Integer, ForeignKey("bot_configs.id", ondelete="SET NULL"), nullable=True)
    
    last_active = Column(DateTime(timezone=True), default=func.now())

# NEW TABLE: Bot Activity Logs (For BotDetail's Activity Log)
class BotActivity(Base):
    __tablename__ = "bot_activities"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bot_configs.id", ondelete="CASCADE"))
    timestamp = Column(DateTime(timezone=True), default=func.now())
    activity_type = Column(String(50), nullable=False) # 'transcript' or 'action'
    content = Column(Text, nullable=False)
    task_status = Column(String(50), nullable=True) # 'completed', 'commented', etc.