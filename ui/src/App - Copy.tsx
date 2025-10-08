import { motion } from "framer-motion";
import { useContext, useEffect, useMemo, useState } from "react";
import { FaCircle, FaCompressAlt, FaExpandAlt, FaMoon, FaSun, FaThLarge } from "react-icons/fa";
import "./App.css";
import Controls from "./components/Controls";
import StartMeeting from "./components/StartMeeting";
import UserList from "./components/UserList";
import { UserContext } from "./context/UserContext";
import { useWebRTC } from "./hooks/useWebRTC";
import { ColorSchemes } from "./theme";
import { ControlActionTypes } from "./types";

export default function App() {
  const userContext = useContext(UserContext);

  const [view, setView] = useState<"grid" | "circle">("grid");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [fullscreenShare, setFullscreenShare] = useState(false);
  const [status, setStatus] = useState("Not connected");

  const {
    speaking,
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream,
    sendContentUpdate,
    peerStatus,
    broadcastStatus,
  } = useWebRTC(userContext.user.room, userContext.user.user);

  useEffect(() => {
    const colors = ColorSchemes[theme];
    const root = document.documentElement;
    Object.entries(colors).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
    root.setAttribute("data-theme", theme);
  }, [theme]);

  async function joinRoom() {
    setStatus("Connecting...");
    await connect();
    setIsJoined(true);
    setStatus("Connected");
  }
  function leaveRoom() {
    disconnect();
    setIsJoined(false);
  }

  const performAction = (action: string) => {
    switch (action) {
      case ControlActionTypes.end:
        leaveRoom();
        break;
      case ControlActionTypes.mute:
        setIsMuted((prev) => {
          const newMuted = !prev;
          getLocalStream()?.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
          broadcastStatus({ isMuted: newMuted, isCameraOff });
          return newMuted;
        });
        break;
      case ControlActionTypes.camera:
        setIsCameraOff((prev) => {
          const newCamera = !prev;
          getLocalStream()?.getVideoTracks().forEach((t) => (t.enabled = !newCamera));
          broadcastStatus({ isMuted, isCameraOff: newCamera });
          return newCamera;
        });
        break;
      case "share":
        setIsSharing((s) => !s);
        break;
    }
  };

  const allUsers = useMemo(() => {
    const localUser = {
      id: userContext.user.user,
      stream: getLocalStream() ?? undefined,
      isMuted,
      isCameraOff,
      isLocal: true,
    };
    const remotes = users
      .filter((id) => id !== userContext.user.user)
      .map((id) => ({
        id,
        stream: remoteStreams[id],
        isMuted: peerStatus[id]?.isMuted ?? false,
        isCameraOff: peerStatus[id]?.isCameraOff ?? false,
        isLocal: false,
      }));
    return [localUser, ...remotes];
  }, [userContext.user.user, users, remoteStreams, peerStatus, isMuted, isCameraOff, getLocalStream]);

  if (!isJoined) return <StartMeeting joinRoom={joinRoom} />;

  return (
    <div className="d-flex flex-column vh-100" style={{ background: "var(--background)", color: "var(--text)" }}>
      {/* Middle section */}
      <div className="flex-grow-1 position-relative overflow-hidden d-flex flex-column" style={{ minHeight: 0 }}>
        {isSharing ? (
          <div className="d-flex w-100 h-100" style={{ minHeight: 0 }}>
            <div className="position-relative flex-grow-1 d-flex flex-column" style={{ overflow: "hidden" }}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setFullscreenShare((f) => !f)}
                className="btn btn-outline-info position-absolute top-0 end-0 m-3 rounded-pill px-3 py-2 z-3"
              >
                {fullscreenShare ? (
                  <>
                    <FaCompressAlt /> Minimize
                  </>
                ) : (
                  <>
                    <FaExpandAlt /> Fullscreen
                  </>
                )}
              </motion.button>

              <textarea
                className="form-control bg-secondary text-white flex-grow-1 m-3 rounded-4"
                style={{ resize: "none" }}
                onChange={(e) => sendContentUpdate(e.target.value)}
              />
            </div>

            {!fullscreenShare && (
              <div
                className="p-3 d-flex flex-column"
                style={{
                  width: 360,
                  background: "var(--surface)",
                  borderLeft: `1px solid var(--border)`,
                }}
              >
                <strong className="mb-2">Participants</strong>
                <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
                  <UserList users={allUsers} view={view} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Floating buttons */}
            <motion.div
              className="position-absolute top-0 start-0 m-3 d-flex gap-2 z-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="btn btn-outline-info rounded-pill px-3 py-2"
              >
                {theme === "dark" ? (
                  <>
                    <FaSun /> Light
                  </>
                ) : (
                  <>
                    <FaMoon /> Dark
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setView(view === "grid" ? "circle" : "grid")}
                className="btn btn-outline-info rounded-pill px-3 py-2"
              >
                {view === "grid" ? (
                  <>
                    <FaCircle /> Circle
                  </>
                ) : (
                  <>
                    <FaThLarge /> Grid
                  </>
                )}
              </motion.button>
            </motion.div>

            {/* Users grid */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <UserList users={allUsers} view={view} />
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div style={{ flexShrink: 0 }}>
        <Controls
          performAction={performAction}
          status={status}
          room={userContext.user.room}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isSharing={isSharing}
          isSpeaking={speaking}
        />
      </div>
    </div>
  );
}
