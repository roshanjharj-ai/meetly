// src/hooks/useWebRTC.ts
import { useRef, useCallback, useState, useEffect } from "react";

const SIGNALING_URL = import.meta.env.VITE_WEBSOCKET_URL || "ws://127.0.0.1:8000";

// --- Type Definitions ---
type SignalMsg = {
  type: "signal" | "user_list" | "error";
  action?: "offer" | "answer" | "ice";
  from?: string;
  to?: string;
  payload?: any;
  users?: string[];
  message?: string;
};

// New structured message type for the Data Channel
type DataChannelMessage = 
  | { type: "content_update"; payload: string }
  | { type: "mute_status"; payload: { isMuted: boolean } };

type PeerMap = Record<string, RTCPeerConnection>;
type DCMap = Record<string, RTCDataChannel>;
type CandidateQueue = Record<string, RTCIceCandidateInit[]>;

export function useWebRTC(room: string, userId: string) {
  const signalingRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<PeerMap>({});
  const dataChannelsRef = useRef<DCMap>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const candidateQueueRef = useRef<CandidateQueue>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [users, setUsers] = useState<string[]>([]);
  
  // New state to hold the shared content received from peers
  const [sharedContent, setSharedContent] = useState<string>("");

  const ICE_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const ensureLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = s;
    }
    return localStreamRef.current;
  }, []);

  const createPeer = useCallback(
    async (targetId: string, isInitiator: boolean) => {
      if (peersRef.current[targetId]) return peersRef.current[targetId];

      const pc = new RTCPeerConnection(ICE_CONFIG);

      // Helper to handle incoming Data Channel messages
      const handleDataChannelMessage = (data: string) => {
        try {
          const msg: DataChannelMessage = JSON.parse(data);
          if (msg.type === "content_update") {
            setSharedContent(msg.payload); // Update state with received HTML
          }
        } catch (err) {
          console.warn("[webrtc][DC] Received non-JSON message:", data);
        }
      };

      if (isInitiator) {
        const dc = pc.createDataChannel("webrtc-datachannel");
        dataChannelsRef.current[targetId] = dc;
        dc.onopen = () => console.log(`[webrtc][DC:${targetId}] open`);
        dc.onclose = () => console.log(`[webrtc][DC:${targetId}] close`);
        dc.onmessage = (ev) => handleDataChannelMessage(ev.data);
      } else {
        pc.ondatachannel = (ev) => {
          const dc = ev.channel;
          dataChannelsRef.current[targetId] = dc;
          dc.onopen = () => console.log(`[webrtc][DC:${targetId}] open`);
          dc.onclose = () => console.log(`[webrtc][DC:${targetId}] close`);
          dc.onmessage = (e) => handleDataChannelMessage(e.data);
        };
      }

      const localStream = await ensureLocalStream();
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const remoteStream = new MediaStream();
      pc.ontrack = (ev) => {
        if (ev.streams && ev.streams.length) {
          setRemoteStreams((prev) => ({ ...prev, [targetId]: ev.streams[0] }));
        } else {
          remoteStream.addTrack(ev.track);
          setRemoteStreams((prev) => ({ ...prev, [targetId]: remoteStream }));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && signalingRef.current?.readyState === WebSocket.OPEN) {
          signalingRef.current.send(JSON.stringify({
            type: "signal",
            action: "ice",
            from: userId,
            to: targetId,
            payload: event.candidate.toJSON(),
          }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          delete peersRef.current[targetId];
          delete dataChannelsRef.current[targetId];
          setRemoteStreams((prev) => {
            const copy = { ...prev };
            delete copy[targetId];
            return copy;
          });
        }
      };

      peersRef.current[targetId] = pc;
      
      const queued = candidateQueueRef.current[targetId];
      if (queued?.length) {
        for (const c of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        }
        delete candidateQueueRef.current[targetId];
      }
      return pc;
    },
    [ensureLocalStream, userId]
  );
  
  const handleSignal = useCallback(async (msg: SignalMsg) => {
      const { action, from, to, payload } = msg;
      if (!from || to !== userId) return;

      if (action === "offer") {
        const pc = await createPeer(from, false);
        if (pc.signalingState !== "stable") {
             await pc.setLocalDescription({ type: "rollback" } as any);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingRef.current?.send(JSON.stringify({
          type: "signal",
          action: "answer",
          from: userId,
          to: from,
          payload: pc.localDescription,
        }));
      } else if (action === "answer") {
        const pc = peersRef.current[from];
        if (pc?.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        }
      } else if (action === "ice") {
        const pc = peersRef.current[from];
        if (!pc) {
          candidateQueueRef.current[from] = candidateQueueRef.current[from] || [];
          candidateQueueRef.current[from].push(payload);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(payload));
        }
      }
    }, [createPeer, userId]);

  const connect = useCallback(async () => {
    await ensureLocalStream();
    const ws = new WebSocket(`${SIGNALING_URL}/ws/${room}/${userId}`);
    ws.onmessage = async (evt) => {
      const msg: SignalMsg = JSON.parse(evt.data);
      if (msg.type === "user_list") {
        setUsers(msg.users || []);
        const allUsers = (msg.users || []).filter((u) => u !== userId);
        for (const peerId of allUsers) {
          if (peersRef.current[peerId]) continue;
          const initiator = userId < peerId;
          const pc = await createPeer(peerId, initiator);
          if (initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({
              type: "signal",
              action: "offer",
              from: userId,
              to: peerId,
              payload: pc.localDescription,
            }));
          }
        }
      } else if (msg.type === "signal") {
        await handleSignal(msg);
      }
    };
    signalingRef.current = ws;
  }, [ensureLocalStream, room, userId, createPeer, handleSignal]);

  const sendData = useCallback((data: string) => {
    Object.values(dataChannelsRef.current).forEach((dc) => {
      if (dc.readyState === "open") dc.send(data);
    });
  }, []);
  
  // New function to broadcast structured content updates
  const sendContentUpdate = useCallback((htmlContent: string) => {
    const msg: DataChannelMessage = { type: "content_update", payload: htmlContent };
    const msgString = JSON.stringify(msg);
    Object.values(dataChannelsRef.current).forEach((dc) => {
      if (dc.readyState === "open") dc.send(msgString);
    });
  }, []);

  const disconnect = useCallback(() => {
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    dataChannelsRef.current = {};
    candidateQueueRef.current = {};
    setRemoteStreams({});
    setUsers([]);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    signalingRef.current?.close();
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream: () => localStreamRef.current,
    sendData,
    sharedContent, // Expose new state
    sendContentUpdate, // Expose new function
  };
}