import { AnimatePresence, motion } from "framer-motion";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../../components/ChatPanel";
import UserList from "../../components/meeting/UserList";
import useMediaQuery from "../../hooks/useMediaQuery";
import { useWebRTC } from "../../hooks/useWebRTC";
import { ControlActionTypes } from "../../types/meeting.types";
import MeetingFooter from "./MeetingFooter";
import MeetingLayout from "./MeetingLayout";

// *** MOCK BOTNAMES (as requested) ***
// TODO: Import this from 'src/Constants.ts'
const BotNames = ["Bot", "AI-Assistant", "Jarvis"];

// Props for the core meeting component, now including theme
interface MeetingCoreProps {
  room: string;
  userName: string;
  email: string;
  theme: string;
  initialAudioEnabled?: boolean; // Optional initial state
  initialVideoEnabled?: boolean; // Optional initial state
}

// Sidebar component
const SidebarContent = React.memo(
  ({
    isMobile,
    activeSidebarTab,
    setActiveSidebarTab,
    setIsSidebarOpen,
    userList,
    botSpeaker,
    sharingBy,
    chatMessages,
    sendChatMessage,
    localUserId,
  }: any) => {
    return (
      <div className="d-flex flex-column h-100 w-100">
        <div className="p-2 d-flex align-items-center justify-content-between border-bottom border-secondary flex-shrink-0">
          <ul className="nav nav-pills">
            <li className="nav-item">
              <button
                className={`nav-link ${
                  activeSidebarTab === "participants" && "active"
                }`}
                onClick={() => setActiveSidebarTab("participants")}
              >
                Participants
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeSidebarTab === "chat" && "active"}`}
                onClick={() => setActiveSidebarTab("chat")}
              >
                Chat
              </button>
            </li>
          </ul>
          {isMobile && (
            <button
              className="btn btn-close"
              onClick={() => setIsSidebarOpen(false)}
            >
              <FaTimes />
            </button>
          )}
        </div>
        <div className="flex-grow-1 overflow-auto p-2">
          {activeSidebarTab === "participants" ? (
            <UserList
              users={userList}
              botSpeaker={botSpeaker}
              excludeUserId={sharingBy}
              botNames={BotNames} // Pass BotNames to filter sidebar list
            />
          ) : (
            <ChatPanel
              messages={chatMessages}
              sendMessage={sendChatMessage}
              localUserId={localUserId}
            />
          )}
        </div>
      </div>
    );
  }
);

const MeetingCore: React.FC<MeetingCoreProps> = ({
  room,
  userName,
  theme,
  initialAudioEnabled = true,
  initialVideoEnabled = true,
}) => {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767.98px)");

  // --- State variables ---
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(!initialAudioEnabled);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideoEnabled);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [activeSidebarTab, setActiveSidebarTab] = useState<
    "participants" | "chat"
  >("participants");
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);

  // --- useWebRTC hook remains the same (uses props) ---
  const {
    connect,
    disconnect,
    users,
    remoteStreams,
    remoteScreens,
    sharingBy,
    getLocalStream,
    broadcastStatus,
    startScreenShare,
    stopScreenShare,
    isScreenSharing,
    chatMessages,
    sendChatMessage,
    botSpeaker,
    peerStatus,
    sharedContent,
    speaking,
    isRecording,
    startRecording,
    stopRecording,
    speakers,
    isRecordingLoading,
    meetingProgress,
  } = useWebRTC(room, userName);

  // --- useEffect for connecting remains the same ---
  useEffect(() => {
    const start = async () => {
      try {
        await connect();
        setIsJoined(true);
      } catch (err) {
        console.warn("Connection failed", err);
      }
    };
    start();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // --- stateRef and its useEffect remain the same ---
  const stateRef = useRef({ isMuted, isCameraOff, isRecording, isScreenSharing });
  useEffect(() => {
    stateRef.current = { isMuted, isCameraOff, isRecording, isScreenSharing };
  }, [isMuted, isCameraOff, isRecording, isScreenSharing]);

  // --- disconnectingRef and performAction remain the same ---
  const disconnectingRef = useRef(false);
  const performAction = useCallback(
    async (action: string) => {
      const {
        isRecording: currentIsRecording,
        isScreenSharing: currentIsScreenSharing,
      } = stateRef.current;
      switch (action) {
        case "end":
          if (disconnectingRef.current) return;
          disconnectingRef.current = true;
          disconnect();
          navigate("/");
          break;
        case ControlActionTypes.sidebar:
          setIsSidebarOpen((p) => !p);
          break;
        case "mute":
          setIsMuted((prev) => {
            const nextIsMuted = !prev;
            getLocalStream()
              ?.getAudioTracks()
              .forEach((t) => (t.enabled = !nextIsMuted));
            broadcastStatus({
              isMuted: nextIsMuted,
              isCameraOff: stateRef.current.isCameraOff,
            });
            return nextIsMuted;
          });
          break;
        case "camera":
          setIsCameraOff((prev) => {
            const nextIsCameraOff = !prev;
            getLocalStream()
              ?.getVideoTracks()
              .forEach((t) => (t.enabled = !nextIsCameraOff));
            broadcastStatus({
              isMuted: stateRef.current.isMuted,
              isCameraOff: nextIsCameraOff,
            });
            return nextIsCameraOff;
          });
          break;
        case "record":
          currentIsRecording ? stopRecording() : startRecording();
          break;
        case "share-none":
          currentIsScreenSharing
            ? await stopScreenShare()
            : await startScreenShare("none");
          break;
        case "share-mic":
          currentIsScreenSharing
            ? await stopScreenShare()
            : await startScreenShare("mic");
          break;
        case "share-system":
          currentIsScreenSharing
            ? await stopScreenShare()
            : await startScreenShare("system");
          break;
        case ControlActionTypes.shareStop:
          await stopScreenShare();
          break;
      }
    },
    [
      disconnect,
      getLocalStream,
      broadcastStatus,
      navigate,
      startRecording,
      stopRecording,
      startScreenShare,
      stopScreenShare,
    ]
  );

  // --- [THIS IS THE REVERTED LOGIC] ---
  // Reverted userList (for sidebar)
  const userList = useMemo(() => {
    const local = {
      id: userName,
      isMuted,
      isCameraOff,
      isLocal: true,
      speaking: (speakers || {})[userName] ?? false,
    };
    const remotes = (users || [])
      .filter((u) => u !== userName) // <-- This filter is the key
      .map((id) => ({
        id,
        isMuted: (peerStatus || {})[id]?.isMuted ?? false, 
        isCameraOff: (peerStatus || {})[id]?.isCameraOff ?? false, 
        isLocal: false,
        speaking: (speakers || {})[id] ?? false, 
      }));
    return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
  }, [userName, users, isMuted, isCameraOff, speakers, peerStatus]);

  // Reverted userGridList (for main layout)
  const userGridList = useMemo(() => {
    const local = {
      id: userName,
      stream: getLocalStream() || undefined,
      isMuted,
      isCameraOff,
      isLocal: true,
      speaking: (speakers || {})[userName] ?? false, 
    };
    const remotes = (users || [])
      .filter((u) => u !== userName) // <-- This filter is the key
      .map((id) => ({
        id,
        stream: (remoteStreams || {})[id], 
        isMuted: (peerStatus || {})[id]?.isMuted ?? false, 
        isCameraOff: (peerStatus || {})[id]?.isCameraOff ?? false, 
        isLocal: false,
        speaking: (speakers || {})[id] ?? false, 
      }));
    return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
  }, [
    userName,
    users,
    getLocalStream,
    remoteStreams,
    isMuted,
    isCameraOff,
    speakers,
    peerStatus,
  ]);
  // --- [END OF REVERTED LOGIC] ---
  
  // Callback for pinning
  const onPinUser = useCallback((userId: string) => {
    setPinnedUserId((prev) => (prev === userId ? null : userId));
  }, []);

  // Get active stream for sharing
  const activeStream = sharingBy ? remoteScreens[sharingBy] : null;

  // --- Determine Main View (for side pane logic) ---
  // const pinnedUser = useMemo(
  //   () => userGridList.find((u) => u.id === pinnedUserId),
  //   [userGridList, pinnedUserId]
  // );

  // const mainViewType = useMemo(() => {
  //   if (pinnedUser) return "pin";
  //   if (activeStream) return "share";
  //   if (sharedContent) return "content";
  //   return "grid";
  // }, [pinnedUser, activeStream, sharedContent]);

  // --- Determine Side Pane Users (for side pane logic) ---
  // const sidePaneUsers = useMemo(() => {
  //   if (mainViewType === "grid") return [];
    
  //   // Filter out bots AND the pinned user
  //   return userGridList.filter(u => 
  //     !BotNames.includes(u.id) && u.id !== pinnedUserId
  //   );

  // }, [userGridList, mainViewType, pinnedUserId]);


  // --- JSX return statement ---
  return (
    <div
      className="d-flex flex-column h-100 position-relative bg-body "
      data-bs-theme={theme}
    >
      <main
        className="d-flex overflow-hidden"
        style={{ height: "calc(100% - 91px)" }}
      >
        <div className="flex-grow-1 h-100 position-relative">
          <MeetingLayout
            users={userGridList}
            botNames={BotNames}
            botSpeaker={botSpeaker}
            sharingBy={sharingBy}
            sharedContent={sharedContent}
            remoteScreenStream={activeStream}
            pinnedUserId={pinnedUserId}
            onPinUser={onPinUser}
            theme={theme}
            // Keep the layout props
            isMobile={isMobile}
            isChatSidebarOpen={isSidebarOpen}
          />
        </div>
        
        {/* Chat/Participant Sidebar (Desktop) */}
        {!isMobile && (
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "tween", duration: 0.3 }}
                className="bg-body h-100 border-start border-secondary flex-shrink-0"
                style={{ overflow: "hidden" }}
              >
                <SidebarContent
                  isMobile={isMobile}
                  activeSidebarTab={activeSidebarTab}
                  setActiveSidebarTab={setActiveSidebarTab}
                  setIsSidebarOpen={setIsSidebarOpen}
                  userList={userList}
                  botSpeaker={botSpeaker}
                  sharingBy={sharingBy}
                  chatMessages={chatMessages}
                  sendChatMessage={sendChatMessage}
                  localUserId={userName}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Footer remains the same */}
      <MeetingFooter
        isRecordingLoading={isRecordingLoading}
        isSidebar={isSidebarOpen}
        performAction={performAction}
        status={isJoined ? "Connected" : "Connecting"}
        room={room}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isSharing={isScreenSharing}
        isSpeaking={speaking}
        isJoined={isJoined}
        isRecording={isRecording}
        meetingProgress={meetingProgress}
      />

      {/* Mobile Sidebar (for Chat/Participants) remains the same */}
      {isMobile && (
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column bg-body"
              style={{ zIndex: 2000 }}
            >
              <SidebarContent
                isMobile={isMobile}
                activeSidebarTab={activeSidebarTab}
                setActiveSidebarTab={setActiveSidebarTab}
                setIsSidebarOpen={setIsSidebarOpen}
                userList={userList}
                botSpeaker={botSpeaker}
                sharingBy={sharingBy}
                chatMessages={chatMessages}
                sendChatMessage={sendChatMessage}
                localUserId={userName}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default MeetingCore;