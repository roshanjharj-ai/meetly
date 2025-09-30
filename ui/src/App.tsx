import { useContext, useRef, useState } from "react";
import "./App.css";
import Controls from "./components/Controls";
import SharedContent from "./components/SharedContent";
import StartMeeting from "./components/StartMeeting";
import UserList from "./components/UserList";
import { UserContext } from "./context/UserContext";
import { useVAD } from "./hooks/useVAD";
import { useWebSocket } from "./hooks/useWebSocket";
import { ControlActionTypes } from "./types";

export default function App() {
  const userContext = useContext(UserContext);
  const [isJoined, setIsJoined] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [users, setUsers] = useState<string[]>(["Roshan", "Santosh", "Prashant", "Rajeev"]);
  const [content, setContent] = useState("");
  const audioContext = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);

  // WS Hook
  const { connect, send, disconnect } = useWebSocket(
    userContext.user.room,
    userContext.user.user,
    setUsers,
    setContent,
    async (data) => {
      try {
        if (!audioContext.current || audioContext.current.state === "closed") {
          audioContext.current = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        } else if (audioContext.current.state === "suspended") {
          await audioContext.current.resume();
        }
        const arrayBuffer =
          data instanceof Blob ? await data.arrayBuffer() : data;
        const audioBuffer = await audioContext.current.decodeAudioData(
          arrayBuffer.slice(0)
        );
        const source = audioContext.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.current.destination);
        source.start(0);
      } catch (e) {
        console.error("Error playing received audio:", e);
      }
    },
    () => {
      setIsJoined(false);
      setStatus("Disconnected");
    }
  );

  // VAD Hook
  const { init: initVAD, cleanup: cleanupVAD } = useVAD(
    isMuted,
    (blob) => send(blob),
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

    connect();
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

  function handleContentChange(newContent: string) {
    setContent(newContent);
    send(JSON.stringify({ type: "content_update", content: newContent }));
  }

  if (!isJoined) {
    return (
      <StartMeeting {...{ joinRoom: joinRoom }} />
    );
  }

  const performAction = (action: string) => {
    switch (action) {
      case ControlActionTypes.end:
        leaveRoom();
        break;
      case ControlActionTypes.mute:
        setIsMuted((m) => !m);
        setStatus(!isMuted ? "Muted" : "Listening...");
        break;
    }
  }

  return (
    <div className="d-flex flex-column min-vh-100 overflow-hidden bg-dark">
      <div className="d-flex flex-column h-100 w-100 overflow-hidden">
        <div className="flex gap-0">
          {
            content != "" &&
            <SharedContent {...{ content: content, setContent: handleContentChange }} />
          }
          <UserList
            users={users.map((name) => ({
              name,
              micOff: true,
              videoOff: true,
            }))}
          />
        </div>
        <div className="h-100">
          <Controls {...{
            performAction: performAction, status: status, room: userContext.user.room
          }} />
        </div>
      </div>
    </div>
  );
}
