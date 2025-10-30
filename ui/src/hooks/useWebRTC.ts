// src/hooks/useWebRTC.ts
/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from "react";

export type MeetingProgress = {
  tasks: any[];
  current_task_index: number;
  state: string;
  start_time?: string;
  end_time?: string;
};

// types
export type PeerStatus = { isMuted: boolean; isCameraOff: boolean };

// UPDATED: Added 'to' field for private chat.
export type ChatMessagePayload = {
  id: string;
  from: string;
  text?: string;
  attachments?: { name: string; dataUrl?: string; url?: string }[]; // Added 'url' for retrieved history
  ts: number;
  to?: string; // New: Target user_id or 'Group'
};

type SignalMsg = {
  type?: string;
  action?: string;
  from?: string;
  to?: string;
  payload?: any;
  users?: string[];
  data?: string;
  format?: string;
  speaker?: string;
  message?: string;
  is_recording?: boolean;
  speakers?: Record<string, boolean>;
};

type DataChannelMessage =
  | { type: "content_update"; payload: string }
  | { type: "status_update"; payload: PeerStatus }
  | { type: "screen_update"; payload: { sharing: boolean; by: string } }
  | { type: "chat_message"; payload: ChatMessagePayload };

const socketUrl = import.meta.env.VITE_WEBSOCKET_URL;
const RECORDER_API_URL = import.meta.env.VITE_RECORDER_API_URL || "http://localhost:8001";
const DEFAULT_WS = socketUrl;

const DEFAULT_BOT_NAMES = (window as any).__BOT_NAMES__ || ["Jarvis"];

const isRecorderBot = (name: string): boolean => name.startsWith("RecorderBot");

// Helper: deterministic, string-safe politeness check
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

class WebRTCManager {
  room: string;
  userId: string;
  wsUrl: string;

  ws: WebSocket | null = null;
  peers: Record<string, RTCPeerConnection & {
    _makingOffer?: boolean;
    _ignoreOffer?: boolean;
    _queuedCandidates?: RTCIceCandidateInit[];
    _polite?: boolean;
    _iceRestartTimer?: number | null;
    _negotiationTimer?: number | null;
  }> = {};
  dataChannels: Record<string, RTCDataChannel> = {};
  localStream: MediaStream | null = null;

  screenStream: MediaStream | null = null;
  screenSenders: Record<string, RTCRtpSender[]> = {};

  sharingBy: string | null = null;

  creatingPeer: Record<string, boolean> = {};
  pendingScreen: string | null = null;
  lastUserList: string[] = [];

  // --- cleanup/connection guards ---
  private isDisconnected = false;
  private cleanupRunning = false;

  onProgressUpdate?: (p: MeetingProgress) => void;
  onUsers?: (u: string[]) => void;
  onRemoteStream?: (peerId: string, s: MediaStream | null) => void;
  onRemoteScreen?: (peerId: string, s: MediaStream | null) => void;
  onSharingBy?: (by: string | null) => void;
  onPeerStatus?: (peerId: string, status: PeerStatus) => void;
  onSharedContent?: (c: string) => void;
  onChat?: (m: ChatMessagePayload) => void;
  onBotAudio?: (data: string, fmt?: string, speaker?: string) => void;
  onBotMessage?: (m: ChatMessagePayload) => void;
  onBotActive?: (active: boolean) => void;
  onUsersCount?: (n: number) => void;
  onRecordingUpdate?: (is_recording: boolean) => void;
  onSpeakerUpdate?: (speakers: Record<string, boolean>) => void;
  onLocalStream?: (s: MediaStream | null) => void;

  iceConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }, 
      { urls: "stun:stun2.l.google.com:19302" },
      {
        urls: "turn:relay.metered.ca:80",
        username: "openai",
        credential: "openai",
      },
    ]
  };

  private initialAudioEnabled: boolean = true;
  private initialVideoEnabled: boolean = true;
  constructor(room: string, userId: string, baseSignalingUrl?: string) {
    this.room = room;
    this.userId = userId;
    const base = baseSignalingUrl || DEFAULT_WS;
    this.wsUrl = base.replace(/\/+$/, "") + `/ws/${this.room}/${this.userId}`;
  }

  // Helper: allow reconnect after a permanent disconnect if needed
  allowReconnect() {
    this.isDisconnected = false;
  }

  log(...args: any[]) {
    console.log("[useWebRTC]", ...args);
  }

  wsSend(obj: any) {
    const s = JSON.stringify(obj);
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.addEventListener("open", () => this.ws?.send(s), { once: true });
    }
  }

  // FIX: Extract politeness calculation
  isPolite(otherId: string): boolean {
    const hThis = stableHash(this.userId);
    const hOther = stableHash(otherId);
    let polite = false;
    // Tie-break: polite if my hash is greater than other's hash
    if (hThis !== hOther) polite = hThis > hOther;
    // Secondary tie-break: polite if my userId string is lexicographically greater
    else polite = this.userId > otherId;
    return polite;
  }

  async ensureLocalStream(audioEnabled: boolean = true, videoEnabled: boolean = true): Promise<MediaStream | null> {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = audioEnabled);
      this.localStream.getVideoTracks().forEach(t => t.enabled = videoEnabled);
      return this.localStream;
    }

    this.initialAudioEnabled = audioEnabled;
    this.initialVideoEnabled = videoEnabled;

    if (!audioEnabled && !videoEnabled) {
      this.log("Initial audio and video disabled. Not requesting media stream yet.");
      return null;
    }

    const constraints = {
      audio: audioEnabled ? true : false,
      video: videoEnabled ? true : false,
    };

    try {
      this.log("Requesting initial media stream with constraints:", constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream.getAudioTracks().forEach(t => t.enabled = this.initialAudioEnabled);
      this.localStream.getVideoTracks().forEach(t => t.enabled = this.initialVideoEnabled);
      this.onLocalStream?.(this.localStream);
      return this.localStream;
    } catch (err) {
      this.log("Initial getUserMedia failed:", err);
      this.localStream = null;
      this.onLocalStream?.(null);
      throw err;
    }
  }

  async connect(initialAudioEnabled = true, initialVideoEnabled = true) {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      this.log("connect() ignored — WebSocket already open.");
      return;
    }

    // If manager already permanently disconnected (guard), do not reconnect.
    if (this.isDisconnected) {
      this.log("⚠️ connect() called but manager is flagged permanently disconnected.");
      return;
    }

    try {
      await this.ensureLocalStream(initialAudioEnabled, initialVideoEnabled);
      this.log("Local stream ready at connect():",
        this.localStream?.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));
    } catch (err) {
      this.log("⚠️ ensureLocalStream failed at connect():", err);
    }

    this.log("Connecting WebSocket →", this.wsUrl);
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.log("✅ WebSocket open:", this.wsUrl);
    };
    ws.onerror = (ev) => {
      this.log("❌ WebSocket error:", ev);
    };
    ws.onclose = (ev) => {
      this.log("🔌 WebSocket closed:", ev.reason || ev.code);
      this.ws = null;
    };
    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        await this.onWsMessage(msg);
      } catch (err) {
        this.log("WS message parse error:", err);
      }
    };
  }

  disconnect(permanent = false) {
    this.log("🔴 Disconnect called for user:", this.userId);

    // Idempotent guard: prevent overlapping cleanup runs
    if (this.cleanupRunning) {
      this.log("⚠️ Disconnect cleanup already running - ignoring duplicate call.");
      return;
    }
    this.cleanupRunning = true;

    // Mark permanently disconnected only when requested as permanent
    if (permanent) this.isDisconnected = true;

    try {
      // --- CRITICAL: detach video elements first to allow browser to release devices ---
      if (typeof window !== "undefined") {
        try {
          document.querySelectorAll("video").forEach((el) => {
            try {
              // detach only if it's our stream
              (el as HTMLVideoElement).srcObject = null;
            } catch (e) { /* ignore */ }
          });
        } catch (e) { /* ignore */ }
      }

      // For each peer, try to remove tracks from senders (replaceTrack(null)) to make sure remote m-lines don't hold devices
      try {
        Object.entries(this.peers).forEach(([peerId, pc]) => {
          try {
            this.log("Removing tracks from peer connection senders for", peerId);
            pc.getSenders().forEach((s: RTCRtpSender) => {
              try {
                if (s && typeof s.replaceTrack === "function") {
                  s.replaceTrack(null);
                }
              } catch (e) { /* ignore */ }
            });
          } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }

      // Stop local tracks
      if (this.localStream) {
        this.log("Stopping local media tracks...");
        try {
          this.localStream.getTracks().forEach((track) => {
            try {
              track.stop();
              this.log(`Stopped ${track.kind} track (${track.label})`);
            } catch { /* ignore */ }
          });
        } catch (e) { /* ignore */ }
      }

      // stop screen tracks if any
      if (this.screenStream) {
        try {
          this.screenStream.getTracks().forEach((t) => {
            try { t.stop(); } catch { /* ignore */ }
          });
        } catch { /* ignore */ }
      }

      // Nullify streams
      this.localStream = null;
      this.screenStream = null;

      // Close and clear peer connections
      for (const [peerId, pc] of Object.entries(this.peers)) {
        try {
          this.log("Closing peer connection for", peerId);
          pc.close();
        } catch { /* ignore */ }
      }
      this.peers = {};
      this.dataChannels = {};
      this.screenSenders = {};

      // Close websocket
      try { this.ws?.close(); } catch { /* ignore */ }
      this.ws = null;

      this.sharingBy = null;

      this.log("✅ All devices and connections released.");
    } catch (err) {
      this.log("disconnect() error:", err);
    } finally {
      this.cleanupRunning = false;
    }
  }


  async onWsMessage(msg: SignalMsg) {
    if (!msg) return;

    switch (msg.type) {
      case "recording_update": this.onRecordingUpdate?.(!!msg.is_recording); break;
      case "speaker_update": this.onSpeakerUpdate?.(msg.speakers || {}); break;
      case "content_update": this.onSharedContent?.(msg.payload || ""); break;
      case "chat_message": 
        // NEW: Handle server-broadcasted persistent chat message
        this.onChat?.(msg.payload as ChatMessagePayload);
        break;
      case "user_list":
        const list = msg.users || [];
        if (JSON.stringify(list) === JSON.stringify(this.lastUserList)) return;
        this.lastUserList = list;
        this.onUsers?.(list);
        this.onUsersCount?.(list.length);
        const otherUsers = list.filter((u) => u !== this.userId);
        for (const peerId of otherUsers) {
          if (!this.peers[peerId] && !this.creatingPeer[peerId]) {
            if (isRecorderBot(peerId)) {
              this.log(`Recorder Bot '${peerId}' detected. Passively waiting for its offer.`);
              continue;
            }
            const isBot = DEFAULT_BOT_NAMES.includes(peerId);
            // FIX: Use isPolite to determine if we should initiate (if we are NOT polite)
            const weArePolite = this.isPolite(peerId);
            const initiator = isBot || !weArePolite; // We initiate if we're impolite or it's a bot
            
            // Prevent duplicate creation if createPeer was triggered recently
            if (!this.creatingPeer[peerId]) {
              this.createPeer(peerId, initiator).catch(err => this.log("createPeer error (user_list):", err));
            }
          }
        }
        break;
      case "bot_audio": this.onBotAudio?.(msg.data || msg.payload || "", msg.format, msg.speaker); break;
      case "bot_message":
        const m: ChatMessagePayload = { 
            id: `bot-${Date.now()}`, 
            from: msg.speaker || "Bot", 
            text: msg.message || (msg.payload as string), 
            ts: Date.now() 
        };
        this.onBotMessage?.(m);
        this.onChat?.(m);
        break;
      case "signal": await this.handleSignal(msg); break;
      case "progress_update":
        console.log("Progress update received:", msg.payload);
        this.onProgressUpdate?.(msg.payload as MeetingProgress);
        break;
    }
  }

  async handleSignal(msg: SignalMsg) {
    const { action, from, payload } = msg;
    if (!from) return;

    // --- create peer if missing ---
    let pc = this.peers[from];
    if (!pc && !this.creatingPeer[from]) {
      this.creatingPeer[from] = true;
      try {
        // FIX: Calculate initiator role for responder as well. The polite peer MUST NOT be an initiator.
        const weArePolite = this.isPolite(from);
        const initiator = DEFAULT_BOT_NAMES.includes(from) ? false : !weArePolite;
        pc = await this.createPeer(from, initiator);
      } catch (err) {
        this.log("createPeer (responder) failed for", from, err);
      } finally {
        delete this.creatingPeer[from];
      }
    }

    if (!pc || pc.signalingState === "closed") {
      this.log("handleSignal: peer not found or closed → ignore", from);
      return;
    }

    // --- deterministic, string-safe politeness check ---
    // The existing politeness logic remains correct here for runtime collision resolution
    // but we use the new helper function for consistency and logging.
    const polite = this.isPolite(from);
    pc._polite = polite;
    this.log(`Politeness check: ${this.userId} vs ${from} → ${polite ? "polite" : "impolite"}`);

    // --- offer-collision logic ---
    const isOfferCollision = action === "offer" &&
      (pc.signalingState !== "stable" || pc._makingOffer);

    if (isOfferCollision && !polite) {
      // Impolite: mark ignoreOffer so we don't attempt to process conflicting offer/ICE
      pc._ignoreOffer = true;
      pc._queuedCandidates = []; // drop queued candidates because this offer is ignored
      this.log("⚠️ Offer collision → ignoring offer from", from, "because not polite. Queued ICE dropped.");
      return;
    }

    try {
      if (action === "offer") {
        
        this.log("📨 Received offer from", from, "collision:", isOfferCollision);

        // rollback if needed
        if (pc.signalingState !== "stable") {
          try { await pc.setLocalDescription({ type: "rollback" } as any); } catch { }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(payload));

        // apply any queued ICE
        if (pc._queuedCandidates?.length) {
          for (const c of pc._queuedCandidates) {
            try { await pc.addIceCandidate(c); } catch (e) { this.log("queued ICE add failed", e); }
          }
          pc._queuedCandidates = [];
        }

        // create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.wsSend({
          type: "signal",
          action: "answer",
          from: this.userId,
          to: from,
          payload: pc.localDescription,
        });

      } else if (action === "answer") {
        this.log("✅ Received answer from", from);
        
        // --- 🔥 FIX: Reset _ignoreOffer when receiving a successful answer ---
        if (pc._ignoreOffer && pc.signalingState === "have-local-offer") {
            this.log(`🔥 Resetting _ignoreOffer flag for ${from} after receiving answer.`);
            pc._ignoreOffer = false;
        }

        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));

          if (pc._queuedCandidates?.length) {
            for (const c of pc._queuedCandidates) {
              try { await pc.addIceCandidate(c); } catch (e) { this.log("queued ICE add failed", e); }
            }
            pc._queuedCandidates = [];
          }
        } else {
          this.log("Ignoring answer — invalid state:", pc.signalingState);
        }

      } else if (action === "ice" && payload) {
        // If we are currently ignoring offers from this peer (we were 'impolite' on a collision), drop ICE
        if (pc._ignoreOffer) {
          this.log("Dropping incoming ICE because peer is in _ignoreOffer state for", from);
          return;
        }

        // Queue candidate if remoteDescription not yet set
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          pc._queuedCandidates = pc._queuedCandidates || [];
          pc._queuedCandidates.push(payload);
          this.log("Queuing ICE candidate (no remoteDescription yet) from", from);
        } else {
          try { await pc.addIceCandidate(payload); } catch (err) { this.log("addIceCandidate error:", err); }
        }
      }
    } catch (err) {
      this.log(`handleSignal error on ${action}:`, err);
      if (String(err).includes("m-lines")) {
        this.log("❌ SDP m-line mismatch → closing peer", from);
        try { pc.close(); } catch { }
        delete this.peers[from];
        this.onRemoteStream?.(from, null);
        this.onRemoteScreen?.(from, null);
      }
    }
  }


  private handleDataChannelMessage(ev: MessageEvent, peerId: string) {
    try {
      const obj = JSON.parse(ev.data) as DataChannelMessage;
      if (obj.type === "content_update") this.onSharedContent?.(obj.payload);
      else if (obj.type === "status_update") this.onPeerStatus?.(peerId, obj.payload);
      else if (obj.type === "chat_message") this.onChat?.(obj.payload); // REMOVED: Chat now over WS
      else if (obj.type === "screen_update") {
        const sharing = obj.payload.sharing;
        const sharer = obj.payload.by;
        this.sharingBy = sharing ? sharer : null;
        this.onSharingBy?.(this.sharingBy);
      }
    } catch (err) {
      this.log("datachannel parse error", err);
    }
  }

  // --- PATCH: attachLocalTracks now prefers transceiver.sender.replaceTrack when present ---
  private attachLocalTracks(pc: RTCPeerConnection & any) {
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0] ?? null;
    const videoTrack = this.localStream.getVideoTracks()[0] ?? null;

    // Prevent adding a track twice: if this exact local track is already a sender on this pc, skip addTrack.
    const trackAlreadyAdded = (t: MediaStreamTrack | null) => {
      if (!t) return false;
      try {
        return pc.getSenders().some((s: RTCRtpSender) => s.track === t);
      } catch (e) {
        return false;
      }
    };

    // Prefer to use transceivers (stable m-line). Find audio transceiver sender first.
    try {
      const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];

      // audio transceiver: choose first transceiver of kind 'audio'
      const audioTransceiver = transceivers.find((t: RTCRtpTransceiver) =>
        (t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') ||
        (t.sender && t.sender.track && t.sender.track.kind === 'audio') ||
        (t && (t as any).kind === 'audio')
      ) ?? null;

      // video transceivers: prefer first video transceiver as camera, second reserved for screen
      const videoTransceivers = transceivers.filter((t: RTCRtpTransceiver) =>
        (t.receiver && t.receiver.track && t.receiver.track.kind === 'video') ||
        (t.sender && t.sender.track && t.sender.track.kind === 'video') ||
        (t && (t as any).kind === 'video')
      );
      const cameraTransceiver = videoTransceivers.length > 0 ? videoTransceivers[0] : null;

      if (audioTrack) {
        const sender = audioTransceiver?.sender ?? pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'audio');
        if (sender && typeof sender.replaceTrack === 'function') {
          try { sender.replaceTrack(audioTrack); } catch (e) { this.log("attachLocalTracks: replace audio failed", e); }
        } else {
          // ✅ SAFETY: only addTrack if the exact track isn't already attached to this pc
          if (!trackAlreadyAdded(audioTrack)) {
            try { pc.addTrack(audioTrack, this.localStream); } catch (e) { this.log("attachLocalTracks: add audio failed", e); }
          } else {
            this.log("attachLocalTracks: audio track already added to pc, skipping addTrack.");
          }
        }
      }

      if (videoTrack) {
        const sender = cameraTransceiver?.sender ?? pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'video');
        if (sender && typeof sender.replaceTrack === 'function') {
          try { sender.replaceTrack(videoTrack); } catch (e) { this.log("attachLocalTracks: replace video failed", e); }
        } else {
          // ✅ SAFETY: only addTrack if the exact track isn't already attached to this pc
          if (!trackAlreadyAdded(videoTrack)) {
            try { pc.addTrack(videoTrack, this.localStream); } catch (e) { this.log("attachLocalTracks: add video failed", e); }
          } else {
            this.log("attachLocalTracks: video track already added to pc, skipping addTrack.");
          }
        }
      }
    } catch (err) {
      // fallback: original behavior if transceivers aren't available or error occurs
      if (audioTrack) {
        const audioSender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'audio');
        if (audioSender) {
          try { audioSender.replaceTrack(audioTrack); } catch (e) { this.log("attachLocalTracks fallback: replace audio failed", e); }
        } else {
          if (!trackAlreadyAdded(audioTrack)) {
            try { pc.addTrack(audioTrack, this.localStream); } catch (e) { this.log("attachLocalTracks fallback: add audio failed", e); }
          } else {
            this.log("attachLocalTracks fallback: audio track already added to pc, skipping addTrack.");
          }
        }
      }
      if (videoTrack) {
        const videoSender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'video');
        if (videoSender) {
          try { videoSender.replaceTrack(videoTrack); } catch (e) { this.log("attachLocalTracks fallback: replace video failed", e); }
        } else {
          if (!trackAlreadyAdded(videoTrack)) {
            try { pc.addTrack(videoTrack, this.localStream); } catch (e) { this.log("attachLocalTracks fallback: add video failed", e); }
          } else {
            this.log("attachLocalTracks fallback: video track already added to pc, skipping addTrack.");
          }
        }
      }
    }
  }

  async createPeer(targetId: string, initiator: boolean): Promise<RTCPeerConnection & any> {
    if (this.peers[targetId] || this.creatingPeer[targetId]) return this.peers[targetId];
    this.creatingPeer[targetId] = true;
    
    // FIX: Calculate politeness here to ensure the polite peer is never an initiator
    const weArePolite = this.isPolite(targetId);
    const finalInitiator = initiator && !weArePolite; 

    this.log("🧩 createPeer →", targetId, "initial initiator:", initiator, "final initiator:", finalInitiator, "weArePolite:", weArePolite);


    const pc: RTCPeerConnection & any = new RTCPeerConnection(this.iceConfig) as any;
    pc._makingOffer = false;
    pc._ignoreOffer = false;
    pc._queuedCandidates = [];
    // ✅ initialize polite based on early calculation
    pc._polite = weArePolite;
    pc._iceRestartTimer = null;
    pc._negotiationTimer = null;

    this.peers[targetId] = pc;

    // --- CREATE STABLE TRANSCEIVERS UP FRONT (ensures consistent m-line order) ---
    try {
      const existing = pc.getTransceivers ? pc.getTransceivers() : [];
      if (!existing || existing.length === 0) {
        if (typeof pc.addTransceiver === "function") {
          pc.addTransceiver("audio", { direction: "sendrecv" });
          pc.addTransceiver("video", { direction: "sendrecv" }); // camera
          pc.addTransceiver("video", { direction: "sendrecv" }); // reserved for screen share
          this.log("Created stable transceivers for", targetId);
        }
      }
    } catch (err) {
      this.log("createPeer: addTransceiver failed (non-fatal):", err);
    }

    try {
      if (!this.localStream) {
        await this.ensureLocalStream(this.initialAudioEnabled, this.initialVideoEnabled);
        this.log("Local stream ensured in createPeer", targetId);
      }
    } catch (err) {
      this.log("ensureLocalStream failed in createPeer:", err);
    }

    const existingSenders = pc.getSenders();
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        const sameKindSender = existingSenders.find((s: any) => s.track?.kind === track.kind);
        if (sameKindSender) {
          try { sameKindSender.replaceTrack(track); } catch (e) { this.log("replaceTrack initial failed", e); }
        } else {
          try { pc.addTrack(track, this.localStream); } catch (e) { this.log("addTrack initial failed", e); }
        }
      });
    }

    pc.onicecandidate = (e: any) => {
      if (e.candidate) {
        this.wsSend({
          type: "signal",
          action: "ice",
          from: this.userId,
          to: targetId,
          payload: e.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.log("ICE state", targetId, pc.iceConnectionState);
      try {
        if (["failed", "disconnected"].includes(pc.iceConnectionState)) {
          if (pc._iceRestartTimer) window.clearTimeout(pc._iceRestartTimer);
          pc._iceRestartTimer = window.setTimeout(() => {
            try {
              // 🔥 FIX: Removed internal state check to make ICE restart more aggressive
              // if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                this.log("?? Attempting ICE restart for", targetId);
                try { (pc as any).restartIce?.(); } catch (err) { this.log('restartIce failed', err); }
              // }
            } catch (err) { this.log('ice restart debounce error', err); }
          }, 2500);
        } else {
          if (pc._iceRestartTimer) { window.clearTimeout(pc._iceRestartTimer); pc._iceRestartTimer = null; }
        }
      } catch (err) { this.log('oniceconnectionstatechange error', err); }
    };

    pc.onconnectionstatechange = () => {
      this.log("Conn state", targetId, pc.connectionState);
      if (["failed", "closed"].includes(pc.connectionState)) {
        if (pc._negotiationTimer) {
          window.clearTimeout(pc._negotiationTimer);
        }
        try { pc.close(); } catch { }
        delete this.peers[targetId];
        this.onRemoteStream?.(targetId, null);
        this.onRemoteScreen?.(targetId, null);
      }
    };

    if (finalInitiator) {
      const dc = pc.createDataChannel("datachannel");
      dc.onmessage = (ev: any) => this.handleDataChannelMessage(ev, targetId);
      this.dataChannels[targetId] = dc;
    } else {
      pc.ondatachannel = (e: any) => {
        this.dataChannels[targetId] = e.channel;
        e.channel.onmessage = (msg: any) => this.handleDataChannelMessage(msg, targetId);
      };
    }

    // Attach tracks using smarter attachLocalTracks (replace if sender exists)
    this.attachLocalTracks(pc);
    this.log("🎧 Attached local tracks →", targetId, this.localStream?.getTracks().length || 0);

    pc.ontrack = (e: any) => {
      this.log("📡 ontrack from", targetId, e.track.kind);
      const stream = e.streams[0];
      if (!stream) return;

      if (e.track.kind === "audio") {
        let audioElem = document.getElementById(`audio-${targetId}`) as HTMLAudioElement;
        if (!audioElem) {
          audioElem = document.createElement("audio");
          audioElem.id = `audio-${targetId}`;
          audioElem.autoplay = true;
          audioElem.muted = false;
          (audioElem as any).playsInline = true;
          document.body.appendChild(audioElem);
        }
        audioElem.srcObject = stream;

        const playAudio = async () => {
          try {
            await audioElem.play();
            this.log("[useWebRTC] Playing remote audio for", targetId);
          } catch (err) {
            this.log("[useWebRTC] Autoplay blocked, trying muted playback for", targetId, err);
            audioElem.muted = true;
            try {
              await audioElem.play();
              this.log("[useWebRTC] Muted playback OK for", targetId);
            } catch (err2) {
              this.log("[useWebRTC] Muted playback also failed for", targetId, err2);
            }
          }
        };
        playAudio();
      }

      if (e.track.kind === "video") {
        this.onRemoteStream?.(targetId, stream);
      }
    };

    // --- Debounce onnegotiationneeded ---
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== "stable") {
        this.log(`[useWebRTC] 🟡 skip negotiation → ${targetId} ${pc.signalingState}`);
        return;
      }
      if (pc._makingOffer || pc.signalingState !== "stable") {
        this.log("🟡 skip negotiation →", targetId, pc.signalingState);
        return;
      }

      pc._makingOffer = true;
      try {
        this.log("🔁 onnegotiationneeded → creating offer for", targetId);
        const offer = await pc.createOffer();

        if (pc.signalingState !== "stable") {
          this.log("🟡 abort offer; state changed mid-offer for", targetId);
          return;
        }

        await pc.setLocalDescription(offer);
        this.wsSend({
          type: "signal",
          action: "offer",
          from: this.userId,
          to: targetId,
          payload: pc.localDescription,
        });
      } catch (err) {
        this.log("negotiationneeded error:", err);
      } finally {
        pc._makingOffer = false;
      }
    };

    if (finalInitiator) {
      try {
        pc._makingOffer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.wsSend({
          type: "signal",
          action: "offer",
          from: this.userId,
          to: targetId,
          payload: pc.localDescription,
        });
      } catch (err) {
        this.log("initial offer error:", err);
      } finally {
        pc._makingOffer = false;
      }
    }

    delete this.creatingPeer[targetId];
    return pc;
  }



  async setAudioDevice(deviceId: string | null) {
    try {
      const newStream = deviceId ? await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } }) : null;
      const newTrack = newStream?.getAudioTracks()[0] ?? null;

      Object.values(this.peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newTrack).catch(err => this.log("replaceTrack audio failed", err));
        } else if (newTrack) {
          pc.addTrack(newTrack, newStream!);
        }
      });

      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(t => { try { t.stop(); } catch { } });
        if (newTrack) this.localStream.addTrack(newTrack);
      } else if (newStream) {
        this.localStream = new MediaStream([...(newStream.getTracks())]);
      }

      this.onLocalStream?.(this.localStream);
    } catch (err) {
      this.log("setAudioDevice failed", err);
    }
  }

  async setVideoDevice(deviceId: string | null) {
    try {
      const newStream = deviceId ? await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } }) : null;
      const newTrack = newStream?.getVideoTracks()[0] ?? null;

      Object.values(this.peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(newTrack).catch(err => this.log("replaceTrack video failed", err));
        } else if (newTrack) {
          pc.addTrack(newTrack, newStream!);
        }
      });

      if (this.localStream) {
        this.localStream.getVideoTracks().forEach(t => { try { t.stop(); } catch { } });
        if (newTrack) this.localStream.addTrack(newTrack);
      } else if (newStream) {
        this.localStream = new MediaStream([...(newStream.getTracks())]);
      }

      this.onLocalStream?.(this.localStream);
    } catch (err) {
      this.log("setVideoDevice failed", err);
    }
  }

  async startScreenShare(audioMode: "none" | "mic" | "system" = "none") {
    if (this.screenStream) return;
    try {
      this.log("[useWebRTC] ▶️ Starting screen share...");

      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { cursor: "always" },
        audio: audioMode === "system",
      });

      let micTrack: MediaStreamTrack | null = null;
      if (audioMode === "mic") {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micTrack = micStream.getAudioTracks()[0] ?? null;
          if (micTrack) displayStream.addTrack(micTrack);
        } catch (err) {
          this.log("[useWebRTC] ⚠️ Mic capture failed, proceeding without mic audio", err);
        }
      }

      this.screenStream = displayStream;

      Object.entries(this.peers).forEach(([peerId, pc]) => {
        if (pc.signalingState === "closed") return;

        const stored: {
          replaced: { kind: string; sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[];
          addedSenders: RTCRtpSender[];
        } = { replaced: [], addedSenders: [] };

        const videoTrack = displayStream.getVideoTracks()[0] ?? null;
        if (videoTrack) {
          const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
          if (videoSender) {
            stored.replaced.push({ kind: "video", sender: videoSender, originalTrack: videoSender.track || null });
            try {
              videoSender.replaceTrack(videoTrack).catch((e) => this.log("replaceTrack(video) failed", e));
            } catch (e) {
              this.log("replaceTrack(video) exception", e);
            }
          } else if (!pc.getSenders().some((s) => s.track?.id === videoTrack.id)) {
            try {
              const s = pc.addTrack(videoTrack, displayStream);
              if (s) stored.addedSenders.push(s as RTCRtpSender);
            } catch (err) {
              this.log("addTrack(video) fallback failed", err);
            }
          }
        }

        const audioTrack = displayStream.getAudioTracks()[0] ?? null;
        if (audioTrack) {
          const audioSender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
          if (audioSender) {
            stored.replaced.push({ kind: "audio", sender: audioSender, originalTrack: audioSender.track || null });
            try {
              audioSender.replaceTrack(audioTrack).catch((e) => this.log("replaceTrack(audio) failed", e));
            } catch (e) {
              this.log("replaceTrack(audio) exception", e);
            }
          } else if (!pc.getSenders().some((s) => s.track?.id === audioTrack.id)) {
            try {
              const s = pc.addTrack(audioTrack, displayStream);
              if (s) stored.addedSenders.push(s as RTCRtpSender);
            } catch (err) {
              this.log("addTrack(audio) fallback failed", err);
            }
          }
        }

        if (stored.replaced.length || stored.addedSenders.length) {
          this.screenSenders[peerId] = stored as any;
        }

        if (pc.signalingState === "stable") {
          pc.onnegotiationneeded?.(new Event("negotiationneeded"));
        }
      });

      this.sharingBy = this.userId;
      this.onSharingBy?.(this.userId);
      this.broadcastDataChannel({
        type: "screen_update",
        payload: { sharing: true, by: this.userId },
      });

      displayStream.getTracks().forEach((track: any) => {
        track.onended = () => this.stopScreenShare();
      });

      this.log("✅ startScreenShare: displayStream created, replacements made.");
    } catch (err) {
      this.log("❌ startScreenShare failed", err);
      if (this.screenStream) {
        try {
          this.screenStream.getTracks().forEach((t) => t.stop());
        } catch { }
        this.screenStream = null;
      }
    }
  }

  async stopScreenShare() {
    if (!this.screenStream && Object.keys(this.screenSenders).length === 0) return;

    try {
      this.log("🛑 Stopping screen share...");

      try {
        this.screenStream?.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch { }
        });
      } catch (err) {
        this.log("Error stopping screenStream tracks", err);
      }

      Object.entries(this.screenSenders).forEach(([peerId, storedAny]) => {
        const pc = this.peers[peerId];
        if (!pc || pc.signalingState === "closed") return;

        const stored: {
          replaced: { kind: string; sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[];
          addedSenders: RTCRtpSender[];
        } = storedAny as any;

        (stored.replaced || []).forEach(({ kind, sender, originalTrack }) => {
          try {
            const fallbackTrack =
              this.localStream?.getTracks().find((t) => t.kind === kind) ?? originalTrack ?? null;
            sender.replaceTrack(fallbackTrack).catch((e) => this.log("replaceTrack restore failed", e));
          } catch (err) {
            this.log("Error restoring replaced sender", err);
          }
        });

        (stored.addedSenders || []).forEach((s: RTCRtpSender) => {
          try {
            if (typeof pc.removeTrack === "function") {
              pc.removeTrack(s);
            }
          } catch (err) {
            this.log("Error removing added sender", err);
          }
        });

        const hasAudioSender = pc.getSenders().some((s) => s.track && s.track.kind === "audio");
        if (!hasAudioSender && this.localStream) {
          try {
            const lt = this.localStream.getAudioTracks()[0];
            if (lt) pc.addTrack(lt, this.localStream);
          } catch (err) {
            this.log("Error re-adding local audio track", err);
          }
        }

        if (pc.signalingState === "stable") {
          pc.onnegotiationneeded?.(new Event("negotiationneeded"));
        }
      });

      this.screenSenders = {};
      this.screenStream = null;
      this.sharingBy = null;
      this.onSharingBy?.(null);

      this.broadcastDataChannel({
        type: "screen_update",
        payload: { sharing: false, by: this.userId },
      });

      this.log("✅ Screen share fully stopped. Peers should renegotiate automatically.");
    } catch (err) {
      this.log("❌ stopScreenShare error:", err);
    }
  }



  broadcastDataChannel(message: DataChannelMessage) {
    const s = JSON.stringify(message);
    Object.values(this.dataChannels).forEach((dc) => {
      try { if (dc.readyState === "open") dc.send(s); } catch (err) { this.log("dc send err", err); }
    });
  }

  sendSpeakingUpdate(speaking: boolean) { this.wsSend({ type: "speaking_update", payload: { speaking } }); }
  sendContentUpdate(content: string) { this.broadcastDataChannel({ type: "content_update", payload: content }); }
  broadcastStatus(status: PeerStatus) { this.broadcastDataChannel({ type: "status_update", payload: status }); }

  // UPDATED: Send chat message via WebSocket to the server for persistence and broadcast
  sendChatMessage(payload: ChatMessagePayload) { 
    this.broadcastDataChannel({ type: "chat_message", payload });
    this.wsSend({ 
      type: "chat_message_to_server", 
      from: this.userId,
      to: payload.to,
      payload 
    }); 
  }

  startRecording() { this.wsSend({ type: "start_recording" }); }
  stopRecording() { this.wsSend({ type: "stop_recording" }); }
}


export function useWebRTC(room: string, userId: string, signalingBase?: string) {
  const mgrRef = useRef<WebRTCManager | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [sharingBy, setSharingBy] = useState<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<Record<string, PeerStatus>>({});
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [botActive, setBotActive] = useState(false);
  const [botSpeaker, setBotSpeaker] = useState<string>("");
  const [sharedContent, setSharedContent] = useState<string>("");
  const [speaking, setSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  const [speakers, setSpeakers] = useState<Record<string, boolean>>({});
  const [meetingProgress, setMeetingProgress] = useState<MeetingProgress | null>(null);

  // Manage hidden audio elements for remote streams so playback is attempted automatically
  const remoteAudioEls = useRef<Record<string, HTMLAudioElement>>({});

  // NEW: Fetch chat history from the API
  const fetchChatHistory = useCallback(async () => {
    // Note: Removed the chatMessages.length > 0 guard to allow re-fetching/merging if needed,
    // though the initial logic relied on it. Since chat is persistent now, fetching is crucial.
    
    try {
      // Assuming 'authToken' is the correct key for the token
      const token = localStorage.getItem('authToken'); 
      // If the chatMessages array is populated by the fetch, we skip re-fetching for this room
      if (chatMessages.length > 0) return chatMessages;

      if (!token) {
        // Fallback for testing or if authentication is managed elsewhere
        console.warn("Authentication token not found. Proceeding without token.");
        // In a production app, you might throw or redirect here.
      }
      
      // Assuming API URL structure based on main.py endpoint
      const API_BASE_URL = signalingBase?.replace('/ws', '/api') || import.meta.env.VITE_API_URL || "https://synapt-server-ebcjejbjh6guhbau.canadacentral-01.azurewebsites.net/api";
      const historyUrl = `${API_BASE_URL.replace(/\/+$/, "")}/meetings/${room}/chat/history`;
      
      const response = await fetch(historyUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      
      if (!response.ok) {
        console.error("Failed to fetch chat history:", response.status, response.statusText);
        return [];
      }
      
      const history: ChatMessagePayload[] = await response.json();
      
      // Update local state with fetched history
      setChatMessages(history); 
      
      return history;

    } catch (error) {
      console.error("Error fetching chat history:", error);
      return [];
    }
  }, [room, chatMessages, signalingBase]);

  useEffect(() => {
    if (!mgrRef.current) {
      mgrRef.current = new WebRTCManager(room, userId, signalingBase);
    }
    const mgr = mgrRef.current;

    mgr.onUsers = setUsers;
    mgr.onLocalStream = (s) => setLocalStream(s);

    mgr.onRemoteStream = (peerId, stream) => {
      setRemoteStreams(prev => {
        const newState = { ...prev };
        if (stream) {
          newState[peerId] = stream;
        } else {
          delete newState[peerId];
        }
        return newState;
      });

      try {
        if (!stream) {
          const existing = remoteAudioEls.current[peerId];
          if (existing) {
            try { existing.pause(); } catch { }
            try { existing.srcObject = null; } catch { }
            try { existing.remove(); } catch { }
            delete remoteAudioEls.current[peerId];
          }
          return;
        }

        const hasAudio = stream.getAudioTracks().length > 0;
        if (!hasAudio) return;

        let audioEl = remoteAudioEls.current[peerId];
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.style.position = "fixed";
          audioEl.style.left = "-9999px";
          audioEl.style.width = "1px";
          audioEl.style.height = "1px";
          audioEl.autoplay = true;
          audioEl.setAttribute("playsinline", "true");
          audioEl.muted = false;
          audioEl.preload = "auto";
          remoteAudioEls.current[peerId] = audioEl;
          try { document.body.appendChild(audioEl); } catch (e) { /* ignore */ }
        }

        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }

        const tryPlay = async () => {
          try {
            await audioEl.play();
            console.log(`[useWebRTC] Playing remote audio for ${peerId}`);
            if (audioEl.muted) {
              try { audioEl.muted = false; } catch { /* ignore */ }
            }
          } catch (err) {
            console.warn(`[useWebRTC] Autoplay blocked for ${peerId}, attempting muted playback. User gesture required to unmute.`, err);
            try {
              audioEl.muted = true;
              await audioEl.play();
              console.log(`[useWebRTC] Muted playback started for ${peerId}. Call unmuteRemote('${peerId}') on user gesture to unmute.`);
            } catch (err2) {
              console.error(`[useWebRTC] Muted playback also failed for ${peerId}`, err2);
            }
          }
        };

        tryPlay();
      } catch (err) {
        console.error("Remote audio element setup failed for", peerId, err);
      }
    };

    mgr.onRemoteScreen = (peerId, stream) => {
      setRemoteScreens(prev => {
        const newState = { ...prev };
        if (stream) newState[peerId] = stream;
        else delete newState[peerId];
        return newState;
      });
    };

    (mgr as any).unmuteRemote = (peerId: string) => {
      const audioEl = remoteAudioEls.current[peerId];
      if (!audioEl) return;
      try {
        audioEl.muted = false;
        audioEl.play().catch(err => console.warn("unmuteRemote play failed", err));
      } catch (err) {
        console.warn("unmuteRemote failed", err);
      }
    };

    (mgr as any).unmuteAllRemotes = () => {
      Object.values(remoteAudioEls.current).forEach(audioEl => {
        try {
          audioEl.muted = false;
          audioEl.play().catch(() => { /* ignore */ });
        } catch { /* ignore */ }
      });
    };

    mgr.onRecordingUpdate = setIsRecording;
    mgr.onSpeakerUpdate = setSpeakers;
    mgr.onSharingBy = setSharingBy;
    mgr.onPeerStatus = (peerId, st) => setPeerStatus((p) => ({ ...p, [peerId]: st }));
    mgr.onSharedContent = setSharedContent;
    mgr.onProgressUpdate = setMeetingProgress;
    mgr.onBotAudio = (data, fmt, speaker) => {
      try {
        setBotSpeaker(speaker || "");
        setBotActive(true);
        const binary = atob(data || "");
        const u8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
        const mime = fmt === "wav" ? "audio/wav" : "audio/mpeg";
        const blob = new Blob([u8], { type: mime });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(err => console.warn("Autoplay failed:", err));
        audio.onended = () => { URL.revokeObjectURL(url); setBotActive(false); setBotSpeaker(""); };
      } catch (err) {
        console.error("bot audio play failed", err);
        setBotActive(false); setBotSpeaker("");
      }
    };
    mgr.onBotMessage = (m) => setChatMessages((prev) => [...prev, m]);
    // UPDATED: Chat handler uses functional update to merge state
    mgr.onChat = (m) => setChatMessages((prev) => {
      // Prevent duplicate messages if server echoes the message back to the sender
      if (prev.some(p => p.id === m.id)) return prev;
      return [...prev, m];
    });
    mgr.onBotActive = setBotActive;

    return () => {
      console.log("[useWebRTC Cleanup] Hook unmounting. Disconnecting manager...");
      if (mgrRef.current) {
        mgrRef.current.disconnect();
        mgrRef.current = null;
      }

      try {
        Object.values(remoteAudioEls.current).forEach((el) => {
          try { el.pause(); } catch { }
          try { el.srcObject = null; } catch { }
          try { el.remove(); } catch { }
        });
      } catch (e) { /* ignore */ }
      remoteAudioEls.current = {};

      setLocalStream(null);
      setUsers([]);
      setRemoteStreams({});
      setRemoteScreens({});
      setSharingBy(null);
      setPeerStatus({});
      setIsScreenSharing(false);
      setSpeaking(false);
      console.log("[useWebRTC Cleanup] Manager and hook state reset.");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, userId, signalingBase]);

  const startRecording = useCallback(async () => {
    setIsRecordingLoading(true);
    try {
      const response = await fetch(`${RECORDER_API_URL}/start-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: room }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start recording');
      }
    } catch (error) {
      console.error("Error starting recording:", error);
    } finally {
      setIsRecordingLoading(false);
    }
  }, [room]);

  const stopRecording = useCallback(async () => {
    setIsRecordingLoading(true);
    try {
      const response = await fetch(`${RECORDER_API_URL}/stop-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: room }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to stop recording');
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
    } finally {
      setIsRecordingLoading(false);
    }
  }, [room]);

  const connect = useCallback(async (initialAudioEnabled: boolean = true, initialVideoEnabled: boolean = true) => {
    if (!mgrRef.current) return;
    try {
      if (!mgrRef.current) {
        mgrRef.current = new WebRTCManager(room, userId, signalingBase);
      }
      await mgrRef.current.connect(initialAudioEnabled, initialVideoEnabled);
      setLocalStream(mgrRef.current.localStream);
    } catch (err) {
      console.error("Connect error:", err);
    }
  }, [room, userId, signalingBase]);

  useEffect(() => {
    if (!localStream) return;
    let audioCtx: AudioContext | null = null, analyser: AnalyserNode | null = null, micSource: MediaStreamAudioSourceNode | null = null, rafId: number;
    const startVAD = async () => {
      try {
        if (localStream.getAudioTracks().length === 0) {
          console.log("VAD: No audio tracks found, skipping.");
          return;
        }
        audioCtx = new AudioContext();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        micSource = audioCtx.createMediaStreamSource(localStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        micSource.connect(analyser);
        const detect = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setSpeaking(avg / 255 > 0.02);
          rafId = requestAnimationFrame(detect);
        };
        detect();
      } catch (err) {
        console.error("Mic activity detection failed", err);
      }
    };
    startVAD();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      micSource?.disconnect();
      analyser?.disconnect();
      audioCtx?.close().catch(() => { });
    };
  }, [localStream]);

  useEffect(() => {
    mgrRef.current?.sendSpeakingUpdate(speaking);
  }, [speaking]);

  const disconnect = useCallback(() => {
    console.log("[useWebRTC disconnect] Hook disconnect called.");
    if (mgrRef.current) {
      mgrRef.current.disconnect();
      setLocalStream(null);
      setUsers([]);
      setRemoteStreams({});
      setRemoteScreens({});
      setSharingBy(null);
      setPeerStatus({});
      setIsScreenSharing(false);
      setSpeaking(false);
      console.log("[useWebRTC disconnect] Local state reset.");
    } else {
      console.warn("[useWebRTC disconnect] Manager ref already null.");
    }
  }, []);
  const startScreenShare = useCallback(async (audioMode: "none" | "mic" | "system" = "none") => { await mgrRef.current?.startScreenShare(audioMode); setIsScreenSharing(true); }, []);
  const stopScreenShare = useCallback(() => { mgrRef.current?.stopScreenShare(); setIsScreenSharing(false); }, []);
  const sendContentUpdate = useCallback((content: string) => mgrRef.current?.sendContentUpdate(content), []);
  const broadcastStatus = useCallback((status: PeerStatus) => { mgrRef.current?.broadcastStatus(status); setPeerStatus((prev) => ({ ...prev, [userId]: status })); }, [userId]);
  // UPDATED: sendChatMessage now expects ChatMessagePayload (with optional 'to')
  const sendChatMessage = useCallback((msg: ChatMessagePayload) => { 
    mgrRef.current?.sendChatMessage(msg);
    // Local echo is handled by the server sending the message back, 
    // but the ChatPanel might rely on the synchronous update. 
    // In this hook, the onChat handler now handles the merge/deduplication.
  }, []);
  
  const getLocalStream = useCallback(() => mgrRef.current?.localStream ?? null, []);
  const selectAudioDevice = useCallback((deviceId: string | null) => { mgrRef.current?.setAudioDevice(deviceId); }, []);
  const selectVideoDevice = useCallback((deviceId: string | null) => { mgrRef.current?.setVideoDevice(deviceId); }, []);

  const unmuteRemote = useCallback((peerId: string) => {
    const el = remoteAudioEls.current[peerId];
    if (!el) return;
    try {
      el.muted = false;
      el.play().catch(err => console.warn("unmute remote play failed", err));
    } catch (err) { console.warn("unmuteRemote error", err); }
  }, []);

  const unmuteAllRemotes = useCallback(() => {
    Object.values(remoteAudioEls.current).forEach((el) => {
      try {
        el.muted = false;
        el.play().catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    });
  }, []);

  return {
    connect,
    disconnect,
    users,
    remoteStreams,
    remoteScreens,
    sharingBy,
    getLocalStream,
    sendContentUpdate,
    peerStatus,
    broadcastStatus,
    startScreenShare,
    stopScreenShare,
    isScreenSharing,
    chatMessages,
    sendChatMessage, // Updated
    fetchChatHistory, // NEW
    botActive,
    botSpeaker,
    sharedContent,
    speaking,
    startRecording,
    stopRecording,
    isRecording,
    speakers,
    isRecordingLoading,
    meetingProgress,
    selectAudioDevice,
    selectVideoDevice,
    localStream,
    unmuteRemote,
    unmuteAllRemotes,
  };
}