// src/components/SuperAdminLicenseModal.tsx

import { motion } from 'framer-motion';
import React, { useCallback, useEffect, useState } from 'react';
import { FaCalendarAlt, FaCheckCircle, FaExclamationTriangle, FaSave, FaShieldAlt, FaSpinner, FaTrash } from 'react-icons/fa';
import useMediaQuery from '../hooks/useMediaQuery';
import type { Customer, License, LicenseBase } from '../services/api';
import { getCustomerLicense, manageCustomerLicense, revokeCustomerLicense } from '../services/api';

// Helper to format ISO date strings
const formatDate = (isoString: string | undefined | null) => {
    if (!isoString) return 'N/A (Permanent/None)';
    return new Date(isoString).toLocaleString();
};

interface SuperAdminLicenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer;
    onLicenseUpdated: () => void; // Callback to refresh the main org list
}

// Initial/default form data structure
interface LicenseFormData {
    duration_value: number;
    duration_unit: 'days' | 'months' | 'years';
    license_type: string;
    status: string;
}

const SuperAdminLicenseModal: React.FC<SuperAdminLicenseModalProps> = ({ 
    isOpen, 
    onClose, 
    customer, 
    onLicenseUpdated 
}) => {
    if (!isOpen) return null;

    const isMobile = useMediaQuery("(max-width: 767.98px)");
    
    const [currentLicense, setCurrentLicense] = useState<License | null>(null);
    const [formData, setFormData] = useState<LicenseFormData>({
        duration_value: 30,
        duration_unit: 'days',
        license_type: 'Standard',
        status: 'Active',
    });
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // --- Data Fetching ---
    const fetchLicense = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const license = await getCustomerLicense(customer.id);
            setCurrentLicense(license);
            
            // Set form data to current active settings for easy editing
            setFormData({
                duration_value: 30, // Default to extending by 30 days
                duration_unit: 'days',
                license_type: license.type,
                status: license.status,
            });
        } catch (err: any) {
            if (err.response?.status === 404) {
                setCurrentLicense(null); // No license exists
            } else {
                setError(err.response?.data?.detail || "Failed to load current license data.");
            }
        } finally {
            setIsLoading(false);
        }
    }, [customer.id]);

    useEffect(() => {
        fetchLicense();
    }, [fetchLicense]);
    
    
    // --- Handlers ---
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: name === 'duration_value' ? parseInt(value, 10) || 0 : value 
        }));
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        // Simple validation
        if (formData.duration_value <= 0 && formData.status === 'Active') {
            setError("Duration must be greater than zero when setting status to Active.");
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setSuccess(null);
        
        try {
            const payload: LicenseBase = {
                duration_value: formData.duration_value,
                duration_unit: formData.duration_unit,
                license_type: formData.license_type,
                status: formData.status,
            };
            
            const updatedLicense = await manageCustomerLicense(customer.id, payload);
            setCurrentLicense(updatedLicense);
            setSuccess("License successfully granted/updated.");
            onLicenseUpdated();
            
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to save license changes.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleRevoke = async () => {
        if (!window.confirm("Are you sure you want to REVOKE this license immediately? This will block organizational access.")) return;

        setIsSubmitting(true);
        setError(null);
        setSuccess(null);
        
        try {
            const revokedLicense = await revokeCustomerLicense(customer.id);
            setCurrentLicense(revokedLicense);
            setSuccess("License successfully REVOKED.");
            onLicenseUpdated();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to revoke license.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isExpired = currentLicense && currentLicense.status === 'Expired';
    const isRevoked = currentLicense && currentLicense.status === 'Revoked';
    
    const DialogContent = (
        <div className={`p-4 p-md-5 bg-body h-100 d-flex flex-column ${isMobile ? 'w-100' : 'w-100'}`}>
            <div className="d-flex justify-content-between align-items-center mb-4 flex-shrink-0 border-bottom pb-3">
                <h3 className="fs-5 fw-bold d-flex align-items-center gap-2 text-primary">
                    <FaShieldAlt className="text-warning" /> Manage License: {customer.name}
                </h3>
                <button type="button" className="btn btn-close" onClick={onClose} aria-label="Close"></button>
            </div>
            
            {/* Status Display */}
            {isLoading ? (
                 <div className="text-center p-5"><FaSpinner className="spinner-border" size={30} /> Loading License...</div>
            ) : (
                <div className="flex-grow-1 overflow-auto">
                    
                    {/* Current License Status Card */}
                    <div className={`card shadow-sm mb-4 p-3 ${isRevoked || isExpired ? 'bg-danger-subtle border-danger' : 'bg-success-subtle border-success'}`}>
                        <div className="card-body">
                            <h4 className="card-title fs-6 fw-bold d-flex align-items-center gap-2">
                                Current Status: <span className={`badge ${isRevoked || isExpired ? 'bg-danger' : 'bg-success'}`}>{currentLicense?.status || 'NOT FOUND'}</span>
                            </h4>
                            <p className="small mb-1">Type: **{currentLicense?.type || 'N/A'}**</p>
                            <p className="small mb-1">Expires: **{formatDate(currentLicense?.expiry_date)}**</p>
                            <p className="small mb-0">Days Granted Total: **{currentLicense?.days_granted || 0}**</p>
                        </div>
                    </div>

                    {/* Form for Granting/Extending */}
                    <form onSubmit={handleSubmit} className="vstack gap-3">
                        <h4 className="fs-6 fw-bold mt-3 d-flex align-items-center gap-2"><FaCalendarAlt /> Grant/Extend License</h4>

                        {/* Duration Input */}
                        <div className="input-group">
                            <input
                                type="number"
                                name="duration_value"
                                className="form-control"
                                placeholder="Duration"
                                value={formData.duration_value}
                                onChange={handleChange}
                                min="1"
                                required
                            />
                            <select
                                name="duration_unit"
                                className="form-select"
                                value={formData.duration_unit}
                                onChange={handleChange}
                            >
                                <option value="days">Days</option>
                                <option value="months">Months</option>
                                <option value="years">Years</option>
                            </select>
                        </div>

                        {/* Type and Status Selects */}
                        <div className="d-flex gap-2">
                            <select
                                name="license_type"
                                className="form-select"
                                value={formData.license_type}
                                onChange={handleChange}
                            >
                                <option value="Standard">Standard</option>
                                <option value="Enterprise">Enterprise</option>
                                <option value="Trial">Trial</option>
                            </select>
                            <select
                                name="status"
                                className="form-select"
                                value={formData.status}
                                onChange={handleChange}
                            >
                                <option value="Active">Active</option>
                                <option value="Expired" disabled>Expired (System Use Only)</option>
                                <option value="Revoked">Revoked</option>
                            </select>
                        </div>
                        
                        <div className="d-flex justify-content-between mt-3 flex-wrap gap-2">
                            <button 
                                type="submit"
                                className="btn btn-success fw-bold d-flex align-items-center gap-2 flex-grow-1"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <FaSpinner className="spinner-border spinner-border-sm" /> : <FaSave />}
                                {currentLicense ? 'Extend/Update' : 'Grant New License'}
                            </button>

                            {currentLicense && currentLicense.status !== 'Revoked' && (
                                <button
                                    type="button"
                                    className="btn btn-warning fw-bold d-flex align-items-center gap-2"
                                    onClick={handleRevoke}
                                    disabled={isSubmitting}
                                >
                                    <FaTrash /> Revoke Access
                                </button>
                            )}
                        </div>
                    </form>
                    
                    {/* Activity Log (License Requests) */}
                    <div className="mt-5 border-top pt-3">
                         <h4 className="fs-6 fw-bold mb-3">License Renewal Requests</h4>
                         {/* This section would load and display data from getLicenseRequests API */}
                         <p className="text-muted small">
                             *Requests must be checked manually via the `getLicenseRequests` endpoint for now.*
                         </p>
                    </div>
                </div>
            )}
            
            {/* Status Messages */}
            <div className="flex-shrink-0 pt-3 mt-auto">
                {error && (
                    <div className="alert alert-danger d-flex align-items-center gap-2 small"><FaExclamationTriangle /> {error}</div>
                )}
                {success && (
                    <div className="alert alert-success d-flex align-items-center gap-2 small"><FaCheckCircle /> {success}</div>
                )}
            </div>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-end align-items-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 3000 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.3 }}
                className="bg-white shadow-lg h-100"
                style={{ width: isMobile ? '100%' : '550px' }}
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
                {DialogContent}
            </motion.div>
        </motion.div>
    );
};

export default SuperAdminLicenseModal;