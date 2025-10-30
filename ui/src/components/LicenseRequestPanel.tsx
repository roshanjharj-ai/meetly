// src/components/LicenseRequestPanel.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { FaCalendarAlt, FaEnvelopeOpenText, FaSpinner } from 'react-icons/fa';
import type { SuperAdminActivityLog } from '../services/api';
import { getLicenseRequests } from '../services/api';

// Helper to format ISO date strings
const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
};

const LicenseRequestPanel: React.FC = () => {
    const [requests, setRequests] = useState<SuperAdminActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRequests = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getLicenseRequests();
            // Sort requests by newest first
            setRequests(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to fetch license requests.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    return (
        <div className="p-4 bg-body h-100 d-flex flex-column">
            <h3 className="fs-5 fw-bold d-flex align-items-center gap-2 text-primary border-bottom pb-3 mb-3 flex-shrink-0">
                <FaEnvelopeOpenText /> License Renewal Requests ({requests.length})
            </h3>
            
            {error && <div className="alert alert-danger small">{error}</div>}

            {isLoading ? (
                <div className="text-center p-5"><FaSpinner className="spinner-border" size={30} /> Loading Requests...</div>
            ) : (
                <div className="flex-grow-1 overflow-auto vstack gap-3">
                    {requests.length === 0 ? (
                        <p className="text-center text-muted p-4">No outstanding license renewal requests.</p>
                    ) : (
                        requests.map((req, index) => (
                            <div key={index} className="card border-info bg-info bg-opacity-10 shadow-sm">
                                <div className="card-body p-3">
                                    <h4 className="fs-6 fw-semibold mb-2">
                                        Request for Customer ID: **{req.customer_id}**
                                    </h4>
                                    <p className="small text-muted mb-2 d-flex align-items-center gap-2">
                                        <FaCalendarAlt /> Sent: {formatDate(req.timestamp)}
                                    </p>
                                    <p className="card-text small border-top pt-2 mt-2">
                                        **Message:** {req.content}
                                    </p>
                                    <div className="mt-3">
                                        {/* Action link: SuperAdmin would use this to manage the license */}
                                        <button 
                                            className="btn btn-sm btn-info text-white"
                                            onClick={() => alert(`Action: Open license manager for customer ID ${req.customer_id}`)}
                                        >
                                            Review License
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default LicenseRequestPanel;