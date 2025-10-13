// src/hooks/useWebRTC.ts
/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from "react";
import { BotNames } from "../Constants";

/**
 * Full-featured WebRTC hook with:
 * - signaling via websocket (default ws://127.0.0.1:8000/ws/<room>/<user>)
 * - per-peer RTCPeerConnections and datachannels
 * - screen share send/receive
 * - chat via datachannel
 * - peerStatus broadcast
 * - bot handling: bot_audio + bot_message from server, botActive/botSpeaker flags
 *
 * Exports (keeps compatibility):
 * connect,
 * disconnect,
 * users,
 * remoteStreams,
 * remoteScreens,
 * sharingBy,
 * getLocalStream,
 * sendContentUpdate,
 * peerStatus,
 * broadcastStatus,
 * startScreenShare,
 * stopScreenShare,
 * isScreenSharing,
 * chatMessages,
 * sendChatMessage,
 * botActive,
 * botSpeaker,
 * speaking
 */

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
const DEFAULT_WS = socketUrl; // "ws://127.0.0.1:8000";

/** Optional bot names - if you have a global constant, set window.__BOT_NAMES__ = [...] before load */
const DEFAULT_BOT_NAMES = (window as any).__BOT_NAMES__ || ["Jarvis"];

class WebRTCManager {
  room: string;
  userId: string;
  wsUrl: string;

  ws: WebSocket | null = null;
  peers: Record<string, RTCPeerConnection> = {};
  dataChannels: Record<string, RTCDataChannel> = {};
  localStream: MediaStream | null = null;

  screenStream: MediaStream | null = null;
  screenSenders: {
    [peerId: string]: { sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[];
  } = {};

  creatingPeer: Record<string, boolean> = {};
  pendingScreen: string | null = null;

  // callbacks set by hook
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
  iceConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  constructor(room: string, userId: string, baseSignalingUrl?: string) {
    this.room = room;
    this.userId = userId;
    const base = baseSignalingUrl || DEFAULT_WS;
    // ensure no trailing slash
    this.wsUrl = base.replace(/\/+$/, "") + `/ws/${this.room}/${this.userId}`;
  }

  log(...args: any[]) {
    console.log("[useWebRTC]", ...args);
  }

  private _isCleaningUp = false;

  async fullCleanup(): Promise<void> {
    if (this._isCleaningUp) return;
    this._isCleaningUp = true;
    try {
      this.log("fullCleanup start");

      // Close websocket
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
      } catch { }

      // For each peer: replace senders' tracks with null (so remote stops receiving),
      // then close the RTCPeerConnection.
      Object.values(this.peers).forEach((pc) => {
        try {
          // Replace all senders' tracks with null (safer than stop only)
          pc.getSenders().forEach((s) => {
            try {
              s.replaceTrack(null);
            } catch {
              /* ignore */
            }
          });
        } catch { }
        try {
          pc.close();
        } catch { }
      });

      // clear peers and data channels
      this.peers = {};
      this.dataChannels = {};

      // Stop & clear localStream
      try {
        if (this.localStream) {
          this.localStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch { }
          });
        }
      } catch { }
      this.localStream = null;

      // Stop & clear screenStream
      try {
        if (this.screenStream) {
          this.screenStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch { }
          });
        }
      } catch { }
      this.screenStream = null;

      // Restore and clear any replaced senders map (if present)
      try {
        // Object.entries(this.screenSenders || {}).forEach(([peerId]) => {
        //   // const pc = this.peers[peerId];
        //   // we already closed pcs above; if you still want to restore, handle it here.
        // });
      } catch { }

      this.screenSenders = {};
      this.pendingScreen = null;
      this.creatingPeer = {};

      // UI callbacks
      try {
        this.onUsers?.([]);
      } catch { }
      try {
        this.onSharingBy?.(null);
      } catch { }
      try {
        this.onBotActive?.(false);
      } catch { }

      this.log("fullCleanup complete");
    } catch (err) {
      this.log("fullCleanup error", err);
    } finally {
      this._isCleaningUp = false;
    }
  }

  wsSend(obj: any) {
    const s = JSON.stringify(obj);
    if (!this.ws) {
      this.log("wsSend: ws not ready, dropping", obj);
      return;
    }
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(s);
      return;
    }
    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.addEventListener(
        "open",
        () => {
          try {
            this.ws?.send(s);
          } catch (e) {
            this.log("delayed send failed", e);
          }
        },
        { once: true }
      );
      return;
    }
    this.log("wsSend: websocket not open", this.ws.readyState);
  }

  async ensureLocalStream(audioOnly = false) {
    if (this.localStream) return this.localStream;
    try {
      const constraints = audioOnly ? { audio: true } : { audio: true, video: true };
      console.log("ensureLocalStream:" + JSON.stringify(constraints));
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (err) {
      this.log("ensureLocalStream error", err);
      throw err;
    }
  }

  async connect() {
    // open ws and prepare local stream (if not available manager won't block - hook handles fallback)
    try {
      await this.ensureLocalStream().catch(() => {
        /* caller may handle if user denies */
      });
    } catch { }
    this.log("Connecting to WS:", this.wsUrl);
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.log("WebSocket open:", this.wsUrl);
    };

    ws.onerror = (ev) => {
      this.log("WebSocket error", ev);
    };

    ws.onclose = (ev) => {
      this.log("WebSocket closed", ev);
    };

    ws.onmessage = async (evt) => {
      try {
        console.log("onmessage:" + evt.data);
        const msg: SignalMsg = JSON.parse(evt.data);
        this.log("?? WS message:", msg.type, msg.from, "?", msg.to);
        await this.onWsMessage(msg);
      } catch (err) {
        this.log("WS parse error", err);
      }
    };
  }

  disconnect() {
    this.log("Manager disconnect");
    try {
      this.ws?.close();
    } catch { }

    Object.values(this.peers).forEach((pc) => {
      try {
        pc.close();
      } catch { }
    });
    this.peers = {};
    this.dataChannels = {};

    // Stop & null local stream if any (clear the reference!)
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch { }
        });
      }
    } catch {
      /* defensive */
    }
    // IMPORTANT: clear the stored reference so React hook cleanup can run
    this.localStream = null;

    // Stop & null screen stream
    try {
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch { }
        });
      }
    } catch {
      /* defensive */
    }
    this.screenStream = null;

    // If we previously replaced senders during screen share, forget them
    this.screenSenders = {};
    this.pendingScreen = null;
    this.creatingPeer = {};
    this.onUsers?.([]);
    this.onSharingBy?.(null);
    this.onBotActive?.(false);
  }

  async onWsMessage(msg: SignalMsg) {
    if (!msg) return;

    // --- NEW: Handle recording updates ---
    if (msg.type === "recording_update") {
      this.onRecordingUpdate?.(!!msg.is_recording);
      return;
    }

    // --- NEW: Handle speaker updates ---
    if (msg.type === "speaker_update") {
      this.onSpeakerUpdate?.(msg.speakers || {});
      return;
    }

    // --- 1?? Handle user list updates ---
    if (msg.type === "user_list") {
      const list = msg.users || [];
      this.onUsers?.(list);
      this.onUsersCount?.(list.length || 0);

      await new Promise((r) => setTimeout(r, 1000));
      // Create peers for normal users
      for (const user of list.filter((u) => u !== this.userId)) {
        if (!this.peers[user]) {
          const initiator = BotNames.indexOf(user) > -1 ? true : this.userId < user;
          this.log(`[useWebRTC] Creating peer for ${user}, initiator=${initiator}`);
          await this.createPeer(user, initiator);
        }
      }

      // Ensure bot peers are established and handshake triggered
      const botNames = (window as any).__BOT_NAMES__ || DEFAULT_BOT_NAMES;
      for (const botName of botNames) {
        if (!this.peers[botName]) {
          this.log(`[useWebRTC] ?? Ensuring bot peer for ${botName}`);

          try {
            // create the peer (this will also try to send an offer via createPeer if initiator=true)
            await this.createPeer(botName, true);

            // In addition to what createPeer already sent, explicitly request the bot to start handshake.
            // This is a no-op for normal servers but helpful for bots that create peers only on certain messages.
            const req = { type: "signal", action: "offer_request", from: this.userId, to: botName, payload: null };
            try {
              this.log(`[useWebRTC] ?? Emitting offer_request to ${botName}`, req);
              this.wsSend(req);
            } catch (sendErr) {
              this.log(`[useWebRTC] ?? wsSend offer_request failed for ${botName}`, sendErr);
            }
          } catch (err) {
            this.log(`[useWebRTC] ?? Failed creating bot peer for ${botName}:`, err);
          }
        }
      }

      return;
    }

    // --- 2?? Handle bot audio stream ---
    if (msg.type === "bot_audio") {
      this.onBotAudio?.(msg.data || msg.payload || "", msg.format, msg.speaker);
      this.onBotActive?.(!!msg.speaker);
      return;
    }

    // --- 3?? Handle bot text message ---
    if (msg.type === "bot_message") {
      const m: ChatMessagePayload = {
        id: `bot-${Date.now()}`,
        from: msg.speaker || "Bot",
        text: msg.message || msg.payload || "",
        ts: Date.now(),
      };
      this.onBotMessage?.(m);
      this.onChat?.(m);
      return;
    }

    if (msg.type === "signal" && msg.action === "offer_request") {
      this.log(`[useWebRTC] ?? Received offer_request from ${msg.from}`);
      const from = msg.from!;
      try {
        // create peer as initiator=false (let bot send offer)
        await this.createPeer(from, false);
      } catch (err) {
        this.log(`[useWebRTC] ?? Failed to create peer on offer_request:`, err);
      }
      return;
    }

    // --- 4?? Handle WebRTC signaling ---
    if (msg.type === "signal") {
      await this.handleSignal(msg);
      return;
    }
  }

  async handleSignal(msg: SignalMsg) {
    const { action, from, payload } = msg;
    const desc = payload?.sdp ? new RTCSessionDescription(payload) : payload;
    if (!from) return;
    if (!this.peers[from]) {
      await this.createPeer(from, false);
    }
    const pc = this.peers[from];
    if (!pc) return;
    try {
      if (action === "offer") {
        // if remote's offer comes when local state isn't stable, skip or handle gracefully
        if (pc.signalingState !== "stable") {
          this.log("Remote offer received but pc signalingState not stable:", pc.signalingState);
        }
        await pc.setRemoteDescription(desc);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        this.wsSend({ type: "signal", action: "answer", from: this.userId, to: from, payload: pc.localDescription });
      } else if (action === "answer") {
        // remote answered our offer
        try {
          await pc.setRemoteDescription(desc);
        } catch (err) {
          this.log("setRemoteDescription(answer) failed:", err);
        }
      } else if (action === "ice" || action === "candidate") {
        if (payload) {
          try {
            await pc.addIceCandidate(payload);
          } catch (e) {
            this.log("addIceCandidate failed", e);
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
          this.onSharingBy?.(null);
        }
      }
    } catch (err) {
      this.log("handleSignal error", err);
    }
  }

  private handleDataChannelMessage(ev: MessageEvent, peerId: string) {
    try {
      const obj = JSON.parse(ev.data) as DataChannelMessage;
      if (!obj || !obj.type) return;
      if (obj.type === "content_update") this.onSharedContent?.(obj.payload);
      else if (obj.type === "status_update") this.onPeerStatus?.(peerId, obj.payload);
      else if (obj.type === "screen_update") {
        const { sharing, by } = obj.payload;
        if (sharing) {
          this.pendingScreen = by;
          this.onSharingBy?.(by);
        } else {
          this.onRemoteScreen?.(by, null);
          this.onSharingBy?.(null);
        }
      } else if (obj.type === "chat_message") {
        this.onChat?.(obj.payload);
      }
    } catch (err) {
      this.log("datachannel parse error", err);
    }
  }

  private attachLocalTracks(pc: RTCPeerConnection) {
    if (!this.localStream) return;
    this.localStream.getTracks().forEach((t) => {
      try {
        pc.addTrack(t, this.localStream as MediaStream);
      } catch { }
    });
  }

  async createPeer(targetId: string, initiator: boolean) {
    if (this.peers[targetId]) return this.peers[targetId];
    if (this.creatingPeer[targetId]) {
      // wait for existing creation
      for (let i = 0; i < 20; i++) {
        if (this.peers[targetId]) return this.peers[targetId];
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    this.creatingPeer[targetId] = true;
    this.log("Creating peer for", targetId, "initiator:", initiator);

    const pc = new RTCPeerConnection(this.iceConfig);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.wsSend({ type: "signal", action: "ice", from: this.userId, to: targetId, payload: e.candidate });
      }
    };

    pc.ontrack = (evt) => {
      try {
        const stream = evt.streams[0];
        const track = evt.track;
        const settings = (track as any).getSettings?.() || {};
        const displaySurface = String(settings.displaySurface || "").toLowerCase();
        let isScreen = false;
        if (track.kind === "video") {
          if (displaySurface === "monitor" || displaySurface === "window" || displaySurface === "application") isScreen = true;
          else if ((track.label || "").toLowerCase().includes("screen")) isScreen = true;
          else if (this.pendingScreen === targetId) {
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
        this.log("ontrack error", err);
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
        this.onSharingBy?.(null);
      }
    };
    console.log("initiator:" + initiator);
    // datachannel
    if (initiator) {
      try {
        // create offer as before
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const dc = pc.createDataChannel("datachannel");
        this.dataChannels[targetId] = dc;
        dc.onmessage = (ev) => this.handleDataChannelMessage(ev, targetId);

        // Build a plain JS payload (avoid any non-serializable fields)
        const payload = {
          sdp: pc.localDescription?.sdp,
          type: pc.localDescription?.type,
        };

        // log for debugging
        this.log(`[useWebRTC] Sending SDP offer to ${targetId}`, { to: targetId, payload: { type: payload.type } });

        // send in normal 'signal' envelope with explicit payload shape
        this.wsSend({ type: "signal", action: "offer", from: this.userId, to: targetId, payload });

        // if target is a BOT, also send a short "offer_request" to encourage bot side
        const botNames = (window as any).__BOT_NAMES__ || DEFAULT_BOT_NAMES;
        if (botNames.includes(targetId)) {
          try {
            this.log(`[useWebRTC] Also sending explicit offer_request to bot ${targetId}`);
            this.wsSend({ type: "signal", action: "offer_request", from: this.userId, to: targetId, payload: null });
          } catch (err) {
            this.log(`[useWebRTC] offer_request send failed for ${targetId}`, err);
          }
        }
      } catch (err) {
        this.log("createOffer failed", err);
      }
    } else {
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        this.dataChannels[targetId] = dc;
        dc.onmessage = (msg) => this.handleDataChannelMessage(msg, targetId);
        dc.onopen = () => this.log("DC (rcv) open from", targetId);
      };
    }

    // attach local tracks
    this.attachLocalTracks(pc);

    // attach screen tracks if already sharing
    if (this.screenStream) {
      const arr: { sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[] = [];
      this.screenStream.getTracks().forEach((t) => {
        try {
          const s = pc.addTrack(t, this.screenStream as MediaStream);
          if (s) arr.push({ sender: s, originalTrack: null });
        } catch {
          /* ignore */
        }
      });
      if (arr.length) this.screenSenders[targetId] = arr;
    }

    if (initiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.wsSend({ type: "signal", action: "offer", from: this.userId, to: targetId, payload: pc.localDescription });
      } catch (err) {
        this.log("createOffer failed", err);
      }
    }

    this.peers[targetId] = pc;
    this.creatingPeer[targetId] = false;
    return pc;
  }

  broadcastDataChannel(message: DataChannelMessage) {
    const s = JSON.stringify(message);
    Object.values(this.dataChannels).forEach((dc) => {
      try {
        if (dc.readyState === "open") dc.send(s);
      } catch (e) {
        this.log("dc send error", e);
      }
    });
  }

  // --- NEW MANAGER METHODS ---
  sendSpeakingUpdate(speaking: boolean) {
    this.wsSend({ type: "speaking_update", payload: { speaking } });
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

  async startScreenShare(audioMode: "none" | "mic" | "system" = "none") {
    if (this.screenStream) return;

    try {
      let displayStream: MediaStream;

      // Configure screen capture with optional audio
      if (audioMode === "system") {
        displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { cursor: "always" },
          audio: true,
        });
      } else {
        displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { cursor: "always" },
          audio: false,
        });

        if (audioMode === "mic") {
          // Grab mic and mix it with display video tracks
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          // keep a combined stream (video from display, audio from mic)
          const mixed = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...micStream.getAudioTracks(),
          ]);
          displayStream = mixed;
        }
      }

      this.screenStream = displayStream;

      // For each peer: if a sender of same kind exists, replace its track.
      // Save originals so we can restore on stop.
      Object.entries(this.peers).forEach(([peerId, pc]) => {
        const replaced: { sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[] = [];

        // candidate audio/video tracks from displayStream
        const screenAudio = displayStream.getAudioTracks()[0] ?? null;
        const screenVideo = displayStream.getVideoTracks()[0] ?? null;

        // Replace existing senders if present
        pc.getSenders().forEach((sender) => {
          try {
            if (sender.track?.kind === "audio" && screenAudio) {
              replaced.push({ sender, originalTrack: sender.track ?? null });
              sender.replaceTrack(screenAudio);
            } else if (sender.track?.kind === "video" && screenVideo) {
              replaced.push({ sender, originalTrack: sender.track ?? null });
              sender.replaceTrack(screenVideo);
            }
          } catch (err) {
            // ignore replaceTrack errors per-browser
          }
        });

        // If there was no audio sender and screenAudio exists, add it
        if (!pc.getSenders().some(s => s.track?.kind === "audio") && screenAudio) {
          try {
            const s = pc.addTrack(screenAudio, displayStream);
            if (s) replaced.push({ sender: s, originalTrack: null });
          } catch { }
        }

        // If there was no video sender and screenVideo exists, add it
        if (!pc.getSenders().some(s => s.track?.kind === "video") && screenVideo) {
          try {
            const s = pc.addTrack(screenVideo, displayStream);
            if (s) replaced.push({ sender: s, originalTrack: null });
          } catch { }
        }

        if (replaced.length) this.screenSenders[peerId] = replaced;
      });

      // If no peers had senders (e.g. late-join), also add tracks directly so they are sent
      // (keeps compatibility with your earlier addTrack approach)
      // (not strictly necessary if peers always have senders)
      Object.entries(this.peers).forEach(([peerId, pc]) => {
        // if we didn't save anything for peer, add tracks
        if (!this.screenSenders[peerId]) {
          const senders: { sender: RTCRtpSender; originalTrack: MediaStreamTrack | null }[] = [];
          displayStream.getTracks().forEach((t) => {
            try {
              const s = pc.addTrack(t, displayStream);
              if (s) senders.push({ sender: s, originalTrack: null });
            } catch { }
          });
          if (senders.length) this.screenSenders[peerId] = senders;
        }

        // Renegotiate if PC is stable
        if (pc.signalingState === "stable") {
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => this.wsSend({
              type: "signal",
              action: "offer",
              from: this.userId,
              to: peerId,
              payload: pc.localDescription,
            }))
            .catch((e) => this.log("renegotiate error:", e));
        }
      });

      this.wsSend({ type: "signal", action: "screen_update", from: this.userId, payload: { sharing: true, by: this.userId } });
      this.broadcastDataChannel({ type: "screen_update", payload: { sharing: true, by: this.userId } });

      // Tear down when displayStream ends
      displayStream.getTracks().forEach((t) => {
        t.onended = () => this.stopScreenShare();
      });

      this.onSharingBy?.(this.userId);
      this.onRemoteScreen?.(this.userId, displayStream);
    } catch (err) {
      this.log("startScreenShare failed", err);
    }
  }

  startRecording() {
    this.wsSend({ type: "start_recording" });
  }
  stopRecording() {
    this.wsSend({ type: "stop_recording" });
  }

  stopScreenShare() {
    try {
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch { }
        });
        this.screenStream = null;
      }

      // If we replaced senders earlier, restore original tracks
      Object.entries(this.screenSenders).forEach(([peerId, replacedList]) => {
        const pc = this.peers[peerId];
        if (!pc) return;
        try {
          replacedList.forEach(({ sender, originalTrack }) => {
            if (!sender) return;
            try {
              if (originalTrack) {
                sender.replaceTrack(originalTrack);
              } else {
                pc.removeTrack(sender);
              }
            } catch {
              /* ignore */
            }
          });
        } catch {
          /* ignore */
        }
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

/** React hook wrapper returning the full API the app expects */
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
  const [speakers, setSpeakers] = useState<Record<string, boolean>>({});

  // Refs for VAD / audio resources so disconnect() can close them reliably
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // create manager once
  useEffect(() => {
    if (!mgrRef.current) mgrRef.current = new WebRTCManager(room, userId, signalingBase);
    const mgr = mgrRef.current;

    mgr.onUsers = (u) => setUsers(u);
    mgr.onRemoteStream = (peerId, stream) =>
      setRemoteStreams((prev) => {
        const n = { ...prev };
        if (stream) n[peerId] = stream;
        else delete n[peerId];
        return n;
      });
    mgr.onRecordingUpdate = (r) => setIsRecording(r);
    mgr.onSpeakerUpdate = (s) => setSpeakers(s);
    mgr.onRemoteScreen = (peerId, stream) =>
      setRemoteScreens((prev) => {
        const n = { ...prev };
        if (stream) n[peerId] = stream;
        else delete n[peerId];
        return n;
      });
    mgr.onSharingBy = (by) => setSharingBy(by);
    mgr.onPeerStatus = (peerId, st) => setPeerStatus((p) => ({ ...p, [peerId]: st }));
    mgr.onSharedContent = (c) => {
      setSharedContent(c);
    };
    mgr.onBotAudio = (data, fmt, speaker) => {
      try {
        setBotSpeaker(speaker || "");
        console.log("Playing bot audio...:" + speaker);
        const binary = atob(data || "");
        const u8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);

        const mime = fmt === "wav" ? "audio/wav" : "audio/mpeg";
        const blob = new Blob([u8], { type: mime });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        // Try to ensure autoplay works
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => console.log("Audio playback started"))
            .catch((err) => {
              console.warn("Autoplay failed for bot audio:", err);
              // attempt to resume AudioContext if blocked
              if (typeof AudioContext !== "undefined") {
                const ctx = new AudioContext();
                if (ctx.state === "suspended") {
                  ctx.resume().then(() => {
                    // const src = ctx.createBufferSource();
                    console.log("Audio context resumed, trying again...");
                    audio.play().catch(() => { });
                  });
                }
              }
            });
        }

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setBotActive(false);
        };
        audio.onerror = (e) => {
          console.error("Audio playback error", e);
          URL.revokeObjectURL(url);
        };

        setBotActive(true);
      } catch (err) {
        console.error("bot audio play failed", err);
      }
      setTimeout(() => {
        setBotSpeaker("");
      }, 5000);
    };
    mgr.onBotMessage = (m) => {
      setChatMessages((prev) => [...prev, m]);
    };
    mgr.onChat = (m) => setChatMessages((prev) => [...prev, m]);
    mgr.onBotActive = (a) => setBotActive(!!a);

    // allow manager to call a "speaking" handler (if you add detection)
    // mgr.onUsersCount = (n) => { /* optional */ };

    // cleanup: don't auto-disconnect here — caller will call disconnect when required
    return () => {
      /* no-op */
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (audioOnly = false) => {
      if (!mgrRef.current) mgrRef.current = new WebRTCManager(room, userId, signalingBase);
      try {
        const stream = await mgrRef.current.ensureLocalStream(audioOnly);
        console.log("?? Local Stream Tracks:", stream.getTracks());
        stream.getAudioTracks().forEach((t) => console.log("Audio track:", t.label, t.enabled));
        setLocalStream(stream);
      } catch (err) {
        throw err;
      }
      await mgrRef.current.connect();
    },
    [room, userId, signalingBase]
  );

  useEffect(() => {
    if (!localStream) return;

    const startVAD = async () => {
      try {
        console.log("?? Starting mic analyzer with stream:", localStream);

        // close any existing to avoid duplicates
        if (audioCtxRef.current) {
          try {
            if (rafIdRef.current) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
          } catch { }
          try {
            micSourceRef.current?.disconnect();
          } catch { }
          try {
            analyserRef.current?.disconnect();
          } catch { }
          try {
            audioCtxRef.current.close();
          } catch { }
          audioCtxRef.current = null;
          analyserRef.current = null;
          micSourceRef.current = null;
        }

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;

        // ?? Resume context if browser suspended it
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
          console.log("AudioContext resumed");
        }

        const micSource = audioCtx.createMediaStreamSource(localStream);
        micSourceRef.current = micSource;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;

        // Create the dataArray once here
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        dataArrayRef.current = dataArray;

        micSource.connect(analyser);

        const detect = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;

          // Populate the array with real-time audio data
          (analyserRef.current as any).getByteFrequencyData(dataArrayRef.current);

          // Now, calculate the average of the *actual* audio data
          const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
          const normalized = avg / 255;

          // This condition will now work correctly
          setSpeaking(normalized > 0.02);

          const id = requestAnimationFrame(detect);
          rafIdRef.current = id;
        };
        detect();
      } catch (err) {
        console.error("? Mic activity detection failed", err);
      }
    };

    startVAD();

    return () => {
      try {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      } catch { }
      try {
        micSourceRef.current?.disconnect();
        micSourceRef.current = null;
      } catch { }
      try {
        analyserRef.current?.disconnect();
        analyserRef.current = null;
      } catch { }
      try {
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => { });
          audioCtxRef.current = null;
        }
      } catch { }
      dataArrayRef.current = null;
    };
  }, [localStream]);

  // --- NEW EFFECT: Report local speaking status to server on change ---
  useEffect(() => {
    mgrRef.current?.sendSpeakingUpdate(speaking);
  }, [speaking]);

  const disconnect = useCallback(async () => {
    const mgr = mgrRef.current;
    if (!mgr) return;

    // stop analyzer
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;

    try { micSourceRef.current?.disconnect(); } catch { }
    try { analyserRef.current?.disconnect(); } catch { }
    micSourceRef.current = null;
    analyserRef.current = null;
    try { await audioCtxRef.current?.close(); } catch { }
    audioCtxRef.current = null;

    // stop local tracks
    try {
      const streams = [localStream, mgr.localStream, mgr.screenStream].filter(Boolean);
      for (const s of streams) {
        s!.getTracks().forEach((t) => { try { t.stop(); } catch { } });
      }
    } catch { }

    // close peers and websocket
    try { mgr.ws?.close(); } catch { }
    Object.values(mgr.peers || {}).forEach((pc) => { try { pc.close(); } catch { } });
    mgr.peers = {};
    mgr.dataChannels = {};
    mgr.localStream = null;
    mgr.screenStream = null;

    // reset UI state
    setLocalStream(null);
    setUsers([]);
    setRemoteStreams({});
    setRemoteScreens({});
    setPeerStatus({});
    setSharingBy(null);
    setBotActive(false);

    // slight wait to ensure camera/mic fully release before returning
    await new Promise((r) => setTimeout(r, 200));
  }, [localStream]);

  const startScreenShare = useCallback(async (audioMode: "none" | "mic" | "system" = "none") => {
    await mgrRef.current?.startScreenShare(audioMode);
    setIsScreenSharing(true);
  }, []);
  // --- NEW CALLBACKS ---
  const startRecording = useCallback(() => {
    mgrRef.current?.startRecording();
  }, []);
  const stopScreenShare = useCallback(() => {
    mgrRef.current?.stopScreenShare();
    setIsScreenSharing(false);
  }, []);
  const stopRecording = useCallback(() => {
    mgrRef.current?.stopRecording();
  }, []);

  const sendContentUpdate = useCallback((content: string) => {
    mgrRef.current?.sendContentUpdate(content);
  }, []);

  const broadcastStatus = useCallback(
    (status: PeerStatus) => {
      mgrRef.current?.broadcastStatus(status);
      setPeerStatus((prev) => {
        const s = { ...prev };
        s[userId] = status;
        return s;
      });
    },
    [userId]
  );

  const sendChatMessage = useCallback((msg: ChatMessagePayload) => {
    mgrRef.current?.sendChatMessage(msg);
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  const getLocalStream = useCallback(() => mgrRef.current?.localStream ?? null, []);

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
  };
}
