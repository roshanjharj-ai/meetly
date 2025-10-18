// src/pages/Meeting/StatusPill.tsx
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MeetingTimer from './MeetingTimer';
import type { MeetingProgress } from '../../hooks/useWebRTC';
import { FaCircle, FaExclamationTriangle } from 'react-icons/fa';

interface StatusPillProps {
  room: string;
  status: string;
  isSpeaking: boolean;
  meetingProgress: MeetingProgress | null;
}

const StatusPill: React.FC<StatusPillProps> = ({ room, status, isSpeaking, meetingProgress }) => {
  const pillVariants = {
    disconnected: { backgroundColor: "rgba(220, 53, 69, 0.85)", borderColor: "rgba(255, 255, 255, 0.1)" },
    connected: { backgroundColor: "rgba(40, 167, 69, 0.85)", borderColor: "rgba(255, 255, 255, 0.1)" },
    speaking: { backgroundColor: "rgba(255, 193, 7, 0.85)", borderColor: "rgba(255, 255, 255, 0.2)" },
  };

  const getPillState = () => {
    if (status !== "Connected") return "disconnected";
    return isSpeaking ? "speaking" : "connected";
  };

  const speakingDotAnimate = {
    scale: isSpeaking ? [1, 1.4, 1] : 1,
    color: isSpeaking ? "#fff" : "#6c757d",
  };

  const isTimeOver = useMemo(() => {
    if (!meetingProgress?.end_time) return false;
    return new Date().getTime() > new Date(meetingProgress.end_time).getTime();
  }, [meetingProgress?.end_time, isSpeaking]); // Re-check when speaking to refresh timer state

  return (
    <motion.div
      className="status-pill-container"
      variants={pillVariants}
      animate={getPillState()}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <div className="status-pill-info">
        <motion.div
          className="speaking-dot"
          animate={speakingDotAnimate}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <FaCircle size={8} />
        </motion.div>
        <div>
          <div className="room-name">{room}</div>
          <div className="connection-status">{status}</div>
        </div>
      </div>
      
      <AnimatePresence>
        {meetingProgress?.start_time && meetingProgress?.end_time && (
          <motion.div
            className="status-pill-timer-wrapper"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <MeetingTimer
              startTime={meetingProgress.start_time}
              endTime={meetingProgress.end_time}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTimeOver && (
          <motion.div
            className="time-over-alert"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <FaExclamationTriangle />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StatusPill;