# signaling_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import time
from typing import Dict, Any
import os

app = FastAPI()

origins = [
    "https://lemon-moss-0c6f8a61e.1.azurestaticapps.net",
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms: Dict[str, Dict[str, Any]] = {}

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[server] New WS connection: room={room_id} user={user_id}")

    if room_id not in rooms:
        rooms[room_id] = {"users": {}, "is_recording": False} # is_recording is no longer used but safe to keep
    
    rooms[room_id]["users"][user_id] = {"ws": websocket, "speaking": False}

    user_list = list(rooms[room_id]["users"].keys())
    join_msg = {"type": "user_list", "users": user_list}
    await broadcast(room_id, join_msg)
    
    # You can remove this line, as the bot will now manage the recording state
    # await safe_send(websocket, {"type": "recording_update", "is_recording": rooms[room_id]["is_recording"]})

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                print("[server] Received non-JSON message")
                continue

            msg_type = msg.get("type")
            print(f"[server] Received from {user_id}: type={msg_type} keys={list(msg.keys())}")
            
            # --- SIMPLIFIED LOGIC ---
            
            if msg_type == "signal":
                target = msg.get("to")
                if room_id in rooms and target in rooms[room_id]["users"]:
                    await safe_send(rooms[room_id]["users"][target]["ws"], msg)
                else:
                    print(f"[server] ⚠️ Target {target} not present in room {room_id}")
            else:
                # RELAY ALL OTHER MESSAGES (start_recording, stop_recording, speaking_update, etc.)
                # The bot will listen for these and act accordingly.
                await broadcast(room_id, msg, sender_id=user_id)

    except WebSocketDisconnect:
        print(f"[server] WebSocketDisconnect: {user_id}")
    finally:
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            del rooms[room_id]["users"][user_id]
            if not rooms[room_id]["users"]:
                del rooms[room_id]
                print(f"[server] Room {room_id} is empty and has been deleted.")
            else:
                user_list = list(rooms[room_id]["users"].keys())
                update_msg = {"type": "user_list", "users": user_list}
                await broadcast(room_id, update_msg)

# --- Helper functions (Unchanged) ---
async def safe_send(ws: WebSocket, msg: dict):
    # ... (no changes)

async def broadcast(room_id: str, msg: dict, sender_id: str = None):
    # ... (no changes)
