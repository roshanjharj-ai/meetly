import { useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UserContext } from './context/UserContext';

import MainLayout from './components/MainLayout';

// Import all your page components
import "./App.css";
import CalendarView from './components/calendar/CalendarView';
import Home from './components/home/Home';
import JoinMeeting from './components/meeting/JoinMeeting';
import Signup from './components/meeting/Signup';
import StartMeeting from './components/meeting/StartMeeting';
import MeetingList from './components/meetingList/MeetingList';
import ParticipantManager from './components/participant/ParticipantManager';

import "./App.css";
import UserProfile from './components/UserProfile';
import MeetingHome from './components/meeting/MeetingHome';

export default function App() {
  // Destructure values from the UserContext
  const { token, user, logout, isLoading, theme } = useContext(UserContext);

  // While the context is checking for a token, show a loading state
  if (isLoading) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // --- Router for Unauthenticated Users ---
  // If no token is present, only show the login and signup pages
  if (!token) {
    return (
      <div className="vh-100" data-bs-theme={theme}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<StartMeeting />} />
            <Route path="/signup" element={<Signup />} />
            {/* Any other path redirects to the login page */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </div>
    );
  }

  // --- Router for Authenticated Users ---
  // If a token exists, show the main application layout and protected routes
  return (
    user != null && (
      <div className="vh-100" data-bs-theme={theme}>
        <BrowserRouter>
          <Routes>
            {/* All protected routes are children of the MainLayout */}
            <Route element={<MainLayout onLogout={logout} />}>
              <Route path="/" element={<Home user={user} />} />
              <Route path="/join" element={<JoinMeeting />} />
              <Route path="/meetings" element={<MeetingList />} />
              <Route path="/participants" element={<ParticipantManager />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/meet/*" element={<MeetingHome />} />
              <Route path="/profile" element={<UserProfile />} />
            </Route>

            {/* If a logged-in user tries to access login/signup, redirect to home */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />

            {/* Any other unknown path for a logged-in user redirects to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </div>)
  );
}