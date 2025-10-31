import asyncio
import base64
import json
import logging
import os
import time
from typing import Dict, List, Optional

import numpy as np
import webrtcvad
from aiortc import RTCSessionDescription, MediaStreamTrack
from aiortc.mediastreams import MediaStreamError
from av import AudioFrame
from av.audio.resampler import AudioResampler
from pydub import AudioSegment

from core.signaling_client import SignalingClient
from core.rtc_peer import RTCPeerManager
from personas.scrum_persona import ScrumPersona
from project_manager.ado import ADOProjectManager
from modules.text_to_speech import TextToSpeechConverter
from modules.speech_to_text import SpeechToTextConverter


logger = logging.getLogger(__name__)


class SilentAudioTrack(MediaStreamTrack):
    kind = "audio"

    async def recv(self):
        samples = 960
        frame = AudioFrame(format="s16", layout="mono", samples=samples)
        for p in frame.planes:
            p.update(bytes(p.buffer_size))
        await asyncio.sleep(0.02)
        return frame


async def _consume_audio_vad(listener: "VirtualListener", track: MediaStreamTrack, remote_id: str):
    vad = webrtcvad.Vad(1)
    rate = 16000
    resampler = AudioResampler(format="s16", layout="mono", rate=rate)
    frame_ms = 20
    frame_bytes = int(rate * frame_ms / 1000) * 2
    buffer = bytearray()
    segment = bytearray()
    voiced = False
    silence_timeout = 0.8
    last_voice_time = time.time()
    processing = False

    async def finalize():
        nonlocal processing
        if processing or len(segment) <= frame_bytes:
            segment.clear()
            return
        processing = True
        try:
            if not (listener._listening_paused or listener._is_speaking):
                await listener._on_speech_segment(bytes(segment), remote_id, rate)
        finally:
            segment.clear()
            await asyncio.sleep(0.25)
            processing = False

    try:
        while True:
            try:
                frame = await track.recv()
            except MediaStreamError:
                await finalize()
                break

            if listener._is_speaking or listener._listening_paused:
                continue

            try:
                r = resampler.resample(frame)
            except Exception:
                continue
            frames = r if isinstance(r, list) else [r]

            for f in frames:
                arr = f.to_ndarray()
                if arr.dtype != np.int16:
                    # Normalize to int16 expected by VAD
                    arr = (arr * 32767.0).astype(np.int16)
                pcm_bytes = arr.tobytes()
                buffer.extend(pcm_bytes)

                while len(buffer) >= frame_bytes:
                    chunk = bytes(buffer[:frame_bytes])
                    del buffer[:frame_bytes]
                    try:
                        speech = vad.is_speech(chunk, rate)
                    except Exception:
                        continue

                    if speech:
                        segment.extend(chunk)
                        voiced = True
                        last_voice_time = time.time()
                    else:
                        if voiced and (time.time() - last_voice_time) > silence_timeout:
                            await finalize()
                            voiced = False
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[bot:{listener.name}] 🧩 Audio consumer ended: {e}")
    finally:
        await finalize()


class VirtualListener:
    def __init__(self, room: str, name: str, server: str, db_session=None):
        self.room = room
        self.name = name
        self.server = server
        self.db_session = db_session

        self.signaling = SignalingClient(server, room, name, self._on_signaling_message)
        self.peer_manager = RTCPeerManager(self, on_track=self._on_new_track)

        self.tts = TextToSpeechConverter()
        self.stt = SpeechToTextConverter()
        self.persona = ScrumPersona(ADOProjectManager())
        self.persona.attach_bot(self)

        self.connected: bool = False
        self._persona_started: bool = False
        self._is_speaking: bool = False
        self._listening_paused: bool = False

        self.users: List[str] = []
        self.data_channels: Dict[str, any] = {}
        self.pending_content: Dict[str, List[str]] = {}
        self.audio_consumer_tasks: Dict[str, asyncio.Task] = {}
        self.state_lock = asyncio.Lock()

        # serialize TTS to avoid overlap
        self._speech_lock = asyncio.Lock()

    async def connect(self):
        print(f"[bot:{self.name}] 🚀 Starting bot for room '{self.room}' using server '{self.server}'")
        await self.signaling.connect()
        self.connected = True
        asyncio.create_task(self.signaling.listen())
        print(f"[bot:{self.name}] 🚀 Connected; waiting for peers...")

    async def disconnect(self):
        self.connected = False
        await self.signaling.disconnect()

        for uid, task in list(self.audio_consumer_tasks.items()):
            try:
                if task and not task.done():
                    task.cancel()
            except Exception:
                pass
        self.audio_consumer_tasks.clear()

        for uid, pc in list(self.peer_manager.peers.items()):
            try:
                if pc.connectionState != "closed":
                    await pc.close()
            except Exception:
                pass
            self.peer_manager.peers.pop(uid, None)

        self.data_channels.clear()
        self.pending_content.clear()

    async def _on_signaling_message(self, data: dict):
        t = data.get("type")
        if t == "user_list":
            await self._handle_user_list(data)
        elif t == "signal":
            await self._handle_signal(data)
        elif t == "chat_message":
            payload = data.get("payload") or {}
            text = (payload.get("text") or "").strip()
            sender = payload.get("from") or data.get("from") or "unknown"
            if text:
                await self._handle_chat_message(text, sender)
        elif t in ("status_update", "speaking_update", "content_update", "progress_update"):
            pass
        elif t == "end_call":
            print(f"[bot:{self.name}] 🔚 Call ended")
            await self.disconnect()

    async def _handle_user_list(self, data: dict):
        async with self.state_lock:
            new_users = data.get("users", [])
            departed = set(self.users) - set(new_users)
            joined = set(new_users) - set(self.users) - {self.name}

        for uid in departed:
            await self._cleanup_departed_user(uid)

        for uid in joined:
            print(f"[bot:{self.name}] 👋 User joined: {uid}")
            asyncio.create_task(self._send_welcome_when_ready(uid))

        self.users = [u for u in new_users if u != self.name]

        if not self._persona_started and self.users:
            async def _wait_and_start():
                timeout = 20
                start = time.time()
                while time.time() - start < timeout:
                    ready = True
                    async with self.state_lock:
                        for uid in self.users:
                            pc = self.peer_manager.peers.get(uid)
                            if not pc or pc.connectionState != "connected":
                                ready = False
                                break
                    if ready:
                        print(f"[bot:{self.name}] ✅ All peers connected → starting persona flow.")
                        await self._start_persona_flow()
                        return
                    await asyncio.sleep(0.5)
                print(f"[bot:{self.name}] ⏱️ Starting persona anyway (timeout).")
                await self._start_persona_flow()
            asyncio.create_task(_wait_and_start())

    async def _handle_signal(self, data: dict):
        from_id: Optional[str] = data.get("from")
        if not from_id:
            return

        async with self.state_lock:
            pc = await self.peer_manager.create_peer(from_id)

            if not any(s.track and s.track.kind == "audio" for s in pc.getSenders()):
                pc.addTrack(SilentAudioTrack())

            if not hasattr(pc, "_bot_dc_bound"):
                @pc.on("datachannel")
                def _on_datachannel(channel):
                    print(f"[bot:{self.name}] 📡 DataChannel from {from_id}")
                    self.data_channels[from_id] = channel

                    @channel.on("open")
                    def on_open():
                        asyncio.create_task(self._flush_pending(from_id, channel))

                    @channel.on("message")
                    def on_message(message):
                        try:
                            payload = json.loads(message)
                            t = payload.get("type")
                            if t == "chat_message":
                                m = payload.get("payload") or {}
                                text = (m.get("text") or "").strip()
                                sender = m.get("from") or from_id
                                if text:
                                    asyncio.create_task(self._handle_chat_message(text, sender))
                        except Exception as e:
                            print(f"[bot:{self.name}] ⚠️ DC message error: {e}")
                pc._bot_dc_bound = True

        action = data.get("action")
        payload = data.get("payload")
        try:
            if action == "offer":
                await pc.setRemoteDescription(RTCSessionDescription(**payload))
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await self.signaling.send({
                    "type": "signal",
                    "action": "answer",
                    "to": from_id,
                    "from": self.name,
                    "payload": {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
                })
            elif action == "answer":
                await pc.setRemoteDescription(RTCSessionDescription(**payload))
            elif action == "ice":
                await self.peer_manager.add_ice_candidate(pc, payload)
        except Exception as e:
            print(f"[bot:{self.name}] ⚠️ Signal handling failed for {from_id}: {e}")

    async def _cleanup_departed_user(self, user_id: str):
        print(f"[bot:{self.name}] 🧹 Cleaning up {user_id}")
        task = self.audio_consumer_tasks.pop(user_id, None)
        if task and not task.done():
            try:
                task.cancel()
            except Exception:
                pass

        pc = self.peer_manager.peers.pop(user_id, None)
        if pc and pc.connectionState != "closed":
            try:
                await pc.close()
            except Exception:
                pass

        self.data_channels.pop(user_id, None)
        self.pending_content.pop(user_id, None)

    async def _on_new_track(self, track: MediaStreamTrack, remote_id: str):
        print(f"[bot:{self.name}] 🎧 ontrack kind={track.kind} from {remote_id}")
        async with self.state_lock:
            pc = self.peer_manager.peers.get(remote_id)

        if not pc or pc.connectionState in ("failed", "closed", "disconnected"):
            return

        if track.kind == "audio":
            old = self.audio_consumer_tasks.get(remote_id)
            if old and not old.done():
                try:
                    old.cancel()
                except Exception:
                    pass
            self.audio_consumer_tasks[remote_id] = asyncio.create_task(
                _consume_audio_vad(self, track, remote_id)
            )

    async def _handle_chat_message(self, text: str, speaker_name: str):
        await self.persona.on_message((text or "").strip(), speaker_name)

    async def _on_speech_segment(self, pcm16_bytes: bytes, remote_id: str, sample_rate: int):
        if self._is_speaking or self._listening_paused:
            return
        if not pcm16_bytes or len(pcm16_bytes) < 3200:
            return
        try:
            text = await self.stt.transcribe(pcm16_bytes, sample_rate)
        except Exception as e:
            print(f"[bot:{self.name}] STT error: {e}")
            return
        if text:
            print(f"[bot:{self.name}] 🗣️ {remote_id}: {text}")
            await self._handle_chat_message(text, remote_id)

    async def _start_persona_flow(self):
        if self._persona_started:
            return
        self._persona_started = True
        try:
            print(f"[bot:{self.name}] 🧩 Scrum meeting starting...")
            await self.persona.on_start()

            if getattr(self.persona, "context", None) is None:
                self.persona.context = {}
            self.persona.context.setdefault("participants", self.users.copy())
            self.persona.context.setdefault("prompt_for_start", True)
            self.persona.context.setdefault("room", self.room)
            self.persona.context.setdefault("bot_name", self.name)
            self.persona.context["persona"] = self.persona

            await asyncio.sleep(0.5)
            print(f"[bot:{self.name}] 🧩 Triggering Scrum graph startup...")
            if hasattr(self.persona, "run_graph_step"):
                await self.persona.run_graph_step()
        except Exception as e:
            print(f"[bot:{self.name}] ⚠️ Failed to start persona flow: {e}")

    async def _send_welcome_when_ready(self, user_id: str):
        timeout = 15
        start = time.time()
        while time.time() - start < timeout:
            async with self.state_lock:
                if user_id not in self.users:
                    return
                pc = self.peer_manager.peers.get(user_id)
            if pc and pc.connectionState == "connected":
                await self.persona.on_user_join(user_id, self.users)
                await self.persona.say(f"Welcome {user_id}! Glad you could join.")
                return
            await asyncio.sleep(0.5)

        await self.persona.on_user_join(user_id, self.users)
        await self.persona.say(f"Welcome {user_id}! Glad you could join.")

    async def _flush_pending(self, to_user: str, channel):
        pending = self.pending_content.pop(to_user, [])
        for msg in pending:
            try:
                channel.send(msg)
            except Exception:
                pass

    def pause_listening(self):
        self._listening_paused = True

    def resume_listening(self):
        self._listening_paused = False

    async def _broadcast_message(self, message: str, to_user: str = "all"):
        async with self._speech_lock:
            self._is_speaking = True
            try:
                await self.signaling.send({"type": "status_update", "payload": {"muted": False, "speaker": self.name}})
                await self.signaling.send({"type": "speaking_update", "payload": {"speaking": True, "speaker": self.name}})
                await self.signaling.send({"type": "bot_message", "speaker": self.name, "message": message})

                tts_path = self.tts.convert_get_file(message)
                print(f"Got file: {tts_path} for message:{message}")
                if tts_path and os.path.exists(tts_path):
                    _, ext = os.path.splitext(tts_path.lower())
                    fmt = "mp3" if ext == ".mp3" else "wav"
                    with open(tts_path, "rb") as f:
                        b64_audio = base64.b64encode(f.read()).decode("ascii")

                    recipients = self.users if to_user == "all" else [to_user]
                    await asyncio.gather(*[
                        self.signaling.send({
                            "type": "bot_audio",
                            "from": self.name,
                            "to": uid,
                            "format": fmt,
                            "data": b64_audio,
                            "speaker": self.name
                        }) for uid in recipients
                    ])

                    try:
                        audio = AudioSegment.from_file(tts_path)
                        duration = audio.duration_seconds
                    except Exception:
                        duration = max(len(message.split()) * 0.4, 2.5)

                    await asyncio.sleep(duration + 0.5)
                    print("Sent Bot Audio")
            except Exception as e:
                print(f"[bot:{self.name}] ⚠️ TTS/Send error: {e}")
            finally:
                await self.signaling.send({"type": "speaking_update", "payload": {"speaking": False, "speaker": self.name}})
                await self.signaling.send({"type": "status_update", "payload": {"muted": True, "speaker": self.name}})
                await asyncio.sleep(0.1)
                self._is_speaking = False

    async def _broadcast_content(self, content, to_user: str = "all"):
        recipients = self.users if to_user == "all" else [to_user]
        tasks = []
        text = json.dumps({"type": "content_update", "payload": content})
        for uid in recipients:
            dc = self.data_channels.get(uid)
            if dc and getattr(dc, "readyState", "") == "open":
                try:
                    dc.send(text)
                    continue
                except Exception:
                    pass
            self.pending_content.setdefault(uid, []).append(text)
            tasks.append(self.signaling.send({
                "type": "content_update", "from": self.name, "to": uid, "payload": content
            }))
        if tasks:
            await asyncio.gather(*tasks)

    async def _broadcast_progress(self, progress_payload, to_user: str = "all"):
        recipients = self.users if to_user == "all" else [to_user]
        await asyncio.gather(*[
            self.signaling.send({
                "type": "progress_update", "from": self.name, "to": uid, "payload": progress_payload
            }) for uid in recipients
        ])


__all__ = ["VirtualListener"]
