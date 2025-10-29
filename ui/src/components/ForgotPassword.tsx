// src/pages/ForgotPassword.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaSpinner, FaMailBulk, FaLock, FaArrowLeft, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import { FiMail, FiLock } from 'react-icons/fi';
import axios from 'axios';
import useMediaQuery from '../hooks/useMediaQuery';
import SplitScreen from './meeting/SplitScreen'; // Assuming SplitScreen is available
import aiLogo from "../assets/ai-meet-icon.png";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isMobile = useMediaQuery("(max-width: 768px)");
    const token = searchParams.get('token'); // Check for token in URL for Phase 2
    
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // --- Phase 1: Request Password Reset Link ---
    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) { setError("Please enter your email address."); return; }
        
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        
        try {
            await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email });
            setSuccess("If the email is registered, a password reset link has been sent to your inbox.");
            setEmail('');
        } catch (err: any) {
            // Still show success message for security purposes
            setSuccess("If the email is registered, a password reset link has been sent to your inbox.");
            console.error("Forgot password request failed:", err);
        } finally {
            setIsLoading(false);
        }
    };
    
    // --- Phase 2: Confirm Password Reset ---
    const handleConfirmReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("New password and confirmation password do not match.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccess(null);
        
        try {
            await axios.post(`${API_BASE_URL}/auth/reset-password`, {
                token,
                new_password: newPassword,
            });
            setSuccess("Your password has been successfully reset! Redirecting to login...");
            // Redirect to the login page after a brief delay
            setTimeout(() => {
                navigate("/login", { replace: true });
            }, 3000);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Password reset failed. The token may be invalid or expired.");
        } finally {
            setIsLoading(false);
        }
    };

    /** ---------- UI Sections ---------- **/
    
    // Left marketing panel (reused from Login.tsx)
    const marketingPanel = () => (
        <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="d-flex flex-column align-items-center justify-content-center h-100 text-center text-light p-5"
            style={{
                background:
                    "linear-gradient(135deg, #6e4aff 0%, #3c1e8a 50%, #141414 100%)",
            }}
        >
            <motion.img
                src={aiLogo}
                alt="AI Meeting"
                width={90}
                height={90}
                className="rounded-circle border border-3 border-light bg-white bg-opacity-25 p-2 mb-4"
                animate={{ rotate: [0, 360] }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            />
            <h1 className="display-5 fw-bold mb-3">Password Reset Portal</h1>
            <p className="lead mb-4 px-4">
                We'll securely guide you through recovering your account access.
            </p>
        </motion.div>
    );

    // --- Phase 1 Form: Request Email Link ---
    const requestForm = () => (
        <form onSubmit={handleRequestReset}>
            <h3 className="fw-bold mb-3 d-flex align-items-center gap-2"><FaMailBulk /> Request Reset Link</h3>
            <p className="text-muted small mb-4">Enter the email address associated with your account. We'll send you a password reset link.</p>
            
            {/* Email Input - FIX: Moving icon outside form-floating */}
            <div className="input-group mb-4">
                <span className="input-group-text"><FiMail /></span>
                <div className="form-floating flex-grow-1">
                    <input
                        type="email" id="reset-email" placeholder="Your email"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        className="form-control form-control-lg" required
                    />
                    <label htmlFor="reset-email">Email Address</label>
                </div>
            </div>
            
            <button type="submit" className="w-100 btn btn-primary btn-lg fw-bold shadow-sm" disabled={isLoading}>
                {isLoading ? (
                    <><FaSpinner className="spinner-border spinner-border-sm me-2" /> Sending Link...</>
                ) : (
                    "Send Reset Link"
                )}
            </button>
        </form>
    );
    
    // --- Phase 2 Form: Set New Password ---
    const resetForm = () => (
        <form onSubmit={handleConfirmReset}>
            <h3 className="fw-bold mb-3 d-flex align-items-center gap-2"><FaLock /> Set New Password</h3>
            <p className="text-muted small mb-4">Please enter your new password (min 8 characters).</p>
            
            {/* New Password Input - FIX: Moving icon outside form-floating */}
            <div className="input-group mb-3">
                <span className="input-group-text"><FiLock /></span>
                <div className="form-floating flex-grow-1">
                    <input
                        type="password" id="new-password" placeholder="New Password"
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        className="form-control form-control-lg" required
                        minLength={8}
                    />
                    <label htmlFor="new-password">New Password</label>
                </div>
            </div>
            
            {/* Confirm Password Input - FIX: Moving icon outside form-floating */}
            <div className="input-group mb-4">
                <span className="input-group-text"><FiLock /></span>
                <div className="form-floating flex-grow-1">
                    <input
                        type="password" id="confirm-password" placeholder="Confirm New Password"
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        className="form-control form-control-lg" required
                        minLength={8}
                    />
                    <label htmlFor="confirm-password">Confirm New Password</label>
                </div>
            </div>
            
            <button type="submit" className="w-100 btn btn-success btn-lg fw-bold shadow-sm" disabled={isLoading}>
                {isLoading ? (
                    <><FaSpinner className="spinner-border spinner-border-sm me-2" /> Resetting...</>
                ) : (
                    "Reset Password"
                )}
            </button>
        </form>
    );
    
    // --- Main Render Container ---
    const mainContent = () => (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="card shadow-lg border-0 rounded-4 bg-white bg-opacity-75 backdrop-blur-sm"
            style={{ maxWidth: 460, width: "100%" }}
        >
            <div className="card-body p-4 p-md-5">
                <div className="text-center mb-4">
                    <img
                        src={aiLogo}
                        alt="AI Meeting"
                        width={60}
                        height={60}
                        className="rounded-circle border border-2 border-primary shadow-sm mb-3 bg-white p-2"
                    />
                    <h2 className="fw-bold text-primary">{token ? "Confirm Password Reset" : "Trouble Logging In?"}</h2>
                </div>
                
                {/* Status Messages */}
                {error && (
                    <div className="alert alert-danger d-flex align-items-center gap-2 small" role="alert">
                        <FaExclamationTriangle /> <span>{error}</span>
                    </div>
                )}
                {success && (
                    <div className="alert alert-success d-flex align-items-center gap-2 small" role="alert">
                        <FaCheckCircle /> <span>{success}</span>
                    </div>
                )}
                
                {/* Render Phase 1 or Phase 2 form */}
                {!token ? requestForm() : resetForm()}

                <div className="text-center mt-4">
                    <button
                        type="button"
                        className="btn btn-link p-0 text-dark fw-semibold d-flex align-items-center mx-auto gap-2"
                        onClick={() => navigate("/login")}
                    >
                        <FaArrowLeft /> Back to Login
                    </button>
                </div>
            </div>
        </motion.div>
    );


    // --- Final Render ---
    return isMobile ? (
        <div
            className="container-fluid d-flex align-items-center justify-content-center min-vh-100 p-4"
            style={{ background: "linear-gradient(135deg, #a28bff 0%, #f5f5f5 100%)" }}
        >
            {mainContent()}
        </div>
    ) : (
        <SplitScreen leftWidth={2} rightWidth={1}>
            {marketingPanel()}
            <div className="d-flex align-items-center justify-content-center h-100 p-4">
                {mainContent()}
            </div>
        </SplitScreen>
    );
};

export default ForgotPassword;