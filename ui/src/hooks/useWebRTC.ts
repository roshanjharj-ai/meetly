// hooks/useWebRTC.ts
import { useRef, useCallback, useState, useEffect } from "react";

const SIGNALING_URL = import.meta.env.VITE_WEBSOCKET_URL || "ws://127.0.0.1:8000";

type SignalMsg = {
    type: "signal";
    action: "offer" | "answer" | "ice";
    from: string;
    to: string;
    payload: any;
};

type PeerMap = Record<string, RTCPeerConnection>;

export function useWebRTC(room: string, userId: string) {
    const signalingRef = useRef<WebSocket | null>(null);
    const peersRef = useRef<PeerMap>({});
    const localStreamRef = useRef<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
    const [users, setUsers] = useState<string[]>([]);

    // STUN servers (you should add TURN for production)
    const ICE_CONFIG: RTCConfiguration = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            // Add TURN server here for NAT traversal in production
        ],
    };

    // Create PeerConnection for a target user
    const createPeer = useCallback(async (targetId: string, isInitiator: boolean) => {
        if (peersRef.current[targetId]) return peersRef.current[targetId];

        const pc = new RTCPeerConnection(ICE_CONFIG);

        // Add local tracks
        if (!localStreamRef.current) {
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = s;
                if (isInitiator)
                    console.log("Initiator");
            } catch (err) {
                console.error("Error getting local audio:", err);
                throw err;
            }
        }
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));

        // Create remote stream and attach tracks to it
        const remoteStream = new MediaStream();
        pc.ontrack = (ev) => {
            console.log("📥 Remote track received from", targetId, ev.streams);
            ev.streams?.forEach((s) => {
                // prefer the provided stream if available
                if (s && s.getAudioTracks().length) {
                    setRemoteStreams((prev) => ({ ...prev, [targetId]: s }));
                } else {
                    // otherwise append tracks to our remoteStream object
                    ev.track && remoteStream.addTrack(ev.track);
                    setRemoteStreams((prev) => ({ ...prev, [targetId]: remoteStream }));
                }
            });
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && signalingRef.current && signalingRef.current.readyState === WebSocket.OPEN) {
                const msg: SignalMsg = {
                    type: "signal",
                    action: "ice",
                    from: userId,
                    to: targetId,
                    payload: event.candidate,
                };
                signalingRef.current.send(JSON.stringify(msg));
            }
        };

        pc.onconnectionstatechange = () => {
            // optional: cleanup on closed/failed
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                pc.close();
                delete peersRef.current[targetId];
                setRemoteStreams((prev) => {
                    const copy = { ...prev };
                    delete copy[targetId];
                    return copy;
                });
            }
        };

        peersRef.current[targetId] = pc;
        return pc;
    }, [userId]);

    // Handle incoming signaling messages
    const handleSignal = useCallback(async (msg: SignalMsg) => {
        const { action, from, to, payload } = msg;
        if (to !== userId) return; // not for me

        if (action === "offer") {
            // If someone offered to connect to us, create peer and answer
            const pc = await createPeer(from, false);
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const answerMsg: SignalMsg = {
                type: "signal",
                action: "answer",
                from: userId,
                to: from,
                payload: pc.localDescription,
            };
            signalingRef.current?.send(JSON.stringify(answerMsg));
        } else if (action === "answer") {
            const pc = peersRef.current[from];
            if (!pc) return;

            if (pc.signalingState === "have-local-offer") {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload));
                } catch (err) {
                    console.error("Error setting remote answer", err);
                }
            } else {
                console.warn(
                    `Ignored answer from ${from}, unexpected state: ${pc.signalingState}`
                );
            }
        } else if (action === "ice") {
            const pc = peersRef.current[from];
            if (!pc) {
                // create peer if not exists (non-initiator)
                await createPeer(from, false);
            }
            try {
                await peersRef.current[from].addIceCandidate(new RTCIceCandidate(payload));
            } catch (err) {
                console.warn("addIceCandidate error", err);
            }
        }
    }, [createPeer, userId]);

    // connect: open signaling socket and join room
    const connect = useCallback(async () => {
        // open signaling websocket
        const ws = new WebSocket(`${SIGNALING_URL}/ws/${room}/${userId}`);
        ws.onopen = async () => {
            console.log("Signaling socket open");
            // ensure local stream is available (get permission)
            if (!localStreamRef.current) {
                try {
                    localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (err) {
                    console.error("Microphone permission denied or failure", err);
                }
            }
        };

        ws.onmessage = async (evt: MessageEvent) => {
            // server sends user_list updates and signaling messages
            const text = typeof evt.data === "string" ? evt.data : null;
            if (!text) return;
            try {
                const msg = JSON.parse(text);
                if (msg.type === "user_list") {
                    const allUsers: string[] = msg.users.filter((u: string) => u !== userId);
                    setUsers(msg.users);

                    // For every peer that is new, create a peer and initiate offer
                    for (const peerId of allUsers) {
                        if (!peersRef.current[peerId]) {
                            // create peer and start offer from this client
                            const pc = await createPeer(peerId, true);
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            const offerMsg: SignalMsg = {
                                type: "signal",
                                action: "offer",
                                from: userId,
                                to: peerId,
                                payload: pc.localDescription,
                            };
                            ws.send(JSON.stringify(offerMsg));
                        }
                    }
                } else if (msg.type === "signal") {
                    await handleSignal(msg);
                } else if (msg.type === "error") {
                    console.warn("Signaling server error:", msg.message);
                }
            } catch (err) {
                console.warn("Invalid signaling message", err);
            }
        };

        ws.onclose = () => {
            console.log("Signaling socket closed");
        };

        ws.onerror = (e) => {
            console.error("Signaling socket error", e);
        };

        signalingRef.current = ws;
    }, [room, userId, createPeer, handleSignal]);

    const disconnect = useCallback(() => {
        // close peers
        Object.values(peersRef.current).forEach((pc) => {
            try {
                pc.close();
            } catch { }
        });
        peersRef.current = {};

        // stop local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
        }

        // close signaling
        try {
            signalingRef.current?.close();
        } catch { }
        signalingRef.current = null;

        setRemoteStreams({});
        setUsers([]);
    }, []);

    // small helper to get local stream (if needed by component)
    const getLocalStream = () => localStreamRef.current;

    // cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        connect,
        disconnect,
        users,
        remoteStreams, // map of peerId -> MediaStream (use to attach to <audio> elements)
        getLocalStream,
    };
}
