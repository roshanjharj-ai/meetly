# signaling_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
from typing import Dict, Any

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
BOT_NAME = "Jarvis" # Define the bot's name to easily target it

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[server] New WS connection: room={room_id} user={user_id}")

    if room_id not in rooms:
        rooms[room_id] = {"users": {}}
    
    rooms[room_id]["users"][user_id] = {"ws": websocket, "speaking": False}

    user_list = list(rooms[room_id]["users"].keys())
    await broadcast(room_id, {"type": "user_list", "users": user_list})
    
    # Send current recording status if it exists
    if rooms[room_id].get("is_recording"):
         await safe_send(websocket, {"type": "recording_update", "is_recording": True})

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            # --- FIX: Explicitly handle recording messages and forward them to the bot ---
            if msg_type == "start_recording" or msg_type == "stop_recording":
                print(f"[server] 🎬 Received '{msg_type}' from {user_id}. Forwarding to bot.")
                bot_info = rooms.get(room_id, {}).get("users", {}).get(BOT_NAME)
                if bot_info:
                    await safe_send(bot_info["ws"], msg)
                else:
                    print(f"[server] ⚠️ Bot '{BOT_NAME}' not found in room '{room_id}' to handle recording.")
            
            # --- FIX: Ensure recording_update from bot is broadcast to all users ---
            elif msg_type == "recording_update":
                print(f"[server] 📢 Broadcasting recording status from bot.")
                is_recording = msg.get("is_recording", False)
                rooms[room_id]["is_recording"] = is_recording
                await broadcast(room_id, msg) # Broadcast to everyone including bot

            elif msg_type == "speaking_update":
                is_speaking = msg.get("payload", {}).get("speaking", False)
                if user_id in rooms.get(room_id, {}).get("users", {}):
                    rooms[room_id]["users"][user_id]["speaking"] = is_speaking
                    all_speakers = {uid: uinfo["speaking"] for uid, uinfo in rooms[room_id]["users"].items()}
                    await broadcast(room_id, {"type": "speaker_update", "speakers": all_speakers})

            elif msg_type == "signal":
                target = msg.get("to")
                if target in rooms.get(room_id, {}).get("users", {}):
                    await safe_send(rooms[room_id]["users"][target]["ws"], msg)
                else:
                    # Delayed retry logic is good, keep it.
                    async def delayed_retry():
                        for _ in range(5):
                            await asyncio.sleep(1)
                            if target in rooms.get(room_id, {}).get("users", {}):
                                await safe_send(rooms[room_id]["users"][target]["ws"], msg)
                                return
                    asyncio.create_task(delayed_retry())
            
            else:
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
                await broadcast(room_id, {"type": "user_list", "users": user_list})

async def safe_send(ws: WebSocket, msg: dict):
    try:
        if ws.client_state.name == 'CONNECTED':
            await ws.send_text(json.dumps(msg))
    except Exception:
        pass # Ignore send errors on disconnected sockets

async def broadcast(room_id: str, msg: dict, sender_id: str = None):
    if room_id in rooms:
        for uid, info in list(rooms[room_id]["users"].items()):
            if sender_id != uid:
                await safe_send(info["ws"], msg)
