// src/pages/MeetingHome.tsx
import DOMPurify from 'dompurify';
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import Controls from "../components/Controls";
import UserGrid from "../components/UserGrid";
import UserList from "../components/UserList";
import { UserContext } from "../context/UserContext";
import { useWebRTC, type ChatMessagePayload } from "../hooks/useWebRTC";
import { ControlActionTypes } from "../types";

// --- START: FIX ---
// 1. Move SidebarContent outside to give it a stable identity.
// 2. Wrap it in React.memo to prevent re-renders unless its props change.
const SidebarContent = React.memo(({
    isMobile,
    activeSidebarTab,
    setActiveSidebarTab,
    setIsSidebarOpen,
    userList,
    botSpeaker,
    sharingBy,
    chatMessages,
    sendChatMessage,
    localUserId
}: any) => {
    return (
        <div className="d-flex flex-column h-100 w-100">
            <div className="p-2 d-flex align-items-center justify-content-between border-bottom border-secondary flex-shrink-0">
                <ul className="nav nav-pills">
                    <li className="nav-item"><button className={`nav-link text-white ${activeSidebarTab === "participants" && "active"}`} onClick={() => setActiveSidebarTab("participants")}>Participants</button></li>
                    <li className="nav-item"><button className={`nav-link text-white ${activeSidebarTab === "chat" && "active"}`} onClick={() => setActiveSidebarTab("chat")}>Chat</button></li>
                </ul>
                {isMobile && <button className="btn btn-close text-white" onClick={() => setIsSidebarOpen(false)}><FaTimes /></button>}
            </div>
            <div className="flex-grow-1 overflow-auto p-2">
                {activeSidebarTab === "participants" ? (
                    <UserList users={userList} botSpeaker={botSpeaker} excludeUserId={sharingBy} />
                ) : (
                    <ChatPanel messages={chatMessages} sendMessage={sendChatMessage} localUserId={localUserId} />
                )}
            </div>
        </div>
    );
});
// --- END: FIX ---

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(window.matchMedia(query).matches);
    useEffect(() => {
        const media = window.matchMedia(query);
        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, [query]);
    return matches;
};

export default function MeetingHome() {
    const userContext = useContext(UserContext);
    const navigate = useNavigate();
    const isMobile = useMediaQuery("(max-width: 768px)");

    const [isJoined, setIsJoined] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
    const [activeSidebarTab, setActiveSidebarTab] = useState<"participants" | "chat">("participants");

    const { connect, disconnect, users, remoteStreams, remoteScreens, sharingBy, getLocalStream, broadcastStatus, startScreenShare, stopScreenShare, isScreenSharing, chatMessages, sendChatMessage, botSpeaker, peerStatus, sharedContent, speaking, isRecording, startRecording, stopRecording, speakers } = useWebRTC(userContext.user.room, userContext.user.user);

    useEffect(() => {
        const start = async () => {
            try { await connect(); setIsJoined(true); }
            catch (err) { console.warn("Connection failed", err); }
        };
        start();
    }, [connect]);

    const disconnectingRef = useRef(false);
    const performAction = useCallback(async (action: string) => {        
        switch (action) {
            case "end": {
                if (disconnectingRef.current) return;
                disconnectingRef.current = true;
                try {
                    await disconnect(); // now waits full cleanup
                } catch (err) {
                    console.warn("Disconnect error:", err);
                } finally {
                    disconnectingRef.current = false;
                    navigate("/");
                }
                break;
            }

            case ControlActionTypes.sidebar: setIsSidebarOpen(p => !p); break;
            case "mute": setIsMuted(prev => { const v = !prev; getLocalStream()?.getAudioTracks().forEach(t => (t.enabled = !v)); broadcastStatus({ isMuted: v, isCameraOff }); return v; }); break;
            case "camera": setIsCameraOff(prev => { const v = !prev; getLocalStream()?.getVideoTracks().forEach(t => (t.enabled = !v)); broadcastStatus({ isMuted, isCameraOff: v }); return v; }); break;
            case "record": isRecording ? stopRecording() : startRecording(); break;
            case "share-none": isScreenSharing ? await stopScreenShare() : await startScreenShare("none"); break;
            case "share-mic": isScreenSharing ? await stopScreenShare() : await startScreenShare("mic"); break;
            case "share-system": isScreenSharing ? await stopScreenShare() : await startScreenShare("system"); break;
            case ControlActionTypes.shareStop: await stopScreenShare(); break;
        }
    }, [disconnect, getLocalStream, broadcastStatus, isCameraOff, isRecording, isScreenSharing, navigate, startRecording, stopRecording, startScreenShare, stopScreenShare]);

    const userList = useMemo(() => {
        const local = { id: userContext.user.user, isMuted, isCameraOff, isLocal: true, speaking: speakers[userContext.user.user] ?? false, };
        const remotes = users.filter(u => u !== userContext.user.user).map(id => ({ id, isMuted: peerStatus[id]?.isMuted ?? false, isCameraOff: peerStatus[id]?.isCameraOff ?? false, isLocal: false, speaking: speakers[id] ?? false, }));
        return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
    }, [userContext.user.user, users, isMuted, isCameraOff, speakers, peerStatus]);

    const userGridList = useMemo(() => {
        const local = { id: userContext.user.user, stream: getLocalStream() || undefined, isMuted, isCameraOff, isLocal: true, speaking: speakers[userContext.user.user] ?? false };
        const remotes = users.filter(u => u !== userContext.user.user).map(id => ({ id, stream: remoteStreams[id], isMuted: peerStatus[id]?.isMuted ?? false, isCameraOff: peerStatus[id]?.isCameraOff ?? false, isLocal: false, speaking: speakers[id] ?? false }));
        return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
    }, [userContext.user.user, users, getLocalStream, remoteStreams, isMuted, isCameraOff, speakers, peerStatus]);

    const shareRef = useRef<HTMLVideoElement | null>(null);
    const activeStream = sharingBy ? remoteScreens[sharingBy] : null;
    useEffect(() => { if (shareRef.current) { shareRef.current.srcObject = activeStream; } }, [activeStream]);

    return (
        <div className="d-flex flex-column vh-100 position-relative bg-dark text-white" data-bs-theme="dark">
            <main className="d-flex flex-grow-1 overflow-hidden">
                <div className="flex-grow-1 h-100 d-flex align-items-center justify-content-center p-2 p-md-3">
                    {activeStream ? (
                        <motion.div className="w-100 h-100 bg-black rounded-3 overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <video ref={shareRef} autoPlay playsInline muted className="w-100 h-100" style={{ objectFit: "contain" }} />
                        </motion.div>
                    ) : sharedContent ? (
                        <div className="w-100 h-100 overflow-auto bg-light rounded p-3 text-dark" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sharedContent) }} />
                    ) : (
                        <UserGrid users={userGridList} />
                    )}
                </div>
                {!isMobile && (
                    <AnimatePresence>
                        {isSidebarOpen && (
                            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: 'tween', duration: 0.3 }} className="bg-dark h-100 border-start border-secondary flex-shrink-0" style={{ overflow: 'hidden' }}>
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
                                    localUserId={userContext.user.user}
                                />
                            </motion.aside>
                        )}
                    </AnimatePresence>
                )}
            </main>
            <footer>
                <Controls isSidebar={isSidebarOpen} performAction={performAction} status={isJoined ? "Connected" : "Connecting"} room={userContext.user.room} isMuted={isMuted} isCameraOff={isCameraOff} isSharing={isScreenSharing} isSpeaking={speaking} isJoined={isJoined} isRecording={isRecording} />
            </footer>
            {isMobile && (
                <AnimatePresence>
                    {isSidebarOpen && (
                        <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: 'tween', duration: 0.3 }} className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column bg-dark" style={{ zIndex: 2000 }}>
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
                                localUserId={userContext.user.user}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    );
}