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
  }> = {};
  dataChannels: Record<string, RTCDataChannel> = {};
  localStream: MediaStream | null = null;

  screenStream: MediaStream | null = null;
  screenSenders: Record<string, RTCRtpSender[]> = {};

  sharingBy: string | null = null;

  creatingPeer: Record<string, boolean> = {};
  pendingScreen: string | null = null;
  lastUserList: string[] = [];

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
  // New callback to inform when localStream is created/updated
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
      // Apply initial state if stream already exists (e.g., re-joining)
      this.localStream.getAudioTracks().forEach(t => t.enabled = audioEnabled);
      this.localStream.getVideoTracks().forEach(t => t.enabled = videoEnabled);
      return this.localStream;
    }

    this.initialAudioEnabled = audioEnabled;
    this.initialVideoEnabled = videoEnabled;

    // Only request stream if at least one device is enabled initially
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
      // Ensure tracks match initial state even after getting stream
      this.localStream.getAudioTracks().forEach(t => t.enabled = this.initialAudioEnabled);
      this.localStream.getVideoTracks().forEach(t => t.enabled = this.initialVideoEnabled);
      // Inform listeners
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
    // Avoid duplicate or half-open sockets
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      this.log("connect() ignored — WebSocket already open.");
      return;
    }

    // Ensure local stream exists before peers connect
    try {
      await this.ensureLocalStream(initialAudioEnabled, initialVideoEnabled);
      this.log("Local stream ready at connect():",
        this.localStream?.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));
    } catch (err) {
      this.log("?? ensureLocalStream failed at connect():", err);
    }

    this.log("Connecting WebSocket ?", this.wsUrl);
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.log("? WebSocket open:", this.wsUrl);
    };
    ws.onerror = (ev) => {
      this.log("? WebSocket error:", ev);
    };
    ws.onclose = (ev) => {
      this.log("?? WebSocket closed:", ev.reason || ev.code);
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

  // --- inside class WebRTCManager ---
  disconnect() {
    this.log("?? Disconnect called for user:", this.userId);

    // --- 1?? Stop all local media tracks ---
    if (this.localStream) {
      this.log("Stopping local media tracks...");
      this.localStream.getTracks().forEach((track) => {
        try {
          if (track.readyState === "live") {
            track.stop();
            this.log(`Stopped ${track.kind} track (${track.label || track.id})`);
          }
        } catch (err) {
          this.log("Error stopping track:", err);
        }
      });

      // Detach from any <video> or <audio> elements
      this.localStream.getTracks().forEach((track) => {
        track.onended = null;
      });
      // Clear the object reference so GC can release camera/mic
      this.localStream = null;
    }

    // --- 2?? Stop screen share stream (if any) ---
    if (this.screenStream) {
      this.log("Stopping screen share tracks...");
      this.screenStream.getTracks().forEach((track) => {
        try { track.stop(); } catch { }
      });
      this.screenStream = null;
    }

    // --- 3?? Close audio context / analyser if used (releases mic lock in mobile) ---
    try {
      if (typeof (window as any).audioContextRef !== "undefined") {
        const ctx = (window as any).audioContextRef;
        if (ctx && ctx.state !== "closed") {
          this.log("Closing shared AudioContext...");
          ctx.close().catch(() => { });
        }
        (window as any).audioContextRef = null;
      }
    } catch (err) {
      this.log("Error closing audio context:", err);
    }

    // --- 4?? Close all peer connections cleanly ---
    this.log("Closing peer connections...");
    Object.entries(this.peers).forEach(([pid, pc]) => {
      try {
        console.log("Closing peer connection for", pid);
        // stop senders' tracks
        pc.getSenders().forEach((s) => {
          try { if (s.track) { s.track.stop(); } } catch { }
          try { s.replaceTrack(null); } catch { }
        });
        // stop receivers' tracks
        pc.getReceivers().forEach((r) => {
          try { r.track?.stop(); } catch { }
        });
        try { pc.close(); } catch { }
      } catch { }
    });
    this.peers = {};
    this.dataChannels = {};
    this.screenSenders = {};
    this.creatingPeer = {};

    // --- 5?? Close WebSocket ---
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'user disconnect');
        }
      } catch { }
      this.ws = null;
    }

    // --- 6?? Notify UI and clear callbacks ---
    this.onLocalStream?.(null);
    this.onRemoteStream?.("", null);
    this.onRemoteScreen?.("", null);
    this.onSharingBy?.(null);
    this.onUsers?.([]);
    this.onUsersCount?.(0);

    this.log("? All devices and connections released.");
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
            // Deterministic initiator rule (consistent on both sides): smaller id initiates
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

  // Improved handleSignal implementing the Perfect Negotiation pattern and queued ICE
  async handleSignal(msg: SignalMsg) {
    const { action, from, payload } = msg;
    if (!from) return;

    // Ensure peer exists (create as responder if needed)
    let pc = this.peers[from];
    if (!pc && !this.creatingPeer[from]) {
      // create as non-initiator; the deterministic initiator rule in onWsMessage will cover initial creation
      this.creatingPeer[from] = true;
      try {
        pc = await this.createPeer(from, false);
      } catch (err) {
        this.log('createPeer (responder) failed for', from, err);
      } finally {
        delete this.creatingPeer[from];
      }
    }
    if (!pc) return;

    // Ensure internal flags exist
    pc._queuedCandidates = pc._queuedCandidates || [];
    pc._makingOffer = !!pc._makingOffer;
    pc._ignoreOffer = !!pc._ignoreOffer;

    // Deterministic polite decision: the peer with smaller id is initiator; polite = not initiator
    const polite = this.userId < from ? false : true; // if our id < from, we are initiator => not polite
    pc._polite = polite;

    const isOfferCollision = action === 'offer' && (pc.signalingState !== 'stable' || pc._makingOffer);
    if (isOfferCollision && !polite) {
      this.log('?? Offer collision ? ignoring offer from', from, 'because not polite');
      return;
    }

    try {
      if (action === 'offer') {
        pc._ignoreOffer = !polite && isOfferCollision;
        this.log('?? Received offer from', from, 'polite:', polite, 'collision:', isOfferCollision);

        if (isOfferCollision && !polite) {
          this.log('?? Non-polite peer ignoring offer, state:', pc.signalingState);
          return;
        }

        // If we are mid-offer, rollback to stable
        if (pc.signalingState !== 'stable') {
          try { await pc.setLocalDescription({ type: 'rollback' } as any); } catch (e) { /* ignore */ }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(payload));

        // Drain queued candidates after remote description is set
        if (pc._queuedCandidates && pc._queuedCandidates.length) {
          const queued = pc._queuedCandidates.slice();
          pc._queuedCandidates = [];
          for (const c of queued) {
            try { await pc.addIceCandidate(c); } catch (e) { this.log('addIceCandidate (queued) failed', e); }
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.wsSend({
          type: 'signal',
          action: 'answer',
          from: this.userId,
          to: from,
          payload: pc.localDescription,
        });

      } else if (action === 'answer') {
        this.log('?? Received answer from', from);
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));

          // Drain queued
          if (pc._queuedCandidates && pc._queuedCandidates.length) {
            const queued = pc._queuedCandidates.slice();
            pc._queuedCandidates = [];
            for (const c of queued) {
              try { await pc.addIceCandidate(c); } catch (e) { this.log('addIceCandidate (queued) failed', e); }
            }
          }
        } else {
          this.log('?? Ignoring answer — invalid state:', pc.signalingState);
        }

      } else if (action === 'ice' && payload) {
        // Queue ICE until remoteDescription exists
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          pc._queuedCandidates = pc._queuedCandidates || [];
          pc._queuedCandidates.push(payload);
          this.log('?? Queuing ICE candidate (no remoteDescription yet) from', from);
        } else {
          try { await pc.addIceCandidate(payload); } catch (err) { this.log('addIceCandidate error:', err); }
        }
      }
    } catch (err) {
      this.log(`handleSignal error on action ${action}:`, err);

      // Fallback to your m-line mismatch fix
      if (String(err).includes('m-lines')) {
        this.log('?? SDP m-line mismatch, recreating peer for', from);
        try { pc.close(); } catch {}
        delete this.peers[from];
        const newPc = await this.createPeer(from, false);
        const offer = await newPc.createOffer();
        await newPc.setLocalDescription(offer);
        this.wsSend({
          type: 'signal',
          action: 'offer',
          from: this.userId,
          to: from,
          payload: offer,
        });
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

  private attachLocalTracks(pc: RTCPeerConnection & any) {
    if (!this.localStream) return;
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
  }

  // --- inside class WebRTCManager ---
  async createPeer(targetId: string, initiator: boolean): Promise<RTCPeerConnection & any> {
    if (this.peers[targetId] || this.creatingPeer[targetId]) return this.peers[targetId];
    this.creatingPeer[targetId] = true;
    this.log("?? createPeer ?", targetId, "initiator:", initiator);

    const pc: RTCPeerConnection & any = new RTCPeerConnection(this.iceConfig) as any;
    // initialize internal flags
    pc._makingOffer = false;
    pc._ignoreOffer = false;
    pc._queuedCandidates = [];
    pc._polite = !(this.userId < targetId); // polite if our id >= targetId (consistent with onWsMessage rule)
    pc._iceRestartTimer = null;

    this.peers[targetId] = pc;
    let localMakingOffer = false;

    // ICE candidates
    pc.onicecandidate = (e) => {
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

    // ICE connection state handling (debounced restart)
    pc.oniceconnectionstatechange = () => {
      this.log("ICE state", targetId, pc.iceConnectionState);
      try {
        if (["failed", "disconnected"].includes(pc.iceConnectionState)) {
          // debounce restart
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

    // Connection state handling (retain your existing cleanup)
    pc.onconnectionstatechange = () => {
      this.log("Conn state", targetId, pc.connectionState);
      if (["failed", "closed"].includes(pc.connectionState)) {
        try { pc.close(); } catch { }
        delete this.peers[targetId];
        this.onRemoteStream?.(targetId, null);
        this.onRemoteScreen?.(targetId, null);
      }
    };

    // Ensure local stream exists
    try {
      if (!this.localStream) {
        await this.ensureLocalStream(this.initialAudioEnabled, this.initialVideoEnabled);
        this.log("Local stream ensured in createPeer", targetId);
      }
    } catch (err) {
      this.log("ensureLocalStream failed in createPeer:", err);
    }

    // Data channel setup
    if (initiator) {
      const dc = pc.createDataChannel("datachannel");
      dc.onmessage = (ev) => this.handleDataChannelMessage(ev, targetId);
      this.dataChannels[targetId] = dc;
    } else {
      pc.ondatachannel = (e) => {
        this.dataChannels[targetId] = e.channel;
        e.channel.onmessage = (msg) => this.handleDataChannelMessage(msg, targetId);
      };
    }

    // Attach local media
    this.attachLocalTracks(pc);
    this.log("?? Attached local tracks ?", targetId, this.localStream?.getTracks().length || 0);

    // Handle remote streams
    pc.ontrack = (evt) => {
      this.log("?? ontrack from", targetId, evt.track.kind, evt.streams.length);
      const stream = evt.streams[0];
      if (evt.track.kind === "video" && this.sharingBy === targetId) {
        this.onRemoteScreen?.(targetId, stream);
      } else {
        this.onRemoteStream?.(targetId, stream);
      }
    };

    // Negotiation guard implementing perfect negotiation
    pc.onnegotiationneeded = async () => {
      if (pc._makingOffer || pc.signalingState !== "stable") {
        this.log("? Skip negotiation (busy or unstable) for", targetId);
        return;
      }
      pc._makingOffer = true;
      try {
        this.log("?? onnegotiationneeded ? offer to", targetId);
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
        this.log("negotiationneeded error:", err);
      } finally {
        pc._makingOffer = false;
      }
    };

    // Handle incoming offers/answers/ice for this peer via ws message handler (handled in handleSignal)

    // Initial offer for initiators
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


  // Replace audio/video track across all peer connections and update localStream
  async setAudioDevice(deviceId: string | null) {
    try {
      const newStream = deviceId ? await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } }) : null;
      const newTrack = newStream?.getAudioTracks()[0] ?? null;

      // Replace senders' audio track with newTrack
      Object.values(this.peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newTrack).catch(err => this.log("replaceTrack audio failed", err));
        } else if (newTrack) {
          pc.addTrack(newTrack, newStream!);
        }
      });

      // Update localStream: remove old audio tracks and add new one
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(t => { try { t.stop(); } catch { } });
        if (newTrack) this.localStream.addTrack(newTrack);
      } else if (newStream) {
        this.localStream = new MediaStream([...(newStream.getTracks())]);
      }

      // Inform listeners
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
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { cursor: "always" }, audio: audioMode === 'system' });
      if (audioMode === 'mic') {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        displayStream.addTrack(micStream.getAudioTracks()[0]);
      }
      this.screenStream = displayStream;

      Object.entries(this.peers).forEach(([peerId, pc]) => {
        const senders: RTCRtpSender[] = [];
        displayStream.getTracks().forEach((track: any) => {
          const sender = pc.addTrack(track, displayStream);
          if (sender) senders.push(sender);
        });
        if (senders.length) this.screenSenders[peerId] = senders;
      });

      this.sharingBy = this.userId;
      this.onSharingBy?.(this.userId);
      this.broadcastDataChannel({ type: "screen_update", payload: { sharing: true, by: this.userId } });
      displayStream.getTracks().forEach((track: any) => { track.onended = () => this.stopScreenShare(); });

    } catch (err) {
      this.log("startScreenShare failed", err);
    }
  }

  async stopScreenShare() {
    if (!this.screenStream) return;

    try {
      this.log("?? Stopping screen share...");

      // --- 1?? Stop screen tracks cleanly ---
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
          this.log(`Stopped screen track (${track.kind})`);
        } catch (err) {
          this.log("Error stopping screen track:", err);
        }
      });
      this.screenStream = null;

      // --- 2?? Restore camera video track if available ---
      const cameraTrack = this.localStream?.getVideoTracks()[0] || null;
      if (cameraTrack) {
        this.log("?? Restoring camera track to peers...");
        Object.values(this.peers).forEach((pc) => {
          const senders = pc.getSenders().filter((s) => s.track?.kind === "video");
          senders.forEach((sender) => {
            try {
              sender.replaceTrack(cameraTrack);
            } catch (err) {
              this.log("replaceTrack (camera restore) failed:", err);
            }
          });
        });
      } else {
        this.log("?? No camera track found to restore after screen share stop.");
      }

      // --- 3?? Reset sharing state and broadcast update ---
      this.screenSenders = {};
      this.sharingBy = null;
      this.onSharingBy?.(null);
      this.broadcastDataChannel({
        type: "screen_update",
        payload: { sharing: false, by: this.userId },
      });

      // --- 4?? Safely rebuild peers to prevent SDP order mismatch ---
      const peersToRecreate = Object.keys(this.peers);
      this.log("?? Recreating peers after screen stop:", peersToRecreate);

      for (const pid of peersToRecreate) {
        try {
          const oldPc = this.peers[pid];
          try { oldPc.close(); } catch { }
          delete this.peers[pid];

          // --- Safe recreate with negotiation guard ---
          const newPc = await this.createPeer(pid, true);
          this.log("? Recreated peer connection for", pid);

          // --- Ensure audio continuity ---
          const audioTrack = this.localStream?.getAudioTracks()[0];
          if (audioTrack) {
            const sender = newPc.getSenders().find((s) => s.track?.kind === "audio");
            if (!sender) {
              newPc.addTrack(audioTrack, this.localStream!);
              this.log("?? Reattached audio track for", pid);
            }
          }

          // --- Renegotiate safely ---
          if (newPc.signalingState === "stable") {
            const offer = await newPc.createOffer();
            await newPc.setLocalDescription(offer);
            this.wsSend({
              type: "signal",
              action: "offer",
              from: this.userId,
              to: pid,
              payload: newPc.localDescription,
            });
            this.log("?? Sent new offer after screen stop to", pid);
          } else {
            this.log("?? Skipped offer — signaling not stable for", pid);
          }

        } catch (err) {
          this.log("stopScreenShare ? peer recreate error for", pid, err);
        }
      }

      this.log("? Screen share fully stopped, peers refreshed.");
    } catch (err) {
      this.log("stopScreenShare error:", err);
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
    };
    mgr.onRemoteScreen = (peerId, stream) => {
      setRemoteScreens(prev => {
        const newState = { ...prev };
        if (stream) {
          newState[peerId] = stream;
        } else {
          delete newState[peerId];
        }
        return newState;
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
      await mgrRef.current.connect(initialAudioEnabled, initialVideoEnabled);
      // Update local stream state after connection attempt (manager.onLocalStream will also notify)
      setLocalStream(mgrRef.current.localStream);
    } catch (err) {
      console.error("Connect error:", err);
    }
  }, []);

  useEffect(() => {
    if (!localStream) return;
    let audioCtx: AudioContext | null = null, analyser: AnalyserNode | null = null, micSource: MediaStreamAudioSourceNode | null = null, rafId: number;
    const startVAD = async () => {
      try {
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
  const sendChatMessage = useCallback((msg: ChatMessagePayload) => { mgrRef.current?.sendChatMessage(msg); setChatMessages((prev) => [...prev, msg]); }, []);
  const getLocalStream = useCallback(() => mgrRef.current?.localStream ?? null, []);
  // Expose device selection helpers
  const selectAudioDevice = useCallback((deviceId: string | null) => { mgrRef.current?.setAudioDevice(deviceId); }, []);
  const selectVideoDevice = useCallback((deviceId: string | null) => { mgrRef.current?.setVideoDevice(deviceId); }, []);

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
    // exposed helpers
    selectAudioDevice,
    selectVideoDevice,
    localStream,
  };
}
