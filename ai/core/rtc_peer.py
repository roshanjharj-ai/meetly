# core/rtc_peer.py
from aiortc import RTCPeerConnection, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiortc.sdp import candidate_from_sdp

class RTCPeerManager:
    """Manages all RTCPeerConnection objects for the Jarvis bot."""

    def __init__(self, listener, on_track=None):
        self.listener = listener
        self.peers = {}
        self.on_track_callback = on_track
        self.ice_config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])

    async def create_peer(self, peer_id: str) -> RTCPeerConnection:
        """Creates and configures a new peer connection for an incoming offer."""
        if peer_id in self.peers:
            return self.peers[peer_id]

        pc = RTCPeerConnection(configuration=self.ice_config)
        self.peers[peer_id] = pc

        @pc.on("track")
        async def on_track(track):
            # Use the decoupled callback passed from the listener
            if self.on_track_callback:
                await self.on_track_callback(track, peer_id)

        @pc.on("connectionstatechange")
        async def on_state_change():
            print(f"[pc:{peer_id}] connectionState -> {pc.connectionState}")
            if pc.connectionState in ("failed", "closed", "disconnected"):
                if peer_id in self.peers:
                    await self.peers[peer_id].close()
                    self.peers.pop(peer_id, None)

        return pc

    async def add_ice_candidate(self, pc: RTCPeerConnection, payload: dict):
        """Correctly parses and adds an ICE candidate received from the client."""
        if not payload or not payload.get("candidate"):
            return
        try:
            # This robustly handles the dictionary format sent by modern browsers
            parsed_candidate = candidate_from_sdp(payload["candidate"])
            ice = RTCIceCandidate(
                foundation=parsed_candidate.foundation,
                component=parsed_candidate.component,
                priority=parsed_candidate.priority,
                ip=parsed_candidate.ip,
                protocol=parsed_candidate.protocol,
                port=parsed_candidate.port,
                type=parsed_candidate.type,
                sdpMid=payload.get("sdpMid"),
                sdpMLineIndex=payload.get("sdpMLineIndex"),
            )
            await pc.addIceCandidate(ice)
        except Exception as e:
            print(f"Error adding ICE candidate for peer: {e}")