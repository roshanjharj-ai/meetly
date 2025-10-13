from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
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

# room_id -> { user_id: { "ws": WebSocket, "attrs": { "speaking": bool, ... } } }
rooms: Dict[str, Dict[str, Dict[str, Any]]] = {}


@app.get("/")
async def health_check():
    return {"status": "ok"}


@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"[server] New WS connection: room={room_id} user={user_id}")

    if room_id not in rooms:
        rooms[room_id] = {}
    rooms[room_id][user_id] = {"ws": websocket, "attrs": {"speaking": False}}

    await broadcast_user_list(room_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "signal":
                target = msg.get("to")
                if target and target in rooms[room_id]:
                    await safe_send(rooms[room_id][target]["ws"], msg)
            elif msg_type in ("bot_audio", "bot_text"):
                for uid, info in rooms[room_id].items():
                    if uid != user_id:
                        await safe_send(info["ws"], msg)
            elif msg_type == "user_attrs":
                attrs = msg.get("attrs", {})
                rooms[room_id][user_id]["attrs"].update(attrs)
                await broadcast_user_list(room_id)
            elif msg_type == "speaking_update":
                payload = msg.get("payload", {})
                speaking = bool(payload.get("speaking", False))
                rooms[room_id][user_id]["attrs"]["speaking"] = speaking
                update_msg = {
                    "type": "speaking_update",
                    "payload": {"id": user_id, "speaking": speaking},
                }
                await broadcast(room_id, update_msg, exclude=user_id)
            else:
                print(f"[server] Ignoring unknown type={msg_type}")

    except WebSocketDisconnect:
        print(f"[server] WebSocketDisconnect: {user_id}")
    finally:
        if room_id in rooms and user_id in rooms[room_id]:
            del rooms[room_id][user_id]
            if not rooms[room_id]:
                del rooms[room_id]
            else:
                await broadcast_user_list(room_id)


async def broadcast_user_list(room_id: str):
    users = [
        {"id": uid, **info["attrs"]}
        for uid, info in rooms.get(room_id, {}).items()
    ]
    msg = {"type": "user_list", "users": users}
    await broadcast(room_id, msg)


async def safe_send(ws: WebSocket, msg: dict):
    try:
        await ws.send_text(json.dumps(msg))
    except Exception as e:
        print(f"[server] safe_send error: {e}")
        try:
            await ws.close()
        except:
            pass


async def broadcast(room_id: str, msg: dict, exclude: str | None = None):
    for uid, info in list(rooms.get(room_id, {}).items()):
        if uid != exclude:
            await safe_send(info["ws"], msg)
