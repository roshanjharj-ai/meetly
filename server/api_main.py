# api_main.py
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
from typing import List, Dict, Any
from sqlalchemy.exc import IntegrityError
import asyncio

# --- Internal Imports ---
import crud
import models
import schemas
import auth 
import email_service
from database import get_db

# We need to import the global dependencies/utilities from main.py's context
# In a real project, these would be in a separate 'dependencies.py' file.
from dependencies import get_current_super_admin, enrich_user_response

router = APIRouter()

# --- Helper Function (Used only by API routes) ---

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


# === API Routes (All original routes moved here) ===

# --- Auth Routes ---
@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    # ... (Auth logic remains the same)
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.user_type != 'SuperAdmin':
        is_license_active = crud.check_license_active(db, user.customer_id)
        if not is_license_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="LICENSE_EXPIRED_OR_REVOKED"
            )
            
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

@router.post("/signup", response_model=schemas.User)
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

# ... (Other Auth routes, /auth/google, /auth/forgot-password, /auth/reset-password) ...
@router.post("/auth/google", response_model=schemas.Token)
async def auth_google(token_request: dict, db: Session = Depends(get_db)):
    google_token = token_request.get("token")
    if not google_token:
        raise HTTPException(status_code=400, detail="Google token not provided")
    return await auth.verify_google_token(google_token, db)

@router.post("/auth/forgot-password", status_code=status.HTTP_200_OK)
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

@router.post("/auth/reset-password", status_code=status.HTTP_200_OK)
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

# --- User Routes ---
@router.get("/users/me", response_model=schemas.User)
async def read_users_me(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return enrich_user_response(db, current_user)

@router.put("/users/me", response_model=schemas.User)
async def update_user_profile(
    update_data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    updated_user = crud.update_user(db=db, user=current_user, update_data=update_data)
    return enrich_user_response(db, updated_user)


@router.get("/users/organization", response_model=List[schemas.User])
async def get_organization_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.user_type != 'Admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admins can view the organization user list.")
    
    users = crud.get_all_users_by_customer(db, current_user.customer_id)
    return [enrich_user_response(db, u) for u in users]

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
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

@router.put("/users/transfer", response_model=schemas.User)
async def super_admin_transfer_user(
    transfer_request: schemas.UserTransfer,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Transfers a user from their current organization to a new one."""
    
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


# --- Customer Management Routes ---

@router.get("/customers/slug/{url_slug}", response_model=schemas.CustomerBase)
async def get_customer_by_slug_route(
    url_slug: str,
    db: Session = Depends(get_db)
):
    """Retrieves customer data required for public signup/login."""
    customer = crud.get_customer_by_slug(db, url_slug)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization not found for slug: {url_slug}"
        )
    return schemas.CustomerBase.model_validate(customer, from_attributes=True)

@router.get("/customers/me", response_model=schemas.Customer)
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


# --- SuperAdmin Global Management Routes (Customers, Users, Licenses) ---

@router.post("/superadmin/customers", response_model=schemas.Customer)
async def super_admin_create_customer(
    customer: schemas.CustomerCreateAdmin,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    try:
        return crud.create_customer_globally(db, customer)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/superadmin/customers", response_model=List[schemas.Customer])
async def super_admin_get_all_customers(
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    customers = crud.get_all_customers(db)
    return customers

@router.put("/superadmin/customers/{customer_id}", response_model=schemas.Customer)
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

@router.delete("/superadmin/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def super_admin_delete_customer(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    deleted_customer = crud.delete_customer_globally(db, customer_id)
    if not deleted_customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer organization not found.")
    return

@router.get("/superadmin/customers/{customer_id}/users", response_model=List[schemas.User])
async def super_admin_get_customer_users(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    users = crud.get_all_users_by_customer(db, customer_id)
    return [enrich_user_response(db, u) for u in users]

@router.put("/superadmin/users/{user_id}", response_model=schemas.User)
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

@router.delete("/superadmin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def super_admin_delete_user(
    user_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    deleted_user = crud.delete_user_globally(db, user_id)
    if not deleted_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return
    
@router.get("/superadmin/customers/{customer_id}/license", response_model=schemas.License)
async def super_admin_get_license(
    customer_id: int,
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    license_data = crud.get_license_by_customer(db, customer_id)
    if not license_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found for customer.")
    return license_data

@router.put("/superadmin/customers/{customer_id}/license", response_model=schemas.License)
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

@router.put("/superadmin/customers/{customer_id}/license/revoke", response_model=schemas.License)
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

@router.get("/superadmin/license-requests", response_model=List[schemas.SuperAdminActivityLog])
async def super_admin_get_license_requests(
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    return crud.get_license_requests(db)

@router.post("/license/request", status_code=status.HTTP_200_OK)
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


# --- Meeting, Participant, Bot Routes ---

@router.get("/getMeetings", response_model=List[schemas.Meeting])
def get_meetings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_meetings(db, current_user.customer_id, skip=skip, limit=limit)

@router.post("/createMeeting", response_model=schemas.Meeting)
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
            schedule_meeting_invites, # Use the helper function defined here
            db_meeting.date_time,
            db_meeting.meeting_link,
            list(db_meeting.participants)
        )
    
    return db_meeting

@router.put("/updateMeeting/{meeting_id}", response_model=schemas.Meeting)
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

@router.delete("/deleteMeeting/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting_route(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_meeting = crud.delete_meeting(db, customer_id=current_user.customer_id, meeting_id=meeting_id)
    if db_meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return

# ... (All other Participant and Bot routes remain the same, just using @router instead of @app) ...
@router.get("/getParticipants", response_model=List[schemas.Participant])
def get_participants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_participants(db, current_user.customer_id, skip=skip, limit=limit)

@router.post("/createParticipant", response_model=schemas.Participant)
def create_participant_route(
    participant: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    try:
        return crud.create_participant(db=db, customer_id=current_user.customer_id, participant=participant)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/updateParticipant/{participant_id}", response_model=schemas.Participant)
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

@router.delete("/deleteParticipant/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant_route(
    participant_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user)
):
    db_participant = crud.delete_participant(db, customer_id=current_user.customer_id, participant_id=participant_id)
    if db_participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return

@router.get("/bots/configs", response_model=List[schemas.BotConfig])
def get_bot_configs_route(db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    return crud.get_bot_configs(db, current_user.customer_id)

@router.post("/bots/create", response_model=schemas.BotConfig)
def create_bot_config_route(bot: schemas.BotConfigCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.create_bot_config(db=db, customer_id=current_user.customer_id, bot=bot, user_id=current_user.id)

@router.put("/bots/update/{bot_id}", response_model=schemas.BotConfig)
def update_bot_config_route(bot_id: int, bot_update: schemas.BotConfigUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    db_bot = crud.update_bot_config(db, customer_id=current_user.customer_id, bot_id=bot_id, bot_update=bot_update)
    if db_bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return db_bot

@router.delete("/bots/delete/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot_config_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    db_bot = crud.delete_bot_config(db, customer_id=current_user.customer_id, bot_id=bot_id)
    if db_bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return

@router.get("/bots/{bot_id}/activities", response_model=List[schemas.BotActivity])
def get_bot_activities_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    """Retrieves recent activities (transcripts and actions) for a specific bot."""
    activities = crud.get_bot_activities(db, bot_id)
    if not activities:
        return []
    return activities

@router.get("/bots/{bot_id}/performance", response_model=schemas.BotPerformance)
def get_bot_performance_route(bot_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(auth.get_current_user)):
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Performance metrics are computed on the client for now.")

@router.post("/bots/{bot_id}/barge", status_code=status.HTTP_200_OK)
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

    mock_meeting_state = schemas.MeetingState(
        room_id=room_id,
        meeting_subject=f"Live Session {room_id}", # Placeholder
        is_recording=False,
        bot_id=bot_id,
        last_active=datetime.now(timezone.utc) # Use timezone-aware datetime
    )
    crud.create_or_update_meeting_state(db, mock_meeting_state)

    db_bot.status = "Attending"
    db_bot.current_meeting_id = room_id
    db.add(db_bot)
    db.commit()
    
    return {"success": True}

@router.get("/meetings/{room_id}/chat/history", response_model=List[schemas.ChatMessagePayload])
async def get_chat_history_route(
    room_id: str, 
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db), 
    current_user: schemas.User = Depends(auth.get_current_user)
):
    """Retrieves persistent chat history for a given meeting room."""
    return crud.get_chat_history(db, room_id, skip=skip, limit=limit)