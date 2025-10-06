import json
import asyncio
import time
from aiortc import RTCSessionDescription
from aiortc.mediastreams import MediaStreamError

from core.signaling_client import SignalingClient
from core.rtc_peer import RTCPeerManager
from core.audio_utils import wav_to_base64
from modules.text_to_speech import TextToSpeechConverter
from modules.speech_to_text import SpeechToTextConverter
from modules.text_processor import TextProcessor


class VirtualListener:
    def __init__(self, room: str, name: str, server: str):
        self.room = room
        self.name = name
        self.server = server
        self.signaling = SignalingClient(server, room, name, self._on_signaling_message)
        self.peer_manager = RTCPeerManager(self)
        self.tts = TextToSpeechConverter()
        self.stt = SpeechToTextConverter()
        self.processor = TextProcessor()
        self.users = []

    async def connect(self):
        await self.signaling.connect()
        asyncio.create_task(self.signaling.listen())

    async def _on_signaling_message(self, data):
        msg_type = data.get("type")
        if msg_type == "user_list":
            await self._handle_user_list(data)
        elif msg_type == "signal":
            await self._handle_signal(data)

    async def _handle_user_list(self, data):
        new_users = data.get("users", [])
        print(f"[bot:{self.name}] Users in room: {new_users}")
        for user_id in new_users:
            if user_id not in self.users and user_id != self.name:
                await self._broadcast_message(f"Welcome {user_id}", user_id)
        self.users = new_users

    async def _handle_signal(self, data):
        action = data["action"]
        payload = data["payload"]
        from_id = data["from"]
        pc = await self.peer_manager.create_peer(from_id)

        if action == "offer":
            await pc.setRemoteDescription(RTCSessionDescription(**payload))
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await self.signaling.send({
                "type": "signal", "action": "answer", "to": from_id, "from": self.name,
                "payload": {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
            })
        elif action == "answer":
            await pc.setRemoteDescription(RTCSessionDescription(**payload))
        elif action == "ice":
            await self.peer_manager.add_ice_candidate(pc, payload)

    async def _on_speech_segment(self, pcm16_bytes, remote_id, sample_rate):
        if not pcm16_bytes or len(pcm16_bytes) < 3200:  # less than 0.1s of audio
            return

        text = await self.stt.transcribe(pcm16_bytes, sample_rate)
        if not text:
            print(f"[bot:{self.name}] ❌ STT failed (no speech detected)")
            return
        speaker_name = remote_id or "Unknown"
        
        print(f"[bot:{self.name}] 🗣️ {speaker_name} said: '{text}'")
        reply = await self.processor.generate_reply(text, speaker_name=speaker_name)
        await self._broadcast_message(reply, remote_id)

    async def _broadcast_message(self, message, to_user):
        wav_path = self.tts.convert_get_file(message)
        b64_audio = wav_to_base64(wav_path)
        await self.signaling.send({
            "type": "bot_audio", "from": self.name, "to": to_user,
            "format": "wav", "data": b64_audio
        })
        print(f"[bot:{self.name}] 📡 Sent bot_audio → {to_user}: '{message}'")


# --- helper to consume audio (used by rtc_peer.py) ---
async def consume_audio_track(listener, track, remote_id):
    import webrtcvad, numpy as np
    from av import AudioResampler
    vad = webrtcvad.Vad(2)
    target_rate = 16000
    resampler = AudioResampler(format="s16", layout="mono", rate=target_rate)
    frame_ms = 20
    frame_bytes = int(target_rate * frame_ms / 1000) * 2
    buffer, segment = bytearray(), bytearray()
    silence_timeout = 1.0
    voiced = False
    last_voice_time = time.time()

    print(f"[pc:{remote_id}] 🎧 Listening for speech (VAD active)...")

    async def finalize():
        if segment:
            await listener._on_speech_segment(bytes(segment), remote_id, target_rate)
            segment.clear()

    while True:
        try:
            frame = await track.recv()
        except MediaStreamError:
            await finalize()
            break

        for f in resampler.resample(frame):
            if not f: continue
            pcm = f.to_ndarray().tobytes()
            buffer.extend(pcm)
            while len(buffer) >= frame_bytes:
                chunk = bytes(buffer[:frame_bytes])
                del buffer[:frame_bytes]
                is_speech = vad.is_speech(chunk, target_rate)
                #rms = np.sqrt(np.mean(np.square(np.frombuffer(chunk, np.int16, count=len(chunk)//2)))) / 32768.0
                #print(f"[pc:{remote_id}] 🎤 RMS={rms:.4f} → {'speech' if is_speech else 'silence'}")
                if is_speech:
                    segment.extend(chunk)
                    voiced = True
                    last_voice_time = time.time()
                elif voiced and time.time() - last_voice_time > silence_timeout:
                    await finalize()
                    voiced = False
