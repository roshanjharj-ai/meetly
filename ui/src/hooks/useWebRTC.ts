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
  peers: Record<string, RTCPeerConnection> = {};
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

  iceConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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

  async connect(initialAudioEnabled: boolean = true, initialVideoEnabled: boolean = true) {
    try {
      // Pass initial state down and make sure localStream is attempted
      try {
        await this.ensureLocalStream(initialAudioEnabled, initialVideoEnabled);
      } catch (err) {
        this.log("Could not get initial media stream, proceeding without it.", err);
      }
    } catch (err) {
      // no-op
    }

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
    this.log("?? Manager disconnect initiated");

    const stopMediaStream = (stream: MediaStream | null, streamName: string) => {
        if (stream) {
            this.log(`Stopping ${streamName} tracks...`);
            let stoppedCount = 0;
            stream.getTracks().forEach((track) => {
                if (track.readyState === 'live') {
                    track.stop();
                    stoppedCount++;
                    this.log(`Stopped ${streamName} track: ${track.kind} (${track.label || track.id})`);
                }
            });
            this.log(`${stoppedCount} ${streamName} tracks stopped.`);
            return null;
        } else {
            this.log(`No active ${streamName} to stop.`);
            return null;
        }
    };

    // 1. Stop local media tracks FIRST
    this.localStream = stopMediaStream(this.localStream, "local media stream");
    this.screenStream = stopMediaStream(this.screenStream, "screen share stream");

    // 2. Close peer connections
    this.log("Closing peer connections...");
    Object.keys(this.peers).forEach(peerId => {
      try {
        this.peers[peerId].close();
      } catch {}
    });
    this.peers = {}; this.dataChannels = {}; this.screenSenders = {}; this.sharingBy = null;

    // 3. Close WebSocket connection
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      try { this.ws.close(); } catch {}
    }
    this.ws = null;

    // 4. Reset state callbacks
    this.log("Resetting state callbacks...");
    this.onUsers?.([]);
    this.onUsersCount?.(0);
    this.onSharingBy?.(null);
    this.onRemoteStream?.('', null);
    this.onRemoteScreen?.('', null);
    this.onLocalStream?.(null);

    this.log("?? Disconnect completed.");
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

  private attachLocalTracks(pc: RTCPeerConnection) {
    if (!this.localStream) return;
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
  }

  async createPeer(targetId: string, initiator: boolean): Promise<RTCPeerConnection> {
    if (this.peers[targetId] || this.creatingPeer[targetId]) return this.peers[targetId];
    this.creatingPeer[targetId] = true;

    const pc = new RTCPeerConnection(this.iceConfig);

    pc.onicecandidate = e => { if (e.candidate) this.wsSend({ type: "signal", action: "ice", from: this.userId, to: targetId, payload: e.candidate }); };
    pc.ontrack = evt => {
      const stream = evt.streams[0];
      if (evt.track.kind === 'video' && this.sharingBy && this.sharingBy === targetId) {
        this.onRemoteScreen?.(targetId, stream);
      } else {
        this.onRemoteStream?.(targetId, stream);
      }
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        this.onRemoteStream?.(targetId, null);
        this.onRemoteScreen?.(targetId, null);
        try { pc.close(); } catch {}
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

    // Add local tracks (if available)
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
        this.localStream.getAudioTracks().forEach(t => { try { t.stop(); } catch {} });
        if (newTrack) this.localStream.addTrack(newTrack);
      } else if (newStream) {
        this.localStream = new MediaStream([ ...(newStream.getTracks()) ]);
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
        this.localStream.getVideoTracks().forEach(t => { try { t.stop(); } catch {} });
        if (newTrack) this.localStream.addTrack(newTrack);
      } else if (newStream) {
        this.localStream = new MediaStream([ ...(newStream.getTracks()) ]);
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
    this.screenStream.getTracks().forEach(track => track.stop());
    this.screenStream = null;

    Object.entries(this.screenSenders).forEach(([peerId, senders]) => {
      const pc = this.peers[peerId];
      if (pc) {
        senders.forEach(sender => {
          try { pc.removeTrack(sender); } catch {}
        });
      }
    });
    this.screenSenders = {};
    this.sharingBy = null;
    this.onSharingBy?.(null);
    this.broadcastDataChannel({ type: "screen_update", payload: { sharing: false, by: this.userId } });
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
