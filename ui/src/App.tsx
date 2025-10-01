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

  // 🔹 State
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [content, setContent] = useState("");

  // 🔹 Refs
  const audioContext = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);

  // 🔹 WebRTC Hook (manages peers + remote streams)
  const { connect, disconnect, users, remoteStreams, getLocalStream } =
    useWebRTC(userContext.user.room, userContext.user.user);

  // 🔹 VAD Hook (voice activity detection – can be extended later for signaling)
  const { init: initVAD, cleanup: cleanupVAD } = useVAD(
    isMuted,
    () => {}, // no direct blob sending now (audio handled by WebRTC)
    (s) => setStatus(s)
  );

  // 🔹 Join Room
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

    await connect(); // connect signaling + peers
    setIsJoined(true);

    if (stream.current) {
      initVAD(stream.current);
    }
  }

  // 🔹 Leave Room
  function leaveRoom() {
    cleanupVAD();
    stream.current?.getTracks().forEach((t) => t.stop());
    disconnect();
    audioContext.current?.close();
    setIsJoined(false);
    setStatus("Disconnected");
  }

  // 🔹 Shared content sync (TODO: use DataChannel in useWebRTC if you want)
  function handleContentChange(newContent: string) {
    setContent(newContent);
    // Example: send via DataChannel in useWebRTC
    // sendData({ type: "content_update", content: newContent });
  }

  // 🔹 Handle Controls
  const performAction = (action: string) => {
    switch (action) {
      case ControlActionTypes.end:
        leaveRoom();
        break;
      case ControlActionTypes.mute:
        setIsMuted((m) => !m);
        setStatus(!isMuted ? "Muted" : "Listening...");
        const localStream = getLocalStream();
        localStream?.getAudioTracks().forEach((t) => (t.enabled = isMuted));
        break;
    }
  };

  // 🔹 Play remote audio automatically
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, ms]) => {
      console.log("🔊 Attaching remote stream for", peerId, ms);
      let audioEl = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-${peerId}`;
        audioEl.autoplay = true;
        audioEl.controls = true;   // ✅ add controls for testing
        audioEl.setAttribute("playsinline", "true"); // ✅ fixed typing issue
        document.body.appendChild(audioEl);
      }
      if (audioEl.srcObject !== ms) {
        audioEl.srcObject = ms;
      }
    });
  }, [remoteStreams]);

  // 🔹 Render
  if (!isJoined) {
    return <StartMeeting joinRoom={joinRoom} />;
  }

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
