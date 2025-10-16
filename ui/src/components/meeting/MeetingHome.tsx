import DOMPurify from 'dompurify';
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../../components/ChatPanel";
import Controls from "./Controls";
import UserGrid from "./UserGrid";
import UserList from "./UserList";
import { UserContext } from "../../context/UserContext";
import { useWebRTC } from "../../hooks/useWebRTC";
import { ControlActionTypes } from "../../types/meeting.types";
import useMediaQuery from '../../hooks/useMediaQuery';

const SidebarContent = React.memo(({
    isMobile, activeSidebarTab, setActiveSidebarTab, setIsSidebarOpen,
    userList, botSpeaker, sharingBy, chatMessages, sendChatMessage, localUserId
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


export default function MeetingHome() {
    const userContext = useContext(UserContext);
    const navigate = useNavigate();
    const isMobile = useMediaQuery("(max-width: 768px)");

    const [isJoined, setIsJoined] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
    const [activeSidebarTab, setActiveSidebarTab] = useState<"participants" | "chat">("participants");

    const { connect, disconnect, users, remoteStreams, remoteScreens, sharingBy, getLocalStream, broadcastStatus, startScreenShare, stopScreenShare, isScreenSharing, chatMessages, sendChatMessage, botSpeaker, peerStatus, sharedContent, speaking, isRecording, startRecording, stopRecording, speakers, isRecordingLoading } = useWebRTC(userContext.user == null ? "dummy" : userContext.user?.room, (userContext.user == null) ? "aa" : userContext.user?.user);

    useEffect(() => {
        const start = async () => {
            try { await connect(); setIsJoined(true); }
            catch (err) { console.warn("Connection failed", err); }
        };
        start();
    }, [connect]);

    const stateRef = useRef({ isMuted, isCameraOff, isRecording, isScreenSharing });
    useEffect(() => {
        stateRef.current = { isMuted, isCameraOff, isRecording, isScreenSharing };
    }, [isMuted, isCameraOff, isRecording, isScreenSharing]);

    const disconnectingRef = useRef(false);
    const performAction = useCallback(async (action: string) => {
        const { isRecording: currentIsRecording, isScreenSharing: currentIsScreenSharing } = stateRef.current;
        switch (action) {
            case "end":
                if (disconnectingRef.current) return;
                disconnectingRef.current = true;
                disconnect();
                navigate("/");
                break;
            case ControlActionTypes.sidebar: setIsSidebarOpen(p => !p); break;
            case "mute":
                setIsMuted(prev => {
                    const nextIsMuted = !prev;
                    getLocalStream()?.getAudioTracks().forEach(t => (t.enabled = !nextIsMuted));
                    broadcastStatus({ isMuted: nextIsMuted, isCameraOff: stateRef.current.isCameraOff });
                    return nextIsMuted;
                });
                break;
            case "camera":
                setIsCameraOff(prev => {
                    const nextIsCameraOff = !prev;
                    getLocalStream()?.getVideoTracks().forEach(t => (t.enabled = !nextIsCameraOff));
                    broadcastStatus({ isMuted: stateRef.current.isMuted, isCameraOff: nextIsCameraOff });
                    return nextIsCameraOff;
                });
                break;
            case "record": currentIsRecording ? stopRecording() : startRecording(); break;
            case "share-none": currentIsScreenSharing ? await stopScreenShare() : await startScreenShare("none"); break;
            case "share-mic": currentIsScreenSharing ? await stopScreenShare() : await startScreenShare("mic"); break;
            case "share-system": currentIsScreenSharing ? await stopScreenShare() : await startScreenShare("system"); break;
            case ControlActionTypes.shareStop: await stopScreenShare(); break;
        }
    }, [disconnect, getLocalStream, broadcastStatus, navigate, startRecording, stopRecording, startScreenShare, stopScreenShare]);

    const userList = useMemo(() => {
        if (userContext.user == null) return [];
        const local = { id: userContext.user?.user, isMuted, isCameraOff, isLocal: true, speaking: speakers[userContext.user?.user] ?? false, };
        const remotes = users.filter(u => u !== userContext.user?.user).map(id => ({ id, isMuted: peerStatus[id]?.isMuted ?? false, isCameraOff: peerStatus[id]?.isCameraOff ?? false, isLocal: false, speaking: speakers[id] ?? false, }));
        return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
    }, [userContext.user?.user, users, isMuted, isCameraOff, speakers, peerStatus]);

    const userGridList = useMemo(() => {
        if (userContext.user == null) return [];
        const local = { id: userContext.user?.user, stream: getLocalStream() || undefined, isMuted, isCameraOff, isLocal: true, speaking: speakers[userContext.user?.user] ?? false };
        const remotes = users.filter(u => u !== userContext.user?.user).map(id => ({ id, stream: remoteStreams[id], isMuted: peerStatus[id]?.isMuted ?? false, isCameraOff: peerStatus[id]?.isCameraOff ?? false, isLocal: false, speaking: speakers[id] ?? false }));
        return [local, ...remotes].sort((a, b) => a.id.localeCompare(b.id));
    }, [userContext.user?.user, users, getLocalStream, remoteStreams, isMuted, isCameraOff, speakers, peerStatus]);

    const shareRef = useRef<HTMLVideoElement | null>(null);
    const activeStream = sharingBy ? remoteScreens[sharingBy] : null;
    useEffect(() => { if (shareRef.current) { shareRef.current.srcObject = activeStream; } }, [activeStream]);

    return (
        <div className="d-flex flex-column h-100 position-relative bg-dark text-white" data-bs-theme="dark">
            <main className="d-flex overflow-hidden" style={{ height: "calc(100% - 91px)" }}>
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
                                <SidebarContent isMobile={isMobile} activeSidebarTab={activeSidebarTab} setActiveSidebarTab={setActiveSidebarTab} setIsSidebarOpen={setIsSidebarOpen} userList={userList} botSpeaker={botSpeaker} sharingBy={sharingBy} chatMessages={chatMessages} sendChatMessage={sendChatMessage} localUserId={userContext.user?.user} />
                            </motion.aside>
                        )}
                    </AnimatePresence>
                )}
            </main>
            <footer className='border-top border-secondary flex-shrink-0' style={{ height: 90 }}>
                <Controls isRecordingLoading={isRecordingLoading} isSidebar={isSidebarOpen} performAction={performAction} status={isJoined ? "Connected" : "Connecting"} room={userContext.user == null ? "rr" : userContext.user?.room} isMuted={isMuted} isCameraOff={isCameraOff} isSharing={isScreenSharing} isSpeaking={speaking} isJoined={isJoined} isRecording={isRecording} />
            </footer>
            {isMobile && (
                <AnimatePresence>
                    {isSidebarOpen && (
                        <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: 'tween', duration: 0.3 }} className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column bg-dark" style={{ zIndex: 2000 }}>
                            <SidebarContent isMobile={isMobile} activeSidebarTab={activeSidebarTab} setActiveSidebarTab={setActiveSidebarTab} setIsSidebarOpen={setIsSidebarOpen} userList={userList} botSpeaker={botSpeaker} sharingBy={sharingBy} chatMessages={chatMessages} sendChatMessage={sendChatMessage} localUserId={userContext.user?.user} />
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    );
}
