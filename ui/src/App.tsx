import { useContext, useRef, useState, useEffect } from "react";
import "./App.css";
import Controls from "./components/Controls";
import SharedContent from "./components/SharedContent";
import StartMeeting from "./components/StartMeeting";
import UserList from "./components/UserList";
import { UserContext } from "./context/UserContext";
import { useVAD } from "./hooks/useVAD";
import { useWebRTC } from "./hooks/useWebRTC";
import { ControlActionTypes } from "./types";

export default function App() {
  const userContext = useContext(UserContext);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [content, setContent] = useState("");

  const audioContext = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);

  // WebRTC Hook
  const { connect, disconnect, users, remoteStreams, getLocalStream } =
    useWebRTC(userContext.user.room, userContext.user.user);

  // VAD Hook
  const { init: initVAD, cleanup: cleanupVAD } = useVAD(
    isMuted,
    (blob) => {
      // For now we don’t send blobs directly anymore,
      // since audio goes via WebRTC, not WebSocket.
      // You can still use this for content signaling if needed.
      console.debug("VAD detected speech blob:", blob);
    },
    (s) => setStatus(s)
  );

  async function joinRoom() {
    if (!userContext.user.user || !userContext.user.room) {
      setStatus("Enter name & room");
      return;
    }

    setStatus("Requesting mic...");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("Mic access denied");
      return;
    }

    await connect();
    setIsJoined(true);

    if (stream.current) {
      initVAD(stream.current);
    }
  }

  function leaveRoom() {
    cleanupVAD();
    stream.current?.getTracks().forEach((t) => t.stop());
    disconnect();
    audioContext.current?.close();
    setIsJoined(false);
    setStatus("Disconnected");
  }

  function handleContentChange(newContent: string) {
    setContent(newContent);
    // TODO: If you want shared content sync over WebRTC,
    // you should add a DataChannel in useWebRTC hook
    // and send messages here.
  }

  if (!isJoined) {
    return <StartMeeting {...{ joinRoom: joinRoom }} />;
  }

  const performAction = (action: string) => {
    switch (action) {
      case ControlActionTypes.end:
        leaveRoom();
        break;
      case ControlActionTypes.mute:
        setIsMuted((m) => !m);
        setStatus(!isMuted ? "Muted" : "Listening...");
        // TODO: You may also want to disable local audio track
        const localStream = getLocalStream();
        localStream?.getAudioTracks().forEach((t) => (t.enabled = isMuted));
        break;
    }
  };

  useEffect(() => {
    // Play remote streams automatically
    Object.entries(remoteStreams).forEach(([peerId, ms]) => {
      let audioEl = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-${peerId}`;
        audioEl.autoplay = true;
        (audioEl as any).playsInline = true;
        document.body.appendChild(audioEl);
      }
      if (audioEl.srcObject !== ms) {
        audioEl.srcObject = ms;
      }
    });
  }, [remoteStreams]);

  return (
    <div className="d-flex flex-column min-vh-100 overflow-hidden bg-dark">
      <div className="d-flex flex-column h-100 w-100 overflow-hidden">
        <div className="flex gap-0">
          {content !== "" && (
            <SharedContent {...{ content: content, setContent: handleContentChange }} />
          )}
          <UserList
            users={users.map((name) => ({
              name,
              micOff: false,
              videoOff: true,
            }))}
          />
        </div>
        <div className="h-100">
          <Controls
            {...{
              performAction: performAction,
              status: status,
              room: userContext.user.room,
            }}
          />
        </div>
      </div>
    </div>
  );
}
