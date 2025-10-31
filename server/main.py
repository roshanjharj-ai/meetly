# main.py
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine, get_db
import auth 
import crud 
import schemas

# Import Routers from the split files
from api_main import router as api_router
from socket_main import websocket_endpoint

# Import shared dependencies/utilities
from dependencies import get_current_super_admin, enrich_user_response # NEW IMPORT

# This line creates the database tables based on the models defined in models.py
models.Base.metadata.create_all(bind=engine)

# --- Application Setup ---
app = FastAPI(title="Unified Meeting Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register Routes ---

# 2. Register the API router
app.include_router(
    api_router, 
    prefix="/api",
    tags=["API"]
)

# 3. Register the WebSocket endpoint
app.websocket("/ws/{room_id}/{user_id}")(websocket_endpoint)

# NOTE: The dependency functions are no longer defined here, resolving the circular import.