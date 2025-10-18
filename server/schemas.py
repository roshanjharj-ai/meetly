from pydantic import BaseModel, EmailStr,Field
from typing import List, Optional
from datetime import datetime


class ValidateJoinRequest(BaseModel):
    email: EmailStr
    room: str
    user_name: Optional[str] = None
    
class ValidateJoinResponse(BaseModel):
    message: str
    # We don't send the code back, it goes via email

class VerifyCodeRequest(BaseModel):
    email: EmailStr
    room: str
    code: str = Field(..., min_length=6, max_length=6) # Basic validation

class VerifyCodeResponse(BaseModel):
    valid: bool
    message: str
    token: Optional[str] = None

# --- Participant Schemas ---
class ParticipantBase(BaseModel):
    name: str
    email: EmailStr
    mobile: Optional[str] = None

class ParticipantCreate(ParticipantBase):
    pass

class Participant(ParticipantBase):
    id: int
    class Config:
        orm_mode = True

# --- Meeting Schemas ---
class MeetingBase(BaseModel):
    subject: str
    agenda: Optional[str] = None
    date_time: datetime
    meeting_link: Optional[str] = None

class MeetingCreate(MeetingBase):
    participant_ids: List[int] = []

class Meeting(MeetingBase):
    id: int
    participants: List[Participant] = []
    class Config:
        orm_mode = True
        
# --- User & Auth Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    user_name: Optional[str] = None
    mobile: Optional[str] = None
    picture: Optional[str] = None

class UserCreate(UserBase):
    password: str
    user_name: str

class User(UserBase):
    id: int
    provider: str
    user_name: Optional[str] = None
    mobile: Optional[str] = None  # Add new field
    picture: Optional[str] = None # Add new field
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None