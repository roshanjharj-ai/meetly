// src/components/SuperAdminUserManager.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCrown, FaSearch, FaSpinner, FaTimes, FaUserMinus, FaUsers, FaUserTag } from 'react-icons/fa';
import useMediaQuery from '../hooks/useMediaQuery';
import type { FetchedUser, SuperAdminUserUpdatePayload } from '../services/api';
import { deleteUserGlobal, getCustomerUsersGlobal, updateUserRoleGlobal } from '../services/api';

interface SuperAdminUserManagerProps {
    customerId: number;
    customerName: string;
    onClose: () => void; // To close the SuperAdmin Manager interface (if used in a modal/drawer)
}

const SuperAdminUserManager: React.FC<SuperAdminUserManagerProps> = ({ customerId, customerName, onClose }) => {
    const isMobile = useMediaQuery("(max-width: 767.98px)");
    
    const [users, setUsers] = useState<FetchedUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // --- Fetch Users (Scoped by Customer ID) ---
    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setStatusMessage(null);
        try {
            // Use the SuperAdmin endpoint to fetch ALL users for the specified customerId
            const fetchedUsers: FetchedUser[] = await getCustomerUsersGlobal(customerId); 
            setUsers(fetchedUsers.filter(u => u.user_type !== 'SuperAdmin')); // Filter out global SuperAdmins
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to load user list.");
        } finally {
            setIsLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // --- Remove/Delete User (Global Delete) ---
    const handleRemoveUser = async (userId: number, userName: string) => {
        if (!window.confirm(`SUPERADMIN ACTION: Are you sure you want to permanently DELETE user "${userName}" (ID: ${userId})? This is a global and irreversible delete.`)) {
            return;
        }

        setStatusMessage(`Deleting ${userName} globally...`);
        try {
            // Use the global delete endpoint
            await deleteUserGlobal(userId); 
            setStatusMessage(`Successfully deleted user ${userName} globally.`);
            // Optimistically update UI
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err: any) {
            setError(err.response?.data?.detail || `Failed to delete user ${userName}.`);
        }
    };
    
    // --- Update User Role ---
    const handleUpdateRole = async (userId: number, userName: string, currentRole: string, newRole: 'Admin' | 'Member') => {
         if (currentRole === newRole) return;

         if (!window.confirm(`Confirm change: Set role for ${userName} from ${currentRole} to ${newRole}?`)) {
            return;
         }
         
         setStatusMessage(`Updating role for ${userName} to ${newRole}...`);
         try {
             const payload: SuperAdminUserUpdatePayload = { user_type: newRole };
             await updateUserRoleGlobal(userId, payload);
             setStatusMessage(`Role for ${userName} updated to ${newRole}.`);
             
             // Update UI state
             setUsers(prev => prev.map(u => 
                u.id === userId ? { ...u, user_type: newRole } : u
             ));

         } catch (err: any) {
            setError(err.response?.data?.detail || `Failed to update role for user ${userName}.`);
         }
    };

    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return users.filter(user => 
            user.full_name?.toLowerCase().includes(lowerCaseSearch) ||
            user.user_name.toLowerCase().includes(lowerCaseSearch) ||
            user.email.toLowerCase().includes(lowerCaseSearch)
        );
    }, [users, searchTerm]);
    
    const totalMembers = users.length;

    return (
        <div className="p-4 p-md-5 bg-body h-100 d-flex flex-column" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div className="d-flex justify-content-between align-items-center flex-shrink-0 border-bottom pb-3 mb-4">
                <h1 className="fw-bold fs-3 d-flex align-items-center gap-2"><FaUsers /> Users in: {customerName}</h1>
                <button className="btn btn-close" onClick={onClose} aria-label="Close"><FaTimes /></button>
            </div>
            
            {statusMessage && <div className={`alert ${error ? 'alert-danger' : 'alert-info'} d-flex justify-content-between align-items-center flex-shrink-0`}>
                {error || statusMessage}
                {isLoading && <FaSpinner className="spinner-border" />}
            </div>}

            <div className="card shadow-sm p-4 flex-grow-1 overflow-hidden">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3 flex-shrink-0">
                    <h2 className="fs-5 fw-semibold mb-0">Total Organization Users: {totalMembers}</h2>
                    
                    <div className="input-group" style={{ maxWidth: isMobile ? '100%' : '300px' }}>
                        <span className="input-group-text"><FaSearch /></span>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Search by Name, Email or Username"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center p-5"><FaSpinner className="spinner-border" size={30} /> Loading Users...</div>
                ) : (
                    <div className="table-responsive flex-grow-1 overflow-auto">
                        <table className="table table-hover align-middle">
                            <thead className="table-light">
                                <tr>
                                    <th>User ID</th>
                                    <th>User Name</th>
                                    <th>Full Name</th>
                                    <th>Email</th>
                                    <th className="text-center">Role</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length > 0 ? filteredUsers.map(user => (
                                    <tr key={user.id}>
                                        <td>{user.id}</td>
                                        <td>**{user.user_name}**</td>
                                        <td>{user.full_name}</td>
                                        <td>{user.email}</td>
                                        <td className="text-center">
                                            <span className={`badge ${user.user_type === 'Admin' ? 'bg-danger' : 'bg-primary'}`}>
                                                {user.user_type}
                                            </span>
                                        </td>
                                        <td className="text-end d-flex gap-2 justify-content-end">
                                            {/* Role Change Buttons */}
                                            {user.user_type === 'Admin' ? (
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => handleUpdateRole(user.id, user.user_name, user.user_type, 'Member')}
                                                    title="Demote to Member"
                                                >
                                                    <FaUserTag /> Demote
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleUpdateRole(user.id, user.user_name, user.user_type, 'Admin')}
                                                    title="Promote to Admin"
                                                >
                                                    <FaCrown /> Promote
                                                </button>
                                            )}

                                            {/* Delete User Button */}
                                            <button 
                                                className="btn btn-sm btn-outline-danger" 
                                                onClick={() => handleRemoveUser(user.id, user.user_name)}
                                                title="Globally Delete User"
                                            >
                                                <FaUserMinus /> Delete
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="text-center text-muted p-4">
                                            No users found matching "{searchTerm || 'criteria'}" for {customerName}.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuperAdminUserManager;