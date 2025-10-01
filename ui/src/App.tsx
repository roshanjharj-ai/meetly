// src/App.tsx
import { useContext, useState, useEffect, useMemo } from "react";
import "./App.css";
import Controls from "./components/Controls";
import StartMeeting from "./components/StartMeeting";
import UserList from "./components/UserList";
import { UserContext } from "./context/UserContext";
import { useWebRTC } from "./hooks/useWebRTC";
import { ControlActionTypes } from "./types";
import DOMPurify from 'dompurify';

export default function App() {
  const userContext = useContext(UserContext);

  // --- Local State ---
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState("Not connected");

  // --- WebRTC Hook ---
  const {
    connect,
    disconnect,
    users,
    remoteStreams,
    getLocalStream,
    sharedContent,
    sendContentUpdate,
    peerStatus,
    broadcastStatus,
  } = useWebRTC(userContext.user.room, userContext.user.user);

  // --- Room Management ---
  async function joinRoom() {
    if (!userContext.user.user || !userContext.user.room) return;
    setStatus("Connecting...");
    await connect();
    setIsJoined(true);
    setStatus("Connected");
  }

  function leaveRoom() {
    disconnect();
    setIsJoined(false);
  }

  // --- Handle Controls ---
  const performAction = (action: string) => {
    switch (action) {
      case ControlActionTypes.end:
        leaveRoom();
        break;
      case ControlActionTypes.mute:
        setIsMuted((prev) => {
            const newMutedState = !prev;
            getLocalStream()?.getAudioTracks().forEach((t) => (t.enabled = !newMutedState));
            broadcastStatus({ isMuted: newMutedState, isCameraOff }); // broadcast change
            return newMutedState;
        });
        break;
      case ControlActionTypes.camera:
        setIsCameraOff((prev) => {
            const newCameraOffState = !prev;
            getLocalStream()?.getVideoTracks().forEach((t) => (t.enabled = !newCameraOffState));
            broadcastStatus({ isMuted, isCameraOff: newCameraOffState }); // broadcast change
            return newCameraOffState;
        });
        break;
      case "share":
        setIsSharing((s) => !s);
        break;
    }
  };
  
  // Combine users, streams, and statuses for the UserList component
  const allUsersForGrid = useMemo(() => {
    const localUser = {
        id: userContext.user.user,
        stream: getLocalStream() ?? undefined,
        isMuted: isMuted,
        isCameraOff: isCameraOff,
        isLocal: true,
    };

    const remoteUsers = users
        .filter(id => id !== userContext.user.user)
        .map(id => ({
            id: id,
            stream: remoteStreams[id],
            isMuted: peerStatus[id]?.isMuted ?? false,
            isCameraOff: peerStatus[id]?.isCameraOff ?? false,
            isLocal: false,
        }));
        
    return [localUser, ...remoteUsers];
  }, [userContext.user.user, users, remoteStreams, peerStatus, isMuted, isCameraOff, getLocalStream]);

  // --- Render Logic ---
  if (!isJoined) {
    return <StartMeeting joinRoom={joinRoom} />;
  }

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden bg-dark">
      <div className="flex-grow-1 d-flex" style={{ minHeight: 0 }}>
        {isSharing ? (
          <>
            <div className="w-50 p-3 d-flex flex-column">
              <textarea
                className="form-control bg-secondary text-white h-100"
                onChange={(e) => sendContentUpdate(e.target.value)}
              />
            </div>
            <div className="w-50 p-3">
              <div
                className="w-100 h-100 bg-light p-3 overflow-auto rounded"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sharedContent) }}
              />
            </div>
          </>
        ) : (
          <UserList users={allUsersForGrid} />
        )}
      </div>
      <Controls
        performAction={performAction}
        status={status}
        room={userContext.user.room}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isSharing={isSharing}
      />
    </div>
  );
}