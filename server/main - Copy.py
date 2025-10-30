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
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Token data MUST include customer_id and user_type now
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


# --- Customer-Scoped Admin Routes ---
@app.get("/api/customers/me", response_model=schemas.Customer)
async def get_customer_details(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.user_type not in ['Admin', 'SuperAdmin']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Admin privileges required.")
    
    customer = crud.get_customer_by_id(db, current_user.customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer organization not found.")
    
    return customer
    
# ... (update_customer_details and delete_customer remain the same, ensure they check for Admin/SuperAdmin)

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

@app.get("/api/superadmin/license-requests", response_model=List[schemas.SuperAdminActivityLog])
async def super_admin_get_license_requests(
    current_super_admin: models.User = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    return crud.get_license_requests(db)

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

# ... (Rest of main.py content omitted for brevity)
