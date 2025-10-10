// src/hooks/WebRTCManager.ts
/* eslint-disable no-console */
export type PeerStatus = { isMuted: boolean; isCameraOff: boolean };

export type ChatMessagePayload = {
    id: string;
    from: string;
    text?: string;
    attachments?: { name: string; dataUrl: string }[];
    ts: number;
};

type SignalMsg = {
    type: "signal" | "user_list" | "error" | "bot_audio";
    action?: "offer" | "answer" | "ice" | "screen_update";
    from?: string;
    to?: string;
    payload?: any;
    users?: string[];
    data?: string;
    format?: string;
    speaker?: string;
};

type DataChannelMessage =
    | { type: "content_update"; payload: string }
    | { type: "status_update"; payload: PeerStatus }
    | { type: "screen_update"; payload: { sharing: boolean; by: string } }
    | { type: "chat_message"; payload: ChatMessagePayload };

type PeerMap = Record<string, RTCPeerConnection>;
type DCMap = Record<string, RTCDataChannel>;

const DEFAULT_SIGNALING_URL = (import.meta.env.VITE_WEBSOCKET_URL as string) || "ws://127.0.0.1:8000";

/**
 * WebRTCManager - encapsulates WebRTC logic. Keeps same behavior as before,
 * only reorganized for modularity and testability.
 */
export default class WebRTCManager {
    room: string;
    userId: string;
    signalingUrl: string;
    BOT_NAME = "Jarvis";

    ws: WebSocket | null = null;
    peers: PeerMap = {};
    dataChannels: DCMap = {};
    localStream: MediaStream | null = null;

    screenStream: MediaStream | null = null;
    screenSenders: Record<string, RTCRtpSender[]> = {};

    creatingPeer: Record<string, boolean> = {};
    pendingScreen: string | null = null;

    // Callbacks (to be assigned by the hook)
    onUsers?: (u: string[]) => void;
    onRemoteStream?: (peerId: string, s: MediaStream | null) => void;
    onRemoteScreen?: (peerId: string, s: MediaStream | null) => void;
    onSharingBy?: (by: string | null) => void;
    onPeerStatus?: (peerId: string, st: PeerStatus) => void;
    onSharedContent?: (c: string) => void;
    onBotAudio?: (data: string, fmt?: string, speaker?: string) => void;
    onChat?: (msg: ChatMessagePayload) => void;
    onSpeaking?: (speaking: boolean) => void;

    iceConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    constructor(room: string, userId: string, signalingUrl?: string) {
        this.room = room;
        this.userId = userId;
        this.signalingUrl = signalingUrl || DEFAULT_SIGNALING_URL;
    }

    log(...args: any[]) {
        console.log("[useWebRTC]", ...args);
    }

    buildWsUrl() {
        const base = this.signalingUrl.endsWith("/") ? this.signalingUrl.slice(0, -1) : this.signalingUrl;
        const path = base.endsWith("/ws") ? "" : "/ws";
        return `${base}${path}/${this.room}/${this.userId}`;
    }

    wsSend(obj: any) {
        const payload = JSON.stringify(obj);
        if (!this.ws) {
            this.log("wsSend: no ws instance; dropping", obj);
            return;
        }
        if (this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(payload);
            } catch (err) {
                this.log("wsSend send failed:", err);
            }
            return;
        }
        if (this.ws.readyState === WebSocket.CONNECTING) {
            const onOpen = () => {
                try {
                    this.ws?.send(payload);
                } catch (e) {
                    this.log("wsSend: delayed send failed", e);
                }
            };
            this.ws.addEventListener("open", onOpen, { once: true });
            return;
        }
        this.log("wsSend: websocket not open", this.ws.readyState, obj);
    }

    async ensureLocalStream() {
        if (!this.localStream) {
            const st = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            this.localStream = st;
        }
        return this.localStream;
    }

    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            this.log("connect called but ws already open/connecting");
            return;
        }
        await this.ensureLocalStream();
        const url = this.buildWsUrl();
        this.log("Connecting to:", url);
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
            this.log("WebSocket open:", url);
        };

        ws.onerror = (err) => {
            this.log("WebSocket error", err);
        };

        ws.onclose = (ev) => {
            this.log("WebSocket closed", ev);
        };

        ws.onmessage = async (evt) => {
            try {
                const msg: SignalMsg = JSON.parse(evt.data);
                await this.handleServerMessage(msg);
            } catch (err) {
                this.log("WS message parse error:", err);
            }
        };
    }

    disconnect() {
        this.log("Disconnecting manager...");
        try {
            this.ws?.close();
        } catch { }
        Object.values(this.peers).forEach((pc) => {
            try {
                pc.close();
            } catch { }
        });
        if (this.localStream) this.localStream.getTracks().forEach((t) => t.stop());
        if (this.screenStream) this.screenStream.getTracks().forEach((t) => t.stop());
        this.peers = {};
        this.dataChannels = {};
        this.screenSenders = {};
        this.pendingScreen = null;
        this.creatingPeer = {};
        this.onUsers?.([]);
        this.onSharingBy?.(null);
    }

    async handleServerMessage(msg: SignalMsg) {
        if (msg.type === "user_list") {
            const list = msg.users || [];
            this.onUsers?.(list);
            for (const peerId of list.filter((u) => u !== this.userId)) {
                if (!this.peers[peerId]) {
                    const isInitiator = this.userId < peerId;
                    await this.createPeer(peerId, isInitiator);
                }
            }
            return;
        }
        if (msg.type === "bot_audio") {
            this.onBotAudio?.(msg.data || "", msg.format, msg.speaker);
            return;
        }
        if (msg.type === "signal") {
            await this.handleSignal(msg);
            return;
        }
    }

    async handleSignal(msg: SignalMsg) {
        const { action, from, payload } = msg;
        if (!from) return;
        const pc = this.peers[from] || (await this.createPeer(from, false));
        if (action === "offer") {
            if (pc.signalingState !== "stable") {
                this.log(`[SIGNAL] skipping offer from ${from} because signalingState=${pc.signalingState}`);
                return;
            }
            await pc.setRemoteDescription(payload);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.wsSend({ type: "signal", action: "answer", from: this.userId, to: from, payload: pc.localDescription });
        } else if (action === "answer") {
            if (pc.signalingState === "stable") {
                this.log(`[SIGNAL] ignoring duplicate answer from ${from}`);
                return;
            }
            try {
                await pc.setRemoteDescription(payload);
            } catch (err) {
                this.log("setRemoteDescription(answer) failed:", err);
            }
        } else if (action === "ice") {
            if (payload) {
                try {
                    await pc.addIceCandidate(payload);
                } catch (err) {
                    this.log("addIceCandidate failed:", err);
                }
            }
        } else if (action === "screen_update") {
            const { sharing, by } = payload || {};
            if (sharing) {
                this.pendingScreen = by;
                this.onSharingBy?.(by);
            } else {
                if (this.pendingScreen === by) this.pendingScreen = null;
                this.onRemoteScreen?.(by, null);
                if (this.onSharingBy) this.onSharingBy(null);
            }
        }
    }

    private handleDataChannelMessage(ev: MessageEvent, peerId: string) {
        try {
            console.log(`handleDataChannelMessage` + ev.data);
            const msg: DataChannelMessage = JSON.parse(ev.data);
            if (msg.type === "content_update") {
                this.onSharedContent?.(msg.payload);
            } else if (msg.type === "status_update") {
                this.onPeerStatus?.(peerId, msg.payload);
            } else if (msg.type === "screen_update") {
                const { sharing, by } = msg.payload;
                if (sharing) {
                    this.pendingScreen = by;
                    this.onSharingBy?.(by);
                } else {
                    this.onRemoteScreen?.(by, null);
                    if (this.onSharingBy) this.onSharingBy(null);
                }
            } else if (msg.type === "chat_message") {
                this.onChat?.(msg.payload);
            }
        } catch (err) {
            this.log("DC parse error:", err);
        }
    }

    private attachLocalTracksToPc(pc: RTCPeerConnection) {
        if (!this.localStream) return;
        this.localStream.getTracks().forEach((track) => {
            try {
                pc.addTrack(track, this.localStream as MediaStream);
            } catch { }
        });
    }

    private async createPeer(targetId: string, isInitiator: boolean) {
        if (this.peers[targetId]) return this.peers[targetId];
        if (this.creatingPeer[targetId]) {
            for (let i = 0; i < 20; i++) {
                if (this.peers[targetId]) return this.peers[targetId];
                await new Promise((r) => setTimeout(r, 50));
            }
        }
        this.creatingPeer[targetId] = true;
        this.log("Creating peer for", targetId, "initiator:", isInitiator);
        const pc = new RTCPeerConnection(this.iceConfig);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.wsSend({ type: "signal", action: "ice", from: this.userId, to: targetId, payload: e.candidate });
            }
        };

        pc.onconnectionstatechange = () => {
            if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
                try {
                    pc.close();
                } catch { }
                delete this.peers[targetId];
                delete this.dataChannels[targetId];
                delete this.screenSenders[targetId];
                this.onRemoteStream?.(targetId, null);
                this.onRemoteScreen?.(targetId, null);
                this.onPeerStatus?.(targetId, { isMuted: false, isCameraOff: false });
                if (this.onSharingBy) {
                    this.onSharingBy(null);
                }
            }
        };

        pc.ontrack = (evt) => {
            try {
                const stream = evt.streams[0];
                const track = evt.track;
                const label = String(track.label || "").toLowerCase();
                const settings = (track as any).getSettings?.() || {};
                const displaySurface = String(settings.displaySurface || "").toLowerCase();

                let isScreen = false;
                if (track.kind === "video") {
                    if (displaySurface === "monitor" || displaySurface === "window" || displaySurface === "application") {
                        isScreen = true;
                    } else if (label.includes("screen")) {
                        isScreen = true;
                    } else if (this.pendingScreen === targetId) {
                        isScreen = true;
                        this.pendingScreen = null;
                    }
                }

                if (isScreen) {
                    this.log("Received screen track from", targetId);
                    this.onRemoteScreen?.(targetId, stream);
                    this.onSharingBy?.(targetId);
                } else {
                    this.log("Received normal media track from", targetId);
                    this.onRemoteStream?.(targetId, stream);
                }
            } catch (err) {
                this.log("ontrack error:", err);
            }
        };

        if (isInitiator) {
            const dc = pc.createDataChannel("datachannel");
            this.dataChannels[targetId] = dc;
            dc.onmessage = (ev) => this.handleDataChannelMessage(ev, targetId);
        } else {
            pc.ondatachannel = (e) => {
                const dc = e.channel;
                this.dataChannels[targetId] = dc;
                dc.onmessage = (ev) => this.handleDataChannelMessage(ev, targetId);
            };
        }

        this.attachLocalTracksToPc(pc);

        if (this.screenStream) {
            const added: RTCRtpSender[] = [];
            this.screenStream.getTracks().forEach((t) => {
                try {
                    const s = pc.addTrack(t, this.screenStream as MediaStream);
                    if (s) added.push(s);
                } catch { }
            });
            if (added.length) this.screenSenders[targetId] = added;
        }

        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.wsSend({ type: "signal", action: "offer", from: this.userId, to: targetId, payload: pc.localDescription });
        }

        this.peers[targetId] = pc;
        this.creatingPeer[targetId] = false;
        return pc;
    }

    broadcastDataChannel(message: DataChannelMessage) {
        const str = JSON.stringify(message);
        Object.values(this.dataChannels).forEach((dc) => {
            try {
                if (dc.readyState === "open") dc.send(str);
            } catch (e) {
                this.log("DC send error", e);
            }
        });
    }

    sendContentUpdate(content: string) {
        this.broadcastDataChannel({ type: "content_update", payload: content });
    }

    broadcastStatus(status: PeerStatus) {
        this.broadcastDataChannel({ type: "status_update", payload: status });
    }

    sendChatMessage(payload: ChatMessagePayload) {
        this.broadcastDataChannel({ type: "chat_message", payload });
    }

    async startScreenShare() {
        if (this.screenStream) return;
        try {
            const displayStream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { cursor: "always" },
                audio: false,
            });
            this.screenStream = displayStream;
            console.log("this.screenStream")
            Object.entries(this.peers).forEach(([peerId, pc]) => {
                const added: RTCRtpSender[] = [];
                displayStream.getTracks().forEach((t) => {
                    try {
                        const s = pc.addTrack(t, displayStream);
                        if (s) added.push(s);
                    } catch (e) {
                        this.log("addTrack screen failed for", peerId, e);
                    }
                });
                if (added.length) this.screenSenders[peerId] = added;
                if (pc.signalingState === "stable") {
                    pc.createOffer()
                        .then((offer) => pc.setLocalDescription(offer))
                        .then(() => {
                            this.wsSend({ type: "signal", action: "offer", from: this.userId, to: peerId, payload: pc.localDescription });
                        })
                        .catch((e) => this.log("renegotiate error:", e));
                }
            });
            console.log("this.screenStream2")
            this.wsSend({ type: "signal", action: "screen_update", from: this.userId, payload: { sharing: true, by: this.userId } });
            this.broadcastDataChannel({ type: "screen_update", payload: { sharing: true, by: this.userId } });
            console.log("this.screenStream3")
            displayStream.getVideoTracks().forEach((t) => {
                t.onended = () => {
                    this.stopScreenShare();
                };
            });
            console.log("this.screenStream4")
        } catch (err) {
            this.log("startScreenShare failed", err);
            throw err;
        }
    }

    stopScreenShare() {
        try {
            if (this.screenStream) {
                this.screenStream.getTracks().forEach((t) => {
                    try { t.stop(); } catch { }
                });
                this.screenStream = null;
            }
            Object.entries(this.screenSenders).forEach(([peerId, senders]) => {
                const pc = this.peers[peerId];
                try {
                    senders.forEach((s) => {
                        try {
                            pc.removeTrack(s);
                        } catch { }
                    });
                } catch { }
            });
            this.screenSenders = {};
            this.wsSend({ type: "signal", action: "screen_update", from: this.userId, payload: { sharing: false, by: this.userId } });
            this.broadcastDataChannel({ type: "screen_update", payload: { sharing: false, by: this.userId } });
            this.pendingScreen = null;
            this.onSharingBy?.(null);
            this.onRemoteScreen?.(this.userId, null);
        } catch (err) {
            this.log("stopScreenShare error", err);
        }
    }
}
