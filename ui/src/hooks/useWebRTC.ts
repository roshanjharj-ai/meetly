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

type DataChannelMessage =
  | { type: "content_update"; payload: string }
  | { type: "status_update"; payload: { isMuted: boolean; isCameraOff: boolean } };

type PeerStatus = { isMuted: boolean; isCameraOff: boolean };
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
  const [sharedContent, setSharedContent] = useState<string>("");
  const [peerStatus, setPeerStatus] = useState<Record<string, PeerStatus>>({});

  const ICE_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const ensureLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = s;
    }
    return localStreamRef.current;
  }, []);

  const createPeer = useCallback(
    async (targetId: string, isInitiator: boolean) => {
      if (peersRef.current[targetId]) return peersRef.current[targetId];
      const pc = new RTCPeerConnection(ICE_CONFIG);

      const handleDataChannelMessage = (data: string) => {
        try {
          const msg: DataChannelMessage = JSON.parse(data);
          if (msg.type === "content_update") {
            setSharedContent(msg.payload);
          } else if (msg.type === "status_update") {
            setPeerStatus(prev => ({ ...prev, [targetId]: msg.payload }));
          }
        } catch (err) { console.warn("Received non-JSON DC message"); }
      };

      if (isInitiator) {
        const dc = pc.createDataChannel("datachannel");
        dataChannelsRef.current[targetId] = dc;
        dc.onmessage = (ev) => handleDataChannelMessage(ev.data);
      } else {
        pc.ondatachannel = (ev) => {
          const dc = ev.channel;
          dataChannelsRef.current[targetId] = dc;
          dc.onmessage = (e) => handleDataChannelMessage(e.data);
        };
      }

      const localStream = await ensureLocalStream();
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (ev) => {
        setRemoteStreams((prev) => ({ ...prev, [targetId]: ev.streams[0] }));
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
      return pc;
    },
    [ensureLocalStream, userId]
  );
  
  const handleSignal = useCallback(async (msg: SignalMsg) => {
      const { action, from, to, payload } = msg;
      if (!from || to !== userId) return;

      const pc = peersRef.current[from] || await createPeer(from, false);

      if (action === "offer") {
        if (pc.signalingState !== "stable") {
             await pc.setLocalDescription({ type: "rollback" } as any);
        }
        console.log("--- Received Offer from Peer ---");
        console.log(payload);
        console.log("--------------------------------");
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
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        }
      } else if (action === "ice") {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) {
            console.error("Error adding received ice candidate", e);
        }
      }
    }, [createPeer, userId]);

  const connect = useCallback(async () => {
    if (!room || !userId) throw new Error("room and userId required");
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

  const broadcastStatus = useCallback((status: PeerStatus) => {
    const msg: DataChannelMessage = { type: "status_update", payload: status };
    const msgString = JSON.stringify(msg);
    Object.values(dataChannelsRef.current).forEach((dc) => {
      if (dc.readyState === "open") dc.send(msgString);
    });
  }, []);
  
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
    setPeerStatus({});
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream: () => localStreamRef.current,
    sharedContent,
    sendContentUpdate,
    peerStatus,
    broadcastStatus,
  };
}