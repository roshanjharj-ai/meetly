from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from database import Base

meeting_participants = Table('meeting_participants', Base.metadata,
    Column('meeting_id', Integer, ForeignKey('meetings.id', ondelete="CASCADE"), primary_key=True),
    Column('participant_id', Integer, ForeignKey('participants.id', ondelete="CASCADE"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String)
    user_name = Column(String, unique=True, index=True, nullable=False)
    mobile = Column(String, nullable=True) # Added from previous migration    
    # **FIX**: Change String to Text for the picture column
    picture = Column(Text, nullable=True)
    hashed_password = Column(String)
    provider = Column(String, default='local')
    provider_id = Column(String, unique=True, nullable=True)

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