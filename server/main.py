# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from typing import List, Dict, Any, Optional
import json
import os
import asyncio

# --- CORRECTED IMPORTS ---
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

# --- Auth Routes (Existing) ---
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    usr = crud.create_user(db=db, user=user)
    full_name = user.full_name if user.full_name else user.user_name
    background_tasks.add_task(
        email_service.send_signup_email, 
        user.email, 
        usr.id,
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

# --- NEW: Chat History API Endpoint ---
@app.get("/api/meetings/{room_id}/chat/history", response_model=List[schemas.ChatMessagePayload])
async def get_chat_history_route(
    room_id: str, 
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db), 
    current_user: schemas.User = Depends(auth.get_current_user)
):
    """Retrieves persistent chat history for a given meeting room."""
    # NOTE: Authorization check (is user in this meeting?) is omitted but recommended.
    return crud.get_chat_history(db, room_id, skip=skip, limit=limit)

# --- Meeting & Participant Routes (Protected) ---

@app.post("/api/meetings/validate-join", response_model=schemas.ValidateJoinResponse)
async def validate_meeting_join_request(
    request: schemas.ValidateJoinRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    is_invited = crud.is_participant_invited(db, request.room, request.email)
    
    if not is_invited:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not invited to this meeting or the meeting does not exist."
        )

    code = verification_service.create_verification_code(request.email, request.room)

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
    is_valid = verification_service.verify_code(request.email, request.room, request.code)

    if not is_valid:
        return {"valid": False, "message": "Invalid or expired verification code."}

    return {"valid": True, "message": "Verification successful."}

@app.get("/api/getMeetings", response_model=List[schemas.Meeting])
def get_meetings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_meetings(db, skip=skip, limit=limit)

@app.post("/api/createMeeting", response_model=schemas.Meeting)
def create_meeting(
    meeting: schemas.MeetingCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.create_meeting(db=db, meeting=meeting)
    
    if db_meeting and db_meeting.participants:
        print(f"Meeting {db_meeting.id} created, scheduling emails...")
        background_tasks.add_task(
            schedule_meeting_invites,
            db_meeting.date_time,
            db_meeting.meeting_link,
            list(db_meeting.participants)
        )
    
    return db_meeting

@app.put("/api/updateMeeting/{meeting_id}", response_model=schemas.Meeting)
def update_meeting_route(
    meeting_id: int,
    meeting_update: schemas.MeetingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.update_meeting(db, meeting_id=meeting_id, meeting_update=meeting_update)
    if db_meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    
    if db_meeting and db_meeting.participants:
        print(f"Meeting {db_meeting.id} updated, scheduling emails...")
        background_tasks.add_task(
            schedule_meeting_invites,
            db_meeting.date_time,
            db_meeting.meeting_link,
            list(db_meeting.participants)
        )

    return db_meeting

# ADDED: DELETE MEETING
@app.delete("/api/deleteMeeting/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting_route(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.delete_meeting(db, meeting_id=meeting_id)
    if db_meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return

@app.get("/api/getParticipants", response_model=List[schemas.Participant])
def get_participants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_participants(db, skip=skip, limit=limit)

# ADDED: CREATE PARTICIPANT
@app.post("/api/createParticipant", response_model=schemas.Participant)
def create_participant_route(
    participant: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    return crud.create_participant(db=db, participant=participant)

# ADDED: UPDATE PARTICIPANT
@app.put("/api/updateParticipant/{participant_id}", response_model=schemas.Participant)
def update_participant_route(
    participant_id: int,
    participant_update: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.update_participant(db, participant_id=participant_id, participant_update=participant_update)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return db_participant

# ADDED: DELETE PARTICIPANT
@app.delete("/api/deleteParticipant/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant_route(
    participant_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.delete_participant(db, participant_id=participant_id)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return

# --- Bot Management Routes (Protected) ---

# ADDED: GET BOT CONFIGS
@app.get("/api/bots/configs", response_model=List[schemas.BotConfig])
def get_bot_configs_route(db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_bot_configs(db)

# ADDED: CREATE BOT CONFIG
@app.post("/api/bots/create", response_model=schemas.BotConfig)
def create_bot_config_route(bot: schemas.BotConfigCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.create_bot_config(db=db, bot=bot, user_id=current_user.id)

# ADDED: UPDATE BOT CONFIG
@app.put("/api/bots/update/{bot_id}", response_model=schemas.BotConfig)
def update_bot_config_route(bot_id: int, bot_update: schemas.BotConfigUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    db_bot = crud.update_bot_config(db, bot_id=bot_id, bot_update=bot_update)
    if db_bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return db_bot

# ADDED: DELETE BOT CONFIG
@app.delete("/api/bots/delete/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot_config_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    db_bot = crud.delete_bot_config(db, bot_id=bot_id)
    if db_bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return

# ADDED: GET BOT ACTIVITIES (Mocked for now)
@app.get("/api/bots/{bot_id}/activities", response_model=List[schemas.BotActivity])
def get_bot_activities_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    """Retrieves recent activities (transcripts and actions) for a specific bot."""
    activities = crud.get_bot_activities(db, bot_id)
    if not activities:
        # NOTE: Returning a 200 OK with an empty list is fine; 
        # the frontend will then need to rely on its mock data if this is intended.
        # But if the table has no entries, this is the correct server response.
        return []
    return activities

# ADDED: GET BOT PERFORMANCE (Mocked for now)
@app.get("/api/bots/{bot_id}/performance", response_model=schemas.BotPerformance)
def get_bot_performance_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    # In a real app, this would be computed from past meeting/activity data.
    # For now, we rely entirely on the frontend mock data to satisfy the schema.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Performance metrics are computed on the client for now.")

# ADDED: BARGE INTO MEETING (Update meeting state)
@app.post("/api/bots/{bot_id}/barge", status_code=status.HTTP_200_OK)
def barge_into_meeting_route(
    bot_id: int,
    request: Dict[str, str], # Expects {"meetingId": "ROOM_ID"}
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    room_id = request.get("meetingId")
    db_bot = crud.get_bot_by_id(db, bot_id)
    
    if not db_bot or not room_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot or Meeting ID not found")

    # Update the MeetingState to show the bot is now attending
    # In a real system, the bot itself would confirm it has joined the WebSocket room.
    
    # We must mock the MeetingState fields since we don't have the full model
    mock_meeting_state = schemas.MeetingState(
        room_id=room_id,
        meeting_subject=f"Live Session {room_id}", # Placeholder
        is_recording=False,
        bot_id=bot_id,
        last_active=datetime.now()
    )
    crud.create_or_update_meeting_state(db, mock_meeting_state)

    # Update the BotConfig status (since it's now 'Attending')
    db_bot.status = "Attending"
    db_bot.current_meeting_id = room_id
    db.add(db_bot)
    db.commit()
    
    return {"success": True}

# === WebSocket Logic ===
@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str, db: Session = Depends(get_db)): # Added DB dependency
    await websocket.accept()
    print(f"[Server] ✅ '{user_id}' connected to room '{room_id}'")

    if room_id not in rooms:
        rooms[room_id] = {"users": {}}
        # NEW: On room creation, create a MeetingState entry
        try:
            crud.create_or_update_meeting_state(db, schemas.MeetingState(
                room_id=room_id,
                is_recording=False,
                last_active=datetime.now()
            ))
        except Exception as e:
             print(f"⚠️ Failed to create MeetingState for {room_id}: {e}")

    # NEW: Update MeetingState on connection
    try:
        db_state = crud.get_meeting_state(db, room_id)
        if db_state:
            update_payload = schemas.MeetingState(
                room_id=room_id,
                meeting_subject=db_state.meeting_subject,
                is_recording=db_state.is_recording,
                bot_id=db_state.bot_id,
                last_active=datetime.now()
            )
            crud.create_or_update_meeting_state(db, update_payload)
    except Exception as e:
        print(f"⚠️ Failed to update MeetingState active time: {e}")
        
    rooms[room_id]["users"][user_id] = {"ws": websocket, "speaking": False}
    await broadcast_user_list(room_id)
    
    # Use database/in-memory state for initial recording status
    is_recording = rooms[room_id].get("is_recording", False)
    if is_recording:
        await safe_send(websocket, {"type": "recording_update", "is_recording": True})

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")
            
            # --- NEW: CHAT MESSAGE HANDLER ---
            if msg_type == "chat_message_to_server":
                try:
                    chat_payload_data = msg.get("payload", {})
                    
                    # Ensure 'from' is correct (user_id from WS path)
                    chat_payload_data["from"] = user_id 
                    
                    # Validate and parse the incoming chat message
                    chat_payload = schemas.ChatMessagePayload.model_validate(chat_payload_data)
                    
                    # 1. Persist the message
                    crud.create_chat_message(db, room_id, chat_payload)
                    
                    # 2. Prepare for broadcast (using client-friendly schema)
                    broadcast_msg = {
                        "type": "chat_message", 
                        "payload": chat_payload.model_dump(by_alias=True)
                    }
                    
                    recipient = chat_payload.to_user
                    
                    if recipient and recipient.lower() != "group":
                        # Private Chat: Send to recipient AND sender
                        recipient_ws = rooms.get(room_id, {}).get("users", {}).get(recipient, {}).get("ws")
                        
                        if recipient_ws:
                            await safe_send(recipient_ws, broadcast_msg)
                            print(f"[Server] ✉️ Private chat: {user_id} -> {recipient}")
                        
                        # Always send back to sender for local echo update (if successful persist)
                        await safe_send(websocket, broadcast_msg)

                    else:
                        # Group Chat: Broadcast to everyone
                        await broadcast(room_id, broadcast_msg)
                        print(f"[Server] 💬 Group chat: {user_id}")
                        
                except Exception as e:
                    print(f"⚠️ Failed to process chat message: {e}")
                    # Optionally send error back to user
                continue # Skip general signaling logic for chat messages
            # --- END CHAT MESSAGE HANDLER ---
            
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
                    try:
                        db_state = crud.get_meeting_state(db, room_id)
                        if db_state:
                            db_state.is_recording = rooms[room_id]["is_recording"]
                            db.add(db_state)
                            db.commit()
                    except Exception as e:
                        print(f"⚠️ Failed to update MeetingState recording status: {e}")

                    await broadcast(room_id, msg)
                elif msg_type == "admin_state_update":
                    # This message is intended for the admin UI only (BotDetail)
                    # No need to broadcast to peers, but might need to persist state/activity.
                    pass
                else:
                    await broadcast(room_id, msg, sender_id=user_id)

    except WebSocketDisconnect:
        print(f"[Server] 🔌 '{user_id}' disconnected from room '{room_id}'")
    finally:
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            # NEW: Handle bot disconnect for Attending status cleanup
            if user_id.startswith("Bot") and user_id != "admin_ui": 
                # This is a heuristic: If a known bot disconnects, update its status.
                try:
                    db_bot = db.query(models.BotConfig).filter(models.BotConfig.name == user_id).first()
                    if db_bot and db_bot.current_meeting_id == room_id:
                        db_bot.status = "Ready"
                        db_bot.current_meeting_id = None
                        db.add(db_bot)
                        db.commit()
                        print(f"[Server] 🤖 Bot '{user_id}' set to Ready after disconnect.")
                except Exception as e:
                    print(f"⚠️ Failed to update BotConfig status on disconnect: {e}")

            del rooms[room_id]["users"][user_id]
            
            if user_id.startswith(RECORDER_BOT_PREFIX):
                print(f"[Server] 🔴 Recorder Bot disconnected. Resetting recording status for room '{room_id}'.")
                rooms[room_id]["is_recording"] = False
                await broadcast(room_id, {"type": "recording_update", "is_recording": False})

            if not rooms[room_id]["users"]:
                del rooms[room_id]
                print(f"[Server] 🗑️ Room '{room_id}' is empty and has been deleted.")
                # NEW: On room deletion, set the bot status to Ready/Offline and delete MeetingState
                try:
                    db_state = crud.get_meeting_state(db, room_id)
                    if db_state:
                        if db_state.bot_id:
                            db_bot = crud.get_bot_by_id(db, db_state.bot_id)
                            if db_bot:
                                db_bot.status = "Ready"
                                db_bot.current_meeting_id = None
                                db.add(db_bot)
                        db.delete(db_state)
                        db.commit()
                except Exception as e:
                    print(f"⚠️ Failed cleanup on room delete: {e}")
            else:
                await broadcast_user_list(room_id)

# --- Helper Functions (Existing) ---

async def schedule_meeting_invites(
    meeting_time: datetime, 
    meeting_link: str, 
    participants: List[models.Participant]
):
    try:
        meeting_time_str = meeting_time.strftime("%A, %B %d, %Y at %I:%M %p %Z")
    except Exception:
        meeting_time_str = str(meeting_time)

    participant_names = [p.name for p in participants]
    
    if not meeting_link:
        print(f"❌ Cannot send emails, meeting has no room_name/meeting_link.")
        return

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