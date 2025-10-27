// src/layout/AppLayout.tsx

import React, { type ReactNode } from 'react';
import { BsMoon, BsSun } from 'react-icons/bs';
import { FaCalendarPlus, FaChartLine, FaUsers } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';
// NOTE: Ensure your UserContext provides 'user', 'theme', and 'toggleTheme'

interface User {
    user_name: string;
    // ... other user properties
}

interface UserContextType {
    user: User | null;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
    // ... other context properties
}


// Placeholder for context (replace with your actual context)
const MockUserContext: UserContextType = {
    user: { user_name: 'Alex' } as User,
    theme: 'dark',
    toggleTheme: () => { console.log("Theme Toggled"); },
}

// Use your actual context here
// const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
//     const { user, theme, toggleTheme } = useContext(UserContext);
const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, theme, toggleTheme } = MockUserContext; // Replace MockUserContext with your actual UserContext
    const location = useLocation();

    // Do not show the navigation bar inside the live meeting
    const isInMeeting = location.pathname.includes('/meeting');

    return (
        <div className="app-layout-container" data-bs-theme={theme} style={{ minHeight: '100vh', background: 'var(--bs-body-bg)', color: 'var(--bs-body-color)' }}>
            {!isInMeeting && (
                <header className="d-flex align-items-center justify-content-between p-3 border-bottom" style={{ borderColor: 'var(--bs-border-color)' }}>
                    <div className="d-flex align-items-center gap-3">
                        <Link to="/" className="text-decoration-none fw-bold fs-4" style={{ color: 'var(--bs-primary)' }}>
                            CommLink Pro
                        </Link>
                    </div>

                    <nav className="d-none d-md-flex gap-4">
                        <NavLink to="/" icon={FaChartLine} label="Dashboard" />
                        <NavLink to="/upcoming" icon={FaCalendarPlus} label="Upcoming" />
                        <NavLink to="/participants" icon={FaUsers} label="People" />
                    </nav>

                    <div className="d-flex align-items-center gap-3">
                        <span className="fw-semibold d-none d-sm-inline" style={{ color: 'var(--bs-text-color)' }}>
                            Hello, {user?.user_name || 'Guest'}
                        </span>
                        <button
                            onClick={toggleTheme}
                            className="btn btn-sm"
                            style={{ background: 'var(--bs-secondary-bg)', color: 'var(--bs-secondary-color)' }}
                            aria-label="Toggle theme"
                        >
                            {theme === 'dark' ? <BsSun size={18} /> : <BsMoon size={18} />}
                        </button>
                    </div>
                </header>
            )}
            <main style={{ flexGrow: 1 }}>
                {children}
            </main>
        </div>
    );
};

const NavLink = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = useLocation().pathname === to;
    return (
        <Link
            to={to}
            className={`d-flex align-items-center gap-2 text-decoration-none fw-semibold ${isActive ? 'text-primary' : 'text-secondary'}`}
            style={{ transition: 'color 0.2s' }}
        >
            <Icon size={20} />
            <span>{label}</span>
        </Link>
    );
};

export default AppLayout;