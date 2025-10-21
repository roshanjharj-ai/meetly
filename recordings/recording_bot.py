import asyncio
from aiortc import MediaStreamTrack
from core.signaling_client import SignalingClient
from core.rtc_peer import RTCPeerManager
from recording_manager import RecordingManager

class RecordingBot:
    def __init__(self, room_id: str, bot_id: str, server_url: str, ffmpeg_path: str = "ffmpeg"):
        self.room_id = room_id; self.bot_id = bot_id; self.state_lock = asyncio.Lock()
        self.signaling = SignalingClient(server_url, room_id, bot_id, self._on_signaling_message)
        self.peer_manager = RTCPeerManager(self, on_track_callback=self._on_new_track)
        self.recorder = RecordingManager(output_dir="recordings", ffmpeg_path=ffmpeg_path)

    def log(self, *args): print(f"[{self.bot_id}]", *args)
    def is_connected(self) -> bool: return self.signaling.is_connected
    
    async def connect_and_record(self):
        await self.signaling.connect()
        asyncio.create_task(self.signaling.listen())
        await asyncio.sleep(1)
        self.log(f"Connected. Starting recording process.")
        self.recorder.start_recording()
        await self.signaling.send({"type": "recording_update", "is_recording": True})

    async def stop_and_cleanup(self) -> str:
        """Stops the recording with a graceful shutdown sequence."""
        self.log("Starting graceful shutdown...")
        
        # --- DEFINITIVE FIX: Correct Shutdown Order ---
        # 1. Close all peer connections first. This will cause the `track.recv()`
        #    in the pipe tasks to raise an exception, gracefully stopping them.
        self.log("Closing all peer connections...")
        async with self.state_lock:
            peers_to_close = list(self.peer_manager.peers.values())
            for pc in peers_to_close:
                if pc.connectionState != "closed":
                    await pc.close()
            self.peer_manager.peers.clear()

        # 2. Give the pipe-writing tasks a moment to finish closing their stdin
        #    and terminate gracefully.
        self.log("Allowing pipe tasks to finish...")
        await asyncio.sleep(2)

        # 3. NOW, instruct the RecordingManager to stop. It will find that the
        #    FFmpeg processes have finished and are ready to be finalized.
        self.log("Finalizing recordings...")
        output_path = await self.recorder.stop_recording_and_compose()
        
        # 4. Perform final cleanup and send notifications (best-effort).
        try:
            if self.signaling.is_connected:
                await self.signaling.send({"type": "recording_update", "is_recording": False})
        except Exception as e:
            self.log(f"⚠️ Could not send final recording_update message: {e}")

        try:
            if self.signaling.is_connected: await self.signaling.close()
        except Exception as e:
            self.log(f"⚠️ Error during signaling client close: {e}")
        
        return output_path

    async def _on_new_track(self, track: MediaStreamTrack, remote_id: str):
        self.log(f"✅✅✅ SUCCESS: Received remote '{track.kind}' track from '{remote_id}'")

        try:
            if not self.recorder.is_recording:
                return

            kind = track.kind
            label = getattr(track, "label", "").lower()

            if kind == "audio":
                await self.recorder.add_audio_track(track, self.room_id, remote_id)

            elif kind == "video":
                # Distinguish between camera and screen share
                if "screen" in label or "display" in label or "share" in label:
                    track_type = "screenshare"
                else:
                    track_type = "camera"

                await self.recorder.add_video_track(
                    track,
                    self.room_id,
                    remote_id,
                    track_type=track_type
                )

        except Exception as e:
            self.log(f"FATAL ERROR in on_new_track for {remote_id}: {e}")

    async def _on_signaling_message(self, data: dict):
        msg_type = data.get("type")
        if msg_type != "speaker_update":
            self.log(f"Received WS message: {msg_type}")
        if msg_type == "user_list":
            async with self.state_lock:
                for user_id in [u for u in data.get("users", []) if u != self.bot_id]:
                    if user_id not in self.peer_manager.peers:
                        self.log(f"User '{user_id}' found. Initiating connection...")
                        await self.peer_manager.create_peer(user_id, initiator=True)
        elif msg_type == "signal" and data.get("from") != self.bot_id:
            await self.peer_manager.handle_signal(data)