// src/pages/Meeting/MeetingHome.tsx
import React, { useContext, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Spinner from '../../components/shared/Spinner';
import { UserContext } from '../../context/UserContext';
import MeetingCore from './MeetingCore';

const MeetingHome: React.FC = () => {
    // **FIX**: Get theme from the context
    const { user, isLoading: isUserLoading, theme } = useContext(UserContext);
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const [room, setRoom] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [initialAudioEnabled, setInitialAudioEnabled] = useState<boolean>(true);
    const [initialVideoEnabled, setInitialVideoEnabled] = useState<boolean>(true);

    useEffect(() => {
        const urlRoom = searchParams.get("room");
        const urlUser = searchParams.get("user");

        if (!urlRoom) {
            setError("Room ID is missing from the URL.");
            return;
        }
        setRoom(urlRoom);

        // Determine user name (same logic as before)
        if (!isUserLoading && user?.user_name) {
            setUserName(user.user_name);
        } else if (urlUser) {
            setUserName(urlUser);
        } else if (!isUserLoading && !user) {
            setError("User not logged in.");
        } else if (!isUserLoading && !user?.user_name && !urlUser) {
            setError("User name could not be determined.");
        }

        // **FIX**: Read initial device state from location.state passed by JoinMeeting
        // Provide defaults if state is not present (e.g., direct navigation)
        const navState = location.state as { initialAudioEnabled?: boolean; initialVideoEnabled?: boolean } | null;
        setInitialAudioEnabled(navState?.initialAudioEnabled ?? true);
        setInitialVideoEnabled(navState?.initialVideoEnabled ?? true);
        console.log("MeetingHome received initial prefs:", navState); // For debugging

    }, [searchParams, user, isUserLoading, location.state]);

    // --- Loading State ---
    if (isUserLoading || !room || !userName) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100">
                <Spinner /> Loading meeting...
            </div>
        );
    }

    // --- Error State ---
    if (error) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 flex-column">
                <p className="text-danger mb-3">{error}</p>
                <button className="btn btn-primary" onClick={() => window.location.href = '/'}>Go Home</button>
            </div>
        );
    }

    // --- Ready State ---
    const userEmail = user?.email || '';

    // **FIX**: Pass the theme prop down to MeetingCore
    return <MeetingCore room={room} userName={userName} email={userEmail} theme={theme} initialAudioEnabled={initialAudioEnabled}
        initialVideoEnabled={initialVideoEnabled} />;
};

export default MeetingHome;