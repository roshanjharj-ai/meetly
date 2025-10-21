# main.py
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from recording_bot import RecordingBot

# --- Configuration ---
WEBSOCKET_URL = os.getenv("WEBSOCKET_URL", "ws://127.0.0.1:8000/ws")

# --- DEFINITIVE FIX for FileNotFoundError: Locate ffmpeg.exe ---
# Get the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))
# Construct the absolute path to ffmpeg.exe inside the 'bin' folder
FFMPEG_PATH = os.path.join(script_dir, "bin", "ffmpeg.exe")

if not os.path.exists(FFMPEG_PATH):
    print(f"FATAL ERROR: ffmpeg.exe not found at {FFMPEG_PATH}")
    print("Please download FFmpeg and place ffmpeg.exe in the 'bin' directory.")
    # You might want to exit here in a real application
    # exit(1)

# --- Application Setup ---
app = FastAPI(title="Meeting Recording Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
active_bots: dict[str, RecordingBot] = {}

class RecordingRequest(BaseModel):
    room_id: str

@app.post("/start-recording")
async def start_recording(request: RecordingRequest):
    room_id = request.room_id
    if room_id in active_bots:
        raise HTTPException(status_code=409, detail=f"Recording already in progress for room '{room_id}'.")
    try:
        bot_id = f"RecorderBot-{room_id[:8]}"
        # Pass the absolute path to the bot
        bot = RecordingBot(room_id, bot_id, WEBSOCKET_URL, ffmpeg_path=FFMPEG_PATH)
        active_bots[room_id] = bot
        asyncio.create_task(bot.connect_and_record())
        await asyncio.sleep(2)
        if not bot.is_connected():
            active_bots.pop(room_id, None)
            raise HTTPException(status_code=500, detail="Bot failed to connect.")
        return {"status": "success", "message": f"Recording started for room '{room_id}'."}
    except Exception as e:
        active_bots.pop(room_id, None)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@app.post("/stop-recording")
async def stop_recording(request: RecordingRequest):
    room_id = request.room_id
    bot = active_bots.get(room_id)
    if not bot:
        raise HTTPException(status_code=404, detail=f"No active recording for room '{room_id}'.")
    try:
        recording_path = await bot.stop_and_cleanup()
        active_bots.pop(room_id, None)
        return {"status": "success", "message": "Recording stopped.", "location": recording_path}
    except Exception as e:
        active_bots.pop(room_id, None)
        raise HTTPException(status_code=500, detail=f"An error occurred during cleanup: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)