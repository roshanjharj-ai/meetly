from pydantic import BaseModel, EmailStr,Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class ValidateJoinRequest(BaseModel):
    email: EmailStr
    room: str
    user_name: Optional[str] = None
    
class ValidateJoinResponse(BaseModel):
    message: str

class VerifyCodeRequest(BaseModel):
    email: EmailStr
    room: str
    code: str = Field(..., min_length=6, max_length=6)

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
        from_attributes = True

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
        from_attributes = True

# --- NEW: Chat Message Schemas ---
class AttachmentPayload(BaseModel):
    name: str
    dataUrl: Optional[str] = None # For sending, optional when retrieving history
    url: Optional[str] = None # For retrieval, the stored URL

class ChatMessagePayload(BaseModel):
    # This is the client-side/WS payload
    id: str # Client-generated ID (for deduplication/keying)
    from_user: str = Field(alias="from")
    text: Optional[str] = None
    attachments: Optional[List[AttachmentPayload]] = None
    ts: int # Client timestamp (ms)
    
    # New: Target for private chat. 'Group' or user_id.
    to_user: Optional[str] = Field(None, alias="to") 
    
    class Config:
        from_attributes = True
        populate_by_name = True

class ChatMessageDB(ChatMessagePayload):
    # This is the server-side/DB model
    db_id: Optional[int] = Field(None, alias="id") # Database ID
    room_id: str
    timestamp: datetime # Database timestamp
    
    class Config:
        from_attributes = True
        populate_by_name = True
        
# --- BOT Schemas ---
class BotConfigBase(BaseModel):
    name: str
    description: Optional[str] = None
    pm_tool: str = "None"
    pm_tool_config: Optional[str] = None

class BotConfigCreate(BotConfigBase):
    pass
    
class BotConfigUpdate(BotConfigBase):
    pass

class BotConfig(BotConfigBase):
    id: int
    status: str = "Offline"
    current_meeting_id: Optional[str] = None
    current_meeting_subject: Optional[str] = None
    recent_completion_rate: float = 0.0
    tasks_completed_last_week: int = 0

    class Config:
        from_attributes = True

class BotActivityCreate(BaseModel):
    bot_id: int
    activity_type: str
    content: str
    task_status: Optional[str] = None

class BotActivity(BaseModel):
    timestamp: datetime
    activity_type: str
    content: str
    task_status: Optional[str] = None
    
    class Config:
        from_attributes = True
        
class BotGraphMetrics(BaseModel):
    total_runs: int
    step_visits: List[Dict[str, Any]]
    step_status: Dict[str, int]
    
class BotPerformance(BaseModel):
    total_meetings: int
    avg_duration_minutes: float
    tasks_completed: int
    tasks_commented: int
    completion_rate: float
    metrics: List[Dict[str, Any]]
    task_breakdown: Dict[str, int]
    graph_metrics: BotGraphMetrics
    
    class Config:
        from_attributes = True

# --- Meeting State (Live Data) ---
class MeetingState(BaseModel):
    room_id: str
    meeting_subject: Optional[str] = None
    is_recording: bool
    bot_id: Optional[int] = None
    last_active: datetime

    class Config:
        from_attributes = True
        
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
    mobile: Optional[str] = None
    picture: Optional[str] = None
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    
    
class LLMCostEntry(BaseModel):
    date: datetime
    cost: float # Cost incurred (e.g., USD)
    tokens_used: int
    
    class Config:
        from_attributes = True
        
class LLMUsage(BaseModel):
    model_name: str
    total_cost_ytd: float
    avg_cost_per_meeting: float
    cost_history: List[LLMCostEntry]
    
    class Config:
        from_attributes = True