import json
import asyncio
import time
import os
from aiortc import RTCSessionDescription, MediaStreamTrack
from av import AudioFrame
from aiortc.mediastreams import MediaStreamError
from modules.html_generator import HTMLGenerator

from core.signaling_client import SignalingClient
from core.rtc_peer import RTCPeerManager
from core.audio_utils import wav_to_base64
#from modules.text_to_speech_tts import TextToSpeechConverterTTS
from modules.text_to_speech import TextToSpeechConverter
from modules.speech_to_text import SpeechToTextConverter

from personas.scrum_persona import ScrumPersona
from project_manager.ado import ADOProjectManager

class SilentAudioTrack(MediaStreamTrack):
    """A MediaStreamTrack that sends silence."""
    kind = "audio"

    async def recv(self):
        samples = 960
        frame = AudioFrame(format="s16", layout="mono", samples=samples)
        for p in frame.planes:
            p.update(bytes(p.buffer_size))
        await asyncio.sleep(0.02)
        return frame

class VirtualListener:
    def __init__(self, room: str, name: str, server: str):
        self.room = room
        self.name = name
        self.server = server
        self.signaling = SignalingClient(server, room, name, self._on_signaling_message)
        self.peer_manager = RTCPeerManager(self, on_track=self._on_new_track)
        self.tts = TextToSpeechConverter()
        self.stt = SpeechToTextConverter()
        self.persona = ScrumPersona(ADOProjectManager())
        self.persona.attach_bot(self)
        self.users = []
        self.data_channels = {}
        self.pending_content = {}
        self.state_lock = asyncio.Lock()
        self.audio_consumer_tasks = {}
        
    async def connect(self):
        await self.signaling.connect()
        asyncio.create_task(self.signaling.listen())
        asyncio.create_task(self.persona.on_start())
        
    async def _on_new_track(self, track: MediaStreamTrack, remote_id: str):
        print(f"SUCCESS >>> [on_track] Received track kind={track.kind} from {remote_id}")
        
        async with self.state_lock:
            pc = self.peer_manager.peers.get(remote_id)
        
        if not pc or pc.connectionState in ["failed", "closed", "disconnected"]:
            print(f"[bot:{self.name}] ⚠️ Ignoring track from {remote_id}: no active peer connection.")
            return
        
        if track.kind == "audio":
            if remote_id in self.audio_consumer_tasks:
                self.audio_consumer_tasks[remote_id].cancel()
            task = asyncio.create_task(consume_audio_track(self, track, remote_id))
            self.audio_consumer_tasks[remote_id] = task

    async def _on_signaling_message(self, data):
        msg_type = data.get("type")
        if msg_type == "user_list":
            await self._handle_user_list(data)
        elif msg_type == "signal":
            await self._handle_signal(data)

    async def _cleanup_departed_user(self, user_id: str):
        print(f"[bot:{self.name}] 🧹 Cleaning up resources for {user_id}.")
        
        task_to_cancel = self.audio_consumer_tasks.pop(user_id, None)
        # --- FIX: Add safety check before canceling task ---
        if task_to_cancel and not task_to_cancel.done():
            task_to_cancel.cancel()

        pc = self.peer_manager.peers.pop(user_id, None)
        if pc and pc.connectionState != "closed":
            await pc.close()
        
        self.data_channels.pop(user_id, None)
        self.pending_content.pop(user_id, None)
    
    async def _handle_user_list(self, data):
        async with self.state_lock:
            new_user_list = data.get("users", [])
            new_users_set = set(new_user_list)
            current_users_set = set(self.users)
            bot_name_set = {self.name}

            departed_users = current_users_set - new_users_set
            arrived_users = new_users_set - current_users_set - bot_name_set

            for user_id in departed_users:
                await self._cleanup_departed_user(user_id)
            for user_id in arrived_users:
                print(f"[bot:{self.name}] 👋 User {user_id} has joined.")
                asyncio.create_task(self._send_welcome_when_ready(user_id))
            
            self.users = [user for user in new_user_list if user != self.name]

    async def _send_welcome_when_ready(self, user_id):
        timeout = 15
        start = time.time()
        while time.time() - start < timeout:
            async with self.state_lock:
                # Check if user is still in the list before proceeding
                if user_id not in self.users:
                    print(f"[bot:{self.name}] ❌ User {user_id} left before connection was ready.")
                    return
                pc = self.peer_manager.peers.get(user_id)
            
            if pc and pc.connectionState == "connected":
                print(f"[bot:{self.name}] 🤝 Connection ready with {user_id}, sending welcome.")
                await self.persona.on_user_join(user_id, self.users)                
                return
            await asyncio.sleep(0.5)
        print(f"[bot:{self.name}] ⚠️ Timed out waiting for peer connection with {user_id}.")

    async def _handle_signal(self, data):
        from_id = data["from"]
        if not from_id: return

        async with self.state_lock:
            pc = await self.peer_manager.create_peer(from_id)
            if not any(sender.track and sender.track.kind == "audio" for sender in pc.getSenders()):
                pc.addTrack(SilentAudioTrack())
            
            if not hasattr(pc, "_bot_dc_bound"):
                @pc.on("datachannel")
                def _on_datachannel(channel):
                    print(f"[bot:{self.name}] 📡 DataChannel received from {from_id} (label={channel.label})")
                    self.data_channels[from_id] = channel
                    @channel.on("open")
                    def on_open():
                        print(f"[bot:{self.name}] ✅ DataChannel open → {from_id}")
                        asyncio.create_task(self._flush_pending(from_id, channel))
                    @channel.on("message")
                    def on_message(message):
                        try:
                            data = json.loads(message)
                            if data.get("type") == "chat_message":
                                text = data.get("payload", {}).get("text")
                                sender = data.get("payload", {}).get("from")
                                if text and sender:
                                    print(f"[bot:{self.name}] 💬 Chat from {sender}: '{text}'")
                                    asyncio.create_task(self._handle_chat_message(text, sender))
                        except Exception as e:
                            print(f"[bot:{self.name}] ⚠️ Error processing data channel message: {e}")

                pc._bot_dc_bound = True
        
        action = data["action"]
        payload = data["payload"]
        if action == "offer":
            await pc.setRemoteDescription(RTCSessionDescription(**payload))
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await self.signaling.send({"type": "signal", "action": "answer", "to": from_id, "from": self.name, "payload": {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}})
        elif action == "answer":
            await pc.setRemoteDescription(RTCSessionDescription(**payload))
        elif action == "ice":
            await self.peer_manager.add_ice_candidate(pc, payload)

    async def _flush_pending(self, to_user, channel):
        pending = self.pending_content.pop(to_user, [])
        for msg in pending:
            try:
                channel.send(msg)
                print(f"[bot:{self.name}] 🔁 Flushed queued content → {to_user}")
            except Exception as e:
                print(f"[bot:{self.name}] ⚠️ Queue send error: {e}")

    async def _handle_chat_message(self, text: str, speaker_name: str):
        """Processes a text message as if it were spoken."""
        print(f"[bot:{self.name}] 🤖 Processing chat message...")
        await self.persona.on_message(text, speaker_name)

    async def _on_speech_segment(self, pcm16_bytes, remote_id, sample_rate):
        if not pcm16_bytes or len(pcm16_bytes) < 3200:
            return
        text = await self.stt.transcribe(pcm16_bytes, sample_rate)
        if not text:
            return
        print(f"[bot:{self.name}] 🗣️ {remote_id} said: '{text}'")
        await self._handle_chat_message(text, remote_id) # Use the same handler for voice and text

    async def _broadcast_message(self, message, to_user):
        """Sends an audio message to a specific user or all users."""
        wav_path = self.tts.convert_get_file(message)
        b64_audio = wav_to_base64(wav_path)       
        await self.signaling.send({ "type": "speaking_update", "payload": {"speaking": True} })

        # Determine the list of recipients
        recipients = self.users if to_user == "all" else [to_user]

        # Create and send a message to each recipient
        tasks = []
        for user_id in recipients:
            payload = {
                "type": "bot_audio", 
                "from": self.name, 
                "to": user_id,  # Use the specific user_id
                "format": "wav", 
                "data": b64_audio, 
                "speaker": self.name
            }
            tasks.append(self.signaling.send(payload))

        if tasks:
            await asyncio.gather(*tasks) # Send all messages concurrently
        
        await self.signaling.send({ "type": "speaking_update", "payload": {"speaking": False} })
        print(f"[bot:{self.name}] 📡 Sent bot_audio → {to_user}: '{message}'")
        words = len(message.split())
        avg_words_per_sec = 2.5  # adjust for your TTS speed (2.5–3.5 typical)
        estimated_duration = words / avg_words_per_sec
        buffer = 0.6  # small safety margin
        await asyncio.sleep(estimated_duration + buffer)
        print(f"[bot:{self.name}] 💤 Finished speaking.")
        
    async def _broadcast_content(self, message, to_user):
        """Sends a content update to a specific user or all users."""
        payload_obj = {"type": "content_update", "payload": message}
        payload_text = json.dumps(payload_obj)

        # Determine the list of recipients
        recipients = self.users if to_user == "all" else [to_user]
        
        signaling_tasks = []
        for user_id in recipients:
            dc = self.data_channels.get(user_id)
            # Try to send via the more efficient DataChannel first
            if dc and dc.readyState == "open":
                try:
                    dc.send(payload_text)
                    print(f"[_broadcast_content:{self.name}] ✅ Sent via DataChannel → {user_id}")
                    continue  # Skip the signaling fallback if DC works
                except Exception as e:
                    print(f"[_broadcast_content:{self.name}] ⚠️ DataChannel send failed for {user_id}: {e}")

            # If DataChannel fails or is not open, queue content and use signaling as a fallback
            self.pending_content.setdefault(user_id, []).append(payload_text)
            print(f"[_broadcast_content:{self.name}] 🕓 Queued content → {user_id}")
            
            signaling_payload = {
                "type": "content_update", 
                "from": self.name, 
                "to": user_id, # Use the specific user_id
                "payload": message
            }
            signaling_tasks.append(self.signaling.send(signaling_payload))

        if signaling_tasks:
            await asyncio.gather(*signaling_tasks) # Send all fallback messages concurrently
            print(f"[_broadcast_content:{self.name}] 📡 Fallback via signaling sent to {len(signaling_tasks)} user(s).")
            
            
    async def on_graph_state_update(self, state: dict):
        """
        Called by the persona whenever the graph state changes.
        This sends the update to the admin UI via the signaling server.
        """
        print(f"📊 Graph state updated. Notifying admin UI. New state: {state.get('state')}")
        
        # The 'to' field can be a specific admin user ID or a special topic
        # that only admin clients subscribe to.
        try:
            # We need to remove non-serializable objects before sending via JSON
            clean_state = self._clean_state_for_broadcast(state)
            
            await self.signaling.send({
                "type": "admin_state_update",
                "from": self.name,
                "to": "admin_ui", # Or a specific admin user ID
                "payload": clean_state
            })
        except Exception as e:
            print(f"⚠️ Failed to send graph state to admin UI: {e}")

    def _clean_state_for_broadcast(self, state: dict) -> dict:
        """Removes non-serializable objects from the state dictionary."""
        cleaned = {}
        for key, value in state.items():
            if key in ["persona", "pm", "bot"]: # Don't send entire objects
                continue
            if isinstance(value, (dict, list, str, int, float, bool, type(None))):
                cleaned[key] = value
        return cleaned
    
    async def on_progress_update(self, progress_data: dict, to_user: str = "all"):
        """Called by the persona to broadcast meeting progress."""
        print(f"📊 Progress updated. Notifying clients ({to_user}). Current task index: {progress_data.get('current_task_index')}")

        recipients = self.users if to_user == "all" else [to_user]
        
        tasks = []
        for user_id in recipients:
            payload = {
                "type": "progress_update",
                "from": self.name,
                "to": user_id,
                "payload": progress_data
            }
            tasks.append(self.signaling.send(payload))

        if tasks:
            await asyncio.gather(*tasks)

async def consume_audio_track(listener, track, remote_id):
    import webrtcvad
    from av import AudioResampler
    vad = webrtcvad.Vad(2); target_rate = 16000
    resampler = AudioResampler(format="s16", layout="mono", rate=target_rate)
    frame_ms = 20; frame_bytes = int(target_rate * frame_ms / 1000) * 2
    buffer, segment = bytearray(), bytearray()
    silence_timeout = 1.0; voiced = False; last_voice_time = time.time()
    # **FIX**: Add a simple lock to prevent re-entry during processing.
    is_processing = False
    
    print(f"[pc:{remote_id}] 🎧 Listening for speech (VAD active)...")
    
    async def finalize():
        nonlocal is_processing
        # If we are already processing a segment, or the segment is too short, do nothing.
        if is_processing or len(segment) <= frame_bytes:
            segment.clear()
            return
        
        try:
            # Set the lock to prevent other calls
            is_processing = True
            await listener._on_speech_segment(bytes(segment), remote_id, target_rate)
        finally:
            # Clear segment, wait for a cooldown period, and then release the lock.
            segment.clear()
            await asyncio.sleep(0.8) # Cooldown to prevent immediate re-triggering
            is_processing = False
    
    try:
        while True:
            try: frame = await track.recv()
            except MediaStreamError: await finalize(); break
            
            for f in resampler.resample(frame):
                pcm = f.to_ndarray().tobytes(); buffer.extend(pcm)
                while len(buffer) >= frame_bytes:
                    chunk = bytes(buffer[:frame_bytes]); del buffer[:frame_bytes]
                    try:
                        is_speech = vad.is_speech(chunk, target_rate)
                        if is_speech:
                            segment.extend(chunk); voiced = True; last_voice_time = time.time()
                        elif voiced and time.time() - last_voice_time > silence_timeout:
                            await finalize(); voiced = False
                    except Exception: continue
    except asyncio.CancelledError: pass
    finally:
        await finalize()
        print(f"[pc:{remote_id}] 🎧 Audio consumer task finished.")
