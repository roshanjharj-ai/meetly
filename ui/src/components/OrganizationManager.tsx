// src/components/OrganizationManager.tsx

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { FaBuilding, FaEnvelope, FaSave, FaUserCog, FaTrashAlt, FaSpinner, FaCheckCircle, FaExclamationTriangle, FaLink, FaGlobe, FaUsers, FaArrowRight } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

// Import API and types
import { getCustomerDetails, updateCustomerDetails, deleteCustomer } from '../services/api';
import type { Customer, CustomerUpdate } from '../services/api';

// Import the new Uploader component
import ImageUploader from './shared/ImageUploader'; // Assuming this path is correct

// Extended type for the component state
// NOTE: Customer interface in api.ts now includes created_at (assumed from schema fix)
interface CustomerState extends Customer {
    
    // created_at is implicitly included via `Customer` in api.ts
}

const OrganizationManager: React.FC = () => {
    const navigate = useNavigate();

    const [customer, setCustomer] = useState<CustomerState | null>(null);
    const [originalCustomer, setOriginalCustomer] = useState<CustomerState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // Get current slug for internal navigation, safely defaulting if customer is null
    const currentSlug = customer?.url_slug || 'default';


    const fetchCustomerDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getCustomerDetails();
            const customerData = {
                ...data,
                // Ensure logo_url is string or null for consistency
                logo_url: data.logo_url || null,
                email_config_json: data.email_config_json || null,
            } as CustomerState;
            setCustomer(customerData);
            setOriginalCustomer(customerData);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to load organization settings. Check if you are logged in as an Admin.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomerDetails();
    }, [fetchCustomerDetails]);

    // Debounce state messages
    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError(null);
                setSuccess(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    // Check if the form data has been modified
    const isModified = useMemo(() => JSON.stringify(customer) !== JSON.stringify(originalCustomer), [customer, originalCustomer]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (customer) {
            setCustomer({
                ...customer,
                [e.target.name]: e.target.value,
            });
        }
    };

    // Handler for the ImageUploader component
    const handleLogoImageChange = useCallback((base64Image: string | null) => {
        if (customer) {
            setCustomer(prev => (prev ? { ...prev, logo_url: base64Image } : null));
        }
    }, [customer]);


    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customer || isSaving || !isModified) return;

        setIsSaving(true);
        setError(null);
        setSuccess(null);

        try {
            // Prepare payload to match CustomerUpdate schema
            const payload: CustomerUpdate = {
                name: customer.name,
                url_slug: customer.url_slug,
                logo_url: customer.logo_url, // Base64 string or null
                email_sender_name: customer.email_sender_name,
                default_meeting_name: customer.default_meeting_name,
            };

            const updatedData = await updateCustomerDetails(payload);

            const updatedCustomerState = {
                ...updatedData,
                logo_url: updatedData.logo_url || null,
                email_config_json: updatedData.email_config_json || null,
            } as CustomerState;

            setCustomer(updatedCustomerState);
            setOriginalCustomer(updatedCustomerState);
            setSuccess("Organization settings updated successfully!");

            // If the slug changed, force a local redirect to the new slug path
            if (customer.url_slug !== updatedData.url_slug) {
                setTimeout(() => {
                    // Update local storage slug so subsequent API calls work
                    localStorage.setItem('customerSlug', updatedData.url_slug);
                    navigate(`/${updatedData.url_slug}/organization`, { replace: true });
                    window.location.reload(); // Force full app context reload if the slug changes
                }, 1000);
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to save settings. Check your slug uniqueness.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("WARNING: Are you sure you want to delete this organization? This action is permanent and will delete ALL users, meetings, participants, and bots associated with this organization. You will be logged out.")) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await deleteCustomer();

            // Since the customer is deleted, the user's token is invalid. Redirect to a public page.
            alert("Organization successfully deleted. You will be logged out.");
            localStorage.removeItem('authToken');
            localStorage.removeItem('customerSlug');
            navigate('/login', { replace: true });
            window.location.reload(); // Force app state reset
        } catch (err: any) {
            setIsLoading(false);
            setError(err.response?.data?.detail || "Failed to delete organization.");
        }
    };
    
    const handleNavigateToUsers = () => {
        navigate(`/${currentSlug}/members`);
    };


    if (isLoading || !customer) {
        return (
            <div className="p-5 d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
                <FaSpinner className="spinner-border" size={30} />
                <span className="ms-2">Loading organization details...</span>
            </div>
        );
    }

    return (
        <div className="p-4 p-md-5" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-5">
                <h1 className="fw-light d-flex align-items-center gap-2">
                    <FaBuilding /> Organization Management
                </h1>
                <span className="badge bg-secondary fs-6">Slug: **/{customer.url_slug}**</span>
            </div>

            {/* Status Messages */}
            {error && (
                <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
                    <FaExclamationTriangle /> <span>**Error:** {error}</span>
                </div>
            )}
            {success && (
                <div className="alert alert-success d-flex align-items-center gap-2" role="alert">
                    <FaCheckCircle /> <span>**Success:** {success}</span>
                </div>
            )}

            <form onSubmit={handleSave}>
                <div className="card shadow-sm mb-4">
                    <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
                        <FaUserCog /> General Settings
                    </div>
                    <div className="card-body">
                        <div className="mb-3">
                            <label htmlFor="name" className="form-label">Organization Name</label>
                            <input
                                type="text"
                                className="form-control"
                                id="name"
                                name="name"
                                value={customer.name}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="url_slug" className="form-label">Organization URL Slug</label>
                            <div className="input-group">
                                <span className="input-group-text"><FaGlobe /></span>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="url_slug"
                                    name="url_slug"
                                    value={customer.url_slug}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-text text-muted">The unique identifier used in the URL: `/.../{customer.url_slug}/dashboard`.</div>
                        </div>

                        {/* --- INTEGRATED IMAGE UPLOADER --- */}
                        <ImageUploader
                            label="Organization Logo (Image Upload)"
                            currentImageUrl={customer.logo_url}
                            onImageChange={handleLogoImageChange}
                            maxFileSizeMB={0.5} // Keep logo size small for database storage
                        />
                        {/* --- END UPLOADER --- */}

                        <div className="mb-3">
                            <label htmlFor="logo_url_manual" className="form-label d-flex align-items-center gap-2"><FaLink /> Logo URL (External)</label>
                            <input
                                type="url"
                                className="form-control"
                                id="logo_url_manual"
                                name="logo_url"
                                value={customer.logo_url || ''}
                                onChange={handleChange}
                                placeholder="Paste external image URL (will override uploaded image)"
                            />
                        </div>
                    </div>
                </div>
                
                {/* --- USER MANAGEMENT LINK CARD --- */}
                <div className="card shadow-sm mb-4 bg-info bg-opacity-10 border-info">
                    <div className="card-body d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                            <FaUsers size={30} className="text-info me-3" />
                            <h3 className="fs-5 fw-semibold mb-0 text-info">Manage Organization Members</h3>
                        </div>
                        <button 
                            type="button" 
                            className="btn btn-info text-white d-flex align-items-center gap-2"
                            onClick={handleNavigateToUsers}
                        >
                            View Members <FaArrowRight />
                        </button>
                    </div>
                </div>
                {/* --- END USER MANAGEMENT LINK CARD --- */}


                <div className="card shadow-sm mb-4">
                    <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
                        <FaEnvelope /> Default Meeting & Email Configuration
                    </div>
                    <div className="card-body">
                        <div className="mb-3">
                            <label htmlFor="default_meeting_name" className="form-label">Default Meeting Name/Template</label>
                            <input
                                type="text"
                                className="form-control"
                                id="default_meeting_name"
                                name="default_meeting_name"
                                value={customer.default_meeting_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="email_sender_name" className="form-label">Email Sender Name (e.g., Jane from {customer.name})</label>
                            <input
                                type="text"
                                className="form-control"
                                id="email_sender_name"
                                name="email_sender_name"
                                value={customer.email_sender_name}
                                onChange={handleChange}
                            />
                        </div>
                        {/* SMTP configuration for email_config_json would go here */}
                    </div>
                </div>

                <div className="d-flex justify-content-between align-items-center pt-3">
                    <button type="button" className="btn btn-outline-danger d-flex align-items-center gap-2" onClick={handleDelete} disabled={isLoading || isSaving}>
                        <FaTrashAlt /> Delete Organization
                    </button>

                    <button type="submit" className="btn btn-lg btn-success d-flex align-items-center gap-2" disabled={isSaving || !isModified}>
                        {isSaving ? (
                            <>
                                <FaSpinner className="spinner-border spinner-border-sm" /> Saving...
                            </>
                        ) : (
                            <>
                                <FaSave /> Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>
            
            {/* Displaying Created At information (Optional addition for Admin view) */}
            <div className="text-muted small text-center mt-4">
                Organization created on: **{new Date(customer.created_at).toLocaleString()}**
            </div>
        </div>
    );
};

export default OrganizationManager;