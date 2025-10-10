import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    FiMic,
    FiMicOff,
    FiVideo,
    FiVideoOff,
    FiPhoneOff,
    FiShare,
} from "react-icons/fi";
import { LuPanelRight, LuPanelRightClose } from "react-icons/lu";
import { PiTelevisionSimpleBold } from "react-icons/pi";
import { BsEarbuds } from "react-icons/bs";
import { ControlActionTypes } from "../types"; // Ensure this path is correct

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
}

const Controls = ({
    performAction,
    status,
    room,
    isMuted,
    isCameraOff,
    isSharing,
    isSpeaking,
    isJoined,
    isSidebar,
}: ControlsProps) => {
    const [isShareMenuOpen, setShareMenuOpen] = useState(false);

    const handleShare = (mode: "none" | "mic" | "system") => {
        performAction(isSharing ? ControlActionTypes.shareStop : `share-${mode}`);
        setShareMenuOpen(false); // Close menu after selection
    };

    // --- Start of New Animations ---

    // 1. Define animation variants for the pill's background color
    const pillVariants = {
        disconnected: { backgroundColor: "#dc3545" /* Red */ },
        connected: { backgroundColor: "#28a745" /* Green */ },
        speaking: { backgroundColor: "#ffc107" /* Yellow */ },
    };

    // 2. Create logic to determine the current state of the pill
    const getPillState = () => {
        if (status !== "Connected") {
            return "disconnected";
        }
        return isSpeaking ? "speaking" : "connected";
    };

    // 3. Define transitions for the speaking dot
    const speakingTransition = {
        duration: 1.2,
        repeat: Infinity,
        repeatType: "loop" as const,
        ease: "easeInOut" as const,
    };
    const idleTransition = {
        duration: 0.3,
        ease: "easeInOut" as const,
    };

    // 4. Define animation targets for the speaking dot (color is now high-contrast)
    const speakingDotAnimate = {
        scale: isSpeaking ? [1, 1.5, 1] : 1,
        backgroundColor: isSpeaking ? "#FFFFFF" : "#dee2e6",
    };

    // --- End of New Animations ---

    const shareMenuVariants = {
        hidden: { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15 } },
    };

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
                @media (max-width: 767.98px) {
                    .controls-container {
                        padding: 0.75rem;
                    }
                    .control-button {
                        width: 44px;
                        height: 44px;
                    }
                    .main-controls-group {
                        gap: 0.5rem !important;
                    }
                    .share-dropdown-menu {
                        width: 190px;
                    }
                }
                `}
            </style>

            <div className="controls-container">
                <div className="w-100 d-flex align-items-center justify-content-center justify-content-md-between">
                    <div className="d-none d-md-flex align-items-center" style={{ minWidth: '200px' }}>
                        {/* The pill is now a motion.div to animate its background */}
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
                                <div className="small text-white-50 text-capitalize">
                                    {status}
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    <div className="d-flex align-items-center justify-content-center main-controls-group" style={{ gap: '1rem' }}>
                        <motion.button
                            onClick={() => performAction(ControlActionTypes.mute)}
                            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                            className={`control-button ${isMuted ? 'active-toggle' : ''}`}
                        >
                            {isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}
                        </motion.button>
                        <motion.button
                            onClick={() => performAction(ControlActionTypes.camera)}
                            aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                            className={`control-button ${isCameraOff ? 'active-toggle' : ''}`}
                        >
                            {isCameraOff ? <FiVideoOff size={20} /> : <FiVideo size={20} />}
                        </motion.button>
                        <div className="position-relative d-flex align-items-center">
                            <motion.button
                                onClick={() => {
                                    if (isSharing) {
                                        handleShare('none');
                                    } else {
                                        setShareMenuOpen(!isShareMenuOpen);
                                    }
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
                                        variants={shareMenuVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                        onBlur={() => setShareMenuOpen(false)}
                                        tabIndex={-1}
                                    >
                                        <div className="share-dropdown-item" onClick={() => handleShare("none")}>
                                            <PiTelevisionSimpleBold size={18} /> <span className="small">Share Screen Only</span>
                                        </div>
                                        <div className="share-dropdown-item" onClick={() => handleShare("mic")}>
                                            <FiMic size={18} /> <span className="small">Share with Microphone</span>
                                        </div>
                                        <div className="share-dropdown-item" onClick={() => handleShare("system")}>
                                            <BsEarbuds size={18} /> <span className="small">Share with System Audio</span>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <motion.button
                            onClick={() => performAction(ControlActionTypes.end)}
                            aria-label="End call"
                            className="control-button hang-up"
                        >
                            <FiPhoneOff size={22} />
                        </motion.button>
                    </div>

                    <div className="d-none d-md-flex justify-content-end" style={{ minWidth: '200px' }}>
                        <motion.button
                            onClick={() => performAction(ControlActionTypes.sidebar)}
                            aria-label={isSidebar ? "Hide participants sidebar" : "Show participants sidebar"}
                            className="control-button"
                        >
                            {isSidebar ? <LuPanelRightClose size={22} /> : <LuPanelRight size={22} />}
                        </motion.button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Controls;