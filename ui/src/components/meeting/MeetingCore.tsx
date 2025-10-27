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
const BotNames = ["Bot", "AI-Assistant", "Jarvis"];

interface MeetingCoreProps {
  room: string;
  userName: string;
  email: string;
  theme: string;
  initialAudioEnabled?: boolean;
  initialVideoEnabled?: boolean;
  prefDevice: { audioDeviceId?: string, videoDeviceId?: string };
}

const SidebarContent = React.memo(
  (props: any) => {
    const { isMobile, activeSidebarTab, setActiveSidebarTab, setIsSidebarOpen, userList, botSpeaker, sharingBy, chatMessages, sendChatMessage, localUserId } = props;
    return (
      <div className="d-flex flex-column h-100 w-100">
        <div className="p-2 d-flex align-items-center justify-content-between border-bottom border-secondary flex-shrink-0">
          <ul className="nav nav-pills">
            <li className="nav-item">
              <button
                className={`nav-link ${activeSidebarTab === "participants" && "active"}`}
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
              botNames={BotNames}
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
  prefDevice,
}) => {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767.98px)");
  const meetingContainerRef = useRef<HTMLDivElement>(null); // NEW: For fullscreen

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(!initialAudioEnabled);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideoEnabled);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"participants" | "chat">("participants");
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false); // NEW: Fullscreen state

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
    selectAudioDevice,
    selectVideoDevice,
  } = useWebRTC(room, userName);

  useEffect(() => {
    const start = async () => {
      try {
        // Respect initial audio/video flags provided to the Meeting
        await connect(initialAudioEnabled, initialVideoEnabled);
        setIsJoined(true);
      } catch (err) {
        console.warn("Connection failed", err);
      }
    };
    start();
    return () => {
      disconnect();
    };
  }, [connect, disconnect, initialAudioEnabled, initialVideoEnabled]);

  const stateRef = useRef({ isMuted, isCameraOff, isRecording, isScreenSharing });

  useEffect(() => {
    stateRef.current = { isMuted, isCameraOff, isRecording, isScreenSharing };
  }, [isMuted, isCameraOff, isRecording, isScreenSharing]);

  useEffect(() => {
    if (prefDevice.audioDeviceId) {
      selectAudioDevice(prefDevice.audioDeviceId);
    }
    if (prefDevice.videoDeviceId) {
      selectVideoDevice(prefDevice.videoDeviceId);
    }
  }, [prefDevice]);
  
    // NEW: Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // NEW: Auto-pin on screen share
  useEffect(() => {
    if (sharingBy) {
      setPinnedUserId(sharingBy); // Auto-pin the sharer
    } else {
      // When sharing stops, unpin *if* the pinned user was the sharer
      setPinnedUserId((prev) => (prev === sharingBy ? null : prev));
    }
  }, [sharingBy]);

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
	case "fullscreen":
          if (!meetingContainerRef.current) return;
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            setIsFullScreen(false);
          } else {
            await meetingContainerRef.current.requestFullscreen();
            setIsFullScreen(true);
          }
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

  const userList = useMemo(() => {
    const local = {
      id: userName,
      isMuted,
      isCameraOff,
      isLocal: true,
      speaking: (speakers || {})[userName] ?? false,
    };
    const remotes = (users || [])
      .filter((u) => u !== userName)
      .map((id) => ({
        id,
        isMuted: (peerStatus || {})[id]?.isMuted ?? false,
        isCameraOff: (peerStatus || {})[id]?.isCameraOff ?? false,
        isLocal: false,
        speaking: (speakers || {})[id] ?? false,
      }));
    return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
  }, [userName, users, isMuted, isCameraOff, speakers, peerStatus]);

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
      .filter((u) => u !== userName)
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

  const onPinUser = useCallback((userId: string) => {
    setPinnedUserId((prev) => (prev === userId ? null : userId));
  }, [sharingBy]);

  const activeStream = sharingBy ? remoteScreens[sharingBy] : null;

  return (
    <div
      ref={meetingContainerRef} // Attach ref for fullscreen
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
            isMobile={isMobile}
            isChatSidebarOpen={isSidebarOpen}
          />
        </div>

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
        isFullScreen={isFullScreen} // Pass fullscreen state
      />

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