import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { BsEarbuds } from "react-icons/bs";
import {
    FiDisc,
    FiMic,
    FiMicOff,
    FiMoreVertical, // Added for the mobile menu
    FiPhoneOff,
    FiShare,
    FiVideo,
    FiVideoOff,
} from "react-icons/fi";
import { LuPanelRight, LuPanelRightClose } from "react-icons/lu";
import { PiTelevisionSimpleBold } from "react-icons/pi";
import { ControlActionTypes } from "../types";

interface ControlsProps {
    performAction: (action: string) => void;
    status: string;
    room: string;
    isMuted: boolean;
    isCameraOff: boolean;
    isSharing: boolean;
    isSpeaking: boolean;
    isJoined: boolean;
    isSidebar: boolean;
    isRecording: boolean;
}

const Controls = ({
    performAction,
    status,
    room,
    isMuted,
    isCameraOff,
    isSharing,
    isSpeaking,
    isSidebar,
    isRecording,
}: ControlsProps) => {
    const [isShareMenuOpen, setShareMenuOpen] = useState(false);
    // --- START: State for the new mobile "More" menu ---
    const [isMoreMenuOpen, setMoreMenuOpen] = useState(false);
    // --- END: State for the new mobile "More" menu ---

    const handleShare = (mode: "none" | "mic" | "system") => {
        performAction(isSharing ? ControlActionTypes.shareStop : `share-${mode}`);
        setShareMenuOpen(false); // Close menu after selection
    };

    // Animation variants for the pill's background color
    const pillVariants = {
        disconnected: { backgroundColor: "#dc3545" /* Red */ },
        connected: { backgroundColor: "#28a745" /* Green */ },
        speaking: { backgroundColor: "#ffc107" /* Yellow */ },
    };

    const getPillState = () => {
        if (status !== "Connected") return "disconnected";
        return isSpeaking ? "speaking" : "connected";
    };

    // Animation targets and transitions for the speaking dot
    const speakingTransition = {
        duration: 1.2,
        repeat: Infinity,
        repeatType: "loop" as const,
        ease: "easeInOut" as const,
    };
    const idleTransition = { duration: 0.3, ease: "easeInOut" as const };
    const speakingDotAnimate = {
        scale: isSpeaking ? [1, 1.5, 1] : 1,
        backgroundColor: isSpeaking ? "#FFFFFF" : "#dee2e6",
    };

    // Animation variants for menus
    const menuVariants = {
        hidden: { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15 } },
    };


    // --- START: Reusable Control Button Components ---
    // To avoid repetition between mobile and desktop views, we define them once.

    const MuteButton = () => (
        <motion.button
            onClick={() => performAction(ControlActionTypes.mute)}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            className={`control-button ${isMuted ? 'active-toggle' : ''}`}
        >
            {isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}
        </motion.button>
    );

    const CameraButton = () => (
         <motion.button
            onClick={() => performAction(ControlActionTypes.camera)}
            aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
            className={`control-button ${isCameraOff ? 'active-toggle' : ''}`}
        >
            {isCameraOff ? <FiVideoOff size={20} /> : <FiVideo size={20} />}
        </motion.button>
    );

    const RecordButton = () => (
        <motion.button
            onClick={() => performAction("record")}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={`control-button ${isRecording ? 'hang-up' : ''}`}
        >
            <FiDisc size={20} />
        </motion.button>
    );

    const ShareButton = () => (
         <div className="position-relative d-flex align-items-center">
            <motion.button
                onClick={() => {
                    if (isSharing) handleShare('none');
                    else setShareMenuOpen(!isShareMenuOpen);
                }}
                aria-label={isSharing ? "Stop screen sharing" : "Share screen"}
                className={`control-button ${isSharing ? 'active-toggle' : ''}`}
            >
                <FiShare size={20} />
            </motion.button>
            <AnimatePresence>
                {isShareMenuOpen && (
                    <motion.div
                        className="share-dropdown-menu"
                        variants={menuVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                    >
                        <div className="share-dropdown-item" onClick={() => handleShare("none")}>
                            <PiTelevisionSimpleBold size={18} /> <span className="small">Share Screen</span>
                        </div>
                        <div className="share-dropdown-item" onClick={() => handleShare("mic")}>
                            <FiMic size={18} /> <span className="small">Share with Mic</span>
                        </div>
                        <div className="share-dropdown-item" onClick={() => handleShare("system")}>
                            <BsEarbuds size={18} /> <span className="small">Share with Audio</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const EndCallButton = () => (
        <motion.button
            onClick={() => performAction(ControlActionTypes.end)}
            aria-label="End call"
            className="control-button hang-up"
        >
            <FiPhoneOff size={22} />
        </motion.button>
    );

    const SidebarButton = () => (
        <motion.button
            onClick={() => performAction(ControlActionTypes.sidebar)}
            aria-label={isSidebar ? "Hide sidebar" : "Show sidebar"}
            className="control-button"
        >
            {isSidebar ? <LuPanelRightClose size={22} /> : <LuPanelRight size={22} />}
        </motion.button>
    );
    // --- END: Reusable Control Button Components ---


    return (
        <>
            <style type="text/css">
                {`
                .controls-container {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 1rem;
                    background-color: rgba(33, 37, 41, 0.6);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    z-index: 1000;
                }
                .control-button {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: none;
                    color: #e9ecef;
                    background-color: #495057;
                    transition: background-color 0.2s ease-in-out, transform 0.1s ease-in-out;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .control-button:hover {
                    background-color: #6c757d;
                    transform: scale(1.05);
                }
                .control-button:active {
                    transform: scale(0.95);
                }
                .control-button.active-toggle {
                    background-color: #007bff;
                }
                .control-button.hang-up {
                    background-color: #dc3545;
                }
                .control-button.hang-up:hover {
                    background-color: #c82333;
                }
                .share-dropdown-menu {
                    position: absolute;
                    bottom: calc(100% + 10px);
                    left: 50%;
                    transform: translateX(-50%);
                    width: 220px;
                    background-color: #343a40;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    padding: 0.5rem 0;
                    z-index: 1010;
                }
                .share-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 0.75rem 1.25rem;
                    color: #e9ecef;
                    cursor: pointer;
                    transition: background-color 0.15s ease-in-out;
                }
                .share-dropdown-item:hover {
                    background-color: #495057;
                }

                /* --- START: New Mobile Menu Styles --- */
                .more-dropup-menu {
                    position: absolute;
                    bottom: calc(100% + 10px);
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: #343a40;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    padding: 0.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    z-index: 1010;
                }
                /* --- END: New Mobile Menu Styles --- */

                @media (max-width: 767.98px) {
                    .controls-container {
                        padding: 0.75rem;
                    }
                    .control-button {
                        width: 48px;
                        height: 48px;
                    }
                }
                `}
            </style>

            <div className="controls-container">
                <div className="w-100 d-flex align-items-center justify-content-between">
                    {/* Left Status Pill (Visible on Desktop) */}
                    <div className="d-none d-md-flex align-items-center" style={{ minWidth: '200px' }}>
                        <motion.div
                            className="d-flex align-items-center gap-3 rounded-pill px-4 py-2 text-white shadow-sm"
                            variants={pillVariants}
                            animate={getPillState()}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        >
                            <motion.div
                                style={{ width: '12px', height: '12px', borderRadius: '50%' }}
                                animate={speakingDotAnimate}
                                transition={isSpeaking ? speakingTransition : idleTransition}
                            />
                            <div>
                                <div className="fw-bold small">{room}</div>
                                <div className="small text-white-50 text-capitalize">{status}</div>
                            </div>
                        </motion.div>
                    </div>

                    {/* --- START: Center Controls --- */}
                    {/* Desktop View: Full controls visible */}
                    <div className="d-none d-md-flex align-items-center justify-content-center" style={{ gap: '1rem' }}>
                        <MuteButton />
                        <CameraButton />
                        <RecordButton />
                        <ShareButton />
                        <EndCallButton />
                    </div>

                    {/* Mobile View: Minimal controls + "More" menu */}
                    <div className="d-flex d-md-none align-items-center justify-content-center w-100" style={{ gap: '1rem' }}>
                        <MuteButton />
                        <div className="position-relative d-flex align-items-center">
                             <motion.button
                                onClick={() => setMoreMenuOpen(!isMoreMenuOpen)}
                                aria-label="More options"
                                className="control-button"
                            >
                                <FiMoreVertical size={22} />
                            </motion.button>
                            <AnimatePresence>
                                {isMoreMenuOpen && (
                                    <motion.div
                                        className="more-dropup-menu"
                                        variants={menuVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                    >
                                        {/* Buttons are nested here for mobile */}
                                        <CameraButton />
                                        <RecordButton />
                                        <ShareButton />
                                        <SidebarButton />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <EndCallButton />
                    </div>
                    {/* --- END: Center Controls --- */}

                    {/* Right Sidebar Button (Visible on Desktop) */}
                    <div className="d-none d-md-flex justify-content-end" style={{ minWidth: '200px' }}>
                        <SidebarButton />
                    </div>
                </div>
            </div>
        </>
    );
};

export default Controls;
