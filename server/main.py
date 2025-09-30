from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json
from typing import Dict, List

app = FastAPI()

# A dictionary to hold room information
rooms: Dict[str, Dict] = {}

class ConnectionManager:
    """A robust connection manager that safely handles sending messages."""
    async def broadcast(self, room_id: str, message, sender_id: str):
        if room_id in rooms:
            for user_id, user_data in list(rooms[room_id]["users"].items()):
                if user_id != sender_id:
                    try:
                        if isinstance(message, bytes):
                            await user_data["websocket"].send_bytes(message)
                        else:
                            await user_data["websocket"].send_text(message)
                    except (WebSocketDisconnect, RuntimeError):
                        print(f"Broadcast failed for user {user_id}. Removing stale connection.")
                        del rooms[room_id]["users"][user_id]

manager = ConnectionManager()

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{user_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_name: str):
    await websocket.accept()
    user_id = f"{websocket.client.host}:{websocket.client.port}"

    # --- Add user to the room ---
    if room_id not in rooms:
        rooms[room_id] = {"users": {}}
    rooms[room_id]["users"][user_id] = {"name": user_name, "websocket": websocket}
    
    print(f"User '{user_name}' ({user_id}) joined room '{room_id}'.")

    # --- Notify others that a new user has joined ---
    user_list = [data["name"] for data in rooms[room_id]["users"].values()]
    join_notification = {"type": "user_join", "user_list": user_list}
    for uid, udata in list(rooms[room_id]["users"].items()):
        if uid != user_id:
            try:
                await udata["websocket"].send_text(json.dumps(join_notification))
            except (WebSocketDisconnect, RuntimeError):
                print(f"Join notification failed for user {uid}. Removing stale connection.")
                del rooms[room_id]["users"][uid]
    
    # ⭐ FIX: Use a try...finally block for robust lifecycle management
    try:
        # --- Send initial state to the new user ---
        await websocket.send_text(json.dumps({"type": "initial_state", "user_list": user_list}))
        
        # --- Main listening loop ---
        while True:
            data = await websocket.receive()
            message_to_broadcast = data.get('bytes') or data.get('text')
            if message_to_broadcast:
                await manager.broadcast(room_id, message_to_broadcast, sender_id=user_id)
                
    except WebSocketDisconnect:
        print(f"User '{user_name}' ({user_id}) disconnected cleanly.")
        
    finally:
        # --- This block ALWAYS runs, ensuring cleanup happens exactly once ---
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            del rooms[room_id]["users"][user_id]
            
            if not rooms[room_id]["users"]:
                print(f"Room '{room_id}' is now empty and has been closed.")
                del rooms[room_id]
            else:
                # Notify remaining users
                print(f"Notifying others that '{user_name}' left.")
                user_list = [data["name"] for data in rooms[room_id]["users"].values()]
                leave_notification = {"type": "user_leave", "user_list": user_list}
                for uid, udata in list(rooms[room_id]["users"].items()):
                    try:
                        await udata["websocket"].send_text(json.dumps(leave_notification))
                    except (WebSocketDisconnect, RuntimeError):
                        print(f"Leave notification failed for user {uid}. Removing stale connection.")
                        del rooms[room_id]["users"][uid]