import { useContext, useRef, useState, useEffect } from "react";
import "./App.css";
import Controls from "./components/Controls";
import StartMeeting from "./components/StartMeeting";
import UserList from "./components/UserList";
import { UserContext } from "./context/UserContext";
import { useVAD } from "./hooks/useVAD";
import { useWebRTC } from "./hooks/useWebRTC";
import { ControlActionTypes } from "./types";
import DOMPurify from 'dompurify'; // Import DOMPurify for security

export default function App() {
  const userContext = useContext(UserContext);

  // --- State ---
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [isSharing, setIsSharing] = useState(false); // New state to toggle share UI

  // --- Refs ---
  const audioContext = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);

  // --- WebRTC Hook (destructure new values) ---
  const {
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream,
    sharedContent,
    sendContentUpdate,
  } = useWebRTC(userContext.user.room, userContext.user.user);

  // --- VAD Hook ---
  const { init: initVAD, cleanup: cleanupVAD } = useVAD(isMuted, () => {}, (s) => setStatus(s));

  // --- Room Management ---
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
    if (stream.current) initVAD(stream.current);
  }

  function leaveRoom() {
    cleanupVAD();
    stream.current?.getTracks().forEach((t) => t.stop());
    disconnect();
    audioContext.current?.close();
    setIsJoined(false);
    setStatus("Disconnected");
  }

  // --- Handle Controls ---
  const performAction = (action: string) => {
    switch (action) {
      case ControlActionTypes.end:
        leaveRoom();
        break;
      case ControlActionTypes.mute:
        setIsMuted((m) => {
          const newMutedState = !m;
          setStatus(newMutedState ? "Muted" : "Listening...");
          getLocalStream()?.getAudioTracks().forEach((t) => (t.enabled = !newMutedState));
          return newMutedState;
        });
        break;
      case "share": // New action for content sharing
        setIsSharing((s) => !s);
        break;
    }
  };

  // --- Auto-play remote audio ---
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, ms]) => {
      let audioEl = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-${peerId}`;
        audioEl.autoplay = true;
        audioEl.setAttribute("playsinline", "true");
        document.body.appendChild(audioEl);
      }
      if (audioEl.srcObject !== ms) {
        audioEl.srcObject = ms;
      }
    });
  }, [remoteStreams]);

  // --- Render Logic ---
  if (!isJoined) {
    return <StartMeeting joinRoom={joinRoom} />;
  }

  return (
    <div className="d-flex flex-column min-vh-100 overflow-hidden bg-dark">
      <div className="d-flex flex-column h-100 w-100 overflow-hidden">
        <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
          {isSharing ? (
            <>
              {/* Left Side: Textarea for input */}
              <div className="w-50 p-3 d-flex flex-column">
                <h5 className="text-light mb-2">Share Live Content (HTML)</h5>
                <textarea
                  className="form-control bg-secondary text-white flex-grow-1"
                  placeholder="Enter HTML content here..."
                  onChange={(e) => sendContentUpdate(e.target.value)}
                  style={{ resize: 'none' }}
                />
              </div>
              {/* Right Side: Rendered output */}
              <div className="w-50 p-3">
                 <div
                    className="w-100 h-100 bg-light p-3 overflow-auto rounded"
                    // SECURITY: Sanitize HTML from peers to prevent XSS attacks
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sharedContent) }}
                 />
              </div>
            </>
          ) : (
            // Show UserList when not sharing
            <div className="w-100">
              <UserList
                users={users.map((name) => ({
                  name,
                  micOff: false, // You can extend this to be dynamic later
                  videoOff: true,
                }))}
              />
            </div>
          )}
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