# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime # NEW: Import datetime
from typing import List, Dict, Any
import json
import os
import asyncio

# --- CORRECTED IMPORTS ---
# All modules (crud, models, auth, etc.) are in the same directory,
# so we import them directly without the leading dot.
import crud
import models
import schemas
import auth
from database import engine, get_db
import email_service
import verification_service

# This line creates the database tables based on the models defined in models.py
models.Base.metadata.create_all(bind=engine)

# --- Configuration ---
RECORDER_BOT_PREFIX = os.getenv("RECORDER_BOT_PREFIX", "RecorderBot")

# --- Application Setup ---
app = FastAPI(title="Unified Meeting Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state for WebSocket rooms
rooms: Dict[str, Dict[str, Any]] = {}

# === API Routes ===

# --- Auth Routes ---
@app.post("/api/token", response_model=schemas.Token)
async def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/signup", response_model=schemas.User)
def create_user(
    user: schemas.UserCreate, 
    background_tasks: BackgroundTasks, # MODIFIED: Add background_tasks
    db: Session = Depends(get_db)
):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    usr = crud.create_user(db=db, user=user)
    # MODIFIED: Ensure full_name is passed, falling back to user_name
    full_name = user.full_name if user.full_name else user.user_name
    background_tasks.add_task(
        email_service.send_signup_email, 
        user.email, 
        usr.id, # Pass the generated user ID
        full_name
    )
    return usr

@app.post("/api/auth/google", response_model=schemas.Token)
async def auth_google(token_request: dict, db: Session = Depends(get_db)):
    google_token = token_request.get("token")
    if not google_token:
        raise HTTPException(status_code=400, detail="Google token not provided")
    return await auth.verify_google_token(google_token, db)

@app.get("/api/users/me", response_model=schemas.User)
async def read_users_me(current_user: schemas.User = Depends(auth.get_current_user)):
    return current_user

@app.put("/api/users/me", response_model=schemas.User)
async def update_user_profile(
    update_data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.update_user(db=db, user=current_user, update_data=update_data)

# --- Meeting & Participant Routes (Protected) ---

@app.post("/api/meetings/validate-join", response_model=schemas.ValidateJoinResponse)
async def validate_meeting_join_request(
    request: schemas.ValidateJoinRequest,
    background_tasks: BackgroundTasks, # MODIFIED: Add background_tasks
    db: Session = Depends(get_db)
):
    is_invited = crud.is_participant_invited(db, request.room, request.email)
    
    if not is_invited:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not invited to this meeting or the meeting does not exist."
        )

    # Generate and store code
    code = verification_service.create_verification_code(request.email, request.room)

    # MODIFIED: Use background_tasks.add_task
    background_tasks.add_task(
        email_service.send_verification_email, 
        request.email, 
        code, 
        request.room
    )

    return {"message": "Verification code sent to your email."}

@app.post("/api/meetings/verify-code", response_model=schemas.VerifyCodeResponse)
async def verify_meeting_join_code(
    request: schemas.VerifyCodeRequest
):
    """
    Verifies the provided code for joining a meeting.
    """
    is_valid = verification_service.verify_code(request.email, request.room, request.code)

    if not is_valid:
        return {"valid": False, "message": "Invalid or expired verification code."}

    # Optionally: Generate a short-lived token specific for this meeting session
    # meeting_token = auth.create_access_token(
    #     data={"sub": request.email, "room": request.room},
    #     expires_delta=timedelta(hours=2) # Example: Token valid for 2 hours
    # )

    return {"valid": True, "message": "Verification successful."} #, "token": meeting_token}

@app.get("/api/getMeetings", response_model=List[schemas.Meeting])
def get_meetings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_meetings(db, skip=skip, limit=limit)

@app.post("/api/createMeeting", response_model=schemas.Meeting)
def create_meeting(
    meeting: schemas.MeetingCreate, 
    background_tasks: BackgroundTasks, # MODIFIED: Add background_tasks
    db: Session = Depends(get_db), 
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.create_meeting(db=db, meeting=meeting)
    
    # --- NEW: Schedule emails for all participants ---
    if db_meeting and db_meeting.participants:
        print(f"Meeting {db_meeting.id} created, scheduling emails...")
        # MODIFIED: Use background_tasks.add_task
        # We pass the raw data, not the db_meeting object, to avoid session errors.
        # list() eagerly loads participants before the session closes.
        background_tasks.add_task(
            schedule_meeting_invites,
            db_meeting.date_time,
            db_meeting.meeting_link,
            list(db_meeting.participants) # Pass the *list* of participants
        )
    
    return db_meeting # MODIFIED

@app.put("/api/updateMeeting/{meeting_id}", response_model=schemas.Meeting)
def update_meeting_route(
    meeting_id: int,
    meeting_update: schemas.MeetingCreate,
    background_tasks: BackgroundTasks, # MODIFIED: Add background_tasks
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.update_meeting(db, meeting_id=meeting_id, meeting_update=meeting_update)
    if db_meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    
    if db_meeting and db_meeting.participants:
        print(f"Meeting {db_meeting.id} updated, scheduling emails...")
        # MODIFIED: Use background_tasks.add_task
        background_tasks.add_task(
            schedule_meeting_invites,
            db_meeting.date_time,
            db_meeting.meeting_link,
            list(db_meeting.participants) # Eagerly load participants
        )

    return db_meeting

# --- ADD THIS ROUTE ---
@app.delete("/api/deleteMeeting/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting_route(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.delete_meeting(db, meeting_id=meeting_id)
    if db_meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return # Return None with 204 status


@app.get("/api/getParticipants", response_model=List[schemas.Participant])
def get_participants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_participants(db, skip=skip, limit=limit)

# --- ADD THIS ROUTE ---
@app.post("/api/createParticipant", response_model=schemas.Participant)
def create_participant_route(
    participant: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    return crud.create_participant(db=db, participant=participant)

# --- ADD THIS ROUTE ---
@app.put("/api/updateParticipant/{participant_id}", response_model=schemas.Participant)
def update_participant_route(
    participant_id: int,
    participant_update: schemas.ParticipantCreate, # Using Create schema for simplicity
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.update_participant(db, participant_id=participant_id, participant_update=participant_update)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return db_participant

# --- ADD THIS ROUTE ---
@app.delete("/api/deleteParticipant/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant_route(
    participant_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.delete_participant(db, participant_id=participant_id)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return # Return None with 204 status

# === WebSocket Logic ===
@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[Server] ✅ '{user_id}' connected to room '{room_id}'")

    if room_id not in rooms:
        rooms[room_id] = {"users": {}}
    
    rooms[room_id]["users"][user_id] = {"ws": websocket, "speaking": False}
    await broadcast_user_list(room_id)
    
    if rooms[room_id].get("is_recording"):
        await safe_send(websocket, {"type": "recording_update", "is_recording": True})

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")
            
            target_id = msg.get("to")
            if target_id:
                target_user_info = rooms.get(room_id, {}).get("users", {}).get(target_id)
                if target_user_info:
                    await safe_send(target_user_info["ws"], msg)
            else:
                if msg_type == "speaking_update":
                    is_speaking = msg.get("payload", {}).get("speaking", False)
                    if user_id in rooms.get(room_id, {}).get("users", {}):
                        rooms[room_id]["users"][user_id]["speaking"] = is_speaking
                        all_speakers = {uid: uinfo["speaking"] for uid, uinfo in rooms[room_id]["users"].items()}
                        await broadcast(room_id, {"type": "speaker_update", "speakers": all_speakers})
                elif msg_type == "recording_update":
                    rooms[room_id]["is_recording"] = msg.get("is_recording", False)
                    await broadcast(room_id, msg)
                else:
                    await broadcast(room_id, msg, sender_id=user_id)

    except WebSocketDisconnect:
        print(f"[Server] 🔌 '{user_id}' disconnected from room '{room_id}'")
    finally:
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            del rooms[room_id]["users"][user_id]
            
            if user_id.startswith(RECORDER_BOT_PREFIX):
                print(f"[Server] 🔴 Recorder Bot disconnected. Resetting recording status for room '{room_id}'.")
                rooms[room_id]["is_recording"] = False
                await broadcast(room_id, {"type": "recording_update", "is_recording": False})

            if not rooms[room_id]["users"]:
                del rooms[room_id]
                print(f"[Server] 🗑️ Room '{room_id}' is empty and has been deleted.")
            else:
                await broadcast_user_list(room_id)

# --- Helper Functions ---

# --- MODIFIED HELPER FUNCTION ---
async def schedule_meeting_invites(
    meeting_time: datetime, 
    meeting_link: str, 
    participants: List[models.Participant]
):
    """
    Asynchronous helper function to schedule invitation emails.
    This function is run by BackgroundTasks on the main event loop.
    
    Args:
        meeting_time: The datetime object of the meeting.
        meeting_link: The room ID/link (e.g., "AB-CDEF").
        participants: A *list* of Participant model objects. 
                      Must be eagerly loaded before calling this.
    """
    try:
        meeting_time_str = meeting_time.strftime("%A, %B %d, %Y at %I:%M %p %Z")
    except Exception:
        meeting_time_str = str(meeting_time)

    participant_names = [p.name for p in participants]
    
    if not meeting_link:
        print(f"❌ Cannot send emails, meeting has no room_name/meeting_link.")
        return

    # This is now running on the main event loop, so asyncio.create_task is safe
    for participant in participants:
        print(f"Scheduling invite email for {participant.email} for room {meeting_link}")
        asyncio.create_task(
            email_service.send_meeting_invite(
                recipient_email=participant.email,
                recipient_name=participant.name,
                room_name=meeting_link,
                meeting_time=meeting_time_str,
                participants=participant_names
            )
        )
# --- END NEW HELPER FUNCTION ---

async def broadcast_user_list(room_id: str):
    if room_id in rooms:
        user_list = list(rooms[room_id]["users"].keys())
        await broadcast(room_id, {"type": "user_list", "users": user_list})

async def safe_send(ws: WebSocket, msg: dict):
    try:
        if ws.client_state.name == 'CONNECTED':
            await ws.send_text(json.dumps(msg))
    except Exception:
        pass

async def broadcast(room_id: str, msg: dict, sender_id: str = None):
    if room_id in rooms:
        for uid, info in list(rooms[room_id]["users"].items()):
            if sender_id != uid:
                await safe_send(info["ws"], msg)