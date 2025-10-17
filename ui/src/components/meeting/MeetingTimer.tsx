// src/pages/Meeting/MeetingTimer.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiClock, FiAlertTriangle } from 'react-icons/fi';
import './MeetingTimer.css';
import useMediaQuery from '../../hooks/useMediaQuery';

interface MeetingTimerProps {
    startTime: string;
    endTime: string;
}

const MeetingTimer: React.FC<MeetingTimerProps> = ({ startTime, endTime }) => {
    const [now, setNow] = useState(Date.now());
    const isMobile = useMediaQuery("(max-width: 767.98px)");

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const { percentage, status, text } = useMemo(() => {
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const total = end - start;
        const elapsed = Math.max(0, now - start);
        const remaining = Math.max(0, end - now);
        const pct = total > 0 ? (elapsed / total) * 100 : 0;

        let currentStatus = 'ontime';
        if (pct > 85) currentStatus = 'warning';
        if (pct >= 100) currentStatus = 'over';

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const timeText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        return { percentage: pct, status: currentStatus, text: timeText };
    }, [now, startTime, endTime]);

    const timerContent = (
        <>
            <div className={`timer-icon ${status}`}>
                {status === 'over' ? <FiAlertTriangle /> : <FiClock />}
            </div>
            <div className="timer-text">{text}</div>
        </>
    );

    if (isMobile) {
        return (
            <div className={`meeting-timer-abstract ${status}`}>
                {timerContent}
            </div>
        );
    }

    return (
        <div className={`meeting-timer-full ${status}`}>
            {timerContent}
            <div className="timer-track">
                <motion.div
                    className="timer-fill"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

export default MeetingTimer;