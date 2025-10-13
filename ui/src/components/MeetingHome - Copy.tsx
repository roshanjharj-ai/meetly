// src/pages/MeetingHome.tsx
import DOMPurify from 'dompurify';
import { AnimatePresence, motion } from "framer-motion";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import Controls from "../components/Controls";
import UserGrid from "../components/UserGrid";
import UserList from "../components/UserList";
import { UserContext } from "../context/UserContext";
import { useWebRTC, type ChatMessagePayload } from "../hooks/useWebRTC";
import { ControlActionTypes } from "../types";

// A simple hook to detect screen size for responsive logic
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile); // Open by default on desktop
    const [activeSidebarTab, setActiveSidebarTab] = useState<"participants" | "chat">("participants");

    const { connect, disconnect, users, remoteStreams, remoteScreens, sharingBy, getLocalStream, broadcastStatus, startScreenShare, stopScreenShare, isScreenSharing, chatMessages, sendChatMessage, botSpeaker, peerStatus, sharedContent, speaking, isRecording, startRecording, stopRecording, speakers } = useWebRTC(userContext.user.room, userContext.user.user);

    useEffect(() => { const start = async () => { try { await connect(); setIsJoined(true); } catch (err) { console.warn("Connection failed", err); } }; start(); return () => disconnect(); }, [connect, disconnect]);

    const performAction = async (action: string) => {
        switch (action) {
            case ControlActionTypes.sidebar: setIsSidebarOpen(p => !p); break;
            case "end": disconnect(); navigate("/"); break;
            case "mute": setIsMuted(prev => { const v = !prev; getLocalStream()?.getAudioTracks().forEach(t => (t.enabled = !v)); broadcastStatus({ isMuted: v, isCameraOff }); return v; }); break;
            case "camera": setIsCameraOff(prev => { const v = !prev; getLocalStream()?.getVideoTracks().forEach(t => (t.enabled = !v)); broadcastStatus({ isMuted, isCameraOff: v }); return v; }); break;
            case "record": isRecording ? stopRecording() : startRecording(); break;
            case "share-none": isScreenSharing ? stopScreenShare() : startScreenShare("none"); break;
            case "share-mic": isScreenSharing ? stopScreenShare() : startScreenShare("mic"); break;
            case "share-system": isScreenSharing ? stopScreenShare() : startScreenShare("system"); break;
            case ControlActionTypes.shareStop: stopScreenShare(); break;
        }
    };

    const userList = useMemo(() => {
        const local = { id: userContext.user.user, stream: getLocalStream() ?? undefined, isMuted, isCameraOff, isLocal: true, speaking: speakers[userContext.user.user] ?? false, };
        const remotes = users.filter(u => u !== userContext.user.user).map(id => ({ id, stream: remoteStreams[id], isMuted: peerStatus[id]?.isMuted ?? false, isCameraOff: peerStatus[id]?.isCameraOff ?? false, isLocal: false, speaking: speakers[id] ?? false, }));
        return [local, ...remotes];
    }, [userContext.user.user, users, remoteStreams, getLocalStream, isMuted, isCameraOff, speakers, peerStatus]);

    const shareRef = useRef<HTMLVideoElement | null>(null);
    const activeStream = sharingBy ? remoteScreens[sharingBy] : null;
    useEffect(() => { if (shareRef.current) { shareRef.current.srcObject = activeStream; } }, [activeStream]);

    const SidebarContent = () => (
        <>
            <div className="p-2 d-flex align-items-center justify-content-between border-bottom border-secondary">
                <ul className="nav nav-pills">
                    <li className="nav-item"><button className={`nav-link text-white ${activeSidebarTab === "participants" && "active"}`} onClick={() => setActiveSidebarTab("participants")}>Participants</button></li>
                    <li className="nav-item"><button className={`nav-link text-white ${activeSidebarTab === "chat" && "active"}`} onClick={() => setActiveSidebarTab("chat")}>Chat</button></li>
                </ul>
                {isMobile && <button className="btn btn-close-white" onClick={() => setIsSidebarOpen(false)}><FaTimes /></button>}
            </div>
            <div className="flex-grow-1 overflow-auto p-2">
                {activeSidebarTab === "participants" ? <UserList users={userList} botSpeaker={botSpeaker} excludeUserId={sharingBy} /> : <ChatPanel messages={chatMessages} sendMessage={sendChatMessage} localUserId={userContext.user.user} />}
            </div>
        </>
    );

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
                        <UserGrid users={userList} />
                    )}
                </div>

                {!isMobile && (
                    <AnimatePresence>
                        {isSidebarOpen && (
                            <motion.aside initial={{ width: 0 }} animate={{ width: 340 }} exit={{ width: 0 }} transition={{ type: 'tween', duration: 0.3 }} className="d-flex flex-column bg-dark h-100 border-start border-secondary">
                                <SidebarContent />
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
                            <SidebarContent />
                        </motion.div>
                    )}
                 </AnimatePresence>
            )}
        </div>
    );
}
