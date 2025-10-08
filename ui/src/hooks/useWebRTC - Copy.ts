import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_SIGNALING_URL = import.meta.env.VITE_WEBSOCKET_URL || "ws://127.0.0.1:8000";

// --- Type Definitions ---
type SignalMsg = {
  type: "signal" | "user_list" | "error" | "bot_audio";
  action?: "offer" | "answer" | "ice";
  from?: string;
  to?: string;
  payload?: any;
  users?: string[];
  message?: string;
  format?: string;
  data?: string;
  speaker?: string; // ? added field
};

type DataChannelMessage =
  | { type: "content_update"; payload: string }
  | { type: "status_update"; payload: PeerStatus };

type PeerStatus = { isMuted: boolean; isCameraOff: boolean };
type PeerMap = Record<string, RTCPeerConnection>;
type DCMap = Record<string, RTCDataChannel>;

// --- The Hook ---
export function useWebRTC(room: string, userId: string, signalingUrl?: string) {
  const SIGNALING_URL = signalingUrl || DEFAULT_SIGNALING_URL;
  const BOT_NAME = "Jarvis";

  // --- Refs for WebRTC objects ---
  const wsRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<PeerMap>({});
  const dataChannelsRef = useRef<DCMap>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  // --- Component State ---
  const [users, setUsers] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [sharedContent, setSharedContent] = useState<string>("");
  const [peerStatus, setPeerStatus] = useState<Record<string, PeerStatus>>({});
  const [botSpeaker, setBotSpeaker] = useState<string>(""); // ? new

  // Mic analyser internals
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRAFRef = useRef<number | null>(null);

  const ICE_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const _log = useCallback((...args: any[]) => console.log("[Client]", ...args), []);

  const buildWsUrl = useCallback(() => {
    const base = SIGNALING_URL.endsWith("/") ? SIGNALING_URL.slice(0, -1) : SIGNALING_URL;
    const path = base.endsWith("/ws") ? "" : "/ws";
    return `${base}${path}/${room}/${userId}`;
  }, [SIGNALING_URL, room, userId]);

  // --- Audio Playback for Bot Messages ---
  const playBase64Audio = useCallback((b64: string, fmt?: string) => {
    try {
      _log("Playing bot audio...");
      const binary = atob(b64 || "");
      const u8 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
      const mime = fmt === "wav" ? "audio/wav" : "audio/mpeg";
      const blob = new Blob([u8.buffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch(err => _log("Autoplay failed for bot audio:", err));
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
    } catch (e) {
      _log("playBase64Audio error:", e);
    }
  }, [_log]);


  // --- Local Media & Mic Analysis ---
  const startMicAnalyser = useCallback((stream: MediaStream) => {
    try {
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const threshold = 0.02;
      let isSpeaking = false;

      const step = () => {
        analyser.getByteTimeDomainData(dataArray);
        const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + ((val - 128) / 128) ** 2, 0) / dataArray.length);
        
        if (rms > threshold && !isSpeaking) {
          isSpeaking = true;
          setSpeaking(true);
        } else if (rms < threshold && isSpeaking) {
          isSpeaking = false;
          setSpeaking(false);
        }
        micRAFRef.current = requestAnimationFrame(step);
      };
      micRAFRef.current = requestAnimationFrame(step);
    } catch (err) {
      _log("Mic analyser failed:", err);
    }
  }, [_log]);

  const ensureLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = stream;
        startMicAnalyser(stream);
      } catch (err) {
        _log("Failed to getUserMedia:", err);
        throw err;
      }
    }
    return localStreamRef.current;
  }, [startMicAnalyser, _log]);

  const getLocalStream = () => localStreamRef.current;

  // --- Data Channel Message Handling ---
  const handleDataChannelMessage = (event: MessageEvent, peerId: string) => {
    try {
      const msg: DataChannelMessage = JSON.parse(event.data);
      if (msg.type === "content_update") {
        setSharedContent(msg.payload);
      } else if (msg.type === "status_update") {
        setPeerStatus((prev) => ({ ...prev, [peerId]: msg.payload }));
      }
    } catch (err) {
      _log("DC message parse error:", err);
    }
  };
  
  // --- Peer Connection Management ---
  const createPeer = useCallback(async (targetId: string, isInitiator: boolean) => {
    if (peersRef.current[targetId]) return peersRef.current[targetId];

    _log(`Creating peer for ${targetId}, initiator: ${isInitiator}`);
    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "signal", action: "ice", from: userId, to: targetId, payload: event.candidate }));
      }
    };

    pc.ontrack = (evt) => {
      _log(`[pc:${targetId}] ontrack received stream`);
      setRemoteStreams(prev => ({ ...prev, [targetId]: evt.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        pc.close();
        delete peersRef.current[targetId];
        delete dataChannelsRef.current[targetId];
        setRemoteStreams(prev => { const p = { ...prev }; delete p[targetId]; return p; });
        setPeerStatus(prev => { const s = { ...prev }; delete s[targetId]; return s; });
      }
    };

    // Data Channel Setup
    if (isInitiator) {
      const dc = pc.createDataChannel("datachannel");
      dc.onmessage = (event) => handleDataChannelMessage(event, targetId);
      dataChannelsRef.current[targetId] = dc;
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.onmessage = (e) => handleDataChannelMessage(e, targetId);
        dataChannelsRef.current[targetId] = dc;
      };
    }

    const localStream = await ensureLocalStream();
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "signal", action: "offer", from: userId, to: targetId, payload: pc.localDescription }));
    }
    
    peersRef.current[targetId] = pc;
    return pc;
  }, [ensureLocalStream, userId, _log]);

  const handleSignal = useCallback(async (msg: SignalMsg) => {
    const { action, from, payload } = msg;
    if (!from) return;

    const pc = peersRef.current[from] || await createPeer(from, false);

    if (action === "offer") {
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current?.send(JSON.stringify({ type: "signal", action: "answer", from: userId, to: from, payload: pc.localDescription }));
    } else if (action === "answer") {
      await pc.setRemoteDescription(payload);
    } else if (action === "ice") {
      if (payload) await pc.addIceCandidate(payload);
    }
  }, [createPeer, userId]);
  
  // --- Data Channel Communication ---
  const broadcastOverDataChannels = (message: DataChannelMessage) => {
    const msgString = JSON.stringify(message);
    Object.values(dataChannelsRef.current).forEach(dc => {
      if (dc.readyState === 'open') {
        dc.send(msgString);
      }
    });
  };

  const sendContentUpdate = useCallback((content: string) => {
    broadcastOverDataChannels({ type: 'content_update', payload: content });
  }, []);

  const broadcastStatus = useCallback((status: PeerStatus) => {
    broadcastOverDataChannels({ type: 'status_update', payload: status });
  }, []);

  // --- Main Connect/Disconnect Logic ---
  const connect = useCallback(async () => {
    await ensureLocalStream();
    const url = buildWsUrl();
    _log("Connecting to:", url);

    const ws = new WebSocket(url);
    ws.onmessage = async (evt) => {
      try {
        const msg: SignalMsg = JSON.parse(evt.data);
        if (msg.type === "user_list") {
          const list = msg.users || [];
          setUsers(list);
          for (const peerId of list.filter(u => u !== userId)) {
            if (peersRef.current[peerId]) continue;
            const isInitiator = peerId === BOT_NAME ? true : userId < peerId;
            await createPeer(peerId, isInitiator);
          }
        } else if (msg.type === "signal") {
          await handleSignal(msg);
        } else if (msg.type === "bot_audio") {
          playBase64Audio(msg.data || "", msg.format);
          setBotSpeaker(msg.speaker || ""); // ? new: track speaker name
        }
      } catch (err) {
        _log("WS message parse error:", err);
      }
    };
    wsRef.current = ws;
  }, [buildWsUrl, ensureLocalStream, createPeer, handleSignal, userId, BOT_NAME, _log, playBase64Audio]);

  const disconnect = useCallback(() => {
    _log("Disconnecting...");
    wsRef.current?.close();
    Object.values(peersRef.current).forEach(pc => pc.close());
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (micRAFRef.current) cancelAnimationFrame(micRAFRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close().catch(()=>{});

    // Reset all state
    localStreamRef.current = null;
    peersRef.current = {};
    dataChannelsRef.current = {};
    setUsers([]);
    setRemoteStreams({});
    setPeerStatus({});
    setSharedContent("");
    setBotSpeaker(""); // ? reset
  }, [_log]);

  useEffect(() => () => disconnect(), [disconnect]);
  
  // --- Final Return Value ---
  return {
    speaking,
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream,
    sharedContent,
    sendContentUpdate,
    peerStatus,
    broadcastStatus,
    botSpeaker, // ? new export
  };
}
