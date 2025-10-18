# signaling_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import os
from typing import Dict, Any

# --- Configuration ---
# Using a prefix is more robust for identifying the recorder bot
RECORDER_BOT_PREFIX = os.getenv("RECORDER_BOT_PREFIX", "RecorderBot")

# --- Application Setup ---
app = FastAPI(title="Unified WebRTC Signaling Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use the detailed state structure that supports all your bots
rooms: Dict[str, Dict[str, Any]] = {}

# --- WebSocket Logic ---
@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[Server] ✅ '{user_id}' connected to room '{room_id}'")

    if room_id not in rooms:
        rooms[room_id] = {"users": {}}
    
    rooms[room_id]["users"][user_id] = {"ws": websocket, "speaking": False}
    await broadcast_user_list(room_id)
    
    # Notify the new user if a recording is already in progress
    if rooms[room_id].get("is_recording"):
        await safe_send(websocket, {"type": "recording_update", "is_recording": True})

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")
            
            target_id = msg.get("to")
            if target_id:
                # This is a direct message (offer, answer, ice). Forward it reliably.
                target_user_info = rooms.get(room_id, {}).get("users", {}).get(target_id)
                if target_user_info:
                    await safe_send(target_user_info["ws"], msg)
            else:
                # This is a broadcast-style message. Handle based on type.
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
        # --- DEFINITIVE FIX FOR STALE STATE ---
        # Cleanly remove the user and check if it was the recorder bot.
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            del rooms[room_id]["users"][user_id]
            
            # If the disconnected user was the recorder, reset the flag and notify everyone.
            if user_id.startswith(RECORDER_BOT_PREFIX):
                print(f"[Server] 🔴 Recorder Bot disconnected. Resetting recording status for room '{room_id}'.")
                rooms[room_id]["is_recording"] = False
                await broadcast(room_id, {"type": "recording_update", "is_recording": False})

            if not rooms[room_id]["users"]:
                del rooms[room_id]
                print(f"[Server] 🗑️ Room '{room_id}' is empty and has been deleted.")
            else:
                await broadcast_user_list(room_id)

# --- Helper Functions (Unchanged) ---
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