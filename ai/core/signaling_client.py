import json
import websockets
from websockets.exceptions import ConnectionClosed


class SignalingClient:
    def __init__(self, server_url: str, room: str, name: str, on_message_callback):
        self.server_url = server_url
        self.room = room
        self.name = name
        self.ws = None
        self.on_message_callback = on_message_callback

    async def connect(self):
        url = f"{self.server_url}/{self.room}/{self.name}"
        print(f"[Signaling] Connecting to {url}")
        self.ws = await websockets.connect(url)
        return self.ws

    async def send(self, payload: dict):
        try:
            await self.ws.send(json.dumps(payload))
        except ConnectionClosed:
            print("[Signaling] Connection closed while sending message")

    async def listen(self):
        async for msg in self.ws:
            try:
                data = json.loads(msg)
                await self.on_message_callback(data)
            except Exception as e:
                print(f"[Signaling] Message parse error: {e}")
