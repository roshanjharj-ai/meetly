import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import get_db
import crud, schemas, models
from models import MeetingStatusEnum
import os

router = APIRouter()

# Environment vars
RECORDER_BOT_PREFIX = os.getenv("RECORDER_BOT_PREFIX", "RecorderBot")
BOT_PREFIX = os.getenv("BOT_PREFIX", "Bot")

# In-memory rooms: {room_id: {"users": {user_id: {"ws": ws}}, "host_id": str}}
rooms = {}

# ---------- Safe send / broadcast helpers ----------

async def safe_send(ws: WebSocket, msg: dict):
    """Send a JSON message safely (ignore disconnected sockets)."""
    try:
        if ws.client_state.name == "CONNECTED":
            await ws.send_text(json.dumps(msg))
    except Exception:
        pass


async def broadcast(room_id: str, msg: dict, sender_id: str = None):
    """Broadcast message to all connected users in a room."""
    room = rooms.get(room_id)
    if not room:
        return
    for uid, info in list(room["users"].items()):
        if uid == sender_id:
            continue
        await safe_send(info["ws"], msg)


def current_user_list(room_id: str):
    """Return all user IDs in a room."""
    return list(rooms.get(room_id, {}).get("users", {}).keys())


# ---------- Main WebSocket endpoint ----------

@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str, db: Session = Depends(get_db)):
    await websocket.accept()

    # Register user in memory
    if room_id not in rooms:
        rooms[room_id] = {"users": {}, "host_id": None}
    rooms[room_id]["users"][user_id] = {"ws": websocket}

    print(f"[socket] ✅ {user_id} connected to room {room_id}")

    # Mark host if not set
    if rooms[room_id]["host_id"] is None and not user_id.startswith(RECORDER_BOT_PREFIX):
        rooms[room_id]["host_id"] = user_id

    # Notify room of updated user list
    await broadcast(room_id, {"type": "user_list", "users": current_user_list(room_id)})

    # Update meeting state in DB
    try:
        crud.update_meeting_state(
            db,
            schemas.MeetingStateUpdate(
                room_id=room_id,
                state=MeetingStatusEnum.ACTIVE,
                updated_at=datetime.now(timezone.utc),
            ),
        )
    except Exception as e:
        print(f"[socket] DB update error: {e}")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            mtype = msg.get("type")
            target = msg.get("to")

            # ---------------- Point-to-point signaling ----------------
            if target:
                tgt = rooms.get(room_id, {}).get("users", {}).get(target)
                if tgt:
                    await safe_send(tgt["ws"], msg)
                continue

            # ---------------- Broadcast categories ----------------
            # These events are meant to reach everyone
            if mtype in (
                "bot_audio",
                "bot_message",
                "speaking_update",
                "status_update",
                "content_update",
                "progress_update",
                "recording_update",
                "signal",
                "user_list",
                "meeting_summary",
            ):
                await broadcast(room_id, msg, sender_id=user_id)
                continue

            # ---------------- Chat messages ----------------
            if mtype == "chat_message_to_server":
                payload = msg.get("payload", {})
                payload["from"] = user_id
                try:
                    crud.create_chat_message(
                        db,
                        room_id,
                        schemas.ChatMessagePayload.model_validate(payload),
                    )
                except Exception as e:
                    print(f"[socket] chat DB error: {e}")
                await broadcast(room_id, {"type": "chat_message", "payload": payload})
                continue

            # ---------------- Recorder control ----------------
            if mtype == "recorder_state":
                await broadcast(room_id, msg, sender_id=user_id)
                continue

            # ---------------- Meeting end ----------------
            if mtype == "end_call":
                print(f"[socket] 🔚 Meeting ended by {user_id}")
                await broadcast(room_id, msg, sender_id=user_id)
                crud.update_meeting_state(
                    db,
                    schemas.MeetingStateUpdate(
                        room_id=room_id,
                        state=MeetingStatusEnum.ENDED,
                        updated_at=datetime.now(timezone.utc),
                    ),
                )
                break

            # ---------------- Default: broadcast ----------------
            await broadcast(room_id, msg, sender_id=user_id)

    except WebSocketDisconnect:
        # Cleanup user
        print(f"[socket] ❌ {user_id} disconnected from room {room_id}")
        if room_id in rooms:
            rooms[room_id]["users"].pop(user_id, None)
            if not rooms[room_id]["users"]:
                rooms.pop(room_id, None)
        # Notify remaining users
        if room_id in rooms:
            await broadcast(room_id, {"type": "user_list", "users": current_user_list(room_id)})

        # If host left → mark meeting ended
        if (
            room_id in rooms
            and rooms[room_id].get("host_id") == user_id
            and not user_id.startswith(BOT_PREFIX)
        ):
            crud.update_meeting_state(
                db,
                schemas.MeetingStateUpdate(
                    room_id=room_id,
                    state=models.MeetingState.ENDED,
                    updated_at=datetime.now(timezone.utc),
                ),
            )
            await broadcast(room_id, {"type": "end_call", "reason": "Host left the meeting"})

    except Exception as e:
        print(f"[socket] ⚠️ Unexpected error in {user_id}: {e}")
        await broadcast(room_id, {"type": "user_list", "users": current_user_list(room_id)})

    finally:
        # Final cleanup if no one left
        if room_id in rooms and not rooms[room_id]["users"]:
            try:
                crud.update_meeting_state(
                    db,
                    schemas.MeetingStateUpdate(
                        room_id=room_id,
                        state=models.MeetingState.ENDED,
                        updated_at=datetime.now(timezone.utc),
                    ),
                )
                rooms.pop(room_id, None)
            except Exception:
                pass
