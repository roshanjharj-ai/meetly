// src/pages/Meeting/PreJoinMeeting.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiAlertCircle, FiLoader, FiLock, FiMoon, FiSun } from 'react-icons/fi';
import { useLocation } from 'react-router-dom';
import * as z from 'zod';
import { UserContext } from '../../context/UserContext';
import { validateJoinRequest, verifyJoinCode } from '../../services/api';
import DevicePreview from './DevicePreview';
import MeetingCore from './MeetingCore'; // **FIX**: Import the core meeting component

// Validation schema for the code input
const codeSchema = z.object({
    code: z.string().length(6, { message: 'Code must be 6 characters' }),
});
type CodeFormData = z.infer<typeof codeSchema>;

// Marketing text animation
const marketingTexts = [
    "Connecting securely...", "Preparing your meeting experience...", "Checking participant list...",
    "Initializing audio & video...", "Almost there!",
];

const PreJoinMeeting: React.FC = () => {
    const location = useLocation();
    const { theme, toggleTheme } = useContext(UserContext); // Get theme and toggle function

    const [userName, setUserName] = useState('');
    const [email, setEmail] = useState('');
    const [room, setRoom] = useState('');
    const [step, setStep] = useState<'validating' | 'awaiting_code' | 'verifying'>('validating');
    const [error, setError] = useState<string | null>(null);
    const [marketingIndex, setMarketingIndex] = useState(0);
    const [devicePrefs, setDevicePrefs] = useState({ audioEnabled: true, videoEnabled: true });
    // **FIX**: State to control rendering MeetingCore
    const [isVerified, setIsVerified] = useState(false);

    const { register, handleSubmit, formState: { errors: codeErrors } } = useForm<CodeFormData>({
        resolver: zodResolver(codeSchema),
    });

    // Extract info from URL on mount
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        setUserName(params.get('user') || '');
        setEmail(params.get('email') || '');
        setRoom(params.get('room') || '');
        setIsVerified(false); // Reset verification status if URL changes
    }, [location.search]);

    // Handle initial validation request
    useEffect(() => {
        // Only run if email/room are set and we are in the initial validation step
        if (email && room && step === 'validating' && !isVerified) {
            const requestValidation = async () => {
                setError(null);
                try {
                    const response = await validateJoinRequest({ email, room, user_name: userName });
                    console.log("Validation request successful:", response.message);
                    setStep('awaiting_code');
                } catch (err: any) {
                    console.error("Validation request failed:", err);
                    setError(err.response?.data?.detail || 'Failed to validate meeting join request. Check room ID and email.');
                    // Don't reset step, let the error show
                }
            };
            // Add a small delay to allow URL params to fully set state
            const timer = setTimeout(requestValidation, 100);
            return () => clearTimeout(timer);
        }
    }, [email, room, userName, step, isVerified]); // Added isVerified dependency

    // Animate marketing text
    useEffect(() => {
        if (step === 'validating') { // Only show marketing text during initial validation
            const interval = setInterval(() => {
                setMarketingIndex(prev => (prev + 1) % marketingTexts.length);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [step]);

    // Handle code verification
    const onCodeSubmit = async (data: CodeFormData) => {
        setStep('verifying');
        setError(null);
        try {
            const response = await verifyJoinCode({ email, room, code: data.code });
            if (response.valid) {
                // **FIX**: Set state to true to render MeetingCore instead of navigating
                setIsVerified(true);
                // Optionally store the meetingToken if your MeetingCore needs it
                // sessionStorage.setItem('meetingToken', response.token);
            } else {
                setError(response.message || 'Invalid verification code.');
                setStep('awaiting_code');
            }
        } catch (err: any) {
            console.error("Code verification failed:", err);
            setError(err.response?.data?.detail || 'Failed to verify code.');
            setStep('awaiting_code');
        }
    };

    const handlePreferencesChange = useCallback((prefs: { audioEnabled: boolean; videoEnabled: boolean }) => {
     setDevicePrefs(prefs);
  }, []);

    // **FIX**: Conditionally render MeetingCore if verified
    if (isVerified) {
        return (
            <MeetingCore
                room={room}
                userName={userName || email} // Use email as fallback username if needed
                email={email}
                theme={theme}
                initialAudioEnabled={devicePrefs.audioEnabled}
                initialVideoEnabled={devicePrefs.videoEnabled}
            />
        );
    }

    // Render the pre-join UI otherwise
    return (
        <div className="container-fluid d-flex justify-content-center align-items-center position-relative" style={{ minHeight: '100vh', padding: '20px' }}>
            <style>{`
          .prejoin-card { max-width: 550px; width: 100%; z-index: 1; }
          .loading-container { min-height: 200px; }
          .marketing-text { font-size: 1.1rem; font-weight: 500; }
          .theme-toggle-prejoin {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 40px; height: 40px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background-color: var(--bs-secondary-bg);
            border: 1px solid var(--bs-border-color);
            color: var(--bs-secondary-color);
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 0 0 0 rgba(var(--bs-primary-rgb), 0);
            z-index: 10;
          }
          .theme-toggle-prejoin:hover {
            color: var(--bs-primary);
            box-shadow: 0 0 0 5px rgba(var(--bs-primary-rgb), 0.3);
          }
       `}</style>

            {/* **FIX**: Add Theme Toggle Button */}
            <motion.button
                className="theme-toggle-prejoin"
                onClick={toggleTheme}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Switch Theme"
            >
                {theme === 'dark' ? <FiSun size={18} /> : <FiMoon size={18} />}
            </motion.button>

            <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="card prejoin-card card-body p-4 rounded-4 border-0 shadow-lg"
            >
                <h4 className="text-center mb-4 fw-bold">Joining: <span className="text-primary">{room}</span></h4>

                {step === 'validating' && (
                    <div className="text-center loading-container d-flex flex-column justify-content-center align-items-center">
                        <FiLoader size={30} className="text-primary animate-spin mb-3" />
                        <AnimatePresence mode="wait">
                            <motion.p
                                key={marketingIndex}
                                className="marketing-text text-body-secondary"
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.5 }}
                            >
                                {marketingTexts[marketingIndex]}
                            </motion.p>
                        </AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="alert alert-danger d-flex align-items-center mt-3" role="alert">
                                <FiAlertCircle className="me-2" /> {error}
                            </motion.div>
                        )}
                    </div>
                )}

                {(step === 'awaiting_code' || step === 'verifying') && (
                    <>
                        <p className="text-center text-body-secondary mb-3">
                            A verification code has been sent to <strong className="text-primary">{email}</strong>. Check your inbox and enter it below.
                        </p>
                        <DevicePreview
                            initialAudioEnabled={devicePrefs.audioEnabled}
                            initialVideoEnabled={devicePrefs.videoEnabled}
                            onPreferencesChange={handlePreferencesChange}
                        />
                        <form onSubmit={handleSubmit(onCodeSubmit)} className="mt-4">
                            <div className="form-floating mb-3">
                                <input
                                    type="text"
                                    inputMode="numeric" // Helps mobile users get numeric keyboard
                                    pattern="{6}" // Basic pattern matching
                                    autoComplete="one-time-code" // Helps with autofill
                                    id="code"
                                    placeholder="Verification Code"
                                    maxLength={6}
                                    className={`form-control form-control-lg text-center ${codeErrors.code ? 'is-invalid' : ''}`}
                                    {...register('code')}
                                    disabled={step === 'verifying'}
                                />
                                <label htmlFor="code"><FiLock className="me-2" /> 6-Digit Code</label>
                                {codeErrors.code && <div className="invalid-feedback text-center">{codeErrors.code.message}</div>}
                            </div>
                            {error && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="alert alert-danger d-flex align-items-center mb-3" role="alert">
                                    <FiAlertCircle className="me-2" /> {error}
                                </motion.div>
                            )}
                            <motion.button
                                type="submit"
                                className="btn btn-primary w-100 btn-lg d-flex align-items-center justify-content-center"
                                disabled={step === 'verifying'}
                                whileTap={{ scale: 0.98 }}
                            >
                                {step === 'verifying' ? <><FiLoader className="animate-spin me-2" /> Verifying...</> : 'Verify & Join Meeting'}
                            </motion.button>
                        </form>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default PreJoinMeeting;