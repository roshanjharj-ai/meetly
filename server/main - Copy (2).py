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

# rooms: room_id -> { user_id: {"name": str, "ws": WebSocket } }
rooms: Dict[str, Dict[str, Dict]] = {}

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{user_id}")
async def signaling(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    # add user to room
    if room_id not in rooms:
        rooms[room_id] = {}
    rooms[room_id][user_id] = {"ws": websocket}

    # notify existing users about the newcomer
    user_list = list(rooms[room_id].keys())
    join_msg = {"type": "user_list", "users": user_list}
    # send updated user list to all users
    for uid, info in list(rooms[room_id].items()):
        try:
            await info["ws"].send_text(json.dumps(join_msg))
        except Exception:
            # stale ws; remove it
            try:
                await info["ws"].close()
            except:
                pass
            del rooms[room_id][uid]

    try:
        while True:
            data = await websocket.receive_text()
            # Expect a JSON object for signaling
            # { type: "signal", action: "offer"/"answer"/"ice", from: user_id, to: target_id, payload: {...} }
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            if msg.get("type") != "signal":
                continue

            target = msg.get("to")
            if not target:
                continue

            # forward to the target if present
            if room_id in rooms and target in rooms[room_id]:
                target_ws = rooms[room_id][target]["ws"]
                try:
                    await target_ws.send_text(json.dumps(msg))
                except Exception:
                    # remove stale and notify
                    try:
                        await target_ws.close()
                    except:
                        pass
                    del rooms[room_id][target]
            else:
                # target not found -> optionally notify sender
                err = {"type": "error", "message": f"target {target} not found in room"}
                try:
                    await websocket.send_text(json.dumps(err))
                except:
                    pass

    except WebSocketDisconnect:
        pass
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
            for uid, info in list(rooms[room_id].items()):
                try:
                    await info["ws"].send_text(json.dumps(update_msg))
                except Exception:
                    try:
                        await info["ws"].close()
                    except:
                        pass
                    del rooms[room_id][uid]

        # delete room if empty
        if room_id in rooms and not rooms[room_id]:
            del rooms[room_id]
