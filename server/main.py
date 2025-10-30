# main.py
from sqlite3 import IntegrityError
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta, datetime, timezone
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

# --- Dependency to enforce SuperAdmin access ---
async def get_current_super_admin(current_user: models.User = Depends(auth.get_current_user)):
    if current_user.user_type != 'SuperAdmin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. SuperAdmin privileges required."
        )
    return current_user


# === API Routes ===

# --- Auth Routes ---
@app.post("/api/token", response_model=schemas.Token)
async def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    # 1. Get user and verify password
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 2. ENFORCE LICENSE CHECK
    if user.user_type != 'SuperAdmin':
        is_license_active = crud.check_license_active(db, user.customer_id)
        
        if not is_license_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="LICENSE_EXPIRED_OR_REVOKED"
            )
            
    # 3. Generate token
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={
            "sub": user.email, 
            "customer_id": user.customer_id, 
            "user_type": user.user_type
        }, 
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/signup", response_model=schemas.User)
def create_user(
    user: schemas.UserCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    db_user = crud.get_user_by_email_and_customer(db, user.customer_id, user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered for this customer")
    
    try:
        usr = crud.create_user(db=db, user=user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    full_name = user.full_name if user.full_name else user.user_name
    background_tasks.add_task(
        email_service.send_signup_email, 
        user.email, 
        usr.id,
        full_name
    )
    customer = crud.get_customer_by_id(db, usr.customer_id)
    
    response_user = schemas.User.model_validate(usr)
    if customer:
        response_user.customer_slug = customer.url_slug
    
    return response_user

@app.post("/api/auth/google", response_model=schemas.Token)
async def auth_google(token_request: dict, db: Session = Depends(get_db)):
    google_token = token_request.get("token")
    if not google_token:
        raise HTTPException(status_code=400, detail="Google token not provided")
    return await auth.verify_google_token(google_token, db)

@app.post("/api/auth/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password_request(
    request: schemas.PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    user = crud.get_user_by_email(db, email=request.email)
    
    if user and user.provider == 'local':
        reset_token = crud.create_reset_token(db, user.id)
        reset_url = f"http://localhost:5173/reset-password?token={reset_token.token}"
        
        background_tasks.add_task(
            email_service.send_password_reset_email,
            user.email,
            user.full_name or user.user_name,
            reset_url
        )
    return {"message": "If a matching account was found, a password reset email has been sent."}

@app.post("/api/auth/reset-password", status_code=status.HTTP_200_OK)
async def reset_password_confirm(
    request: schemas.PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    user = crud.get_user_by_reset_token(db, request.token)
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    crud.update_user_password(db, user.id, request.new_password)
    crud.invalidate_reset_token(db, request.token)
    
    return {"message": "Password successfully updated."}

# Utility to enrich User schema with customer_slug before sending to frontend
def enrich_user_response(db: Session, user: models.User) -> schemas.User:
    customer = crud.get_customer_by_id(db, user.customer_id)
    
    enriched_user = schemas.User.model_validate(user)
    
    if customer:
        enriched_user.customer_slug = customer.url_slug
        
        # --- FIX: Set license_status using the check_license_active utility ---
        is_license_active = crud.check_license_active(db, user.customer_id) 
        
        # Re-fetch license data after potential update (to get latest status string)
        license_data = crud.get_license_by_customer(db, user.customer_id) 
        
        enriched_user.license_status = license_data.status if license_data else "NOT_LICENSED"
    
    return enriched_user

@app.get("/api/users/me", response_model=schemas.User)
async def read_users_me(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return enrich_user_response(db, current_user)

@app.put("/api/users/me", response_model=schemas.User)
async def update_user_profile(
    update_data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    updated_user = crud.update_user(db=db, user=current_user, update_data=update_data)
    return enrich_user_response(db, updated_user)


@app.get("/api/users/organization", response_model=List[schemas.User])
async def get_organization_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.user_type != 'Admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admins can view the organization user list.")
    
    users = crud.get_all_users_by_customer(db, current_user.customer_id)
    return [enrich_user_response(db, u) for u in users]

@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.user_type != 'Admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admins can remove users.")
        
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself.")
        
    user_to_delete = crud.remove_user_by_id(db, current_user.customer_id, user_id)
    
    if not user_to_delete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found in this organization.")
        
    return

# --- NEW: Customer Management Routes (Admin Only) ---

@app.get("/api/customers/slug/{url_slug}", response_model=schemas.Customer) # Changed response_model to schemas.Customer
async def get_customer_by_slug_route(
    url_slug: str,
    db: Session = Depends(get_db)
):
    """
    Retrieves customer data required for public signup/login.
    """
    customer = crud.get_customer_by_slug(db, url_slug)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization not found for slug: {url_slug}"
        )
    
    # Use the full Customer schema which correctly includes 'id' and 'created_at' 
    # and has from_attributes=True defined.
    # Pydantic V2 strongly prefers .model_validate(obj, from_attributes=True)
    return schemas.Customer.model_validate(customer, from_attributes=True)

@app.get("/api/customers/me", response_model=schemas.Customer)
async def get_customer_details(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.user_type != 'Admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admins can access organization details.")
    
    customer = crud.get_customer_by_id(db, current_user.customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer organization not found.")
    
    return customer


# --- SuperAdmin Global Management Routes ---

@app.post("/api/superadmin/customers", response_model=schemas.Customer)
async def super_admin_create_customer(
    customer: schemas.CustomerCreateAdmin,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    try:
        return crud.create_customer_globally(db, customer)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/superadmin/customers", response_model=List[schemas.Customer])
async def super_admin_get_all_customers(
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    customers = crud.get_all_customers(db)
    return customers

@app.put("/api/superadmin/customers/{customer_id}", response_model=schemas.Customer)
async def super_admin_update_customer(
    customer_id: int,
    customer_update: schemas.CustomerUpdateAdmin,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    updated_customer = crud.update_customer_globally(db, customer_id, customer_update)
    if not updated_customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer organization not found.")
    return updated_customer

@app.delete("/api/superadmin/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def super_admin_delete_customer(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    deleted_customer = crud.delete_customer_globally(db, customer_id)
    if not deleted_customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer organization not found.")
    return

# --- SuperAdmin User Management ---

@app.get("/api/superadmin/customers/{customer_id}/users", response_model=List[schemas.User])
async def super_admin_get_customer_users(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    users = crud.get_users_by_customer_id_global(db, customer_id)
    return [enrich_user_response(db, u) for u in users]

@app.put("/api/superadmin/users/{user_id}", response_model=schemas.User)
async def super_admin_update_user(
    user_id: int,
    update_data: schemas.SuperAdminUserUpdate,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    updated_user = crud.update_user_globally(db, user_id, update_data)
    if not updated_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return enrich_user_response(db, updated_user)

@app.delete("/api/superadmin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def super_admin_delete_user(
    user_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    deleted_user = crud.delete_user_globally(db, user_id)
    if not deleted_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return
    
# --- SuperAdmin License Management Routes ---

@app.get("/api/superadmin/customers/{customer_id}/license", response_model=schemas.License)
async def super_admin_get_license(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    license_data = crud.get_license_by_customer(db, customer_id)
    if not license_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found for customer.")
    return license_data

@app.put("/api/superadmin/customers/{customer_id}/license", response_model=schemas.License)
async def super_admin_manage_license(
    customer_id: int,
    license_data: schemas.LicenseBase,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    try:
        license_obj = crud.create_or_update_license(db, customer_id, current_super_admin.id, license_data)
        
        crud.log_superadmin_activity(
            db, 
            customer_id, 
            "LICENSE_UPDATE", 
            f"Set license status to {license_data.status} for {license_data.duration_value} {license_data.duration_unit}."
        )
        return license_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/superadmin/customers/{customer_id}/license/revoke", response_model=schemas.License)
async def super_admin_revoke_license(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    revoked_license = crud.revoke_license(db, customer_id)
    if not revoked_license:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found.")

    crud.log_superadmin_activity(db, customer_id, "LICENSE_REVOKE", "License manually revoked.")
    return revoked_license

@app.get("/api/superadmin/license-requests", response_model=List[schemas.SuperAdminActivityLog])
async def super_admin_get_license_requests(
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    return crud.get_license_requests(db)

# --- NEW: Customer-side License Request API ---
@app.post("/api/license/request", status_code=status.HTTP_200_OK)
async def customer_request_license(
    request: schemas.LicenseRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if request.customer_id != current_user.customer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot request license for another organization.")

    crud.log_superadmin_activity(
        db, 
        request.customer_id, 
        "LICENSE_REQUEST", 
        f"Request from {current_user.email}: {request.message_body}"
    )
    
    return {"message": "License request sent to SuperAdmin successfully."}


# --- Existing Meeting, Participant, Bot Routes (Full Content) ---

@app.get("/api/getMeetings", response_model=List[schemas.Meeting])
def get_meetings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_meetings(db, current_user.customer_id, skip=skip, limit=limit)

@app.post("/api/createMeeting", response_model=schemas.Meeting)
def create_meeting(
    meeting: schemas.MeetingCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.create_meeting(db=db, customer_id=current_user.customer_id, meeting=meeting)
    
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
    db_meeting = crud.update_meeting(db, customer_id=current_user.customer_id, meeting_id=meeting_id, meeting_update=meeting_update)
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

@app.delete("/api/deleteMeeting/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting_route(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.delete_meeting(db, customer_id=current_user.customer_id, meeting_id=meeting_id)
    if db_meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return

@app.get("/api/getParticipants", response_model=List[schemas.Participant])
def get_participants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_participants(db, current_user.customer_id, skip=skip, limit=limit)

@app.post("/api/createParticipant", response_model=schemas.Participant)
def create_participant_route(
    participant: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    try:
        return crud.create_participant(db=db, customer_id=current_user.customer_id, participant=participant)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/updateParticipant/{participant_id}", response_model=schemas.Participant)
def update_participant_route(
    participant_id: int,
    participant_update: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.update_participant(db, customer_id=current_user.customer_id, participant_id=participant_id, participant_update=participant_update)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return db_participant

@app.delete("/api/deleteParticipant/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant_route(
    participant_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.delete_participant(db, customer_id=current_user.customer_id, participant_id=participant_id)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return

# ADDED: GET BOT CONFIGS
@app.get("/api/bots/configs", response_model=List[schemas.BotConfig])
def get_bot_configs_route(db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_bot_configs(db, current_user.customer_id)

# ADDED: CREATE BOT CONFIG
@app.post("/api/bots/create", response_model=schemas.BotConfig)
def create_bot_config_route(bot: schemas.BotConfigCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.create_bot_config(db=db, customer_id=current_user.customer_id, bot=bot, user_id=current_user.id)

# ADDED: UPDATE BOT CONFIG
@app.put("/api/bots/update/{bot_id}", response_model=schemas.BotConfig)
def update_bot_config_route(bot_id: int, bot_update: schemas.BotConfigUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    db_bot = crud.update_bot_config(db, customer_id=current_user.customer_id, bot_id=bot_id, bot_update=bot_update)
    if db_bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return db_bot

# ADDED: DELETE BOT CONFIG
@app.delete("/api/bots/delete/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot_config_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    db_bot = crud.delete_bot_config(db, customer_id=current_user.customer_id, bot_id=bot_id)
    if db_bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return

# ADDED: GET BOT ACTIVITIES (Mocked for now)
@app.get("/api/bots/{bot_id}/activities", response_model=List[schemas.BotActivity])
def get_bot_activities_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    """Retrieves recent activities (transcripts and actions) for a specific bot."""
    activities = crud.get_bot_activities(db, bot_id)
    if not activities:
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
    db_bot = crud.get_bot_by_id_and_customer(db, current_user.customer_id, bot_id) # Using customer-scoped getter
    
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
        last_active=datetime.now(timezone.utc) # Use timezone-aware datetime
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
                last_active=datetime.now(timezone.utc)
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
                last_active=datetime.now(timezone.utc)
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
                
                
@app.get("/api/superadmin/customers/{customer_id}/license", response_model=schemas.License)
async def super_admin_get_license(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    license_data = crud.get_license_by_customer(db, customer_id)
    if not license_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found for customer.")
    return license_data

@app.put("/api/superadmin/customers/{customer_id}/license", response_model=schemas.License)
async def super_admin_manage_license(
    customer_id: int,
    license_data: schemas.LicenseBase,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    try:
        license_obj = crud.create_or_update_license(db, customer_id, current_super_admin.id, license_data)
        
        crud.log_superadmin_activity(
            db, 
            customer_id, 
            "LICENSE_UPDATE", 
            f"Set license status to {license_data.status} for {license_data.duration_value} {license_data.duration_unit}."
        )
        return license_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/superadmin/customers/{customer_id}/license/revoke", response_model=schemas.License)
async def super_admin_revoke_license(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    revoked_license = crud.revoke_license(db, customer_id)
    if not revoked_license:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found.")

    crud.log_superadmin_activity(db, customer_id, "LICENSE_REVOKE", "License manually revoked.")
    return revoked_license

@app.get("/api/superadmin/license-requests", response_model=List[schemas.SuperAdminActivityLog])
async def super_admin_get_license_requests(
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    return crud.get_license_requests(db)

# --- NEW: Customer-side License Request API ---
@app.post("/api/license/request", status_code=status.HTTP_200_OK)
async def customer_request_license(
    request: schemas.LicenseRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if request.customer_id != current_user.customer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot request license for another organization.")

    crud.log_superadmin_activity(
        db, 
        request.customer_id, 
        "LICENSE_REQUEST", 
        f"Request from {current_user.email}: {request.message_body}"
    )
    
    return {"message": "License request sent to SuperAdmin successfully."}


@app.put("/api/superadmin/users/transfer", response_model=schemas.User)
async def super_admin_transfer_user(
    transfer_request: schemas.UserTransfer,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Transfers a user from their current organization to a new one."""
    
    # Prevents SuperAdmin from accidentally kicking themselves out of their own scope
    # (Optional, but safe guard)
    if transfer_request.user_id == current_super_admin.id:
        raise HTTPException(status_code=400, detail="Cannot transfer the active SuperAdmin account.")
        
    try:
        updated_user = crud.transfer_user_to_customer(
            db, 
            transfer_request.user_id, 
            transfer_request.new_customer_id
        )
        
        if not updated_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
            
        return enrich_user_response(db, updated_user)
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, 
            detail="Conflict: A user with that email already exists in the target organization."
        )
    except Exception as e:
        print(f"Transfer error: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred during transfer.")