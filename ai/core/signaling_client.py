import json
import websockets
from websockets.exceptions import ConnectionClosed
import asyncio


class SignalingClient:
    def __init__(self, server_url: str, room: str, name: str, on_message_callback):
        self.server_url = server_url
        self.room = room
        self.name = name
        self.ws = None
        self.on_message_callback = on_message_callback

    async def connect(self):
        url = f"{self.server_url.rstrip('/')}/{self.room}/{self.name}"
        print(f"[Signaling] Connecting to {url}")
        try:
            # --- DEFINITIVE FIX: Add the required Origin header ---
            # This is the only change needed. It uses 'additional_headers', which is
            # correct for your modern websockets library.
            headers = {"Origin": "http://localhost"}
            self.ws = await websockets.connect(url, additional_headers=headers)
            print(f"[Signaling] ✅ Connection successful.")
            return self.ws
        except Exception as e:
            print(f"[Signaling] ❌ Connection failed: {e}")
            raise

    async def send(self, payload: dict):
        if not self.ws: return
        try:
            await self.ws.send(json.dumps(payload))
        except ConnectionClosed:
            print("[Signaling] Connection closed while sending message")

    async def listen(self):
        if not self.ws: return
        try:
            async for msg in self.ws:
                await self.on_message_callback(json.loads(msg))
        except asyncio.CancelledError:
            pass  # task cancelled, normal shutdown
        except ConnectionResetError:
            print(f"[SignalingClient:{self.name}] ⚠️ Connection reset by peer.")
        except websockets.ConnectionClosed:
            print(f"[SignalingClient:{self.name}] 🔌 WebSocket closed normally.")
        except Exception as e:
            print(f"[SignalingClient:{self.name}] ❌ Unexpected error in listen loop: {e}")