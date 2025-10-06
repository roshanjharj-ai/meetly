# signaling_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Dict

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

# rooms: room_id -> { user_id: {"ws": WebSocket } }
rooms: Dict[str, Dict[str, Dict]] = {}

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[server] New WS connection: room={room_id} user={user_id}")

    # add user to room
    if room_id not in rooms:
        rooms[room_id] = {}
    rooms[room_id][user_id] = {"ws": websocket}

    # notify existing users about the newcomer
    user_list = list(rooms[room_id].keys())
    join_msg = {"type": "user_list", "users": user_list}
    await broadcast(room_id, join_msg)

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

            # forwarding signaling messages
            if msg_type == "signal":
                # keep exact payload
                target = msg.get("to")
                if not target:
                    await safe_send(websocket, {"type": "error", "message": "missing 'to' in signal"})
                    continue
                if room_id in rooms and target in rooms[room_id]:
                    print(f"[server] Forwarding signal from {user_id} to {target} (action={msg.get('action')})")
                    await safe_send(rooms[room_id][target]["ws"], msg)
                else:
                    print(f"[server] Target {target} not present in room {room_id}")
                    await safe_send(websocket, {
                        "type": "error",
                        "message": f"target {target} not found in room"
                    })

            # bot_audio / bot_text broadcast
            elif msg_type in ("bot_audio", "bot_text"):
                print(f"[server] Broadcasting {msg_type} from {user_id} to room {room_id}")
                # broadcast to all in the room except sender
                for uid, info in list(rooms[room_id].items()):
                    if uid == user_id:
                        continue
                    await safe_send(info["ws"], msg)

            # user_list / other messages: ignore or broadcast as needed
            else:
                # Unknown types: ignore but you can add handling here
                print(f"[server] Ignoring unknown message type: {msg_type}")
                continue

    except WebSocketDisconnect:
        print(f"[server] WebSocketDisconnect: {user_id}")
    finally:
        # cleanup on disconnect
        if room_id in rooms and user_id in rooms[room_id]:
            try:
                del rooms[room_id][user_id]
            except KeyError:
                pass

        # notify remaining users about updated user list
        if room_id in rooms:
            user_list = list(rooms[room_id].keys())
            update_msg = {"type": "user_list", "users": user_list}
            await broadcast(room_id, update_msg)

        # delete room if empty
        if room_id in rooms and not rooms[room_id]:
            del rooms[room_id]

# -------------------------------------------------------------------
# Helper functions
# -------------------------------------------------------------------
async def safe_send(ws: WebSocket, msg: dict):
    try:
        await ws.send_text(json.dumps(msg))
    except Exception as e:
        print(f"[server] safe_send error: {e}")
        try:
            await ws.close()
        except:
            pass

async def broadcast(room_id: str, msg: dict):
    """Send message to all clients in a room"""
    if room_id not in rooms:
        return
    for uid, info in list(rooms[room_id].items()):
        await safe_send(info["ws"], msg)
