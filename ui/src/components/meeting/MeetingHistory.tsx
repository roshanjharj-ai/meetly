// src/components/MeetingHistory.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { FaCalendarCheck, FaClock, FaCommentDots, FaHistory, FaSpinner } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import useMediaQuery from '../../hooks/useMediaQuery';
import { getMeetings } from '../../services/api'; // Using existing meetings API
import type { Meeting } from '../../types/meeting.types';
import { formatDate } from '../../utils/Utilities';

interface MeetingHistoryProps {
    user: { id: number; email: string; user_name: string };
}

// Mock structure for demonstration
interface MeetingHistoryEntry extends Meeting {
    meeting_link: string;
    duration_minutes: number;
    tasks_created: number; // For performance metrics
}

const MeetingHistory: React.FC<MeetingHistoryProps> = ({ user }) => {
    const navigate = useNavigate();
    const isMobile = useMediaQuery("(max-width: 767.98px)");

    const [history, setHistory] = useState<MeetingHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMeetingHistory = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Use the existing API, which is scoped to the current customer/user
            const rawMeetings: Meeting[] = await getMeetings();

            // Filter for past meetings and enrich with mock data (since API doesn't return duration/tasks yet)
            const enrichedHistory: MeetingHistoryEntry[] = rawMeetings
                .filter(m => new Date(m.dateTime) < new Date())
                .map(m => ({
                    ...m,
                    meeting_link: m.meetingLink || 'N/A',
                    duration_minutes: 30 + Math.floor(Math.random() * 60),
                    tasks_created: Math.floor(Math.random() * 5),
                }))
                .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()); // Sort newest first

            setHistory(enrichedHistory);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to load meeting history.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMeetingHistory();
    }, [fetchMeetingHistory]);

    // --- Performance Metrics ---
    const totalMeetings = history.length;
    const totalDuration = history.reduce((sum, m) => sum + m.duration_minutes, 0);
    const totalTasks = history.reduce((sum, m) => sum + m.tasks_created, 0);

    const handleViewChat = (roomId: string, subject: string) => {
        // You would need a dedicated chat viewer component, or navigate to a meeting review page.
        alert(`Navigating to persistent chat for: ${subject} (Room: ${roomId})`);
        // Example: navigate(`/${user.customer_slug}/chat-review/${roomId}`);
    };


    return (
        <div className="p-4 p-md-5" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h1 className="fw-light mb-4 d-flex align-items-center gap-2"><FaHistory /> Your Meeting History</h1>

            {error && <div className="alert alert-danger">Error: {error}</div>}

            {/* --- Stats Cards --- */}
            <div className="row g-4 mb-5">
                <StatCard icon={FaCalendarCheck} title="Meetings Attended" value={totalMeetings} color="var(--bs-primary)" />
                <StatCard icon={FaClock} title="Total Duration (Hours)" value={(totalDuration / 60).toFixed(1)} color="var(--bs-info)" />
                <StatCard icon={FaCommentDots} title="Tasks Created by Bot" value={totalTasks} color="var(--bs-success)" />
            </div>

            {/* --- History Table --- */}
            <div className="card shadow-sm p-4">
                <h2 className="fs-5 fw-semibold mb-3">Past Meetings ({totalMeetings})</h2>

                {isLoading ? (
                    <div className="text-center p-5"><FaSpinner className="spinner-border" size={30} /> Loading History...</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-light">
                                <tr>
                                    <th>Subject</th>
                                    <th>Date/Time</th>
                                    <th>Type</th>
                                    <th>Participants</th>
                                    <th>Duration</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.length > 0 ? history.map(m => (
                                    <tr key={m.id}>
                                        <td>**{m.subject}**</td>
                                        <td>{formatDate(m.dateTime)}</td>
                                        <td>{m.meeting_type}</td>
                                        <td>{m.participants.length}</td>
                                        <td>{m.duration_minutes} min</td>
                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-outline-secondary"
                                                onClick={() => handleViewChat(m.meeting_link, m.subject)}
                                                title="View Chat Transcript"
                                            >
                                                <FaCommentDots /> Chat
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="text-center text-muted p-4">
                                            No past meetings recorded.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Sub-Component: StatCard ---
const StatCard = ({ icon: Icon, title, value, color }: any) => (
    <div className="col-lg-4 col-md-6">
        <div className="p-4 rounded-3 shadow-sm d-flex align-items-center" style={{ background: 'var(--bs-secondary-bg)', borderLeft: `5px solid ${color}` }}>
            <div className="me-3 p-3 rounded-circle" style={{ background: color, color: 'white' }}>
                <Icon size={24} />
            </div>
            <div>
                <div className="text-muted small">{title}</div>
                <h3 className="fs-4 fw-bold mb-0">{value}</h3>
            </div>
        </div>
    </div>
);


export default MeetingHistory;