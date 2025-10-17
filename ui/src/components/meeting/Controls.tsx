import { AnimatePresence, motion } from "framer-motion";
import React, { useState } from "react";
import { BsEarbuds } from "react-icons/bs";
import { CgSpinner } from "react-icons/cg";
import { FiDisc, FiMic, FiMicOff, FiMoreVertical, FiPhoneOff, FiShare, FiVideo, FiVideoOff } from "react-icons/fi";
import { LuPanelRight, LuPanelRightClose } from "react-icons/lu";
import { PiTelevisionSimpleBold } from "react-icons/pi";
import type { MeetingProgress } from "../../hooks/useWebRTC";
import { ControlActionTypes } from "../../types/meeting.types";
import StatusPill from "./StatusPill";

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
    isRecordingLoading: boolean;
    timerComponent?: React.ReactNode;
    meetingProgress: MeetingProgress | null;
}

const MuteButton = React.memo(({ performAction, isMuted }: { performAction: (a: string) => void; isMuted: boolean }) => (
    <motion.button onClick={() => performAction(ControlActionTypes.mute)} aria-label={isMuted ? "Unmute" : "Mute"} className={`control-button ${isMuted ? 'active-toggle' : ''}`}>{isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}</motion.button>
));

const CameraButton = React.memo(({ performAction, isCameraOff }: { performAction: (a: string) => void; isCameraOff: boolean }) => (
    <motion.button onClick={() => performAction(ControlActionTypes.camera)} aria-label={isCameraOff ? "Turn on camera" : "Turn off camera"} className={`control-button ${isCameraOff ? 'active-toggle' : ''}`}>{isCameraOff ? <FiVideoOff size={20} /> : <FiVideo size={20} />}</motion.button>
));

const RecordButton = React.memo(({ performAction, isRecording, isRecordingLoading }: { performAction: (a: string) => void; isRecording: boolean, isRecordingLoading: boolean }) => (
    <motion.button
        onClick={() => performAction("record")}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
        className={`control-button ${isRecording ? 'recording-active' : ''}`}
        disabled={isRecordingLoading}
    >
        {isRecordingLoading ? <CgSpinner size={22} className="animate-spin" /> : <FiDisc size={20} />}
    </motion.button>
));

const EndCallButton = React.memo(({ performAction }: { performAction: (a: string) => void }) => (
    <motion.button onClick={() => performAction(ControlActionTypes.end)} aria-label="End call" className="control-button hang-up"><FiPhoneOff size={22} /></motion.button>
));

const SidebarButton = React.memo(({ performAction, isSidebar }: { performAction: (a: string) => void; isSidebar: boolean }) => (
    <motion.button onClick={() => performAction(ControlActionTypes.sidebar)} aria-label={isSidebar ? "Hide sidebar" : "Show sidebar"} className="control-button">{isSidebar ? <LuPanelRightClose size={22} /> : <LuPanelRight size={22} />}</motion.button>
));

const ShareButton = React.memo(({ isSharing, handleShare, menuVariants }: any) => {
    const [isShareMenuOpen, setShareMenuOpen] = useState(false);
    return (
        <div className="position-relative d-flex align-items-center">
            <motion.button onClick={() => { if (isSharing) { handleShare('none'); } else { setShareMenuOpen((v: boolean) => !v); } }} aria-label={isSharing ? "Stop sharing" : "Share screen"} className={`control-button ${isSharing ? 'active-toggle' : ''}`}>
                <FiShare size={20} />
            </motion.button>
            <AnimatePresence>
                {isShareMenuOpen && (
                    <motion.div className="share-dropdown-menu" variants={menuVariants} initial="hidden" animate="visible" exit="hidden">
                        <div className="share-dropdown-item" onClick={() => handleShare("none")}><PiTelevisionSimpleBold size={18} /> <span className="small">Share Screen</span></div>
                        <div className="share-dropdown-item" onClick={() => handleShare("mic")}><FiMic size={18} /> <span className="small">Share with Mic</span></div>
                        <div className="share-dropdown-item" onClick={() => handleShare("system")}><BsEarbuds size={18} /> <span className="small">Share with Audio</span></div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});


const Controls = ({ performAction, status, room, isMuted, isCameraOff, isSharing,
    isSpeaking, isSidebar, isRecording, isRecordingLoading, meetingProgress }: ControlsProps) => {
    const [isMoreMenuOpen, setMoreMenuOpen] = useState(false);

    const handleShare = (mode: "none" | "mic" | "system") => {
        performAction(isSharing ? ControlActionTypes.shareStop : `share-${mode}`);
    };

    const menuVariants = { hidden: { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15 } } };

    return (
        <>
            <style type="text/css">{`
                .controls-container {
                    width: 100%;
                    height: 100%;
                    display: flex; /* Use flex to center the content */
                    align-items: center;
                    padding: 0 1rem;
                    background-color: rgba(33, 37, 41, 0.6);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }
                .control-button { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; color: #e9ecef; background-color: #495057; transition: background-color 0.2s ease-in-out, transform 0.1s ease-in-out; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .control-button:hover { background-color: #6c757d; transform: scale(1.05); }
                .control-button:active { transform: scale(0.95); }
                .control-button.active-toggle { background-color: #007bff; }
                .control-button.hang-up { background-color: #dc3545; }
                .control-button.hang-up:hover { background-color: #c82333; }
                .share-dropdown-menu { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); width: 220px; background-color: #343a40; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); padding: 0.5rem 0; z-index: 1010; }
                .share-dropdown-item { display: flex; align-items: center; gap: 10px; padding: 0.75rem 1.25rem; color: #e9ecef; cursor: pointer; transition: background-color 0.15s ease-in-out; }
                .share-dropdown-item:hover { background-color: #495057; }
                .more-dropup-menu { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); background-color: #343a40; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; z-index: 1010; }
                .control-button.recording-active { background-color: #c82333; color: white; animation: pulse-red 1.5s infinite; }
                @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }
                @media (max-width: 767.98px) { .controls-container { padding: 0 0.75rem; } .control-button { width: 48px; height: 48px; } }
                .status-pill-container {
                  position: relative; /* For the alert icon */
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  border-radius: 50px;
                  padding: 6px 16px 6px 12px;
                  backdrop-filter: blur(10px);
                  -webkit-backdrop-filter: blur(10px);
                  border: 1px solid transparent;
                  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                  transition: background-color 0.5s ease, border-color 0.5s ease;
                }
                .status-pill-info { display: flex; align-items: center; gap: 10px; }
                .speaking-dot { display: flex; align-items: center; justify-content: center; transition: color 0.5s ease; }
                .room-name { font-weight: 600; font-size: 0.9rem; color: #fff; white-space: nowrap; }
                .connection-status { font-size: 0.75rem; color: rgba(255, 255, 255, 0.7); text-transform: capitalize; line-height: 1; }
                .status-pill-timer-wrapper { overflow: hidden; display: flex; }
                .time-over-alert {
                  position: absolute;
                  top: -5px;
                  right: -5px;
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  background-color: #dc3545;
                  color: white;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 0.7rem;
                  box-shadow: 0 0 0 4px rgba(33, 37, 41, 0.8);
                  animation: pulse-red-alert 1.5s infinite;
                }
                @keyframes pulse-red-alert { 
                  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
                  70% { transform: scale(1); box-shadow: 0 0 0 7px rgba(220, 53, 69, 0); }
                  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
                }
            `}</style>
            <div className="controls-container">
                <div className="w-100 d-flex align-items-center justify-content-between">
                    <div className="d-none d-md-flex align-items-center">
                        <StatusPill
                            room={room}
                            status={status}
                            isSpeaking={isSpeaking}
                            meetingProgress={meetingProgress}
                        />
                    </div>

                    <div className="d-none d-md-flex align-items-center justify-content-center flex-grow-1" style={{ gap: '1rem' }}>
                        <MuteButton performAction={performAction} isMuted={isMuted} />
                        <CameraButton performAction={performAction} isCameraOff={isCameraOff} />
                        <RecordButton isRecordingLoading={isRecordingLoading} performAction={performAction} isRecording={isRecording} />
                        <ShareButton isSharing={isSharing} handleShare={handleShare} menuVariants={menuVariants} />
                        <EndCallButton performAction={performAction} />
                    </div>

                    <div className="d-flex d-md-none align-items-center justify-content-center flex-grow-1" style={{ gap: '1rem' }}>
                        <StatusPill
                            room={room}
                            status={status}
                            isSpeaking={isSpeaking}
                            meetingProgress={meetingProgress}
                        />
                        <div className="d-flex align-items-center" style={{ gap: '0.5rem' }}>
                            <MuteButton performAction={performAction} isMuted={isMuted} />
                            <EndCallButton performAction={performAction} />
                            <div className="position-relative d-flex align-items-center">
                                <motion.button onClick={() => setMoreMenuOpen(!isMoreMenuOpen)} aria-label="More options" className="control-button"><FiMoreVertical size={22} /></motion.button>
                                <AnimatePresence>
                                    {isMoreMenuOpen && (
                                        <motion.div className="more-dropup-menu" variants={menuVariants} initial="hidden" animate="visible" exit="hidden">
                                            <CameraButton performAction={performAction} isCameraOff={isCameraOff} />
                                            <RecordButton isRecordingLoading={isRecordingLoading} performAction={performAction} isRecording={isRecording} />
                                            <ShareButton isSharing={isSharing} handleShare={handleShare} menuVariants={menuVariants} />
                                            <SidebarButton performAction={performAction} isSidebar={isSidebar} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        <EndCallButton performAction={performAction} />
                    </div>

                    <div className="d-none d-md-flex justify-content-end" style={{ minWidth: '200px' }}>
                        <SidebarButton performAction={performAction} isSidebar={isSidebar} />
                    </div>
                </div>
            </div>
        </>
    );
};

export default Controls;