// src/pages/MeetingHome.tsx
import DOMPurify from 'dompurify';
import { motion } from "framer-motion";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { FaCircle, FaMoon, FaRobot, FaSun } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import Controls from "../components/Controls";
import UserGrid from "../components/UserGrid";
import UserList from "../components/UserList"; // your existing list component (used in side panel)
import { BotNames } from "../Constants";
import { UserContext } from "../context/UserContext";
import { useWebRTC, type ChatMessagePayload } from "../hooks/useWebRTC";
import { ColorSchemes } from "../theme";
import { ControlActionTypes } from "../types";

/**
 * MeetingHome - final version
 * - center grid when no share
 * - big shared screen + right participant list when someone shares
 * - floating, draggable bot bubble bottom-left that pulses when botActive
 * - floating chat top-right (minimizable)
 * - floating auto-hide toolbar top-right
 */

export default function MeetingHome() {
    const userContext = useContext(UserContext);
    const navigate = useNavigate();

    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [viewMode, setViewMode] = useState<"grid" | "circle">("grid");
    const [isJoined, setIsJoined] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [toolbarHover, setToolbarHover] = useState(false);
    const [chatOpen, setChatOpen] = useState(true);
    const [isSidebar, showSidebar] = useState(false);
    const [botPanelOpen, setBotPanelOpen] = useState(false);

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
        // botActive,
        botSpeaker,
        peerStatus,
        sharedContent,
        speaking, // Local speaking status
        // --- NEW from hook ---
        isRecording,
        startRecording,
        stopRecording,
        speakers, // All speakers
    } = useWebRTC(userContext.user.room, userContext.user.user);

    // set CSS theme variables
    useEffect(() => {
        const colors = ColorSchemes[theme];
        const root = document.documentElement;
        Object.entries(colors).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
        root.setAttribute("data-theme", theme);
    }, [theme]);

    // join with fallback audio-only
    useEffect(() => {
        const start = async () => {
            try {
                await connect();
                setIsJoined(true);
            } catch (err) {
                console.warn("connect failed, attempting audio-only fallback", err);
                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                    await connect();
                    setIsJoined(true);
                } catch (err2) {
                    console.error("fallback connect failed", err2);
                }
            }
        };
        start();
        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    function leaveRoom() {
        disconnect();
        navigate("/");
    }

    const performAction = async (action: string) => {
        switch (action) {
            case "end":
                leaveRoom();
                break;
            case "mute":
                setIsMuted((prev) => {
                    const v = !prev;
                    getLocalStream()?.getAudioTracks().forEach((t: any) => (t.enabled = !v));
                    broadcastStatus({ isMuted: v, isCameraOff });
                    return v;
                });
                break;
            case ControlActionTypes.sidebar:
                showSidebar((p) => !p);
                break;
            case "camera":
                setIsCameraOff((prev) => {
                    const v = !prev;
                    getLocalStream()?.getVideoTracks().forEach((t: any) => (t.enabled = !v));
                    broadcastStatus({ isMuted, isCameraOff: v });
                    return v;
                });
                break;
            case "share":
                try {
                    if (isScreenSharing) await stopScreenShare();
                    else await startScreenShare();
                } catch (e) {
                    console.error("share error", e);
                }
                break;
            case "chat":
                setChatOpen((s) => !s);
                break;
            // --- NEW ACTION ---
            case "record":
                if (isRecording) stopRecording();
                else startRecording();
                break;
            case "share-none": startScreenShare("none"); break;
            case "share-mic": startScreenShare("mic"); break;
            case "share-system": startScreenShare("system"); break;
        }
    };

    // prepare user list for grid
    const userListForGrid = useMemo(() => {
        const local = {
            id: userContext.user.user,
            stream: getLocalStream() ?? undefined,
            isMuted,
            isCameraOff,
            isLocal: true,
            speaking: speakers[userContext.user.user] ?? false,
        };
        const remotes = users
            .filter((u) => u !== userContext.user.user)
            .map((id) => ({
                id,
                stream: remoteStreams[id],
                // --- BUG FIX: Use peerStatus for correct remote status ---
                isMuted: peerStatus[id]?.isMuted ?? false,
                isCameraOff: peerStatus[id]?.isCameraOff ?? false,
                isLocal: false,
                // --- NEW: Use speakers object for remote users ---
                speaking: speakers[id] ?? false,
            }));
        return [local, ...remotes];
    }, [userContext.user.user, users, remoteStreams, getLocalStream, isMuted, isCameraOff, speakers, peerStatus]);

    // active share
    const shareRef = useRef<HTMLVideoElement | null>(null);
    const activeSharer = sharingBy;
    const activeStream = activeSharer ? remoteScreens[activeSharer] : null;
    // const isSomeoneSharing = !!activeStream && activeSharer && activeSharer !== userContext.user.user;

    useEffect(() => {
        if (!shareRef.current) return;
        if (activeStream) {
            shareRef.current.srcObject = activeStream;
            shareRef.current.muted = true;
            shareRef.current.play().catch(() => { });
        } else {
            try {
                shareRef.current.srcObject = null;
            } catch { }
        }
    }, [activeStream]);

    function handleSendChatMessage(msg: ChatMessagePayload) {
        sendChatMessage(msg);
    }

    const [activeSidebarTab, setActiveSidebarTab] = useState<"chat" | "perticipants" | "settings">("perticipants")

    return (
        <div className="d-flex flex-column vh-100" style={{ background: "var(--background)", color: "var(--text)" }}>
            {/* Floating auto-hide toolbar */}
            <div style={{ position: "fixed", top: 12, left: 12, zIndex: 1700 }}
                onMouseEnter={() => setToolbarHover(true)} onMouseLeave={() => setToolbarHover(false)}>
                <motion.div initial={{ opacity: 0.12 }} animate={{ opacity: toolbarHover ? 1 : 0.12, x: toolbarHover ? 0 : -6 }} transition={{ duration: 0.18 }} style={{ display: "flex", gap: 8, padding: 6, borderRadius: 8, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(6px)" }}>
                    <button className="btn btn-sm btn-outline-light" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>{theme === "dark" ? <FaSun /> : <FaMoon />}</button>
                    <button className="btn btn-sm btn-outline-light" onClick={() => setViewMode((v) => (v === "grid" ? "circle" : "grid"))}><FaCircle /></button>
                    {/* <button className="btn btn-sm btn-outline-light" onClick={() => setChatOpen((s) => !s)}>Chat</button> */}
                </motion.div>
            </div>
            {/* Main area */}
            <div className="d-flex flex-row w-100 overflow-hidden" style={{ position: "relative", height: "calc(100% - 90px)" }}>
                {/* Center area */}
                <div className="w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ justifyContent: !activeStream ? "center" : "flex-start", alignItems: !activeStream ? "center" : "stretch", transition: "all 0.28s" }}>
                    {activeStream ? (
                        <motion.div className="w-100 h-100 d-flex align-items-center justify-content-center bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ borderRadius: 8, overflow: "hidden" }}>
                            <video ref={shareRef} autoPlay playsInline className="w-100 h-100" style={{ objectFit: "contain", background: "#000" }} />
                        </motion.div>
                    ) : sharedContent != "" ?
                        <div className="w-100 h-100 overflow-auto">
                            <div
                                className="bg-light rounded h-100 p-3 text-dark overflow-auto"
                                dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(sharedContent || "<p>No shared content</p>"),
                                }}
                            />
                        </div> :
                        (
                            <div style={{ width: "100%", maxWidth: 1200 }}>
                                <UserGrid users={userListForGrid} view={viewMode} />
                            </div>
                        )}
                </div>


                <div style={{ width: isSidebar ? 500 : 0, minWidth: 0, background: "var(--surface)", borderLeft: "1px solid rgba(255,255,255,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ padding: 8, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                        <ul className="nav nav-tabs">
                            <li className="nav-item">
                                <a onClick={() => { setActiveSidebarTab("perticipants") }} className={activeSidebarTab == "perticipants" ? "nav-link active" : "nav-link"} aria-current="page" href="#">Participants</a>
                            </li>
                            <li className="nav-item">
                                <a onClick={() => { setActiveSidebarTab("chat") }} className={activeSidebarTab == "chat" ? "nav-link active" : "nav-link"} href="#">Chat</a>
                            </li>
                            <li className="nav-item">
                                <a onClick={() => { setActiveSidebarTab("settings") }} className={activeSidebarTab == "settings" ? "nav-link active" : "nav-link"} href="#">Settings</a>
                            </li>
                        </ul>
                    </div>

                    <div className="h-100" style={{ padding: 8, flex: 1 }}>
                        {
                            activeSidebarTab == "perticipants" ?
                                <div style={{ overflowY: "auto", flex: 1 }}>
                                    <UserList
                                        botSpeaker={botSpeaker}
                                        users={users.map((id) => ({
                                            id,
                                            stream: remoteStreams[id],
                                            isMuted: peerStatus[id]?.isMuted ?? false,
                                            isCameraOff: peerStatus[id]?.isCameraOff ?? false,
                                            isLocal: id === userContext.user.user,
                                            speaking: false,
                                        }))}
                                        view={viewMode}
                                        excludeUserId={sharingBy}
                                    /> </div> :
                                activeSidebarTab == "chat" ?
                                    <ChatPanel messages={chatMessages} sendMessage={handleSendChatMessage} localUserId={userContext.user.user} className={chatOpen ? "" : "minimized"} /> :
                                    <div>Setting Tab</div>
                        }
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                <Controls isSidebar={isSidebar} performAction={(a: string) => performAction(a)} status={isJoined ? "Connected" : "Not connected"} room={userContext.user.room} isMuted={isMuted} isCameraOff={isCameraOff} isSharing={isScreenSharing} isSpeaking={speaking} isJoined={isJoined} isRecording={isRecording} />
            </div>

            {
                botPanelOpen && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ position: "fixed", left: 90, bottom: 12, zIndex: 1800, width: 320 }}>
                        <div style={{ background: "rgba(0,0,0,0.8)", color: "#fff", padding: 12, borderRadius: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <FaRobot /> <strong>Assistant</strong>
                                </div>
                                <button className="btn btn-sm btn-outline-light" onClick={() => setBotPanelOpen(false)}>Close</button>
                            </div>
                            <div style={{ maxHeight: 220, overflowY: "auto" }}>
                                {chatMessages.filter(m => (window as any).__BOT_NAMES__?.map((b: string) => b.toLowerCase()).includes(m.from?.toLowerCase()) || BotNames.map(b => b.toLowerCase()).includes(m.from?.toLowerCase())).slice(-10).map(m => (
                                    <div key={m.id} style={{ marginBottom: 8, padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                                        <div style={{ fontWeight: 700 }}>{m.from}</div>
                                        {m.text && <div>{m.text}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )
            }
        </div >
    );
}
