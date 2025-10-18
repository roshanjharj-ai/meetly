// src/hooks/webrtc/useWebRTC.ts
/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from "react";
import { WebRTCManager } from './manager';
import { type MeetingProgress, type PeerStatus, type ChatMessagePayload, RECORDER_API_URL } from './types';

/**
 * React hook to manage WebRTC meeting state and interactions.
 */
export function useWebRTC(room: string, userId: string, signalingBase?: string) {
  // Ref to hold the single instance of WebRTCManager
  const mgrRef = useRef<WebRTCManager | null>(null);

  // --- React State Variables ---
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [sharingBy, setSharingBy] = useState<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<Record<string, PeerStatus>>({});
  const [isScreenSharing, setIsScreenSharing] = useState(false); // Local screen share state
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [botActive, setBotActive] = useState(false); // Is the bot currently speaking?
  const [botSpeaker, setBotSpeaker] = useState<string>(""); // Which bot is speaking?
  const [sharedContent, setSharedContent] = useState<string>(""); // HTML content shared by bot
  const [speaking, setSpeaking] = useState(false); // Local user speaking state (VAD)
  const [isRecording, setIsRecording] = useState(false); // Is the meeting being recorded?
  const [isRecordingLoading, setIsRecordingLoading] = useState(false); // Loading state for recording actions
  const [speakers, setSpeakers] = useState<Record<string, boolean>>({}); // Remote speaker status from server
  const [meetingProgress, setMeetingProgress] = useState<MeetingProgress | null>(null); // Meeting progress data

  // --- Initialization and Cleanup Effect ---
  useEffect(() => {
    // Instantiate the manager only once when the hook mounts
    if (!mgrRef.current) {
      console.log("[useWebRTC Effect] Creating new WebRTCManager instance.");
      mgrRef.current = new WebRTCManager(room, userId, signalingBase);
    }
    const mgr = mgrRef.current;

    // --- Assign Callbacks to Update React State ---
    // These functions link the manager's events back to the hook's state
    mgr.onUsers = setUsers;
    mgr.onRemoteStream = (peerId, stream) => {
      setRemoteStreams(prev => {
        const newState = { ...prev };
        if (stream) newState[peerId] = stream;
        else delete newState[peerId]; // Remove stream if null
        return newState;
      });
    };
    mgr.onRemoteScreen = (peerId, stream) => {
      setRemoteScreens(prev => {
        const newState = { ...prev };
        if (stream) newState[peerId] = stream;
        else delete newState[peerId]; // Remove stream if null
        return newState;
      });
    };
    mgr.onRecordingUpdate = setIsRecording;
    mgr.onSpeakerUpdate = setSpeakers;
    mgr.onSharingBy = (sharerId) => {
        setSharingBy(sharerId);
        // Automatically update local screen sharing state based on who is sharing
        setIsScreenSharing(sharerId === userId);
    };
    mgr.onPeerStatus = (peerId, st) => setPeerStatus((p) => ({ ...p, [peerId]: st }));
    mgr.onSharedContent = setSharedContent;
    mgr.onProgressUpdate = setMeetingProgress;
    mgr.onBotAudio = (data, fmt, speaker) => {
      // Logic to decode Base64 audio and play it
      try {
        setBotSpeaker(speaker || ""); setBotActive(true);
        const binary = atob(data || ""); const u8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
        const mime = fmt === "wav" ? "audio/wav" : "audio/mpeg";
        const blob = new Blob([u8], { type: mime }); const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(err => console.warn("Autoplay failed:", err));
        // Cleanup audio object and reset state when playback finishes
        audio.onended = () => { URL.revokeObjectURL(url); setBotActive(false); setBotSpeaker(""); };
      } catch (err) {
        console.error("Bot audio play failed", err); setBotActive(false); setBotSpeaker("");
      }
    };
    // Append bot text messages to the chat
    mgr.onBotMessage = (m) => setChatMessages((prev) => [...prev, m]);
    // Append regular chat messages to the chat
    mgr.onChat = (m) => setChatMessages((prev) => [...prev, m]);
    // Track if the bot is generally active (e.g., processing) - might not be used here
    mgr.onBotActive = setBotActive;

    // Cleanup function: disconnect manager when the component unmounts or dependencies change
    return () => {
      console.log("[useWebRTC Cleanup] Hook unmounting/deps changed. Disconnecting manager...");
      if (mgrRef.current) {
        mgrRef.current.disconnect(); // Call the robust disconnect in the manager
        mgrRef.current = null; // Clear the ref
      }
       // Explicitly reset hook states related to connection
       setLocalStream(null); setUsers([]); setRemoteStreams({}); setRemoteScreens({});
       setSharingBy(null); setPeerStatus({}); setIsScreenSharing(false); setSpeaking(false);
       console.log("[useWebRTC Cleanup] Manager and hook state reset.");
    };
  // Dependencies ensure manager is recreated ONLY if room, userId, or signalingBase changes
  }, [room, userId, signalingBase]);

  // --- Actions Exposed by the Hook ---

  // Connect to the meeting, passing initial device preferences
  const connect = useCallback(async (initialAudioEnabled: boolean = true, initialVideoEnabled: boolean = true) => {
    if (!mgrRef.current) { console.warn("[useWebRTC connect] Manager not ready."); return; }
    console.log(`[useWebRTC connect] Calling manager connect: audio=${initialAudioEnabled}, video=${initialVideoEnabled}`);
    try {
      await mgrRef.current.connect(initialAudioEnabled, initialVideoEnabled);
      // Update local stream state *after* connection attempt is complete
      // Get stream directly from the media module within the manager
      setLocalStream(mgrRef.current.media.getLocalStream());
      console.log("[useWebRTC connect] Connection process completed.");
    } catch (err) { console.error("[useWebRTC connect] Error during connection:", err); }
  }, []); // No dependencies needed as mgrRef is stable

  // Disconnect from the meeting
  const disconnect = useCallback(() => {
    console.log("[useWebRTC disconnect] Hook disconnect called.");
    if (mgrRef.current) {
        mgrRef.current.disconnect(); // Calls manager's robust disconnect
         // Reset hook state immediately after initiating disconnect
         setLocalStream(null); setUsers([]); setRemoteStreams({}); setRemoteScreens({});
         setSharingBy(null); setPeerStatus({}); setIsScreenSharing(false); setSpeaking(false);
         console.log("[useWebRTC disconnect] Local state reset.");
    } else { console.warn("[useWebRTC disconnect] Manager ref already null."); }
  }, []); // No dependencies needed

  // Start screen sharing
  const startScreenShare = useCallback(async (audioMode: "none" | "mic" | "system" = "none") => {
      await mgrRef.current?.media.startScreenShare(audioMode);
      // setIsScreenSharing(true); // State is now managed via onSharingBy callback
  }, []);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
      mgrRef.current?.media.stopScreenShare(true); // Ensure broadcast on manual stop
      // setIsScreenSharing(false); // State is now managed via onSharingBy callback
  }, []);

  // Get the current local media stream
  const getLocalStream = useCallback(() => mgrRef.current?.media.getLocalStream() ?? null, []);

  // Broadcast local mute/camera status to other peers
  const broadcastStatus = useCallback((status: PeerStatus) => {
      mgrRef.current?.broadcastStatus(status);
      // Update local peer status immediately for UI consistency
      setPeerStatus((prev) => ({ ...prev, [userId]: status }));
  }, [userId]); // Depends on userId

  // Send a chat message
  const sendChatMessage = useCallback((msg: ChatMessagePayload) => {
      // Add message locally immediately for better UX
      setChatMessages((prev) => [...prev, msg]);
      mgrRef.current?.sendChatMessage(msg);
  }, []);

  // Send shared HTML content (e.g., from bot)
  const sendContentUpdate = useCallback((content: string) => mgrRef.current?.sendContentUpdate(content), []);

  // --- Recording Actions ---
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
      // Success: WebSocket 'recording_update' message will update isRecording state
    } catch (error) {
      console.error("Error starting recording:", error);
      alert(`Error starting recording: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRecordingLoading(false);
    }
  }, [room]); // Depends on room

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
      // Success: WebSocket 'recording_update' message will update isRecording state
    } catch (error) {
      console.error("Error stopping recording:", error);
       alert(`Error stopping recording: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRecordingLoading(false);
    }
  }, [room]); // Depends on room

  // --- VAD (Voice Activity Detection) Effect ---
  // This effect sets up audio analysis to detect when the local user is speaking
  useEffect(() => {
    // If there's no local stream or no audio tracks, we can't detect speaking
    if (!localStream || localStream.getAudioTracks().length === 0) {
      setSpeaking(false); // Ensure speaking is false if no audio
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let micSource: MediaStreamAudioSourceNode | null = null;
    let rafId: number; // requestAnimationFrame ID

    const startVAD = async () => {
      try {
        // Create AudioContext if needed
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Resume context if it was suspended (required by some browsers)
        if (audioCtx.state === "suspended") await audioCtx.resume();

        // Create nodes for analysis
        micSource = audioCtx.createMediaStreamSource(localStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512; // Lower FFT size for faster analysis
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Connect the microphone source to the analyser
        micSource.connect(analyser);

        // Loop to analyze audio data
        const detect = () => {
          if (!analyser) return; // Stop if analyser is gone
          analyser.getByteFrequencyData(dataArray);
          // Calculate average volume - simple VAD
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          // Threshold - adjust this value based on testing
          const speakingThreshold = 0.02; // Corresponds to ~5/255
          setSpeaking(avg / 255 > speakingThreshold);

          // Continue the loop
          rafId = requestAnimationFrame(detect);
        };
        detect(); // Start the loop

      } catch (err) {
        console.error("Mic activity detection failed", err);
        setSpeaking(false); // Ensure speaking is false on error
      }
    };

    startVAD(); // Initialize VAD

    // Cleanup function for the VAD effect
    return () => {
      console.log("[useWebRTC VAD Cleanup] Stopping VAD...");
      if (rafId) cancelAnimationFrame(rafId); // Stop the animation loop
      micSource?.disconnect(); // Disconnect nodes
      analyser?.disconnect();
      // Close the AudioContext to release resources
      audioCtx?.close().catch((e) => console.warn("Error closing AudioContext:", e));
      console.log("[useWebRTC VAD Cleanup] VAD stopped.");
    };
  }, [localStream]); // Re-run VAD setup only when the localStream changes

  // --- Effect to Send Speaking Status Updates ---
  // This effect sends the local 'speaking' state to other peers via the manager
  useEffect(() => {
    // Only send updates if the manager exists
    mgrRef.current?.sendSpeakingUpdate(speaking);
  }, [speaking]); // Run only when the local 'speaking' state changes

  // --- Return Hook State and Actions ---
  // Expose all the state variables and action functions for components to use
  return {
    connect, disconnect, users, remoteStreams, remoteScreens, sharingBy,
    getLocalStream, sendContentUpdate, peerStatus, broadcastStatus,
    startScreenShare, stopScreenShare, isScreenSharing,
    chatMessages, sendChatMessage, botActive, botSpeaker, sharedContent,
    speaking, // Local speaking state
    startRecording, stopRecording, isRecording, speakers, // Remote speaking state
    isRecordingLoading,
    meetingProgress
  };
}