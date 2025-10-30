// src/components/LicenseExpired.tsx

import React, { useState } from 'react';
import { FaShieldAlt, FaEnvelope, FaExclamationTriangle, FaSpinner, FaCheckCircle, FaTimes } from 'react-icons/fa';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

interface LicenseExpiredProps {
    customerSlug: string;
    customerId: number;
}

const LicenseExpired: React.FC<LicenseExpiredProps> = ({ customerSlug, customerId }) => {
    const navigate = useNavigate();
    const [messageBody, setMessageBody] = useState(`Dear SuperAdmin,

Our organization's license (${customerSlug}) seems to be expired/revoked. Could you please review and extend our access?

Thank you.`);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    const handleSubmitRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageBody.trim()) {
            setError("Message cannot be empty.");
            return;
        }
        
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            await axios.post(`${API_BASE_URL}/license/request`, {
                customer_id: customerId,
                message_body: messageBody,
            });
            setSuccess("Your license renewal request has been successfully sent to the SuperAdmin!");
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to send request. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container-fluid d-flex justify-content-center align-items-center bg-light" style={{ minHeight: '100vh', padding: '40px' }}>
            <div className="card shadow-lg border-0 rounded-4 p-5 bg-white" style={{ maxWidth: '600px', width: '100%' }}>
                <div className="text-center mb-5">
                    <FaShieldAlt size={60} className="text-danger mb-3" />
                    <h1 className="fw-bold text-danger">License Required</h1>
                    <p className="lead text-muted">Access to features for `{customerSlug}` has been disabled.</p>
                </div>
                
                {error && (
                    <div className="alert alert-danger d-flex align-items-center gap-2 small"><FaExclamationTriangle /> {error}</div>
                )}
                {success && (
                    <div className="alert alert-success d-flex align-items-center gap-2 small"><FaCheckCircle /> {success}</div>
                )}

                <form onSubmit={handleSubmitRequest} className="vstack gap-3">
                    <label htmlFor="messageBody" className="form-label fw-semibold d-flex align-items-center gap-2"><FaEnvelope /> Request License Renewal</label>
                    <textarea
                        id="messageBody"
                        className="form-control"
                        rows={6}
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        required
                        disabled={!!success}
                    />
                    <button type="submit" className="btn btn-lg btn-danger w-100 fw-bold d-flex align-items-center justify-content-center gap-2 mt-3" disabled={isSubmitting || !!success}>
                        {isSubmitting ? <FaSpinner className="spinner-border spinner-border-sm" /> : <FaEnvelope />}
                        {isSubmitting ? 'Sending Request...' : 'Send Renewal Request to SuperAdmin'}
                    </button>
                    
                    <button type="button" className="btn btn-link text-muted" onClick={() => navigate(`/${customerSlug}/login`)}>
                        <FaTimes /> Logout
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LicenseExpired;