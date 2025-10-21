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

export type ChatMessagePayload = {
  id: string;
  from: string;
  text?: string;
  attachments?: { name: string; dataUrl: string }[];
  ts: number;
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

  // --- FIX A: Add guard flag for idempotent disconnect ---
  private isDisconnected = false;

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

    // If manager already disconnected permanently (guard), do not reconnect.
    if (this.isDisconnected) {
      this.log("⚠️ connect() called but manager is flagged disconnected.");
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

    // Idempotent guard: ensure we only run the heavy cleanup once.
    if (this.isDisconnected) {
      this.log("⚠️ Disconnect called, but already disconnected.");
      return;
    }
    this.isDisconnected = permanent ? true : true;

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
            console.log("Removing tracks from peer connection senders for", peerId);
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
    }
  }


  async onWsMessage(msg: SignalMsg) {
    if (!msg) return;

    switch (msg.type) {
      case "recording_update": this.onRecordingUpdate?.(!!msg.is_recording); break;
      case "speaker_update": this.onSpeakerUpdate?.(msg.speakers || {}); break;
      case "content_update": this.onSharedContent?.(msg.payload || ""); break;
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
            const initiator = isBot || this.userId < peerId;
            this.createPeer(peerId, initiator);
          }
        }
        break;
      case "bot_audio": this.onBotAudio?.(msg.data || msg.payload || "", msg.format, msg.speaker); break;
      case "bot_message":
        const m: ChatMessagePayload = { id: `bot-${Date.now()}`, from: msg.speaker || "Bot", text: msg.message || (msg.payload as string), ts: Date.now() };
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
        pc = await this.createPeer(from, false);
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
    function stableHash(str: string): number {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    }
    const polite = stableHash(this.userId) > stableHash(from);
    pc._polite = polite;
    this.log(`Politeness check: ${this.userId} vs ${from} → ${polite ? "polite" : "impolite"}`);

    // --- offer-collision logic ---
    const isOfferCollision = action === "offer" &&
      (pc.signalingState !== "stable" || pc._makingOffer);

    if (isOfferCollision && !polite) {
      this.log("⚠️ Offer collision → ignoring offer from", from, "because not polite");
      return;
    }

    try {
      if (action === "offer") {
        pc._ignoreOffer = !polite && isOfferCollision;
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
      else if (obj.type === "chat_message") this.onChat?.(obj.payload);
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
      const audioTransceiver = transceivers.find((t: RTCRtpTransceiver) => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio' || (t.sender && t.sender.track && t.sender.track.kind === 'audio')) ??
        transceivers.find((t: RTCRtpTransceiver) => t.mid === null && t.sender && t.sender && t.sender.track === null && t.receiver && t.receiver.track === null && t.sender && t.sender.track === null && (t as any).kind === 'audio');

      // video transceivers: prefer first video transceiver as camera, second reserved for screen
      const videoTransceivers = transceivers.filter((t: RTCRtpTransceiver) => (t.receiver && t.receiver.track && t.receiver.track.kind === 'video') || t.sender?.track?.kind === 'video' || (t && (t as any).kind === 'video'));
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
    this.log("🧩 createPeer →", targetId, "initiator:", initiator);

    const pc: RTCPeerConnection & any = new RTCPeerConnection(this.iceConfig) as any;
    pc._makingOffer = false;
    pc._ignoreOffer = false;
    pc._queuedCandidates = [];
    // ✅ FIX: initialize polite to false here — deterministically computed in handleSignal
    pc._polite = false;
    pc._iceRestartTimer = null;
    pc._negotiationTimer = null;

    this.peers[targetId] = pc;

    const existingSenders = pc.getSenders();
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        const sameKindSender = existingSenders.find((s: any) => s.track?.kind === track.kind);
        if (sameKindSender) {
          // replace existing track instead of re-adding
          sameKindSender.replaceTrack(track);
        } else {
          pc.addTrack(track, this.localStream);
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
              if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                this.log("?? Attempting ICE restart for", targetId);
                try { (pc as any).restartIce?.(); } catch (err) { this.log('restartIce failed', err); }
              }
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

    // Ensure localStream exists (but do NOT attach tracks yet — transceivers first)
    try {
      if (!this.localStream) {
        await this.ensureLocalStream(this.initialAudioEnabled, this.initialVideoEnabled);
        this.log("Local stream ensured in createPeer", targetId);
      }
    } catch (err) {
      this.log("ensureLocalStream failed in createPeer:", err);
    }

    // --- PATCH: create stable transceivers up-front to guarantee SDP m-line order ---
    // Order matters: audio, camera-video, screen-video (reserved).
    // Creating transceivers here prevents later add/remove from changing m-line order.
    try {
      const existing = pc.getTransceivers();
      if (!existing || existing.length === 0) {
        pc.addTransceiver("audio", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" }); // camera
        pc.addTransceiver("video", { direction: "sendrecv" }); // reserved for screen share
        this.log("Created stable transceivers for", targetId);
      }
    } catch (err) {
      this.log("createPeer: addTransceiver failed (non-fatal):", err);
    }

    if (initiator) {
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

    // --- FIX B: Debounce onnegotiationneeded ---
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== "stable") {
        this.log(`[useWebRTC] 🟡 skip negotiation → ${targetId} ${pc.signalingState}`);
        return;
      }
      // prevent repeated renegotiation loops
      if (pc._makingOffer || pc.signalingState !== "stable") {
        this.log("🟡 skip negotiation →", targetId, pc.signalingState);
        return;
      }

      pc._makingOffer = true;
      try {
        this.log("🔁 onnegotiationneeded → creating offer for", targetId);
        const offer = await pc.createOffer();

        // ensure still stable before applying
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

    // --- End FIX B ---


    if (initiator) {
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
        // ✅ Safari & Chrome safety: must use boolean, not undefined
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

      // ✅ Prevent re-adding duplicate senders (common cause of addTrack InvalidAccessError)
      Object.entries(this.peers).forEach(([peerId, pc]) => {
        if (pc.signalingState === "closed") return;

        const stored: {
          replaced: { kind: string; sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[];
          addedSenders: RTCRtpSender[];
        } = { replaced: [], addedSenders: [] };

        // === VIDEO ===
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

        // === AUDIO ===
        const audioTrack = displayStream.getAudioTracks()[0] ?? null;
        if (audioTrack) {
          const audioSender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
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

        // ✅ Force renegotiation only when signalingState is stable
        if (pc.signalingState === "stable") {
          pc.onnegotiationneeded?.(new Event("negotiationneeded"));
        }
      });

      // === Local updates ===
      this.sharingBy = this.userId;
      this.onSharingBy?.(this.userId);
      this.broadcastDataChannel({
        type: "screen_update",
        payload: { sharing: true, by: this.userId },
      });

      // Auto-stop listener
      displayStream.getTracks().forEach((track: any) => {
        track.onended = () => this.stopScreenShare();
      });

      this.log("✅ startScreenShare: displayStream created, replacements made.");
    } catch (err) {
      this.log("❌ startScreenShare failed", err);
      // cleanup
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

      // ✅ Stop only display tracks, keep camera/mic intact
      try {
        this.screenStream?.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch { }
        });
      } catch (err) {
        this.log("Error stopping screenStream tracks", err);
      }

      // === Restore original tracks ===
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

        // ✅ Re-add local audio if needed (fixes “silent peer after share” bug)
        const hasAudioSender = pc.getSenders().some((s) => s.track && s.track.kind === "audio");
        if (!hasAudioSender && this.localStream) {
          try {
            const lt = this.localStream.getAudioTracks()[0];
            if (lt) pc.addTrack(lt, this.localStream);
          } catch (err) {
            this.log("Error re-adding local audio track", err);
          }
        }

        // ✅ Trigger renegotiation if stable
        if (pc.signalingState === "stable") {
          pc.onnegotiationneeded?.(new Event("negotiationneeded"));
        }
      });

      // === Cleanup ===
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
  sendChatMessage(payload: ChatMessagePayload) { this.broadcastDataChannel({ type: "chat_message", payload }); }
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

  useEffect(() => {
    if (!mgrRef.current) {
      mgrRef.current = new WebRTCManager(room, userId, signalingBase);
    }
    const mgr = mgrRef.current;

    mgr.onUsers = setUsers;
    mgr.onLocalStream = (s) => setLocalStream(s);

    // ------------ Remote stream handling with automatic audio playback ------------
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

      // Create / manage an <audio> element when a remote stream with audio arrives.
      try {
        // If stream is null -> cleanup
        if (!stream) {
          // remove audio element
          const existing = remoteAudioEls.current[peerId];
          if (existing) {
            try { existing.pause(); } catch { }
            try { existing.srcObject = null; } catch { }
            try { existing.remove(); } catch { }
            delete remoteAudioEls.current[peerId];
          }
          return;
        }

        // Only create audio element if stream has audio tracks (non-screen)
        const hasAudio = stream.getAudioTracks().length > 0;
        if (!hasAudio) return;

        // If an audio element already exists for this peer, update srcObject
        let audioEl = remoteAudioEls.current[peerId];
        if (!audioEl) {
          audioEl = document.createElement("audio");
          // Keep element out of layout
          audioEl.style.position = "fixed";
          audioEl.style.left = "-9999px";
          audioEl.style.width = "1px";
          audioEl.style.height = "1px";
          audioEl.autoplay = true;
          // playsInline helps on mobile (iOS)
          audioEl.setAttribute("playsinline", "true");
          audioEl.muted = false; // prefer audible; we will fallback to muted play if autoplay blocked
          audioEl.preload = "auto";
          // Some UAs require `muted` to be true to autoplay with sound; we'll try play and handle errors
          remoteAudioEls.current[peerId] = audioEl;
          try { document.body.appendChild(audioEl); } catch (e) { /* If DOM not ready, ignore */ }
        }

        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }

        // Try to play. If autoplay blocked, attempt muted play then set a flag (console warns).
        const tryPlay = async () => {
          try {
            await audioEl.play();
            // Playback succeeded without a user gesture
            console.log(`[useWebRTC] Playing remote audio for ${peerId}`);
            // If it was muted to force play, unmute if possible (leave it muted if autoplay policy prevents)
            if (audioEl.muted) {
              // attempt to unmute — may still be blocked without user gesture
              try {
                audioEl.muted = false;
              } catch (e) { /* ignore */ }
            }
          } catch (err) {
            // Autoplay blocked: try muted play (this usually succeeds). Inform via console so UI can prompt user to unmute.
            console.warn(`[useWebRTC] Autoplay blocked for ${peerId}, attempting muted playback. User gesture required to unmute.`, err);
            try {
              audioEl.muted = true;
              await audioEl.play();
              // Keep element muted; app UI should provide an unmute button that calls unmuteRemote(peerId).
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

    // Remote screen streams handled separately
    mgr.onRemoteScreen = (peerId, stream) => {
      setRemoteScreens(prev => {
        const newState = { ...prev };
        if (stream) newState[peerId] = stream;
        else delete newState[peerId];
        return newState;
      });
    };

    // Expose a helper on manager too (optional): unmute remote audio element (must be called on user gesture)
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

    // Also allow globally unmuting all remote audios on gesture
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
    mgr.onChat = (m) => setChatMessages((prev) => [...prev, m]);
    mgr.onBotActive = setBotActive;

    return () => {
      console.log("[useWebRTC Cleanup] Hook unmounting. Disconnecting manager...");
      if (mgrRef.current) {
        mgrRef.current.disconnect();
        mgrRef.current = null;
      }

      // cleanup audio elements
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
        // --- FIX A: Check if localStream still has audio tracks ---
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
      // Let the effect cleanup null the ref on unmount - but if caller explicitly disconnects,
      // we keep the ref around to allow reconnect if desired. (mgrRef.current internal guard prevents repeated runs)
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
  const sendChatMessage = useCallback((msg: ChatMessagePayload) => { mgrRef.current?.sendChatMessage(msg); setChatMessages((prev) => [...prev, msg]); }, []);
  const getLocalStream = useCallback(() => mgrRef.current?.localStream ?? null, []);
  const selectAudioDevice = useCallback((deviceId: string | null) => { mgrRef.current?.setAudioDevice(deviceId); }, []);
  const selectVideoDevice = useCallback((deviceId: string | null) => { mgrRef.current?.setVideoDevice(deviceId); }, []);

  // expose unmute helpers for UI usage
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
    sendChatMessage,
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
    // new helpers exposed
    unmuteRemote,
    unmuteAllRemotes,
  };
}
