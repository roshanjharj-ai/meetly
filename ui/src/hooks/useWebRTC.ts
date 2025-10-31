/* src/hooks/useWebRTC.ts */
/* eslint-disable no-console */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** ---------------------------------------------------------
 * Types (staying compatible with your existing app)
 * --------------------------------------------------------*/
export type PeerStatus = { isMuted?: boolean; isCameraOff?: boolean };
export type ChatMessagePayload = {
  id: string;
  from: string;
  text?: string;
  attachments?: { name: string; dataUrl?: string; url?: string }[];
  ts: number;
  to?: string; // userId or "Group"
};
export type MeetingProgress = {
  tasks: any[];
  current_task_index: number;
  state: string;
  start_time?: string;
  end_time?: string;
};

type SignalMsg = {
  type?: string;
  action?: "offer" | "answer" | "ice";
  from?: string;
  to?: string;
  users?: string[];
  payload?: any;
  format?: string;
  data?: any;
  message?: string;
  speaker?: string;
  is_recording?: boolean;
  speakers?: Record<string, boolean>;
  host_id?: string;
  reason?: string;
};

type DataChannelMessage =
  | { type: "content_update"; payload: string }
  | { type: "status_update"; payload: { muted?: boolean; speaker?: string; isMuted?: boolean; isCameraOff?: boolean } }
  | { type: "screen_update"; payload: { sharing: boolean; by: string } }
  | { type: "chat_message"; payload: ChatMessagePayload }
  | { type: "speaking_update"; payload: { speaking: boolean; speaker: string } };

const WS_BASE = (import.meta as any).env?.VITE_WEBSOCKET_URL || "";
const DEFAULT_BOT_NAMES = (window as any).__BOT_NAMES__ || ["Jarvis", "Bot", "AI-Assistant"];

/** ---------------------------------------------------------
 * Utilities
 * --------------------------------------------------------*/
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function isPolite(selfId: string, otherId: string): boolean {
  const a = stableHash(selfId), b = stableHash(otherId);
  if (a !== b) return a > b;
  return selfId > otherId;
}
class Mutex {
  private p: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.p.then(fn, fn);
    this.p = next.then(() => { }, () => { });
    return next;
  }
}

/** ---------------------------------------------------------
 * Core Manager (glare-safe, multi-peer, VAD, indicators)
 * --------------------------------------------------------*/
class WebRTCManager {
  room: string;
  userId: string;
  wsUrl: string;
  ws: WebSocket | null = null;

  iceConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Replace with your TURN if needed:
      // { urls: "turn:YOUR_TURN", username: "X", credential: "Y" },
    ],
  };

  peers: Record<string, RTCPeerConnection & {
    _makingOffer?: boolean;
    _ignoreOffer?: boolean;
    _queuedCandidates?: RTCIceCandidateInit[];
    _polite?: boolean;
    _negotiationMutex?: Mutex;
    _iceRestartTimer?: number | null;
  }> = {};
  dataChannels: Record<string, RTCDataChannel> = {};

  localStream: MediaStream | null = null;
  preferredAudioDeviceId: string | null = null;
  preferredVideoDeviceId: string | null = null;

  screenStream: MediaStream | null = null;
  screenSenders: Record<string, { replaced: { kind: "audio" | "video"; sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[]; addedSenders: RTCRtpSender[]; }> = {};
  sharingBy: string | null = null;

  // VAD / speaking
  private vadIntervalId: number | null = null;
  private lastSpeaking = false;
  private lastSpeakingSentAt = 0;
  private speakingThrottleMs = 400;
  public localSpeaking = false;

  // initial states
  initialAudioEnabled = true;
  initialVideoEnabled = true;

  // callbacks wired by the hook
  onUsers?: (u: string[]) => void;
  onLocalStream?: (s: MediaStream | null) => void;
  onRemoteStream?: (peerId: string, s: MediaStream | null) => void;
  onRemoteScreen?: (peerId: string, s: MediaStream | null) => void;
  onSharingBy?: (by: string | null) => void;
  onPeerStatus?: (peerId: string, status: PeerStatus & { speaking?: boolean }) => void;
  onSharedContent?: (c: string) => void;
  onChat?: (m: ChatMessagePayload) => void;
  onBotAudio?: (data: string, fmt?: string, speaker?: string) => void;
  onBotMessage?: (m: ChatMessagePayload) => void;
  onRecordingUpdate?: (is_recording: boolean) => void;
  onSpeakerUpdate?: (speakers: Record<string, boolean>) => void;
  onProgressUpdate?: (p: MeetingProgress) => void;
  onEndCall?: (reason?: string) => void;

  creatingPeer: Record<string, boolean> = {};
  usersList: string[] = [];

  constructor(room: string, userId: string, base?: string) {
    this.room = room;
    this.userId = userId;
    const baseUrl = (base || WS_BASE || "").replace(/\/+$/, "");
    this.wsUrl = `${baseUrl}/ws/${encodeURIComponent(room)}/${encodeURIComponent(userId)}`;
  }

  log(...a: any[]) { console.log("[useWebRTC]", ...a); }

  wsSend(obj: any) {
    if (!this.ws) return;
    const s = JSON.stringify(obj);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.addEventListener("open", () => this.ws?.send(s), { once: true });
    }
  }

  /** ---------------- Local media & VAD ---------------- */
  async ensureLocalStream(audio = true, video = true) {
    this.initialAudioEnabled = audio;
    this.initialVideoEnabled = video;

    const a = audio ? { deviceId: this.preferredAudioDeviceId || undefined } : false;
    const v = video ? { deviceId: this.preferredVideoDeviceId || undefined } : false;

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = !!audio);
      this.localStream.getVideoTracks().forEach(t => t.enabled = !!video);
      this.onLocalStream?.(this.localStream);
      return this.localStream;
    }

    if (!audio && !video) {
      this.onLocalStream?.(null);
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: a, video: v });
      stream.getAudioTracks().forEach(t => t.enabled = !!audio);
      stream.getVideoTracks().forEach(t => t.enabled = !!video);
      this.localStream = stream;
      this.onLocalStream?.(stream);
      // start VAD so others see our speaking ring
      this.startLocalVAD();
      return stream;
    } catch (e) {
      this.log("getUserMedia failed:", e);
      this.localStream = null;
      this.onLocalStream?.(null);
      return null;
    }
  }

  async switchDevice(kind: "audioinput" | "videoinput", deviceId: string) {
    if (kind === "audioinput") this.preferredAudioDeviceId = deviceId || null;
    else this.preferredVideoDeviceId = deviceId || null;

    const wantAudio = !!this.initialAudioEnabled;
    const wantVideo = !!this.initialVideoEnabled;

    try {
      const constraints: MediaStreamConstraints = {
        audio: kind === "audioinput" ? { deviceId } : wantAudio,
        video: kind === "videoinput" ? { deviceId } : wantVideo
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = kind === "audioinput"
        ? newStream.getAudioTracks()[0] || null
        : newStream.getVideoTracks()[0] || null;

      if (!newTrack) return;

      if (!this.localStream) this.localStream = new MediaStream();
      const old = this.localStream.getTracks().find(t => t.kind === newTrack.kind);
      if (old) { try { old.stop(); } catch { } try { this.localStream.removeTrack(old); } catch { } }
      this.localStream.addTrack(newTrack);

      Object.values(this.peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === newTrack.kind);
        if (sender) { try { sender.replaceTrack(newTrack); } catch { } }
      });

      this.onLocalStream?.(this.localStream);
    } catch (e) {
      this.log("switchDevice error", e);
    }
  }

  /** Local mute/camera status → broadcast to others (used by broadcastStatus) */
  sendStatusUpdateOverSig(status: { isMuted?: boolean; isCameraOff?: boolean }) {
    const payload = {
      type: "status_update",
      payload: {
        speaker: this.userId,
        muted: status.isMuted,
        isMuted: status.isMuted,
        isCameraOff: status.isCameraOff,
      },
    };
    try { this.broadcastDataChannel(payload as any); } catch { }
    this.wsSend(payload);
    // update local UI immediately
    this.onPeerStatus?.(this.userId, { isMuted: status.isMuted, isCameraOff: status.isCameraOff });
  }

  /** ---------------- Connect / Disconnect ---------------- */
  async connect(initialAudio = true, initialVideo = true) {
    await this.ensureLocalStream(initialAudio, initialVideo);
    this.log("Local stream ready:", this.localStream?.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));

    this.log("Connecting WebSocket →", this.wsUrl);
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    window.meetSocket = ws;

    ws.onopen = () => this.log("✅ WebSocket open");
    ws.onerror = (e) => this.log("❌ WebSocket error", e);
    ws.onclose = () => { this.log("🔌 WebSocket closed"); this.ws = null; };
    ws.onmessage = (evt) => {
      try { this.onWsMessage(JSON.parse(evt.data)); }
      catch (e) { this.log("WS parse error", e); }
    };
  }

  disconnect() {
    this.log("🔴 Disconnect called");
    try {
      this.stopLocalVAD();

      this.localStream?.getTracks().forEach(t => { try { t.stop(); } catch { } });
      this.screenStream?.getTracks().forEach(t => { try { t.stop(); } catch { } });
      this.localStream = null;
      this.screenStream = null;

      Object.values(this.peers).forEach(pc => { try { pc.close(); } catch { } });
      this.peers = {};
      this.dataChannels = {};
      this.screenSenders = {};
      this.sharingBy = null;

      try { this.ws?.close(); } catch { }
      this.ws = null;
    } catch (e) {
      this.log("disconnect error", e);
    }
  }

  /** ---------------- WebSocket messages ---------------- */
  async onWsMessage(msg: SignalMsg) {
    // Room user list
    if (msg.type === "user_list") {
      const list = (msg.users || []).filter(u => u !== this.userId);
      this.usersList = (msg.users || []);
      this.onUsers?.(this.usersList);
      for (const pid of list) if (!this.peers[pid] && !this.creatingPeer[pid]) {
        const polite = isPolite(this.userId, pid);
        const initiator = DEFAULT_BOT_NAMES.includes(pid) ? false : !polite;
        this.createPeer(pid, initiator).catch(() => { });
      }
      return;
    }

    // Fallback indicators via WS
    if (msg.type === "status_update" && (msg as any).payload) {
      const p = (msg as any).payload;
      const speaker = p.speaker || msg.from;
      if (speaker) this.onPeerStatus?.(speaker, { isMuted: p.muted ?? p.isMuted, isCameraOff: p.isCameraOff });
      return;
    }
    if (msg.type === "speaking_update" && (msg as any).payload) {
      const p = (msg as any).payload;
      const speaker = p.speaker || msg.from;
      if (speaker) this.onPeerStatus?.(speaker, { speaking: !!p.speaking });
      return;
    }

    if (msg.type === "signal") { await this.handleSignal(msg); return; }
    if (msg.type === "host_info") { return; }
    if (msg.type === "end_call") { this.onEndCall?.(msg.reason || "Host ended the call"); this.disconnect(); return; }
    if (msg.type === "recording_update") { this.onRecordingUpdate?.(!!msg.is_recording); return; }
    if (msg.type === "speaker_update") { this.onSpeakerUpdate?.(msg.speakers || {}); return; }
    if (msg.type === "content_update") { this.onSharedContent?.(msg.payload || ""); return; }
    if (msg.type === "chat_message") { this.onChat?.(msg.payload as ChatMessagePayload); return; }
    if (msg.type === "bot_audio") { this.onBotAudio?.(msg.data || msg.payload || "", msg.format, msg.speaker); return; }
    if (msg.type === "bot_message") {
      const m: ChatMessagePayload = { id: `bot-${Date.now()}`, from: msg.speaker || "Bot", text: msg.message || (msg.payload as string), ts: Date.now() };
      this.onBotMessage?.(m); this.onChat?.(m); return;
    }
    if (msg.type === "progress_update") { this.onProgressUpdate?.(msg.payload as MeetingProgress); return; }
  }

  /** ---------------- Signaling (glare-safe) ---------------- */
  async handleSignal(msg: SignalMsg) {
    const from = msg.from!;
    let pc = this.peers[from];

    if (!pc && !this.creatingPeer[from]) {
      this.creatingPeer[from] = true;
      try {
        const polite = isPolite(this.userId, from);
        const initiator = DEFAULT_BOT_NAMES.includes(from) ? false : !polite;
        pc = await this.createPeer(from, initiator);
      } finally {
        delete this.creatingPeer[from];
      }
    }
    if (!pc || pc.signalingState === "closed") return;

    const polite = isPolite(this.userId, from);
    pc._polite = polite;

    const isOffer = msg.action === "offer";
    const isAnswer = msg.action === "answer";
    const isIce = msg.action === "ice";

    const collision = isOffer && (pc.signalingState !== "stable" || pc._makingOffer);
    if (collision && !polite) {
      pc._ignoreOffer = true;
      pc._queuedCandidates = [];
      this.log("⚠️ Offer collision → ignoring offer from", from);
      return;
    }

    try {
      if (isOffer) {
        pc._ignoreOffer = !polite && collision;
        if (pc.signalingState !== "stable") {
          try { await pc.setLocalDescription({ type: "rollback" } as any); } catch { }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        if (pc._queuedCandidates?.length) {
          for (const c of pc._queuedCandidates) {
            try { await pc.addIceCandidate(c); } catch { }
          }
          pc._queuedCandidates = [];
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.wsSend({ type: "signal", action: "answer", from: this.userId, to: from, payload: pc.localDescription });
      } else if (isAnswer) {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          if (pc._queuedCandidates?.length) {
            for (const c of pc._queuedCandidates) {
              try { await pc.addIceCandidate(c); } catch { }
            }
            pc._queuedCandidates = [];
          }
        } else {
          this.log("Ignoring answer in state", pc.signalingState);
        }
      } else if (isIce && msg.payload) {
        if (pc._ignoreOffer) return;
        if (!pc.remoteDescription) {
          (pc._queuedCandidates ||= []).push(msg.payload);
        } else {
          try { await pc.addIceCandidate(msg.payload); } catch (e) { this.log("addIceCandidate error", e); }
        }
      }
    } catch (e) {
      this.log("handleSignal error", e);
      try { pc.close(); } catch { }
      delete this.peers[from];
      this.onRemoteStream?.(from, null);
      this.onRemoteScreen?.(from, null);
    } finally {
      if (pc.signalingState === "stable") pc._ignoreOffer = false;
    }
  }

  /** ---------------- Peer creation & tracks ---------------- */
  async createPeer(targetId: string, initiator: boolean) {
    if (this.peers[targetId]) return this.peers[targetId];

    const polite = isPolite(this.userId, targetId);
    const finalInitiator = initiator && !polite;

    const pc: RTCPeerConnection & any = new RTCPeerConnection(this.iceConfig) as any;
    pc._makingOffer = false;
    pc._ignoreOffer = false;
    pc._queuedCandidates = [];
    pc._polite = polite;
    pc._negotiationMutex = new Mutex();
    pc._iceRestartTimer = null;

    this.peers[targetId] = pc;

    // Pre-allocate transceivers (audio, cam video, screen video)
    try {
      if (typeof pc.addTransceiver === "function" && (!pc.getTransceivers || pc.getTransceivers().length === 0)) {
        pc.addTransceiver("audio", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" }); // camera
        pc.addTransceiver("video", { direction: "sendrecv" }); // screen
      }
    } catch { }

    // Ensure local stream and attach/replace
    try { await this.ensureLocalStream(this.initialAudioEnabled, this.initialVideoEnabled); } catch { }
    this.attachLocalTracksTo(pc);

    pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) this.wsSend({ type: "signal", action: "ice", from: this.userId, to: targetId, payload: e.candidate });
    };

    pc.oniceconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(pc.iceConnectionState)) {
        if (pc._iceRestartTimer) clearTimeout(pc._iceRestartTimer);
        pc._iceRestartTimer = window.setTimeout(() => {
          try { (pc as any).restartIce?.(); } catch { }
        }, 2500);
      } else if (pc._iceRestartTimer) {
        clearTimeout(pc._iceRestartTimer);
        pc._iceRestartTimer = null;
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        try { pc.close(); } catch { }
        delete this.peers[targetId];
        this.onRemoteStream?.(targetId, null);
        this.onRemoteScreen?.(targetId, null);
      }
    };

    if (finalInitiator) {
      const dc = pc.createDataChannel("data");
      this.bindDataChannel(dc, targetId);
      this.dataChannels[targetId] = dc;
    } else {
      pc.ondatachannel = (e: any) => {
        this.dataChannels[targetId] = e.channel;
        this.bindDataChannel(e.channel, targetId);
      };
    }

    pc.ontrack = (e: RTCTrackEvent) => {
      const stream = e.streams[0];
      if (!stream) return;
      if (e.track.kind === "audio") {
        // Autoplay remote audio (hidden <audio> element per peer)
        let el = document.getElementById(`audio-${targetId}`) as HTMLAudioElement;
        if (!el) {
          el = document.createElement("audio");
          el.id = `audio-${targetId}`;
          el.autoplay = true;
          (el as any).playsInline = true;
          el.style.display = "none";
          document.body.appendChild(el);
        }
        el.srcObject = stream;
        el.play().catch(() => { el.muted = true; el.play().catch(() => { }); });
      }
      if (e.track.kind === "video") this.onRemoteStream?.(targetId, stream);
    };

    const doNegotiate = async () => {
      if (pc.signalingState !== "stable" || pc._makingOffer) return;
      await pc._negotiationMutex!.run(async () => {
        if (pc._makingOffer || pc.signalingState !== "stable") return;
        pc._makingOffer = true;
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          this.wsSend({ type: "signal", action: "offer", from: this.userId, to: targetId, payload: pc.localDescription });
        } catch (e) {
          // ignore
        } finally {
          pc._makingOffer = false;
        }
      });
    };

    pc.onnegotiationneeded = () => { doNegotiate().catch(() => { }); };
    if (finalInitiator) doNegotiate().catch(() => { });

    return pc;
  }

  attachLocalTracksTo(pc: RTCPeerConnection) {
    if (!this.localStream) return;
    const audio = this.localStream.getAudioTracks()[0] || null;
    const video = this.localStream.getVideoTracks()[0] || null;

    const senders = pc.getSenders();
    const aSender = senders.find(s => s.track?.kind === "audio");
    const vSender = senders.find(s => s.track?.kind === "video");

    if (audio) {
      if (aSender) { try { aSender.replaceTrack(audio); } catch { } }
      else { try { pc.addTrack(audio, this.localStream); } catch { } }
    }
    if (video) {
      if (vSender) { try { vSender.replaceTrack(video); } catch { } }
      else { try { pc.addTrack(video, this.localStream); } catch { } }
    }
  }

  /** ---------------- DataChannel ---------------- */
  bindDataChannel(dc: RTCDataChannel, peerId: string) {
    dc.onmessage = (ev: MessageEvent) => {
      try {
        const obj = JSON.parse(ev.data) as DataChannelMessage;
        if (obj.type === "content_update") this.onSharedContent?.(obj.payload);
        else if (obj.type === "status_update") {
          const p = obj.payload || {};
          const speaker = p.speaker || peerId;
          this.onPeerStatus?.(speaker, { isMuted: p.muted ?? p.isMuted, isCameraOff: p.isCameraOff });
        }
        else if (obj.type === "speaking_update") {
          const p = obj.payload;
          this.onPeerStatus?.(p.speaker || peerId, { speaking: !!p.speaking });
        }
        else if (obj.type === "screen_update") {
          const sharing = obj.payload.sharing;
          const by = obj.payload.by;
          this.sharingBy = sharing ? by : null;
          this.onSharingBy?.(this.sharingBy);
        }
        else if (obj.type === "chat_message") this.onChat?.(obj.payload);
      } catch { }
    };
  }

  broadcastDataChannel(message: DataChannelMessage) {
    const s = JSON.stringify(message);
    Object.values(this.dataChannels).forEach(dc => { try { if (dc.readyState === "open") dc.send(s); } catch { } });
  }

  /** ---------------- Screen share ---------------- */
  async startScreenShare(audioMode: "none" | "mic" | "system" = "none") {
    if (this.screenStream) return;
    const display = await (navigator.mediaDevices as any).getDisplayMedia({ video: { cursor: "always" }, audio: audioMode === "system" });
    if (audioMode === "mic") {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const t = mic.getAudioTracks()[0]; if (t) display.addTrack(t);
      } catch { }
    }
    this.screenStream = display;

    Object.entries(this.peers).forEach(([peerId, pc]) => {
      const store = { replaced: [] as any[], addedSenders: [] as RTCRtpSender[] };
      const v = display.getVideoTracks()[0] || null;
      const a = display.getAudioTracks()[0] || null;

      if (v) {
        const s = pc.getSenders().find(x => x.track?.kind === "video");
        if (s) { store.replaced.push({ kind: "video", sender: s, originalTrack: s.track || null }); try { s.replaceTrack(v); } catch { } }
        else { try { const ns = pc.addTrack(v, display); if (ns) store.addedSenders.push(ns as RTCRtpSender); } catch { } }
      }
      if (a) {
        const s = pc.getSenders().find(x => x.track?.kind === "audio");
        if (s) { store.replaced.push({ kind: "audio", sender: s, originalTrack: s.track || null }); try { s.replaceTrack(a); } catch { } }
        else { try { const ns = pc.addTrack(a, display); if (ns) store.addedSenders.push(ns as RTCRtpSender); } catch { } }
      }
      this.screenSenders[peerId] = store;
    });

    this.sharingBy = this.userId;
    this.onSharingBy?.(this.userId);
    this.broadcastDataChannel({ type: "screen_update", payload: { sharing: true, by: this.userId } });

    display.getTracks().forEach((t: any) => { t.onended = () => this.stopScreenShare(); });
  }

  async stopScreenShare() {
    if (!this.screenStream && !Object.keys(this.screenSenders).length) return;
    try { this.screenStream?.getTracks().forEach(t => { try { t.stop(); } catch { } }); } catch { }
    this.screenStream = null;

    Object.entries(this.peers).forEach(([peerId, pc]) => {
      const store = this.screenSenders[peerId]; if (!store) return;
      store.replaced.forEach(({ kind, sender, originalTrack }) => {
        const fallback = this.localStream?.getTracks().find(t => t.kind === kind) || originalTrack || null;
        try { sender.replaceTrack(fallback); } catch { }
      });
      store.addedSenders.forEach(s => { try { pc.removeTrack(s); } catch { } });
    });
    this.screenSenders = {};
    this.sharingBy = null;
    this.onSharingBy?.(null);
    this.broadcastDataChannel({ type: "screen_update", payload: { sharing: false, by: this.userId } });
  }

  /** ---------------- Recording / Chat / Progress ---------------- */
  sendChatMessage(payload: ChatMessagePayload) {
    this.broadcastDataChannel({ type: "chat_message", payload });
    this.wsSend({ type: "chat_message_to_server", from: this.userId, to: payload.to, payload });
  }
  startRecording() { this.wsSend({ type: "start_recording" }); }
  stopRecording() { this.wsSend({ type: "stop_recording" }); }

  /** ---------------- Indicators & VAD ---------------- */
  startLocalVAD() {
    if (!this.localStream || this.vadIntervalId) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = ctx.createMediaStreamSource(this.localStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);

    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      try {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const speaking = !!this.localStream?.getAudioTracks?.()[0]?.enabled && rms > 0.06;

        const now = performance.now();
        if (speaking !== this.lastSpeaking && now - this.lastSpeakingSentAt > this.speakingThrottleMs) {
          this.lastSpeaking = speaking;
          this.lastSpeakingSentAt = now;
          this.localSpeaking = speaking;
          const msg: DataChannelMessage = { type: "speaking_update", payload: { speaking, speaker: this.userId } };
          try { this.broadcastDataChannel(msg); } catch { }
          this.wsSend(msg as any);
          this.onPeerStatus?.(this.userId, { /* keep merged */ } as any);
        }
      } catch { }
    };

    this.vadIntervalId = window.setInterval(tick, 150);
  }

  stopLocalVAD() {
    if (this.vadIntervalId) {
      clearInterval(this.vadIntervalId);
      this.vadIntervalId = null;
    }
    this.lastSpeaking = false;
    this.localSpeaking = false;
  }

  /** Public helper used by the hook when UI toggles mute/camera */
  broadcastStatus(status: { isMuted?: boolean; isCameraOff?: boolean }) {
    // flip tracks locally (authoritative)
    if (typeof status.isMuted === "boolean") {
      this.localStream?.getAudioTracks().forEach(t => (t.enabled = !status.isMuted));
    }
    if (typeof status.isCameraOff === "boolean") {
      this.localStream?.getVideoTracks().forEach(t => (t.enabled = !status.isCameraOff));
    }
    // Notify others
    this.sendStatusUpdateOverSig(status);
  }
}

/** ---------------------------------------------------------
 * React Hook — returns EXACTLY your original API
 * --------------------------------------------------------*/
export function useWebRTC(room: string, userId: string, signalingBase?: string) {
  const mgrRef = useRef<WebRTCManager | null>(null);
  if (!mgrRef.current) mgrRef.current = new WebRTCManager(room, userId, signalingBase);
  const mgr = mgrRef.current;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [sharingBy, setSharingBy] = useState<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<Record<string, PeerStatus>>({});
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [botSpeaker, setBotSpeaker] = useState<string>("");
  const [sharedContent, setSharedContent] = useState<string>("");
  const [speaking, setSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingLoading] = useState(false);
  const [speakers, setSpeakers] = useState<Record<string, boolean>>({});
  const [meetingProgress, setMeetingProgress] = useState<MeetingProgress | null>(null);

  // Wire manager callbacks once
  useEffect(() => {
    mgr.onUsers = setUsers;
    mgr.onLocalStream = setLocalStream;
    mgr.onRemoteStream = (peerId, stream) => {
      setRemoteStreams(prev => {
        const next = { ...prev };
        if (stream) next[peerId] = stream; else delete next[peerId];
        return next;
      });
    };
    mgr.onRemoteScreen = (peerId, stream) => {
      setRemoteScreens(prev => {
        const next = { ...prev };
        if (stream) next[peerId] = stream; else delete next[peerId];
        return next;
      });
    };
    mgr.onSharingBy = setSharingBy;
    mgr.onPeerStatus = (peerId, st) => {
      setPeerStatus(p => ({ ...p, [peerId]: { ...p[peerId], ...st } }));
      // derive botSpeaker + local speaking state
      if (st && (st as any).speaking !== undefined) {
        if (peerId === userId) setSpeaking(!!(st as any).speaking);
        if (DEFAULT_BOT_NAMES.includes(peerId)) setBotSpeaker((st as any).speaking ? peerId : "");
      }
    };
    mgr.onSharedContent = setSharedContent;
    mgr.onChat = (m) => setChatMessages(cm => (cm.some(x => x.id === m.id) ? cm : [...cm, m]));
    mgr.onBotAudio = (data, fmt, speaker) => {
      setBotSpeaker(speaker || "Bot");

      try {
        const fmtLower = (fmt || "mp3").toLowerCase();
        const mime = fmtLower === "wav" ? "audio/wav" : "audio/mpeg";
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        (audioEl as any).playsInline = true;
        audioEl.src = `data:${mime};base64,${data}`;
        audioEl.volume = 1.0;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);

        const playPromise = audioEl.play();
        if (playPromise) {
          playPromise.catch((err) => {
            console.warn("Audio play blocked:", err);
          });
        }

        // Cleanup after playback ends
        audioEl.addEventListener("ended", () => {
          audioEl.remove();
          setBotSpeaker("");
        });
      } catch (err) {
        console.error("Failed to play bot audio:", err);
      }
    };
    mgr.onBotMessage = (m) => setChatMessages(cm => [...cm, m]);
    mgr.onRecordingUpdate = setIsRecording;
    mgr.onSpeakerUpdate = setSpeakers;
    mgr.onProgressUpdate = setMeetingProgress;
    mgr.onEndCall = () => { };

    return () => { /* explicit disconnect in unmount path handled by consumer */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep derived
  useEffect(() => { setIsScreenSharing(sharingBy === userId); }, [sharingBy, userId]);

  /** ---------- Public API (same names you already use) ---------- */
  const connect = useCallback(async (initialAudioEnabled = true, initialVideoEnabled = true) => {
    await mgr.connect(initialAudioEnabled, initialVideoEnabled);
  }, [mgr]);

  const disconnect = useCallback(() => { mgr.disconnect(); }, [mgr]);

  const getLocalStream = useCallback(() => localStream, [localStream]);

  const startScreenShare = useCallback((mode: "none" | "mic" | "system" = "none") => mgr.startScreenShare(mode), [mgr]);
  const stopScreenShare = useCallback(() => mgr.stopScreenShare(), [mgr]);

  const broadcastStatus = useCallback((status: PeerStatus) => mgr.broadcastStatus(status), [mgr]);

  const sendChatMessage = useCallback((p: ChatMessagePayload) => mgr.sendChatMessage(p), [mgr]);
  const startRecording = useCallback(() => mgr.startRecording(), [mgr]);
  const stopRecording = useCallback(() => mgr.stopRecording(), [mgr]);

  const fetchChatHistory = useCallback(async (_roomId: string, _to?: string) => { return; }, []);

  const selectAudioDevice = useCallback(async (deviceId: string) => { await mgr.switchDevice("audioinput", deviceId); }, [mgr]);
  const selectVideoDevice = useCallback(async (deviceId: string) => { await mgr.switchDevice("videoinput", deviceId); }, [mgr]);

  return {
    // functions (unchanged)
    connect,
    disconnect,
    getLocalStream,
    broadcastStatus,
    startScreenShare,
    stopScreenShare,
    sendChatMessage,
    fetchChatHistory,
    startRecording,
    stopRecording,
    selectAudioDevice,
    selectVideoDevice,

    // state (unchanged names)
    users,
    remoteStreams,
    remoteScreens,
    sharingBy,
    isScreenSharing,
    chatMessages,
    botSpeaker,
    peerStatus,
    sharedContent,
    speaking,            // local speaking (VAD)
    isRecording,
    speakers,
    isRecordingLoading,
    meetingProgress,
  };
}
