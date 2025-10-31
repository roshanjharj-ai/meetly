# models.py
from sqlalchemy import BigInteger, Column, Integer, String, Text, DateTime, ForeignKey, Table, Boolean, func, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base # Assuming database.py provides the Base class
from enum import Enum

meeting_participants = Table('meeting_participants', Base.metadata,
    Column('meeting_id', Integer, ForeignKey('meetings.id', ondelete="CASCADE"), primary_key=True),
    Column('participant_id', Integer, ForeignKey('participants.id', ondelete="CASCADE"), primary_key=True)
)

# --- NEW TABLE: Organization Licenses ---
class License(Base):
    __tablename__ = "licenses"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete="CASCADE"), unique=True, nullable=False)
    license_key = Column(String(128), unique=True, nullable=False)
    status = Column(String(20), default='Trial', nullable=False)
    type = Column(String(50), default='Standard', nullable=False)
    start_date = Column(DateTime(timezone=True), default=func.now())
    expiry_date = Column(DateTime(timezone=True), nullable=True)
    days_granted = Column(Integer, default=0)
    created_by_user_id = Column(Integer, ForeignKey('users.id', ondelete="SET NULL"))
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    customer = relationship("Customer", back_populates="license", uselist=False)
    creator = relationship("User", foreign_keys=[created_by_user_id])
    
# --- NEW TABLE: Password Reset Tokens ---
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False)
    token = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=func.now())
    
    user = relationship("User")


# --- Core Models with updated relationships ---

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    logo_url = Column(Text, nullable=True)
    email_sender_name = Column(String(255), default='System Bot')
    email_config_json = Column(Text, nullable=True)
    default_meeting_name = Column(String(255), default='Team Meeting')
    url_slug = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=func.now())

    # Relationships
    users = relationship("User", back_populates="customer")
    participants = relationship("Participant", back_populates="customer")
    meetings = relationship("Meeting", back_populates="customer")
    bot_configs = relationship("BotConfig", back_populates="customer")
    license = relationship("License", back_populates="customer", uselist=False)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=func.now())
    from_user = Column(String(255), nullable=False)
    to_user = Column(String(255), nullable=True)
    text_content = Column(Text, nullable=True)
    attachments_json = Column(Text, nullable=True)
    
    client_id = Column(String(255), unique=True, nullable=False)
    client_ts = Column(BigInteger)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete="CASCADE"), nullable=False)
    email = Column(String, index=True, nullable=False)
    full_name = Column(String)
    user_name = Column(String, index=True, nullable=False)
    mobile = Column(String, nullable=True)
    picture = Column(Text, nullable=True)
    hashed_password = Column(String)
    provider = Column(String, default='local')
    provider_id = Column(String, unique=True, nullable=True)
    user_type = Column(String(50), nullable=False, default='Member')

    # Relationships
    customer = relationship("Customer", back_populates="users")
    bot_configs = relationship("BotConfig", back_populates="owner")
    
    # Composite Unique Constraints
    __table_args__ = (
        UniqueConstraint('customer_id', 'email', name='uix_users_customer_email'),
        UniqueConstraint('customer_id', 'user_name', name='uix_users_customer_user_name'),
    )

class Participant(Base):
    __tablename__ = "participants"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, index=True, nullable=False)
    mobile = Column(String, nullable=True)
    
    # Relationships
    customer = relationship("Customer", back_populates="participants")
    
    # Composite Unique Constraint
    __table_args__ = (
        UniqueConstraint('customer_id', 'email', name='uix_participants_customer_email'),
    )


class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete="CASCADE"), nullable=False)
    subject = Column(String, nullable=False)
    agenda = Column(Text, nullable=True)
    date_time = Column(DateTime(timezone=True), nullable=False)
    meeting_link = Column(String)
    meeting_type = Column(String(50), default='Multi-Participant', nullable=False)
    config_json = Column(Text, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="meetings")
    participants = relationship("Participant", secondary=meeting_participants, backref="meetings")


class BotConfig(Base):
    __tablename__ = "bot_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    pm_tool = Column(String(50), default="None", nullable=False)
    pm_tool_config = Column(Text)
    status = Column(String(50), default="Offline")
    current_meeting_id = Column(String(255), nullable=True)
    current_meeting_subject = Column(String(255), nullable=True)

    # Relationships
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    owner = relationship("User", back_populates="bot_configs")
    customer = relationship("Customer", back_populates="bot_configs")
    
    # Composite Unique Constraint
    __table_args__ = (
        UniqueConstraint('customer_id', 'name', name='uix_bot_configs_customer_name'),
    )

class MeetingState(Base):
    __tablename__ = "meeting_states"
    
    room_id = Column(String(255), primary_key=True, index=True) 
    
    meeting_subject = Column(String(255), nullable=True)
    is_recording = Column(Boolean, default=False)
    
    bot_id = Column(Integer, ForeignKey("bot_configs.id", ondelete="SET NULL"), nullable=True)
    
    last_active = Column(DateTime(timezone=True), default=func.now())

class BotActivity(Base):
    __tablename__ = "bot_activities"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bot_configs.id", ondelete="CASCADE"))
    timestamp = Column(DateTime(timezone=True), default=func.now())
    activity_type = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    task_status = Column(String(50), nullable=True)
    

class MeetingStatusEnum(str, Enum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    SCHEDULED = "SCHEDULED"