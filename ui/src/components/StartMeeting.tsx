// src/pages/StartMeeting.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserAndRoom } from '../types';

const StartMeeting = () => {
    const [userNRoom, setUserNRoom] = useState<UserAndRoom>({
        room: "",
        user: ""
    });
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const joinRoom = () => {
        if (!userNRoom.user.trim() || !userNRoom.room.trim()) {
            alert("Please enter both your name and a room name.");
            return;
        }
        setIsLoading(true);
        // Navigate after encoding components to ensure URL safety
        navigate(`/meet?room=${encodeURIComponent(userNRoom.room)}&user=${encodeURIComponent(userNRoom.user)}`);
    };

    return (
        <div className="container-fluid d-flex align-items-center justify-content-center min-vh-100" style={{ background: "var(--background, #f8f9fa)" }}>
            <div className="col-11 col-sm-10 col-md-8 col-lg-5 col-xl-4">
                <div className="card shadow-lg border-0 rounded-4">
                    <div className="card-body p-4 p-md-5">
                        <h2 className="card-title text-center fw-bold mb-4">Join Meeting</h2>
                        <form onSubmit={(e) => { e.preventDefault(); joinRoom(); }}>
                            <div className="d-flex flex-column gap-3">
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        id="userName"
                                        placeholder="Your name"
                                        value={userNRoom.user}
                                        onChange={(e) => setUserNRoom((p) => ({ ...p, user: e.target.value }))}
                                        className="form-control form-control-lg"
                                        required
                                    />
                                    <label htmlFor="userName">Your name</label>
                                </div>
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        id="roomName"
                                        placeholder="Room name"
                                        value={userNRoom.room}
                                        onChange={(e) => setUserNRoom((p) => ({ ...p, room: e.target.value }))}
                                        className="form-control form-control-lg"
                                        required
                                    />
                                    <label htmlFor="roomName">Room name</label>
                                </div>
                                <button
                                    type="submit"
                                    className="w-100 btn btn-primary btn-lg mt-3"
                                    disabled={isLoading || !userNRoom.user || !userNRoom.room}
                                >
                                    {isLoading ? 'Joining...' : 'Join Room'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StartMeeting;