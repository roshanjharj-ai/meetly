import { useContext } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { UserContext } from './context/UserContext';

import MainLayout from './components/MainLayout';

// Import all your page components
import "./App.css";
import CalendarView from './components/calendar/CalendarView';
import JoinMeeting from './components/meeting/JoinMeeting';
import Signup from './components/meeting/Signup';
import Login from './components/Login';
import MeetingList from './components/meetingList/MeetingList';
import ParticipantManager from './components/participant/ParticipantManager';

import "./App.css";
import BotDetail from './components/bot/BotDetail';
import BotManager from './components/bot/BotManager';
import DashboardHome from './components/Dashboard';
import MeetingHome from './components/meeting/MeetingHome';
import PreJoinMeeting from './components/meeting/PreJoinMeeting';
import OrganizationManager from './components/OrganizationManager';
import UserProfile from './components/UserProfile';
import UserManager from './components/UserManager';
import MeetingHistory from './components/meeting/MeetingHistory';
import ForgotPassword from './components/ForgotPassword';
import SuperAdminOrgManager from './components/SuperAdminOrganizationManager';
import LicenseExpired from './components/LicenseExpired';


// --- Helper Component 1: ScopedRoutes (The content loader for Admins/Members) ---
const ScopedRoutes = ({ onLogout, user }: { onLogout: () => void, user: any }) => {
  const { customerSlug } = useParams<{ customerSlug: string }>();

  // CRITICAL GUARD: Redirect if the URL slug doesn't match the authenticated user's slug
  if (customerSlug !== user.customer_slug) {
    return <Navigate to={`/${user.customer_slug}/dashboard`} replace />;
  }

  return (
    <Routes>
      <Route element={<MainLayout onLogout={onLogout} />}>
        <Route path="dashboard" element={<DashboardHome user={user} />} />
        <Route path="join" element={<JoinMeeting />} />
        <Route path="prejoin" element={<PreJoinMeeting />} />
        <Route path="meetings" element={<MeetingList />} />
        <Route path="participants" element={<ParticipantManager />} />
        <Route path='bots' element={<BotManager />} />
        <Route path='bots/:botId' element={<BotDetail />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="meet/*" element={<MeetingHome />} />
        <Route path="profile" element={<UserProfile />} />
        {user.user_type === 'Admin' && (
          <Route path="organization" element={<OrganizationManager />} />
        )}
        {user.user_type === 'Admin' && (
          <Route path="members" element={<UserManager />} /> // User Management for Admins
        )}
        <Route path="history" element={<MeetingHistory user={user} />} />
      </Route>
      {/* Catch-all for paths under the valid slug */}
      <Route path="*" element={<Navigate to={`/${customerSlug}/dashboard`} replace />} />
    </Routes>
  );
};


// --- Main App Component ---
export default function App() {
  const { token, user, logout, isLoading, theme } = useContext(UserContext);

  if (isLoading) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const isAuthenticated = token && user && user.customer_id && user.customer_slug;
  const customerSlug = user?.customer_slug || 'default';

  // Check for license expiration/revocation
  if (isAuthenticated && (user.license_status === 'Expired' || user.license_status === 'Revoked')) {
    // This is the gate, rendering the license request UI if access is denied
    return <LicenseExpired customerSlug={customerSlug} customerId={user.customer_id} />;
  }

  return (
    <div className="vh-100" data-bs-theme={theme}>
      <Routes>

        {/* --- Public (Unauthenticated) Routes --- */}
        {!isAuthenticated && (
          <>
            {/* Public paths serve the login/signup pages */}
            <Route path="/:customerSlug/prejoin" element={<PreJoinMeeting />} />
            <Route path="/prejoin" element={<PreJoinMeeting />} />
            <Route path="/:customerSlug/login" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/:customerSlug/signup" element={<Signup />} />
            <Route path="/signup" element={<Signup />} />
            
            {/* Password Reset Routes */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ForgotPassword />} />

            {/* Default redirect for all unauthenticated users */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}

        {/* --- Protected (Authenticated) Route Block --- */}
        {isAuthenticated && (
          <>
            {/* 1. Catch all public/unscoped entry points and redirect to the scoped dashboard */}
            <Route path="/" element={<Navigate to={`/${customerSlug}/dashboard`} replace />} />
            <Route path="/login" element={<Navigate to={`/${customerSlug}/dashboard`} replace />} />
            <Route path="/signup" element={<Navigate to={`/${customerSlug}/dashboard`} replace />} />

            {/* 2. SUPERADMIN GLOBAL ROUTES (Wrapped in MainLayout) */}
            {user?.user_type === 'SuperAdmin' && (
              <Route element={<MainLayout onLogout={logout} />}>
                <Route path="/superadmin/orgs" element={<SuperAdminOrgManager />} />
              </Route>
            )}

            {/* 3. MAIN SCOPED ROUTES (Member/Admin) */}
            <Route path={`/:customerSlug/*`} element={<ScopedRoutes onLogout={logout} user={user} />} />

            {/* 4. FAILSAFE: If authenticated but somehow hit a path not covered, redirect to the scoped dashboard */}
            <Route path="*" element={<Navigate to={`/${customerSlug}/dashboard`} replace />} />
          </>
        )}
      </Routes>
    </div>
  );
}