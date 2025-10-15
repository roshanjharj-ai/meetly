import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiVideo } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { UserContext } from '../../context/UserContext';

export default function JoinMeeting() {
    const [roomId, setRoomId] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const userContext = useContext(UserContext);

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        // Simple validation
        if (!roomId.trim()) {
            setError('Room ID cannot be empty.');
            return;
        }
        setError(''); // Clear any previous errors

        // Navigate to the meeting room with the provided ID
        //navigate(`/meet/${roomId.trim()}/user`);
        if (userContext.user != null)
            navigate(`/meet?room=${encodeURIComponent(roomId.trim())}&user=${encodeURIComponent(userContext.user.user)}`);
    };

    return (
        <div className="container d-flex align-items-center justify-content-center" style={{ minHeight: 'calc(100vh - 60px)' }}>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card bg-dark border-secondary text-center"
                style={{ maxWidth: '450px', width: '100%' }}
            >
                <div className="card-body p-4 p-md-5">
                    <FiVideo className="display-4 text-primary mx-auto mb-3" />
                    <h3 className="card-title">Join Meeting</h3>
                    <p className="card-text text-muted mb-4">Enter the Room ID to join an existing meeting.</p>

                    <form onSubmit={handleJoin} noValidate>
                        <div className="mb-3">
                            <input
                                type="text"
                                className={`form-control form-control-lg text-center ${error && 'is-invalid'}`}
                                placeholder="Enter Room ID"
                                value={roomId}
                                onChange={(e) => {
                                    setRoomId(e.target.value);
                                    if (error) setError(''); // Clear error on typing
                                }}
                                required
                                aria-describedby="error-feedback"
                            />
                            {error && <div id="error-feedback" className="invalid-feedback d-block">{error}</div>}
                        </div>
                        <button type="submit" className="btn btn-primary w-100 btn-lg d-flex align-items-center justify-content-center gap-2">
                            Join <FiArrowRight />
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}