// src/hooks/useWebRTC.ts
/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from "react";

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
const DEFAULT_WS = socketUrl;

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
  screenSenders: Record<string, RTCRtpSender[]> = {};

  creatingPeer: Record<string, boolean> = {};
  pendingScreen: string | null = null;
  lastUserList: string[] = [];

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

  async ensureLocalStream(audioOnly = false) {
    if (this.localStream) return this.localStream;
    const constraints = audioOnly ? { audio: true } : { audio: true, video: true };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.localStream;
  }

  async connect() {
    try { await this.ensureLocalStream(); } catch { }
    this.log("Connecting to WS:", this.wsUrl);
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => this.log("WebSocket open:", this.wsUrl);
    ws.onerror = (ev) => this.log("WebSocket error", ev);
    ws.onclose = (ev) => this.log("WebSocket closed", ev);
    ws.onmessage = async (evt) => {
      try {
        const msg: SignalMsg = JSON.parse(evt.data);
        await this.onWsMessage(msg);
      } catch (err) {
        this.log("WS parse error", err);
      }
    };
  }

  disconnect() {
    this.log("Manager disconnect");
    this.ws?.close();
    Object.values(this.peers).forEach((pc) => pc.close());
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.peers = {}; this.dataChannels = {}; this.localStream = null; this.screenStream = null;
    this.onUsers?.([]); this.onSharingBy?.(null);
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
            const isBot = DEFAULT_BOT_NAMES.includes(peerId);
            const initiator = isBot || this.userId < peerId;
            this.createPeer(peerId, initiator);
          }
        }
        break;
      case "bot_audio": this.onBotAudio?.(msg.data || msg.payload || "", msg.format, msg.speaker); break;
      case "bot_message":
        const m: ChatMessagePayload = { id: `bot-${Date.now()}`, from: msg.speaker || "Bot", text: msg.message || msg.payload as string, ts: Date.now() };
        this.onBotMessage?.(m);
        this.onChat?.(m);
        break;
      case "signal": await this.handleSignal(msg); break;
    }
  }

  async handleSignal(msg: SignalMsg) {
    const { action, from, payload } = msg;
    if (!from) return;

    let pc = this.peers[from];
    if (!pc && action === "offer") {
      pc = await this.createPeer(from, false);
    }
    if (!pc) return;

    try {
      if (action === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.wsSend({ type: "signal", action: "answer", from: this.userId, to: from, payload: pc.localDescription });
      } else if (action === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
      } else if (action === "ice" && payload) {
        await pc.addIceCandidate(payload);
      }
    } catch (err) {
      this.log(`handleSignal error on action ${action}:`, err);
    }
  }

  private handleDataChannelMessage(ev: MessageEvent, peerId: string) {
    try {
      const obj = JSON.parse(ev.data) as DataChannelMessage;
      if (obj.type === "content_update") this.onSharedContent?.(obj.payload);
      else if (obj.type === "status_update") this.onPeerStatus?.(peerId, obj.payload);
      else if (obj.type === "chat_message") this.onChat?.(obj.payload);
    } catch (err) {
      this.log("datachannel parse error", err);
    }
  }

  private attachLocalTracks(pc: RTCPeerConnection) {
    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
  }

  async createPeer(targetId: string, initiator: boolean): Promise<RTCPeerConnection> {
    if (this.peers[targetId] || this.creatingPeer[targetId]) return this.peers[targetId];
    this.creatingPeer[targetId] = true;

    const pc = new RTCPeerConnection(this.iceConfig);

    pc.onicecandidate = e => { if (e.candidate) this.wsSend({ type: "signal", action: "ice", from: this.userId, to: targetId, payload: e.candidate }); };
    // pc.ontrack = evt => {
    //   //const stream = evt.streams[0];
    //   // Differentiate between regular video and screen share based on who initiated the share
    //   // if (evt.track.kind === 'video' && this.sharingBy && this.sharingBy !== this.userId) {
    //   //     this.onRemoteScreen?.(this.sharingBy, stream);
    //   // } else {
    //   //     this.onRemoteStream?.(targetId, stream);
    //   // }
    // };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        this.onRemoteStream?.(targetId, null);
        this.onRemoteScreen?.(targetId, null);
        delete this.peers[targetId];
      }
    };

    if (initiator) {
      const dc = pc.createDataChannel("datachannel");
      dc.onmessage = (ev) => this.handleDataChannelMessage(ev, targetId);
      this.dataChannels[targetId] = dc;
    } else {
      pc.ondatachannel = e => {
        this.dataChannels[targetId] = e.channel;
        e.channel.onmessage = (msg) => this.handleDataChannelMessage(msg, targetId);
      };
    }

    this.attachLocalTracks(pc);

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
    delete this.creatingPeer[targetId];
    return pc;
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

        // --- FIX: Renegotiate connection after adding tracks ---
        if (pc.signalingState === 'stable') {
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => this.wsSend({ type: "signal", action: "offer", from: this.userId, to: peerId, payload: pc.localDescription }))
            .catch(e => this.log("Screen share renegotiation error:", e));
        }
      });

      this.onSharingBy?.(this.userId);
      this.broadcastDataChannel({ type: "screen_update", payload: { sharing: true, by: this.userId } });
      displayStream.getTracks().forEach((track: any) => { track.onended = () => this.stopScreenShare(); });

    } catch (err) {
      this.log("startScreenShare failed", err);
    }
  }

  async stopScreenShare() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach(track => track.stop());
    this.screenStream = null;

    Object.entries(this.screenSenders).forEach(([peerId, senders]) => {
      const pc = this.peers[peerId];
      if (pc) {
        senders.forEach(sender => pc.removeTrack(sender));
        // Renegotiate after removing tracks
        if (pc.signalingState === 'stable') {
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => this.wsSend({ type: "signal", action: "offer", from: this.userId, to: peerId, payload: pc.localDescription }))
            .catch(e => this.log("Screen share stop renegotiation error:", e));
        }
      }
    });
    this.screenSenders = {};
    this.onSharingBy?.(null);
    this.broadcastDataChannel({ type: "screen_update", payload: { sharing: false, by: this.userId } });
  }

  broadcastDataChannel(message: DataChannelMessage) {
    const s = JSON.stringify(message);
    Object.values(this.dataChannels).forEach((dc) => {
      if (dc.readyState === "open") dc.send(s);
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
  const [speakers, setSpeakers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!mgrRef.current) {
      mgrRef.current = new WebRTCManager(room, userId, signalingBase);
    }
    const mgr = mgrRef.current;

    mgr.onUsers = setUsers;
    mgr.onRemoteStream = (peerId, stream) => setRemoteStreams(prev => ({ ...prev, [peerId]: stream } as Record<string, MediaStream>));
    mgr.onRecordingUpdate = setIsRecording;
    mgr.onSpeakerUpdate = setSpeakers;
    mgr.onRemoteScreen = (peerId, stream) => setRemoteScreens((prev) => ({ ...prev, [peerId]: stream } as Record<string, MediaStream>));
    mgr.onSharingBy = setSharingBy;
    mgr.onPeerStatus = (peerId, st) => setPeerStatus((p) => ({ ...p, [peerId]: st }));
    mgr.onSharedContent = setSharedContent;
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
      if (mgrRef.current) { mgrRef.current.disconnect(); mgrRef.current = null; }
    };
  }, [room, userId, signalingBase]);

  const connect = useCallback(async (audioOnly = false) => {
    if (!mgrRef.current) return;
    try {
      const stream = await mgrRef.current.ensureLocalStream(audioOnly);
      setLocalStream(stream);
      await mgrRef.current.connect();
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

  const disconnect = useCallback(() => mgrRef.current?.disconnect(), []);
  const startScreenShare = useCallback(async (audioMode: "none" | "mic" | "system" = "none") => { await mgrRef.current?.startScreenShare(audioMode); setIsScreenSharing(true); }, []);
  const stopScreenShare = useCallback(() => { mgrRef.current?.stopScreenShare(); setIsScreenSharing(false); }, []);
  const startRecording = useCallback(() => mgrRef.current?.startRecording(), []);
  const stopRecording = useCallback(() => mgrRef.current?.stopRecording(), []);
  const sendContentUpdate = useCallback((content: string) => mgrRef.current?.sendContentUpdate(content), []);
  const broadcastStatus = useCallback((status: PeerStatus) => { mgrRef.current?.broadcastStatus(status); setPeerStatus((prev) => ({ ...prev, [userId]: status })); }, [userId]);
  const sendChatMessage = useCallback((msg: ChatMessagePayload) => { mgrRef.current?.sendChatMessage(msg); setChatMessages((prev) => [...prev, msg]); }, []);
  const getLocalStream = useCallback(() => mgrRef.current?.localStream ?? null, []);

  return {
    connect, disconnect, users, remoteStreams, remoteScreens, sharingBy, getLocalStream, sendContentUpdate, peerStatus, broadcastStatus, startScreenShare, stopScreenShare, isScreenSharing, chatMessages, sendChatMessage, botActive, botSpeaker, sharedContent, speaking, startRecording, stopRecording, isRecording, speakers,
  };
}
