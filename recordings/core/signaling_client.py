# core/signaling_client.py
import asyncio
import json
import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus

class SignalingClient:
    """Manages the WebSocket connection and message handling for signaling."""

    def __init__(self, server_url: str, room: str, name: str, on_message_callback):
        self.url = f"{server_url.rstrip('/')}/{room}/{name}"
        self.ws = None
        self.on_message_callback = on_message_callback
        self._is_connected = False
        self.name = name

    @property
    def is_connected(self) -> bool:
        """Returns the current connection status."""
        return self._is_connected

    async def connect(self):
        """Establishes the WebSocket connection with the required Origin header."""
        try:
            print(f"[Signaling] Connecting to {self.url}")
            # The Origin header is crucial for bypassing CORS on the server
            headers = {"Origin": "http://localhost"}
            self.ws = await websockets.connect(self.url)
            self._is_connected = True
            print(f"[Signaling] ✅ Connection successful.")
        except (ConnectionRefusedError, InvalidStatus, OSError) as e:
            self._is_connected = False
            print(f"[Signaling] ❌ Connection failed: {e}")
            raise

    async def listen(self):
        """Listens for incoming messages and handles disconnection."""
        if not self.ws:
            return
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self.on_message_callback(data)
                except json.JSONDecodeError:
                    print(f"[Signaling] ⚠️ Received non-JSON message.")
        except ConnectionClosed:
            print("[Signaling] 🔌 Connection closed.")
        except Exception as e:
            print(f"[SignalingClient:{self.name}] ❌ Unexpected error in listen loop: {e}")
        finally:
            self._is_connected = False

    async def send(self, data: dict):
        """Sends a JSON message over the WebSocket."""
        if self.ws and self.is_connected:
            try:
                await self.ws.send(json.dumps(data))
            except ConnectionClosed:
                self._is_connected = False
                print("[Signaling] ⚠️ Attempted to send on a closed connection.")

    async def close(self):
        """Closes the WebSocket connection gracefully."""
        if self.ws and self.is_connected:
            await self.ws.close()
        self._is_connected = False