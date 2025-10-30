// src/components/SuperAdminOrgModal.tsx

import { motion } from 'framer-motion';
import React, { useEffect, useMemo, useState } from 'react';
import { FaBuilding, FaCalendarAlt, FaEdit, FaEnvelope, FaGlobe, FaImage, FaPlus, FaSave, FaSpinner } from 'react-icons/fa';
import useMediaQuery from '../hooks/useMediaQuery';
import type { Customer, CustomerUpdate } from '../services/api';

interface SuperAdminOrgModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CustomerUpdate | null) => Promise<void>;
    customerToEdit: Customer | null;
    isSubmitting: boolean;
    apiError: string | null;
}

const SuperAdminOrgModal: React.FC<SuperAdminOrgModalProps> = ({
    isOpen,
    onClose,
    onSave,
    customerToEdit,
    isSubmitting,
    apiError
}) => {
    if (!isOpen) return null;

    const isMobile = useMediaQuery("(max-width: 767.98px)");

    const [formData, setFormData] = useState<CustomerUpdate>({
        name: '',
        url_slug: '',
        logo_url: null,
        email_sender_name: 'System Bot',
        default_meeting_name: 'Team Meeting',
    });

    // Original state used to determine if data was changed
    const [originalData, setOriginalData] = useState<CustomerUpdate | null>(null);

    const isEditMode = customerToEdit !== null;

    useEffect(() => {
        if (customerToEdit) {
            const initialData: CustomerUpdate = {
                name: customerToEdit.name,
                url_slug: customerToEdit.url_slug,
                logo_url: customerToEdit.logo_url || null,
                email_sender_name: customerToEdit.email_sender_name,
                default_meeting_name: customerToEdit.default_meeting_name,
            };
            setFormData(initialData);
            setOriginalData(initialData);
        } else {
            // Reset for Add mode
            const defaultData: CustomerUpdate = {
                name: '',
                url_slug: '',
                logo_url: null,
                email_sender_name: 'System Bot',
                default_meeting_name: 'Team Meeting',
            };
            setFormData(defaultData);
            setOriginalData(defaultData);
        }
    }, [customerToEdit]);

    const isModified = useMemo(() => {
        if (!originalData) return false;
        return JSON.stringify(formData) !== JSON.stringify(originalData);
    }, [formData, originalData]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || !isModified) return;

        // Basic validation
        if (!formData.name || !formData.url_slug) {
            // Use API error state for local form validation
            onSave(null);
            return;
        }

        onSave(formData);
    };

    const DialogContent = (
        <div className={`p-4 p-md-5 bg-body h-100 d-flex flex-column ${isMobile ? 'w-100' : 'w-100'}`}>
            <div className="d-flex justify-content-between align-items-center mb-4 flex-shrink-0">
                <h3 className="fs-5 fw-bold d-flex align-items-center gap-2 text-primary">
                    {isEditMode ? <FaEdit /> : <FaPlus />}
                    {isEditMode ? `Edit: ${customerToEdit?.name}` : 'New Organization'}
                </h3>
                <button type="button" className="btn btn-close" onClick={onClose} aria-label="Close"></button>
            </div>

            {/* API Error Display */}
            {apiError && (
                <div className="alert alert-danger small mb-3">**Error:** {apiError}</div>
            )}

            <form onSubmit={handleSubmit} className="flex-grow-1 overflow-auto">
                <div className="vstack gap-4">

                    {/* Organization Name */}
                    <div className="form-floating">
                        <input
                            type="text"
                            className="form-control"
                            id="name"
                            name="name"
                            placeholder="Organization Name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                        />
                        <label htmlFor="name"><FaBuilding className="me-2" />Organization Name</label>
                    </div>

                    {/* URL Slug */}
                    <div className="form-floating">
                        <input
                            type="text"
                            className="form-control"
                            id="url_slug"
                            name="url_slug"
                            placeholder="URL Slug"
                            value={formData.url_slug}
                            onChange={handleChange}
                            required
                        />
                        <label htmlFor="url_slug"><FaGlobe className="me-2" />URL Slug (e.g., 'acme-corp')</label>
                    </div>

                    {/* Email Sender Name */}
                    <div className="form-floating">
                        <input
                            type="text"
                            className="form-control"
                            id="email_sender_name"
                            name="email_sender_name"
                            placeholder="Email Sender Name"
                            value={formData.email_sender_name}
                            onChange={handleChange}
                        />
                        <label htmlFor="email_sender_name"><FaEnvelope className="me-2" />Email Sender Name</label>
                    </div>

                    {/* Default Meeting Name */}
                    <div className="form-floating">
                        <input
                            type="text"
                            className="form-control"
                            id="default_meeting_name"
                            name="default_meeting_name"
                            placeholder="Default Meeting Name"
                            value={formData.default_meeting_name}
                            onChange={handleChange}
                        />
                        <label htmlFor="default_meeting_name"><FaCalendarAlt className="me-2" />Default Meeting Name</label>
                    </div>

                    {/* Logo URL (Simple text input, assuming Base64/external URL logic is handled in Manager if needed) */}
                    <div className="form-floating">
                        <input
                            type="text"
                            className="form-control"
                            id="logo_url"
                            name="logo_url"
                            placeholder="Logo URL / Base64"
                            value={formData.logo_url || ''}
                            onChange={handleChange}
                        />
                        <label htmlFor="logo_url"><FaImage className="me-2" />Logo URL (Base64/External)</label>
                    </div>

                </div>
            </form>

            <div className="flex-shrink-0 pt-4 border-top border-secondary mt-auto">
                <button
                    type="submit"
                    className="btn btn-success w-100 btn-lg fw-bold d-flex align-items-center justify-content-center gap-2"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !isModified}
                >
                    {isSubmitting ? (
                        <><FaSpinner className="spinner-border spinner-border-sm" /> Saving...</>
                    ) : (
                        <><FaSave /> {isEditMode ? 'Update Organization' : 'Create Organization'}</>
                    )}
                </button>
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
                style={{ width: isMobile ? '100%' : '500px' }}
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
                {DialogContent}
            </motion.div>
        </motion.div>
    );
};

export default SuperAdminOrgModal;