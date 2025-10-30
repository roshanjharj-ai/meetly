# schemas.py
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

# --- Password Reset Schemas ---
class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)
    
# --- License Schemas ---
class LicenseBase(BaseModel):
    duration_value: int = Field(..., gt=0)
    duration_unit: str = Field(..., pattern="^(days|months|years)$")
    license_type: str = 'Standard'
    status: str = 'Active'

class License(BaseModel): 
    id: int
    customer_id: int
    license_key: str
    start_date: datetime
    expiry_date: Optional[datetime]
    days_granted: int
    status: str 
    type: str 
    
    class Config:
        from_attributes = True

# --- Customer Schemas ---
class CustomerBase(BaseModel):
    name: str
    logo_url: Optional[str] = None
    email_sender_name: Optional[str] = 'System Bot'
    default_meeting_name: Optional[str] = 'Team Meeting'
    url_slug: str

class CustomerCreate(CustomerBase):
    pass 
    
class CustomerCreateAdmin(CustomerBase):
    pass 
    
class CustomerUpdateAdmin(CustomerBase):
    pass

class Customer(CustomerBase):
    id: int
    email_config_json: Optional[str] = None
    created_at: datetime
    license: Optional[License] = None
    
    class Config:
        from_attributes = True

# --- License Request & Activity Log Schemas ---
class LicenseRequest(BaseModel):
    customer_id: int
    message_body: str
    
class SuperAdminActivityLog(BaseModel):
    customer_id: int
    activity_type: str
    content: str
    timestamp: datetime
    
    class Config:
        from_attributes = True
        
# --- NEW: User Transfer Schema ---
class UserTransfer(BaseModel):
    user_id: int
    new_customer_id: int


# --- Meeting Configuration Payload ---
class MeetingPermissionConfig(BaseModel):
    # Global/Default permissions for the meeting
    allow_screen_share: bool = True
    allow_video: bool = True
    allow_audio: bool = True
    allow_group_chat: bool = True
    allow_private_chat: bool = True
    participant_overrides: Dict[str, Dict[str, bool]] = Field(default_factory=dict)
    speaker_ids: List[int] = Field(default_factory=list)


# --- Participant Schemas ---
class ParticipantBase(BaseModel):
    name: str
    email: EmailStr
    mobile: Optional[str] = None

class ParticipantCreate(ParticipantBase):
    pass

class Participant(ParticipantBase):
    id: int
    customer_id: int
    class Config:
        from_attributes = True

# --- Meeting Schemas ---
class MeetingBase(BaseModel):
    subject: str
    agenda: Optional[str] = None
    date_time: datetime
    meeting_link: Optional[str] = None
    meeting_type: str = 'Multi-Participant'
    config: Optional[MeetingPermissionConfig] = None

class MeetingCreate(MeetingBase):
    participant_ids: List[int] = []

class Meeting(MeetingBase):
    id: int
    customer_id: int
    participants: List[Participant] = []
    config_json: Optional[str] = None

    class Config:
        from_attributes = True

# --- Chat Message Schemas ---
class AttachmentPayload(BaseModel):
    name: str
    dataUrl: Optional[str] = None 
    url: Optional[str] = None 

class ChatMessagePayload(BaseModel):
    id: str 
    from_user: str = Field(alias="from")
    text: Optional[str] = None
    attachments: Optional[List[AttachmentPayload]] = None
    ts: int 
    to_user: Optional[str] = Field(None, alias="to") 
    
    class Config:
        from_attributes = True
        populate_by_name = True

class ChatMessageDB(ChatMessagePayload):
    db_id: Optional[int] = Field(None, alias="id")
    room_id: str
    timestamp: datetime
    
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

class BotConfig(BaseModel):
    id: int
    customer_id: int
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
    customer_id: int 

class SuperAdminUserUpdate(BaseModel):
    user_type: Optional[str] = None
    is_active: Optional[bool] = None 

class User(UserBase):
    id: int
    customer_id: int 
    provider: str
    user_name: Optional[str] = None
    mobile: Optional[str] = None
    picture: Optional[str] = None
    user_type: str = 'Member'
    customer_slug: Optional[str] = None # NEW: Passed from backend for frontend routing
    license_status: Optional[str] = None # <<< FIX: ADDED LICENSE STATUS

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    customer_id: Optional[int] = None
    user_type: Optional[str] = None
   
    
class LLMCostEntry(BaseModel):
    date: datetime
    cost: float
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