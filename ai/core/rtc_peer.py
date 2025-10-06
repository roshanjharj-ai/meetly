from aiortc import RTCPeerConnection, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiortc.sdp import candidate_from_sdp


ICE_SERVERS = [RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
RTC_CONFIGURATION = RTCConfiguration(iceServers=ICE_SERVERS)


class RTCPeerManager:
    def __init__(self, listener):
        self.listener = listener
        self.peers = {}

    async def create_peer(self, peer_id: str):
        if peer_id in self.peers:
            return self.peers[peer_id]

        pc = RTCPeerConnection(configuration=RTC_CONFIGURATION)
        self.peers[peer_id] = pc

        @pc.on("track")
        async def on_track(track):
            print(f"SUCCESS >>> [on_track] Received track kind={track.kind} from {peer_id}")
            if track.kind == "audio":
                from core.listener import consume_audio_track
                import asyncio
                asyncio.create_task(consume_audio_track(self.listener, track, peer_id))

        @pc.on("connectionstatechange")
        async def on_state_change():
            print(f"[pc:{peer_id}] connectionState -> {pc.connectionState}")
            if pc.connectionState in ("failed", "closed"):
                await pc.close()
                self.peers.pop(peer_id, None)

        return pc

    async def add_ice_candidate(self, pc, payload):
        if not payload.get("candidate"):
            return
        candidate = candidate_from_sdp(payload["candidate"])
        ice = RTCIceCandidate(
            foundation=candidate.foundation,
            component=candidate.component,
            priority=candidate.priority,
            ip=candidate.ip,
            protocol=candidate.protocol,
            port=candidate.port,
            type=candidate.type,
            tcpType=getattr(candidate, "tcpType", None),
            sdpMid=payload.get("sdpMid"),
            sdpMLineIndex=payload.get("sdpMLineIndex"),
        )
        await pc.addIceCandidate(ice)
