// src/pages/Meeting/MeetingFooter.tsx
import React from 'react';
import Controls from './Controls';
import { motion, AnimatePresence } from 'framer-motion';
import MeetingProgressBar from './MeetingProgressBar';
import type { MeetingProgress } from '../../hooks/useWebRTC';
import MeetingTimer from './MeetingTimer';

interface MeetingFooterProps {
  isRecordingLoading: boolean;
  isSidebar: boolean;
  performAction: (action: string) => void;
  status: string;
  room: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharing: boolean;
  isSpeaking: boolean;
  isJoined: boolean;
  isRecording: boolean;
  meetingProgress: MeetingProgress | null;
  isFullScreen: boolean;
}

const MeetingFooter: React.FC<MeetingFooterProps> = (props) => {
  return (
    // This footer is now the positioning context for the progress bar
    <footer
      className='flex-shrink-0 border-top'
      style={{ height: 90, position: 'relative' }}
    >
      <AnimatePresence>
        {props.meetingProgress && props.meetingProgress.tasks.length > 0 && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{
              position: 'absolute',
              top: 0, // Aligns to the top border of the footer
              left: 0,
              width: '100%',
              // This lifts the bar up by half its height to sit ON the border
              transform: 'translateY(-50%)',
              height: '20px',
              zIndex: 100, // Ensures it's above main content but below control popups
            }}
          >
            <MeetingProgressBar progress={props.meetingProgress} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The controls now take up the full height of the footer */}
      <div style={{ height: '100%' }}>
        <Controls
          {...props}
          timerComponent={
            props.meetingProgress?.start_time && props.meetingProgress?.end_time ? (
              <MeetingTimer
                startTime={props.meetingProgress.start_time}
                endTime={props.meetingProgress.end_time}
              />
            ) : null
          }
        />
      </div>
    </footer>
  );
};

export default MeetingFooter;