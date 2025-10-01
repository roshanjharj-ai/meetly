// src/hooks/useWebRTC.ts
import { useRef, useCallback, useState, useEffect } from "react";

const SIGNALING_URL = import.meta.env.VITE_WEBSOCKET_URL || "ws://127.0.0.1:8000";

type SignalMsg = {
  type: "signal" | "user_list" | "error";
  action?: "offer" | "answer" | "ice";
  from?: string;
  to?: string;
  payload?: any;
  users?: string[];
  message?: string;
};

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

  // Basic ICE config — add TURN servers in production
  const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // add TURN servers here for production
    ],
  };

  // Helper: ensure local media is available (cached)
  const ensureLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      console.log("[webrtc] Getting local media (audio)...");
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = s;
        console.log("[webrtc] Local media ready:", s);
      } catch (err) {
        console.error("[webrtc] getUserMedia failed:", err);
        throw err;
      }
    }
    return localStreamRef.current;
  }, []);

  // Create RTCPeerConnection for a peer
  const createPeer = useCallback(
    async (targetId: string, isInitiator: boolean) => {
      if (peersRef.current[targetId]) {
        return peersRef.current[targetId];
      }

      console.log(`[webrtc] createPeer -> target=${targetId} initiator=${isInitiator}`);

      const pc = new RTCPeerConnection(ICE_CONFIG);

      // data channel (initiator creates it)
      if (isInitiator) {
        try {
          const dc = pc.createDataChannel("webrtc-datachannel");
          dataChannelsRef.current[targetId] = dc;
          dc.onopen = () => console.log(`[webrtc][DC:${targetId}] open`);
          dc.onclose = () => console.log(`[webrtc][DC:${targetId}] close`);
          dc.onmessage = (ev) => {
            console.log(`[webrtc][DC:${targetId}] message:`, ev.data);
            // you can emit events or handle shared content here
          };
        } catch (err) {
          console.warn(`[webrtc] Failed to create data channel for ${targetId}`, err);
        }
      } else {
        // non-initiator listens for datachannel
        pc.ondatachannel = (ev) => {
          console.log(`[webrtc][DC:${targetId}] ondatachannel`);
          const dc = ev.channel;
          dataChannelsRef.current[targetId] = dc;
          dc.onopen = () => console.log(`[webrtc][DC:${targetId}] open`);
          dc.onclose = () => console.log(`[webrtc][DC:${targetId}] close`);
          dc.onmessage = (e) => console.log(`[webrtc][DC:${targetId}] message:`, e.data);
        };
      }

      // Add local tracks (ensure local stream exists)
      try {
        const localStream = await ensureLocalStream();
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
        console.log(`[webrtc] Added local tracks to pc for ${targetId}`);
      } catch (err) {
        console.error(`[webrtc] Error adding local tracks for ${targetId}`, err);
        // Allow pc creation to continue (we might still connect audio-less)
      }

      // Remote stream handling
      const remoteStream = new MediaStream();
      pc.ontrack = (ev) => {
        // prefer streams[] if provided
        if (ev.streams && ev.streams.length) {
          console.log(`[webrtc] ontrack: received full stream from ${targetId}`, ev.streams[0]);
          setRemoteStreams((prev) => ({ ...prev, [targetId]: ev.streams[0] }));
        } else {
          // otherwise append track to remoteStream
          console.log(`[webrtc] ontrack: received track for ${targetId}`, ev.track);
          if (ev.track) remoteStream.addTrack(ev.track);
          setRemoteStreams((prev) => ({ ...prev, [targetId]: remoteStream }));
        }
      };

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && signalingRef.current && signalingRef.current.readyState === WebSocket.OPEN) {
          const msg: SignalMsg = {
            type: "signal",
            action: "ice",
            from: userId,
            to: targetId,
            payload: event.candidate.toJSON(),
          };
          signalingRef.current.send(JSON.stringify(msg));
          console.debug(`[webrtc] Sent ICE candidate -> ${targetId}`, event.candidate);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[webrtc] connectionState for ${targetId}:`, pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          try {
            pc.close();
          } catch {}
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

      // flush any queued ICE candidates for this peer
      const queued = candidateQueueRef.current[targetId];
      if (queued && queued.length) {
        (async () => {
          for (const c of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
              console.debug(`[webrtc] added queued ICE candidate for ${targetId}`, c);
            } catch (err) {
              console.warn(`[webrtc] error adding queued ICE candidate for ${targetId}`, err);
            }
          }
        })();
        delete candidateQueueRef.current[targetId];
      }

      return pc;
    },
    [ensureLocalStream, userId]
  );

  // Helper to send signaling via WebSocket
  const sendSignal = useCallback((ws: WebSocket, msg: SignalMsg) => {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn("[webrtc] sendSignal error", err);
    }
  }, []);

  // Handle incoming signaling messages
  const handleSignal = useCallback(
    async (msg: SignalMsg) => {
      const { action, from, to, payload } = msg;
      if (!from || to !== userId) {
        // not for me
        return;
      }

      console.debug("[webrtc] handleSignal", msg);

      if (action === "offer") {
        // remote offered to us -> setRemoteDescription and answer
        const pc = peersRef.current[from] || (await createPeer(from, false));
        if (!pc) {
          console.error("[webrtc] No PC after createPeer for offer");
          return;
        }

        try {
          // if we're in a not-stable state, try rollback to avoid "Called in wrong state"
          if (pc.signalingState !== "stable") {
            console.warn(`[webrtc] offer arriving but pc.signalingState=${pc.signalingState}. Attempting rollback.`);
            try {
              await pc.setLocalDescription({ type: "rollback" } as any);
            } catch (rerr) {
              console.warn("[webrtc] rollback failed", rerr);
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // send answer back
          const answerMsg: SignalMsg = {
            type: "signal",
            action: "answer",
            from: userId,
            to: from,
            payload: pc.localDescription,
          };
          signalingRef.current?.send(JSON.stringify(answerMsg));
          console.log(`[webrtc] Sent answer to ${from}`);
        } catch (err) {
          console.error("[webrtc] Error handling offer:", err);
        }
      } else if (action === "answer") {
        const pc = peersRef.current[from];
        if (!pc) {
          console.warn("[webrtc] Received answer but PC not found for", from);
          return;
        }

        // Only accept answer when we actually have a local offer waiting
        if (pc.signalingState === "have-local-offer" || pc.signalingState === "have-remote-pranswer") {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            console.log(`[webrtc] set remote answer for ${from}`);
          } catch (err) {
            console.error("[webrtc] Error setting remote answer:", err);
          }
        } else {
          console.warn(`[webrtc] Ignored answer from ${from}, unexpected state: ${pc.signalingState}`);
        }
      } else if (action === "ice") {
        // ICE candidate
        const pc = peersRef.current[from];
        try {
          const candidateInit: RTCIceCandidateInit = payload;
          if (!pc) {
            // queue candidate until pc exists
            candidateQueueRef.current[from] = candidateQueueRef.current[from] || [];
            candidateQueueRef.current[from].push(candidateInit);
            console.debug(`[webrtc] queued ICE candidate for ${from}`, candidateInit);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            console.debug(`[webrtc] added ICE candidate for ${from}`, candidateInit);
          }
        } catch (err) {
          console.warn("[webrtc] Error adding ICE candidate:", err);
        }
      }
    },
    [createPeer, userId]
  );

  // Connect: opens signaling websocket and joins room
  const connect = useCallback(async () => {
    if (!room || !userId) throw new Error("room and userId required");

    // ensure local stream ready before connecting (so we can create offers immediately)
    try {
      await ensureLocalStream();
    } catch (err) {
      console.error("[webrtc] Local stream unavailable, aborting connect");
      throw err;
    }

    const wsUrl = `${SIGNALING_URL}/ws/${room}/${userId}`;
    console.log("[webrtc] connecting signaling:", wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[webrtc] Signaling socket open");
    };

    ws.onmessage = async (evt) => {
      const text = typeof evt.data === "string" ? evt.data : null;
      if (!text) return;

      try {
        const msg: SignalMsg = JSON.parse(text);

        if (msg.type === "user_list") {
          // msg.users assumed present
          const allUsers: string[] = (msg.users || []).filter((u) => u !== userId);
          setUsers(msg.users || []);

          // For each remote user, create a peer connection.
          // To avoid glare, we pick a deterministic initiator:
          // the user with lexicographically smaller id will initiate.
          for (const peerId of allUsers) {
            // skip if already have pc
            if (peersRef.current[peerId]) continue;

            // determine initiator based on string compare
            const initiator = userId < peerId;
            console.log(`[webrtc] user_list: peer=${peerId} initiator=${initiator}`);

            // create peer and if initiator, create offer
            const pc = await createPeer(peerId, initiator);

            if (initiator) {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                const offerMsg: SignalMsg = {
                  type: "signal",
                  action: "offer",
                  from: userId,
                  to: peerId,
                  payload: pc.localDescription,
                };
                sendSignal(ws, offerMsg);
                console.log("[webrtc] Sent offer to", peerId);
              } catch (err) {
                console.error("[webrtc] Error creating/sending offer to", peerId, err);
              }
            } else {
              // not initiating — wait for remote offer
              console.log(`[webrtc] Waiting for offer from ${peerId}`);
            }
          }
        } else if (msg.type === "signal") {
          await handleSignal(msg);
        } else if (msg.type === "error") {
          console.warn("[webrtc] Signaling server error:", msg.message);
        } else {
          console.warn("[webrtc] Unknown signaling message:", msg);
        }
      } catch (err) {
        console.warn("[webrtc] Invalid signaling message", err);
      }
    };

    ws.onclose = () => {
      console.log("[webrtc] Signaling socket closed");
    };

    ws.onerror = (e) => {
      console.error("[webrtc] Signaling socket error ", e);
    };

    signalingRef.current = ws;
    return ws;
  }, [ensureLocalStream, room, userId, createPeer, handleSignal, sendSignal]);

  // Send data (via DataChannel) to a target or broadcast
  const sendData = useCallback((targetId: string | "broadcast", data: string) => {
    if (targetId === "broadcast") {
      Object.entries(dataChannelsRef.current).forEach(([pid, dc]) => {
        if (dc && dc.readyState === "open") {
          dc.send(data);
          console.debug(`[webrtc][DC] broadcast -> ${pid}`, data);
        }
      });
      return;
    }
    const dc = dataChannelsRef.current[targetId];
    if (!dc) {
      console.warn("[webrtc] sendData: dataChannel not found for", targetId);
      return;
    }
    if (dc.readyState !== "open") {
      console.warn("[webrtc] dataChannel not open for", targetId, dc.readyState);
      return;
    }
    dc.send(data);
    console.debug(`[webrtc][DC] sent to ${targetId}`, data);
  }, []);

  // Disconnect: close all peer connections and signaling
  const disconnect = useCallback(() => {
    console.log("[webrtc] Disconnecting...");
    Object.values(peersRef.current).forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    peersRef.current = {};
    dataChannelsRef.current = {};
    candidateQueueRef.current = {};
    setRemoteStreams({});
    setUsers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    try {
      signalingRef.current?.close();
    } catch {}
    signalingRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // expose the hook API
  return {
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream: () => localStreamRef.current,
    sendData,
  };
}
