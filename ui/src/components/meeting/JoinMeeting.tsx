import { useContext, useState, useCallback, useEffect } from 'react'; // **FIX**: Import useCallback
import { useLocation, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiVideo, FiLoader } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { UserContext } from '../../context/UserContext';
import DevicePreview from './DevicePreview'; // Import the preview component

export default function JoinMeeting() {
    const [roomId, setRoomId] = useState('');
    const [error, setError] = useState('');
    const [showPreview, setShowPreview] = useState(false); // State to control preview visibility
    const [devicePrefs, setDevicePrefs] = useState({ audioEnabled: true, videoEnabled: true }); // State for preferences
    const [isValidating, setIsValidating] = useState(false); // State for loading indicator
    const [prefDevice, setPrefDevice] = useState<{ audioDeviceId?: string, videoDeviceId?: string }>({ audioDeviceId: "", videoDeviceId: "" });
    const navigate = useNavigate();
    const userContext = useContext(UserContext);
    const customerSlug = userContext.user?.customer_slug || 'default';

    const handleInitialJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomId.trim()) { setError('Room ID cannot be empty.'); return; }
        setError(''); setIsValidating(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsValidating(false); setShowPreview(true);
    };

    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        let roomParam = params.get("room");
        if (roomParam) setRoomId(roomParam);
    }, [location.search])

    const handleFinalJoin = () => {
        if (userContext.user?.user_name) {
            let prefDeviceString = (typeof prefDevice != 'undefined') ? "&prefDeviceString=" + encodeURIComponent(JSON.stringify(prefDevice)) : "";
            navigate(`/${customerSlug}/meet?room=${encodeURIComponent(roomId.trim())}&user=${encodeURIComponent(userContext.user.user_name)}${prefDeviceString}`, {
                state: { initialAudioEnabled: devicePrefs.audioEnabled, initialVideoEnabled: devicePrefs.videoEnabled, }
            });
        } else {
            setError("User information is missing. Please log in again."); setShowPreview(false);
        }
    };

    const handlePreferencesChange = useCallback((prefs: { audioEnabled: boolean; videoEnabled: boolean }) => {
        setDevicePrefs(prefs);
    }, []); // Empty dependency array means the function is created only once

    return (
        <div className="container d-flex align-items-center justify-content-center" style={{ minHeight: 'calc(100vh - 60px)', padding: '20px 0' }}>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card border-secondary"
                style={{ maxWidth: '550px', width: '90%' }} // Wider card for preview
            >
                <div className="card-body p-4 p-md-5">
                    <AnimatePresence mode="wait">
                        {!showPreview ? (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 50 }}
                                transition={{ duration: 0.3 }}
                                className="text-center"
                            >
                                <FiVideo className="display-4 text-primary mx-auto mb-3" />
                                <h3 className="card-title">Join Meeting</h3>
                                <p className="card-text text-body-secondary mb-4">Enter the Room ID to join.</p>
                                <form onSubmit={handleInitialJoin} noValidate>
                                    <div className="mb-3">
                                        <input
                                            type="text"
                                            className={`form-control form-control-lg text-center ${error && 'is-invalid'}`}
                                            placeholder="Enter Room ID"
                                            value={roomId}
                                            onChange={(e) => {
                                                setRoomId(e.target.value);
                                                if (error) setError('');
                                            }}
                                            required
                                            aria-describedby="error-feedback"
                                        />
                                        {error && <div id="error-feedback" className="invalid-feedback d-block">{error}</div>}
                                    </div>
                                    <button type="submit" className="btn btn-primary w-100 btn-lg d-flex align-items-center justify-content-center gap-2" disabled={isValidating}>
                                        {isValidating ? <><FiLoader className="animate-spin me-2" /> Checking...</> : <>Next <FiArrowRight /></>}
                                    </button>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.3 }}
                            >
                                <h4 className="text-center mb-3 fw-bold">Check Your Audio & Video</h4>
                                <DevicePreview
                                    initialAudioEnabled={devicePrefs.audioEnabled}
                                    initialVideoEnabled={devicePrefs.videoEnabled}
                                    onPreferencesChange={handlePreferencesChange}
                                    onDeviceChange={setPrefDevice}
                                />
                                <div className="d-flex gap-2 mt-4">
                                    <button className="btn btn-secondary w-50" onClick={() => setShowPreview(false)}>Back</button>
                                    <button className="btn btn-success w-50" onClick={handleFinalJoin}>Join Now</button>
                                </div>
                                {error && <div className="alert alert-danger mt-3">{error}</div>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}