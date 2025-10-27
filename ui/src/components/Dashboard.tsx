// src/pages/Dashboard/DashboardHome.tsx

import { useEffect, useState } from 'react';
import { FaCalendarAlt, FaFileAlt, FaPlay, FaPlus, FaUsers } from 'react-icons/fa';
import { FiMonitor } from 'react-icons/fi'; // New icon for Bot Management
import { useNavigate } from 'react-router-dom';
import { getMeetings } from '../services/api';
import type { Meeting, UserAndRoom } from '../types/meeting.types';
import { formatDate } from '../utils/Utilities';


interface DashboardProps {
    user: UserAndRoom;
}

// --- Placeholder Components (Skeletons) ---

const SkeletonCard = () => (
    <div className="p-4 rounded-3 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ background: 'var(--bs-secondary-bg)' }}>
        <div className="placeholder-glow d-flex flex-column">
            {/* Placeholder for Icon (to match the mb-3 spacing of the ActionCard icon) */}
            <div className="placeholder mb-3" style={{ width: '30px', height: '30px', borderRadius: '50%' }}></div>
            
            {/* Placeholder for Title */}
            <div className="placeholder w-75 mb-2" style={{ height: '24px' }}></div> 
        </div>
        <div className="placeholder-glow">
            {/* Placeholder for Button */}
            <div className="placeholder btn btn-secondary mt-3 w-100" style={{ height: '38px' }}></div>
        </div>
    </div>
);

const SkeletonUpcomingCard = () => (
    <div className="d-flex align-items-center justify-content-between p-3 rounded-3 placeholder-glow" style={{ background: 'var(--bs-secondary-bg)', borderLeft: '4px solid var(--bs-border-color)' }}>
        <div className="d-flex flex-column w-75">
            <span className="placeholder w-50 mb-1"></span>
            <div className="placeholder w-75 small"></div>
        </div>
        <div className="placeholder btn btn-sm btn-outline-primary" style={{ width: '60px', height: '31px' }}></div>
    </div>
);

const SkeletonOutcomeCard = () => (
    <div className="p-4 rounded-3 shadow-sm placeholder-glow" style={{ background: 'var(--bs-secondary-bg)' }}>
        <div className="placeholder w-50 fs-5 fw-semibold mb-3"></div>
        <div className="placeholder w-100 mb-2"></div>
        <div className="placeholder w-75 mb-3"></div>
        <div className="placeholder btn btn-sm btn-outline-primary" style={{ width: '120px', height: '31px' }}></div>
    </div>
);


const DashboardHome = ({ user }: DashboardProps) => {
    const navigate = useNavigate();
    // 0: Initial, 1: Loading, -1: Loaded/Error
    const [loading, setIsLoading] = useState(-1);
    const [upcomingMeetings, setMeetings] = useState<Meeting[]>([]);

    const fetchMeetings = async () => {
        setIsLoading(1);
        try {
            let d = await getMeetings()
            setMeetings([...d])
        } catch (error) {
            console.error("Failed to fetch meetings", error);
        } finally {
            setIsLoading(-1);
        }
    };

    useEffect(() => {
        fetchMeetings();
    }, [])

    const isLoading = loading != -1;

    const lastMeeting = {
        title: "Weekly Sync - 10/25",
        outcome: "Approved marketing budget for Q4 and assigned three new tasks.",
        notesLink: "#",
    };

    const handleJoinMeeting = (roomId: string) => {
        navigate(`/join?room=${roomId}&user=${user.user_name}`, { state: { initialAudioEnabled: true, initialVideoEnabled: true } });
    };

    return (
        <div className="p-4 p-md-5" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h1 className="fw-light mb-4">Welcome Back {user.user_name}!</h1>

            {/* --- 1. Action Panel --- */}
            <div className="row g-4 mb-5">
                {isLoading ? (
                    <>
                        {/* 4 skeletons for 4 cards */}
                        <div className="col-lg-3 col-md-6"><SkeletonCard /></div>
                        <div className="col-lg-3 col-md-6"><SkeletonCard /></div>
                        <div className="col-lg-3 col-md-6"><SkeletonCard /></div>
                        <div className="col-lg-3 col-md-6"><SkeletonCard /></div>
                    </>
                ) : (
                    <>
                        <ActionCard
                            title="Start/Join a Meeting"
                            icon={FaPlay}
                            buttonText="Start"
                            onClick={() => navigate("/join")}
                            color="var(--bs-success)"
                        />
                        <ActionCard
                            title="Manage My Meetings"
                            icon={FaPlus}
                            buttonText="Manage"
                            onClick={() => navigate("/meetings")}
                            color="var(--bs-primary)"
                        />
                        <ActionCard
                            title="Manage Participants"
                            icon={FaUsers}
                            buttonText="Manage"
                            onClick={() => navigate("/participants")}
                            color="var(--bs-info)"
                        />
                        {/* NEW BOT MANAGEMENT CARD */}
                        <ActionCard
                            title="Manage Meeting Bots"
                            icon={FiMonitor}
                            buttonText="Configure Bots"
                            onClick={() => navigate("/bots")}
                            color="var(--bs-warning)"
                        />
                    </>
                )}
            </div>

            {/* --- 2. Meeting Insights & Upcoming --- */}
            <div className="row g-5">
                {/* Upcoming Meetings */}
                <div className="col-lg-7">
                    <h2 className="fs-5 mb-4 d-flex align-items-center gap-2"><FaCalendarAlt /> Upcoming Meetings</h2>
                    <div className="d-flex flex-column gap-3">
                        {isLoading ? (
                            <>
                                <SkeletonUpcomingCard />
                                <SkeletonUpcomingCard />
                                <SkeletonUpcomingCard />
                            </>
                        ) : upcomingMeetings.length > 0 ? (
                            upcomingMeetings.map(m => (
                                <UpcomingCard key={m.id} meeting={m} onJoin={handleJoinMeeting} />
                            ))
                        ) : (
                            <p className="text-muted">No upcoming meetings scheduled.</p>
                        )}
                    </div>
                </div>

                {/* Last Meeting Outcome */}
                <div className="col-lg-5">
                    <h2 className="fs-5 mb-4 d-flex align-items-center gap-2"><FaFileAlt /> Last Meeting Notes</h2>
                    {isLoading ? (
                        <SkeletonOutcomeCard />
                    ) : (
                        <MeetingOutcomeCard lastMeeting={lastMeeting} />
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Sub-components for Dashboard ---

const ActionCard = ({ title, icon: Icon, buttonText, onClick, color }: any) => (
    // Updated grid sizing for 4 cards per row on large screens
    <div className="col-lg-3 col-md-6"> 
        <div className="p-4 rounded-3 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ background: 'var(--bs-secondary-bg)' }}>
            <div>
                <Icon size={30} style={{ color: color }} className="mb-3" />
                <h3 className="fs-5 fw-semibold">{title}</h3>
            </div>
            <button className="btn btn-sm mt-3 w-100 fw-bold" onClick={onClick} style={{ background: color, color: 'white' }}>
                {buttonText}
            </button>
        </div>
    </div>
);

const UpcomingCard = ({ meeting, onJoin }: any) => (
    <div className="d-flex align-items-center justify-content-between p-3 rounded-3" style={{ background: 'var(--bs-secondary-bg)', borderLeft: '4px solid var(--bs-primary)' }}>
        <div className="d-flex flex-column">
            <span className="fw-semibold">{meeting.subject}</span>
            <div className="text-muted small">{formatDate(meeting.date_time)} | <div className="d-inline-flex">
                {meeting.participants.slice(0, 3).map((p: any) => <span key={p.id} className="badge rounded-pill bg-secondary me-1">{p.name.split(' ').map((n: string) => n[0]).join('')}</span>)}
                {meeting.participants.length > 3 && <span className="badge rounded-pill border border-secondary">+{meeting.participants.length - 3}</span>}
            </div></div>
        </div>
        <button className="btn btn-sm btn-outline-primary fw-bold" onClick={() => onJoin(meeting.subject)}>
            Join
        </button>
    </div>
);

const MeetingOutcomeCard = ({ lastMeeting }: any) => (
    <div className="p-4 rounded-3 shadow-sm" style={{ background: 'var(--bs-secondary-bg)' }}>
        <h3 className="fs-5 fw-semibold mb-2 text-primary">{lastMeeting.title}</h3>
        <p className="text-muted small mb-3">{lastMeeting.outcome}</p>
        <a href={lastMeeting.notesLink} className="btn btn-sm btn-outline-primary">
            View Full Notes
        </a>
    </div>
);

export default DashboardHome;