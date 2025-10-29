// src/components/UserManager.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaSearch, FaSpinner, FaUserMinus, FaUsers } from 'react-icons/fa';
import useMediaQuery from '../hooks/useMediaQuery';
import { getUsers, removeUserFromOrganization, type FetchedUser } from '../services/api'; // NEW API imports


const UserManager: React.FC = () => {
    const isMobile = useMediaQuery("(max-width: 767.98px)");
    
    const [users, setUsers] = useState<FetchedUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Mock/Fetch function to get users
    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setStatusMessage(null);
        try {
            // NOTE: We need a new API endpoint: /api/users/organization
            const fetchedUsers: FetchedUser[] = await getUsers(); 
            setUsers(fetchedUsers.filter(u => u.user_type !== 'Admin')); // Admins shouldn't easily remove each other
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to load user list.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleRemoveUser = async (userId: number, userName: string) => {
        if (!window.confirm(`Are you sure you want to remove user "${userName}" from the organization? This action is irreversible.`)) {
            return;
        }

        setStatusMessage(`Removing ${userName}...`);
        try {
            // NOTE: We need a new API endpoint: DELETE /api/users/{user_id}
            await removeUserFromOrganization(userId); 
            setStatusMessage(`Successfully removed ${userName}.`);
            // Optimistically update UI
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err: any) {
            setError(err.response?.data?.detail || `Failed to remove user ${userName}.`);
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
        <div className="p-4 p-md-5" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h1 className="fw-light mb-4 d-flex align-items-center gap-2"><FaUsers /> Member Management</h1>
            
            {statusMessage && <div className={`alert ${error ? 'alert-danger' : 'alert-info'} d-flex justify-content-between align-items-center`}>
                {statusMessage}
                {isLoading && <FaSpinner className="spinner-border" />}
            </div>}

            <div className="card shadow-sm p-4">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
                    <h2 className="fs-5 fw-semibold mb-0">Total Members: {totalMembers}</h2>
                    
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
                    <div className="text-center p-5"><FaSpinner className="spinner-border" size={30} /> Loading Members...</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-light">
                                <tr>
                                    <th>User Name</th>
                                    <th>Full Name</th>
                                    <th>Email</th>
                                    <th className="text-center">Type</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length > 0 ? filteredUsers.map(user => (
                                    <tr key={user.id}>
                                        <td>**{user.user_name}**</td>
                                        <td>{user.full_name}</td>
                                        <td>{user.email}</td>
                                        <td className="text-center">
                                            <span className={`badge ${user.user_type === 'Admin' ? 'bg-danger' : 'bg-primary'}`}>
                                                {user.user_type}
                                            </span>
                                        </td>
                                        <td className="text-end">
                                            <button 
                                                className="btn btn-sm btn-outline-danger" 
                                                onClick={() => handleRemoveUser(user.id, user.user_name)}
                                                title="Remove from Organization"
                                            >
                                                <FaUserMinus />
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="text-center text-muted p-4">
                                            No members found matching "{searchTerm || 'criteria'}".
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

export default UserManager;