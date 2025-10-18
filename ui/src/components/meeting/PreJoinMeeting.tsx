// src/pages/Meeting/PreJoinMeeting.tsx
import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiLock, FiLoader, FiAlertCircle } from 'react-icons/fi';
import { UserContext } from '../../context/UserContext';
import DevicePreview from './DevicePreview';
import { validateJoinRequest, verifyJoinCode } from '../../services/api'; // Assume these exist

// Validation schema for the code input
const codeSchema = z.object({
  code: z.string().length(6, { message: 'Code must be 6 characters' }),
});
type CodeFormData = z.infer<typeof codeSchema>;

// Marketing text animation
const marketingTexts = [
  "Connecting securely...",
  "Preparing your meeting experience...",
  "Checking participant list...",
  "Initializing audio & video...",
  "Almost there!",
];

const PreJoinMeeting: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useContext(UserContext); // Get theme for styling

  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [room, setRoom] = useState('');
  const [step, setStep] = useState<'validating' | 'awaiting_code' | 'verifying'>('validating');
  const [error, setError] = useState<string | null>(null);
  const [marketingIndex, setMarketingIndex] = useState(0);
  const [devicePrefs, setDevicePrefs] = useState({ audioEnabled: true, videoEnabled: true });

  const { register, handleSubmit, formState: { errors: codeErrors } } = useForm<CodeFormData>({
    resolver: zodResolver(codeSchema),
  });

  // Extract info from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setUserName(params.get('user') || '');
    setEmail(params.get('email') || '');
    setRoom(params.get('room') || '');
  }, [location.search]);

  // Handle initial validation request
  useEffect(() => {
    if (email && room && step === 'validating') {
      const requestValidation = async () => {
        setError(null);
        try {
          const response = await validateJoinRequest({ email, room, user_name: userName });
          console.log("Validation request successful:", response.message);
          setStep('awaiting_code');
        } catch (err: any) {
          console.error("Validation request failed:", err);
          setError(err.response?.data?.detail || 'Failed to validate meeting join request.');
          setStep('validating'); // Stay on validating step if error
        }
      };
      requestValidation();
    }
  }, [email, room, userName, step]);

  // Animate marketing text
  useEffect(() => {
    if (step === 'validating' || step === 'awaiting_code') {
      const interval = setInterval(() => {
        setMarketingIndex(prev => (prev + 1) % marketingTexts.length);
      }, 3000); // Change text every 3 seconds
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
        // Success! Navigate to the actual meeting room
        // Pass device preferences via state or query params
        navigate(`/meet?room=${encodeURIComponent(room)}&user=${encodeURIComponent(userName || email)}`, {
          state: {
            audioEnabled: devicePrefs.audioEnabled,
            videoEnabled: devicePrefs.videoEnabled,
            // meetingToken: response.token // If using a meeting-specific token
          }
        });
      } else {
        setError(response.message || 'Invalid verification code.');
        setStep('awaiting_code'); // Go back to code input
      }
    } catch (err: any) {
      console.error("Code verification failed:", err);
      setError(err.response?.data?.detail || 'Failed to verify code.');
      setStep('awaiting_code');
    }
  };

  const handlePreferencesChange = (prefs: { audioEnabled: boolean; videoEnabled: boolean }) => {
     setDevicePrefs(prefs);
  };

  return (
    <div className="container-fluid d-flex justify-content-center align-items-center" style={{ minHeight: '100vh', padding: '20px' }}>
       <style>{`
          .prejoin-card { max-width: 550px; width: 100%; }
          .loading-container { min-height: 150px; }
          .marketing-text { font-size: 1.1rem; font-weight: 500; }
       `}</style>
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card prejoin-card card-body p-4 rounded-4 border-0 shadow-lg"
      >
        <h4 className="text-center mb-4 fw-bold">Joining: {room}</h4>

        {step === 'validating' && (
          <div className="text-center loading-container d-flex flex-column justify-content-center align-items-center">
             <FiLoader size={30} className="text-primary animate-spin mb-3" />
            <AnimatePresence mode="wait">
               <motion.p
                 key={marketingIndex}
                 className="marketing-text text-body-secondary"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.5 }}
               >
                  {marketingTexts[marketingIndex]}
               </motion.p>
             </AnimatePresence>
             {error && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} className="alert alert-danger d-flex align-items-center mt-3" role="alert">
                   <FiAlertCircle className="me-2"/> {error}
                </motion.div>
             )}
          </div>
        )}

        {(step === 'awaiting_code' || step === 'verifying') && (
          <>
            <p className="text-center text-body-secondary mb-3">
              A verification code has been sent to <strong>{email}</strong>. Please enter it below.
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
                  id="code"
                  placeholder="Verification Code"
                  maxLength={6}
                  className={`form-control ${codeErrors.code ? 'is-invalid' : ''}`}
                  {...register('code')}
                  disabled={step === 'verifying'}
                />
                <label htmlFor="code"><FiLock className="me-2" /> Verification Code</label>
                {codeErrors.code && <div className="invalid-feedback">{codeErrors.code.message}</div>}
              </div>
              {error && (
                 <motion.div initial={{opacity:0}} animate={{opacity:1}} className="alert alert-danger d-flex align-items-center mb-3" role="alert">
                    <FiAlertCircle className="me-2"/> {error}
                 </motion.div>
              )}
              <button type="submit" className="btn btn-primary w-100 btn-lg d-flex align-items-center justify-content-center" disabled={step === 'verifying'}>
                {step === 'verifying' ? <><FiLoader className="animate-spin me-2"/> Verifying...</> : 'Verify & Join Meeting'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default PreJoinMeeting;