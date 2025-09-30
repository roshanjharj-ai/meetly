import asyncio
import websockets
import json
import os
from dotenv import load_dotenv


from text2speech import TextToSpeechConverter
from speech2text import SpeechToTextConverter
from aibot import AIResponder

# --- Load Environment Variables ---
load_dotenv()

class VirtualParticipant:
    """Manages the WebSocket connection and orchestrates the other classes."""
    def __init__(self, room_id: str, name: str, server_uri: str):
        self.websocket_uri = f"{server_uri}/ws/{room_id}/{name}"
        self.name = name
        self.room_id = room_id
        self.websocket = None
        self.audio_buffer = bytearray()

        # Instantiate the worker classes
        self.stt_converter = SpeechToTextConverter()
        self.responder = AIResponder()
        self.tts_converter = TextToSpeechConverter()

    async def connect(self):
        print(f"🤖 Bot '{self.name}' connecting to room '{self.room_id}'...")
        self.websocket = await websockets.connect(self.websocket_uri)
        print(f"✅ Bot '{self.name}' connected successfully!")
        return True

    async def send_audio(self, audio_bytes: bytes):
        # ⭐ FIX: The correct property is .open
        try:
            if self.websocket:
                await self.websocket.send(audio_bytes)
        except websockets.exceptions.ConnectionClosed:
            print("🔊 Could not send audio, connection is closed.")

    async def handle_utterance(self):
        """
        The core logic pipeline that runs when the user pauses.
        This runs as a background task to not block the listener.
        """
        if not self.audio_buffer:
            return

        buffer_copy = self.audio_buffer
        self.audio_buffer = bytearray()

        # 1. Convert audio to text (blocking, so run in a thread)
        transcribed_text = await asyncio.to_thread(self.stt_converter.convert, buffer_copy)
        if not transcribed_text:
            return

        # 2. Get a response from Gemini (already async)
        response_text = await self.responder.generate_response(transcribed_text)
        if not response_text:
            return
        print(f"💡 Full response pipeline complete. Preparing audio...")
        # 3. Convert response text to audio (blocking, so run in a thread)
        audio_response = await asyncio.to_thread(self.tts_converter.convert, response_text)
        print("💡 Audio ready to send back to client.")
        if not audio_response:
            return
        print("🔊 Sending audio back to client...")
        # 4. Send the audio back to the client
        await self.send_audio(audio_response)
        print("✅ Audio sent successfully.")
    async def listen(self):
        """Listens for messages and triggers the handler on end_of_speech signal."""
        print("👂 Bot is now listening for speech signals...")
        async for message in self.websocket:
            if isinstance(message, bytes):
                self.audio_buffer.extend(message)
            elif isinstance(message, str):
                data = json.loads(message)
                if data.get("type") == "end_of_speech":
                    print("...end of speech signal received. Handling utterance.")
                    # Run the entire pipeline as a background task
                    asyncio.create_task(self.handle_utterance())

    async def run(self):
        """Main execution loop with auto-reconnect."""
        while True:
            try:
                if await self.connect():
                    await self.websocket.recv()
                    print("👍 Handshake complete.")
                    await self.listen()
            except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError) as e:
                print(f"🔌 Connection lost or refused: {type(e).__name__}. Reconnecting in 5s...")
            except Exception as e:
                print(f"An unexpected error occurred: {e}. Reconnecting in 5s...")
            
            await asyncio.sleep(5)