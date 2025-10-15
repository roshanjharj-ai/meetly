// src/pages/StartMeeting.tsx
import { useState } from 'react';
import useMediaQuery from '../../hooks/useMediaQuery';
import type { UserAndRoom } from '../../types/meeting.types';
import SplitScreen from './SplitScreen';

interface StartMeetingProps {
    onLogin: (user: { name: string; email: string; room: string }) => void;
}

const StartMeeting = ({ onLogin }: StartMeetingProps) => {
    const [userNRoom, setUserNRoom] = useState<UserAndRoom>({
        room: "",
        user: "",
        email: "",
        password: ""
    });
    const isMobile = useMediaQuery("(max-width: 768px)");
    const [isLoading, setIsLoading] = useState(false);

    const joinRoom = () => {
        if (!userNRoom.user.trim() || !userNRoom.password?.trim()) {
            alert("Please enter both your user name and a password.");
            return;
        }
        setIsLoading(true);
        // Navigate after encoding components to ensure URL safety
        //navigate(`/meet?room=${encodeURIComponent(userNRoom.room)}&user=${encodeURIComponent(userNRoom.user)}`);
        onLogin({ name: userNRoom.user, email: "", room: userNRoom.room });
    };

    const loginForm = () => (
        <div className="card shadow-lg border-0 rounded-4">
            <div className="card-body p-4 p-md-5">
                <h2 className="card-title text-center fw-bold mb-4">Login</h2>
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
                            <label htmlFor="userName">User name</label>
                        </div>
                        <div className="form-floating">
                            <input
                                type="password"
                                id="password"
                                placeholder="Password"
                                value={userNRoom.password}
                                onChange={(e) => setUserNRoom((p) => ({ ...p, password: e.target.value }))}
                                className="form-control form-control-lg"
                                required
                            />
                            <label htmlFor="password">Password</label>
                        </div>
                        <button
                            type="submit"
                            className="w-100 btn btn-primary btn-lg mt-3"
                            disabled={isLoading || !userNRoom.user || !userNRoom.password}
                        >
                            {isLoading ? 'Loging in...' : 'Login'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )

    const loginScreen = () => {
        return (
            isMobile ?
                <div className={"container-fluid d-flex align-items-center justify-content-center min-vh-100"} style={{ background: "var(--background, #f8f9fa)" }}>
                    <div className="col-11 col-sm-10 col-md-8 col-lg-5 col-xl-4">
                        {loginForm()}
                    </div>
                </div> :
                loginForm()
        )
    }

    return (
        isMobile ?
            loginScreen() :
            <SplitScreen leftWidth={2} rightWidth={1}>
                <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center p-4" style={{ background: "var(--primary, #0d6efd)", color: "#fff" }}>
                    <h1 className="display-4 fw-bold mb-3">Welcome to Our Meeting App</h1>
                    <p className="lead mb-4">Connect with friends, family, and colleagues in high-quality video meetings.</p>
                    <img src="/meeting-illustration.png" alt="Meeting Illustration" className="img-fluid" style={{ maxHeight: '300px' }} />
                </div>
                {
                    loginScreen()
                }
            </SplitScreen>
    );
};

export default StartMeeting;