from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json
from typing import Dict, List

app = FastAPI()

# A dictionary to hold room information
rooms: Dict[str, Dict] = {}

class ConnectionManager:
    async def broadcast(self, room_id: str, message, sender_id: str):
        """Broadcasts a message to all users in a room, EXCLUDING the sender."""
        if room_id in rooms:
            # Iterate over a copy of the items to allow for safe deletion
            for user_id, user_data in list(rooms[room_id]["users"].items()):
                if user_id != sender_id:
                    # ⭐ FIX: Wrap send in a try/except block to handle dead connections
                    try:
                        if isinstance(message, bytes):
                            await user_data["websocket"].send_bytes(message)
                        else:
                            await user_data["websocket"].send_text(message)
                    except (WebSocketDisconnect, RuntimeError):
                        print(f"Found and removed stale connection for user {user_id}")
                        del rooms[room_id]["users"][user_id]


manager = ConnectionManager()

@app.websocket("/ws/{room_id}/{user_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_name: str):
    await websocket.accept()
    user_id = f"{websocket.client.host}:{websocket.client.port}"

    # Add user to the room
    if room_id not in rooms:
        rooms[room_id] = {"users": {}}
    
    rooms[room_id]["users"][user_id] = {"name": user_name, "websocket": websocket}

    # Prepare and send initial state to the new user
    user_list = [data["name"] for data in rooms[room_id]["users"].values()]
    initial_data = {"type": "initial_state", "user_list": user_list}
    await websocket.send_text(json.dumps(initial_data))

    # Notify others that a new user has joined
    print(f"User '{user_name}' ({user_id}) joined room '{room_id}'. Notifying others...")
    join_notification = {"type": "user_join", "user_list": user_list}
    for uid, udata in list(rooms[room_id]["users"].items()):
        if uid != user_id:
            # ⭐ FIX: Wrap send in a try/except block
            try:
                await udata["websocket"].send_text(json.dumps(join_notification))
            except (WebSocketDisconnect, RuntimeError):
                print(f"Found and removed stale connection for user {uid} during join notification")
                del rooms[room_id]["users"][uid]

    try:
        while True:
            data = await websocket.receive()
            
            message_to_broadcast = None
            if 'bytes' in data:
                message_to_broadcast = data['bytes']
            elif 'text' in data:
                message_to_broadcast = data['text']

            if message_to_broadcast:
                await manager.broadcast(room_id, message_to_broadcast, sender_id=user_id)

    except WebSocketDisconnect:
        print(f"User '{user_name}' ({user_id}) disconnected cleanly.")
    finally:
        # --- Safely handle user removal and notification ---
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            del rooms[room_id]["users"][user_id]
            
            if not rooms[room_id]["users"]:
                print(f"Room '{room_id}' is now empty and has been closed.")
                del rooms[room_id]
            else:
                print(f"Notifying others that '{user_name}' left.")
                user_list = [data["name"] for data in rooms[room_id]["users"].values()]
                leave_notification = {"type": "user_leave", "user_list": user_list}
                for uid, udata in list(rooms[room_id]["users"].items()):
                    # ⭐ FIX: Wrap send in a try/except block
                    try:
                        await udata["websocket"].send_text(json.dumps(leave_notification))
                    except (WebSocketDisconnect, RuntimeError):
                        print(f"Found and removed stale connection for user {uid} during leave notification")
                        del rooms[room_id]["users"][uid]