// src/components/SuperAdminOrganizationManager.tsx (Full replacement)

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useState } from 'react';
import { FaBuilding, FaEdit, FaEnvelopeOpenText, FaList, FaPlus, FaShieldAlt, FaSpinner, FaToggleOff, FaToggleOn, FaTrash, FaUsers } from 'react-icons/fa';
import useMediaQuery from '../hooks/useMediaQuery';
import type { BotConfig, Customer, CustomerUpdate } from '../services/api';
import {
    createNewCustomer,
    deleteCustomerGlobal,
    getAllCustomers,
    getCustomerBotsGlobal,
    updateBotStatusGlobal,
    updateCustomerGlobal
} from '../services/api';
import { formatDate } from '../utils/Utilities';
import LicenseRequestPanel from './LicenseRequestPanel'; // NEW IMPORT
import SuperAdminLicenseModal from './SuperAdminLicenseModal';
import SuperAdminOrgModal from './SuperAdminOrgModal';
import SuperAdminUserManager from './SuperAdminUserManager';


// --- TYPE DEFINITION (Must match or extend type defined in api.ts) ---
interface CustomerWithBotData extends Customer {
    bot_count?: number;
    bots_active?: number;
    is_status_loading?: boolean;
}
// --- END TYPE DEFINITION ---


// --- Component for a single customer's view and actions ---
const CustomerRow: React.FC<{
    customer: CustomerWithBotData;
    onEdit: (c: Customer) => void;
    onDelete: (id: number, name: string) => void;
    navigateToUsers: (c: Customer) => void;
    onToggleBots: (c: CustomerWithBotData) => void;
    onManageLicense: (c: Customer) => void;
    isGlobalLoading: boolean;
}> = ({ customer, onEdit, onDelete, navigateToUsers, onToggleBots, onManageLicense, isGlobalLoading }) => {

    const hasActiveBots = (customer.bots_active || 0) > 0;
    const toggleButtonText = hasActiveBots ? "Disable All" : "Enable All";
    const buttonIcon = hasActiveBots ? FaToggleOn : FaToggleOff;
    const buttonClass = hasActiveBots ? 'btn-outline-warning' : 'btn-outline-success';

    // License Status Styling
    const licenseStatus = customer.license?.status || 'NOT FOUND';
    const licenseExpires = customer.license?.expiry_date;
    const isLicenseBad = licenseStatus === 'Revoked' || licenseStatus === 'Expired' || licenseStatus === 'NOT FOUND';

    const licenseBadgeClass = licenseStatus === 'Active' ? 'bg-success' :
        (licenseStatus === 'Trial' ? 'bg-info' :
            'bg-danger');

    return (
        <tr key={customer.id} className={isLicenseBad ? 'table-danger bg-opacity-25' : ''}>
            <td>{customer.id}</td>
            <td>**{customer.name}**</td>
            <td>/{customer.url_slug}</td>
            <td className="d-flex align-items-center gap-2">
                <span className={`badge ${licenseBadgeClass}`} title={`Expires: ${licenseExpires ? formatDate(licenseExpires) : 'N/A'}`}>{licenseStatus}</span>
            </td>
            <td>{customer.bot_count === undefined ?
                (<FaSpinner className="spinner-border spinner-border-sm" />) :
                (<span>{customer.bots_active || 0} / {customer.bot_count || 0}</span>)}</td>
            <td className="text-end d-flex gap-2 justify-content-end">

                {/* 1. LICENSE MANAGEMENT BUTTON */}
                <button
                    className="btn btn-sm btn-outline-warning"
                    onClick={() => onManageLicense(customer)}
                    title="Manage License & Expiry"
                    disabled={isGlobalLoading}
                >
                    <FaShieldAlt /> License
                </button>

                {/* 2. MANAGE USERS LINK (Triggers the User Manager Drawer) */}
                <button
                    className="btn btn-sm btn-outline-info"
                    onClick={() => navigateToUsers(customer)}
                    title="View & Manage Users"
                    disabled={isGlobalLoading}
                >
                    <FaUsers />
                </button>

                {/* 3. QUICK BOT TOGGLE BUTTON */}
                <button
                    className={`btn btn-sm ${buttonClass}`}
                    onClick={() => onToggleBots(customer)}
                    title={toggleButtonText + " Bots"}
                    disabled={isGlobalLoading || customer.is_status_loading || (customer.bot_count || 0) === 0}
                >
                    {customer.is_status_loading ? (
                        <FaSpinner className="spinner-border spinner-border-sm" />
                    ) : (
                        React.createElement(buttonIcon)
                    )}
                </button>
                
                {/* 4. EDIT & DELETE */}
                <button 
                    className="btn btn-sm btn-outline-secondary" 
                    onClick={() => onEdit(customer)}
                    title="Edit Organization Details"
                    disabled={isGlobalLoading}
                >
                    <FaEdit />
                </button>
                <button 
                    className="btn btn-sm btn-outline-danger" 
                    onClick={() => onDelete(customer.id, customer.name)}
                    title="Delete Organization"
                    disabled={isGlobalLoading}
                >
                    <FaTrash />
                </button>
            </td>
        </tr>
    );
};
// --- END CUSTOMER ROW UPDATE ---


const SuperAdminOrgManager: React.FC = () => {
    const isMobile = useMediaQuery("(max-width: 767.98px)");

    const [customers, setCustomers] = useState<CustomerWithBotData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'organizations' | 'requests'>('organizations'); // NEW Tab State
    
    // License Modal State
    const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
    const [customerToManageLicense, setCustomerToManageLicense] = useState<Customer | null>(null);
    
    // User Manager Drawer State
    const [isUserManagerDrawerOpen, setIsUserManagerDrawerOpen] = useState(false);
    const [customerToManageUsers, setCustomerToManageUsers] = useState<Customer | null>(null);


    // Helper to fetch bot counts for a customer
    const fetchBotData = useCallback(async (customer: Customer) => {
        try {
            // Ensure ID is passed as number or string based on API requirements
            const bots: BotConfig[] = await getCustomerBotsGlobal(customer.id as number); 
            const activeBots = bots.filter(b => b.status === 'Ready' || b.status === 'Attending').length;
            
            return {
                id: customer.id,
                bot_count: bots.length,
                bots_active: activeBots,
            };
        } catch (e) {
            console.error(`Error fetching bot data for customer ${customer.id}`, e);
            return { id: customer.id, bot_count: 0, bots_active: 0 };
        }
    }, []);


    // Main function to fetch all customers and enrich with bot data
    const fetchCustomers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data: Customer[] = await getAllCustomers();
            const sortedCustomers = data.sort((a, b) => a.id - b.id);
            
            // Fetch bot data concurrently for all customers
            const botDataPromises = sortedCustomers.map(fetchBotData);
            const botDataResults = await Promise.all(botDataPromises);
            
            const updatedCustomers: CustomerWithBotData[] = sortedCustomers.map(c => {
                const botData = botDataResults.find(r => r.id === c.id);
                return {
                    ...c,
                    bot_count: botData?.bot_count,
                    bots_active: botData?.bots_active,
                    is_status_loading: false,
                } as CustomerWithBotData; 
            });
            
            setCustomers(updatedCustomers);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to load all organizations.");
        } finally {
            setIsLoading(false);
        }
    }, [fetchBotData]);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);
    
    
    // --- Handlers ---

    const handleToggleBots = async (customer: CustomerWithBotData) => {
        // Set loading state for the specific row
        setCustomers(prev => prev.map(c => 
            c.id === customer.id ? { ...c, is_status_loading: true } : c
        ));
        
        setError(null);
        setSuccessMessage(null);

        try {
            const bots = await getCustomerBotsGlobal(customer.id as number);
            const hasActive = (customer.bots_active || 0) > 0;
            const newStatus = hasActive ? 'Offline' : 'Ready';
            
            if (bots.length === 0) {
                setError("Organization has no configured bots to enable/disable.");
                return;
            }

            // Create concurrent update promises for all bots in the organization
            const updatePromises = bots.map(bot => 
                updateBotStatusGlobal(bot.id, newStatus)
            );
            await Promise.all(updatePromises);

            setSuccessMessage(`Successfully set all bots for ${customer.name} to '${newStatus}'.`);
            
            // Refresh all customer/bot data to update the counts accurately
            await fetchCustomers();

        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to toggle bot status.");
        } finally {
             // Clear loading state (handled by fetchCustomers, but needed for robustness)
             setCustomers(prev => prev.map(c => 
                c.id === customer.id ? { ...c, is_status_loading: false } : c
            ));
        }
    };

    const handleLicenseUpdated = () => {
        // Close modal and refresh the main table data
        setIsLicenseModalOpen(false);
        fetchCustomers();
    };

    const handleManageLicense = (customer: Customer) => {
        setCustomerToManageLicense(customer);
        setIsLicenseModalOpen(true);
    };

    // Clear API error when OrgModal closes
    useEffect(() => {
        if (!isModalOpen) {
            setApiError(null);
        }
    }, [isModalOpen]);


    // --- CRUD Handlers ---
    const handleAddClick = () => {
        setCustomerToEdit(null);
        setIsModalOpen(true);
    };

    const handleEditClick = (customer: Customer) => {
        setCustomerToEdit(customer);
        setIsModalOpen(true);
    };

    const handleSave = async (data: CustomerUpdate | null) => {
        if (data == null)
            return;
        setIsSubmitting(true);
        setApiError(null);
        setSuccessMessage(null);

        try {
            const apiCall = customerToEdit 
                ? updateCustomerGlobal(customerToEdit.id, data)
                : createNewCustomer(data);

            const result = await apiCall;
            setSuccessMessage(`Organization '${result.name}' saved successfully.`);
            
            await fetchCustomers();
            setIsModalOpen(false);
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Failed to save organization.";
            setApiError(msg);
            setSuccessMessage(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number, name: string) => {
        if (!window.confirm(`WARNING: Are you absolutely sure you want to delete the organization "${name}" (ID: ${id})? This will permanently delete ALL users, meetings, and data associated with it.`)) {
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await deleteCustomerGlobal(id);
            setSuccessMessage(`Organization '${name}' successfully deleted.`);
            await fetchCustomers();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to delete organization.");
            setIsLoading(false);
        }
    };

    const handleNavigateToUsers = (customer: Customer) => {
        setCustomerToManageUsers(customer);
        setIsUserManagerDrawerOpen(true);
    };

    const totalOrganizations = customers.length;
    const isGlobalLoading = isLoading || isSubmitting;


    return (
        <div className="p-4 p-md-5" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            
            <h1 className="fw-light mb-4 d-flex align-items-center gap-2"><FaBuilding /> Global Management</h1>

            {error && <div className="alert alert-danger">{error}</div>}
            {successMessage && <div className="alert alert-success">{successMessage}</div>}
            
            {/* --- TAB NAVIGATION --- */}
            <ul className="nav nav-tabs mb-4">
                <li className="nav-item">
                    <button 
                        className={`nav-link ${activeTab === 'organizations' ? 'active' : ''}`}
                        onClick={() => setActiveTab('organizations')}
                    >
                        <FaList className='me-2' /> Organizations
                    </button>
                </li>
                <li className="nav-item">
                    <button 
                        className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        <FaEnvelopeOpenText className='me-2' /> License Requests
                    </button>
                </li>
            </ul>
            {/* --- END TAB NAVIGATION --- */}

            <div className="card shadow-sm p-4">
                
                {/* --- Organization List Tab Content --- */}
                {activeTab === 'organizations' && (
                    <>
                        <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
                            <h2 className="fs-5 fw-semibold mb-0">Organization List ({totalOrganizations})</h2>
                            <button className="btn btn-primary d-flex align-items-center justify-content-center gap-2" onClick={handleAddClick} disabled={isGlobalLoading}>
                                <FaPlus /> New Organization
                            </button>
                        </div>

                        {isLoading ? (
                            <div className="text-center p-5"><FaSpinner className="spinner-border" size={30} /> Loading Organizations...</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle">
                                    <thead className="table-light">
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>URL Slug</th>
                                            <th>License Status</th>
                                            <th>Bots (Active/Total)</th>
                                            <th className="text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customers.map(customer => (
                                            <CustomerRow
                                                key={customer.id}
                                                customer={customer}
                                                onEdit={handleEditClick}
                                                onDelete={handleDelete}
                                                navigateToUsers={handleNavigateToUsers}
                                                onToggleBots={handleToggleBots}
                                                onManageLicense={handleManageLicense}
                                                isGlobalLoading={isGlobalLoading}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
                
                {/* --- License Request Tab Content --- */}
                {activeTab === 'requests' && (
                    <LicenseRequestPanel />
                )}
                
            </div>

            {/* --- Modals and Drawers (AnimatePresence blocks omitted for brevity, ensure they wrap the modal components) --- */}
            
            {/* SuperAdminOrgModal (Create/Edit) */}
            <AnimatePresence>
                {isModalOpen && (
                    <SuperAdminOrgModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        onSave={handleSave}
                        customerToEdit={customerToEdit}
                        isSubmitting={isSubmitting}
                        apiError={apiError}
                    />
                )}
            </AnimatePresence>
            
            {/* SuperAdminLicenseModal */}
            <AnimatePresence>
                {isLicenseModalOpen && customerToManageLicense && (
                    <SuperAdminLicenseModal
                        isOpen={isLicenseModalOpen}
                        onClose={() => setIsLicenseModalOpen(false)}
                        customer={customerToManageLicense}
                        onLicenseUpdated={handleLicenseUpdated}
                    />
                )}
            </AnimatePresence>
            
            {/* SuperAdminUserManager Drawer */}
            <AnimatePresence>
                {isUserManagerDrawerOpen && customerToManageUsers && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                        className="position-fixed top-0 end-0 bg-white shadow-lg h-100"
                        style={{ width: isMobile ? '100%' : '600px', zIndex: 4000 }}
                    >
                        <SuperAdminUserManager
                            customerId={customerToManageUsers.id as number}
                            customerName={customerToManageUsers.name}
                            onClose={() => {
                                setIsUserManagerDrawerOpen(false);
                                setCustomerToManageUsers(null);
                                fetchCustomers(); // Refresh counts after user action
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            
        </div>
    );
};

export default SuperAdminOrgManager;