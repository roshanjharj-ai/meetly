# core/rtc_peer.py
import asyncio
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer, RTCIceCandidate
from aiortc.sdp import candidate_from_sdp

class RTCPeerManager:
    def __init__(self, bot, on_track_callback):
        self.bot = bot
        self.on_track_callback = on_track_callback
        self.peers: dict[str, RTCPeerConnection] = {}
        self.ice_config = RTCConfiguration(
            iceServers=[RTCIceServer(urls="stun:stun.l.google.com:19302")],
            bundlePolicy='max-compat'
        )

    async def create_peer(self, peer_id: str, initiator: bool = False) -> RTCPeerConnection:
        if peer_id in self.peers: return self.peers[peer_id]
        pc = RTCPeerConnection(self.ice_config)
        self.peers[peer_id] = pc

        # --- DEFINITIVE FIX for Screen Share ---
        # Explicitly declare that this connection will only receive audio and
        # up to two video streams (one for camera, one for screen share).
        pc.addTransceiver('audio', direction='recvonly')
        pc.addTransceiver('video', direction='recvonly')
        pc.addTransceiver('video', direction='recvonly')

        @pc.on("track")
        async def on_track(track): await self.on_track_callback(track, peer_id)
        
        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            self.bot.log(f"[pc:{peer_id}] connectionState -> {pc.connectionState}")
            if pc.connectionState in ("failed", "closed", "disconnected"):
                if peer_id in self.peers:
                    await self.peers[peer_id].close()
                    self.peers.pop(peer_id, None)

        if initiator:
            @pc.on("icecandidate")
            async def on_icecandidate(candidate):
                if candidate: await self.bot.signaling.send({"type": "signal", "action": "ice", "from": self.bot.bot_id, "to": peer_id, "payload": candidate.to_dict()})
            
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            self.bot.log(f"Sending compatible (recvonly) offer to '{peer_id}'")
            await self.bot.signaling.send({"type": "signal", "action": "offer", "from": self.bot.bot_id, "to": peer_id, "payload": {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}})
        
        return pc

    async def handle_signal(self, data: dict):
        peer_id, action, payload = data.get("from"), data.get("action"), data.get("payload")
        pc = self.peers.get(peer_id)
        if not pc: return

        if action == "answer":
            self.bot.log(f"Received answer from '{peer_id}'")
            await pc.setRemoteDescription(RTCSessionDescription(**payload))
        
        elif action == "ice":
            if payload and payload.get("candidate"):
                try:
                    # This correct parsing logic is preserved
                    parsed_candidate = candidate_from_sdp(payload["candidate"])
                    ice_candidate = RTCIceCandidate(
                        component=parsed_candidate.component, foundation=parsed_candidate.foundation,
                        ip=parsed_candidate.ip, port=parsed_candidate.port, priority=parsed_candidate.priority,
                        protocol=parsed_candidate.protocol, type=parsed_candidate.type,
                        sdpMid=payload.get("sdpMid"), sdpMLineIndex=payload.get("sdpMLineIndex"),
                    )
                    await pc.addIceCandidate(ice_candidate)
                except Exception as e:
                    self.bot.log(f"⚠️ Error adding ICE candidate for {peer_id}: {e}")