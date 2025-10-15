import { useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

// Import the new MainLayout component
import MainLayout from './components/MainLayout';

// Import all your page components
import CalendarView from './components/calendar/CalendarView';
import Home from './components/home/Home';
import JoinMeeting from './components/meeting/JoinMeeting';
import MeetingWrapper from './components/meeting/MeetingWrapper';
import StartMeeting from './components/meeting/StartMeeting';
import MeetingList from './components/meetingList/MeetingList';
import ParticipantManager from './components/participant/ParticipantManager';
import { UserContext } from './context/UserContext';

export default function App() {
  const userContext = useContext(UserContext);

  const handleLogin = (loggedInUser: { name: string, email: string, room: string }) => {
    userContext.setUser({ user: loggedInUser.name, email: loggedInUser.email, room: loggedInUser.room });
  };

  const handleLogout = () => {
    userContext.setUser(null);
  };

  // If the user is logged out, the router will redirect them to the /login page
  if (!userContext.user) {
    return (
      <div className="bg-dark text-white vh-100" data-bs-theme="dark">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<StartMeeting onLogin={handleLogin} />} />
            {/* Any other path will redirect to login if not authenticated */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </div>
    );
  }

  // If the user IS logged in, this router is used
  return (
    <div className="bg-dark text-white vh-100" data-bs-theme="dark">
      <BrowserRouter>
        <Routes>
          {/* A parent route that renders the MainLayout. All nested routes will appear inside the <Outlet /> */}
          <Route element={<MainLayout onLogout={handleLogout} />}>
            <Route path="/" element={<Home user={userContext.user} />} /> {/* Home page, now with the top bar */}
            <Route path="/join" element={<JoinMeeting />} />
            <Route path="/meetings" element={<MeetingList />} />
            <Route path="/participants" element={<ParticipantManager />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/meet/*" element={<MeetingWrapper />} />
          </Route>

          {/* If a logged-in user tries to go to /login, redirect them to the dashboard */}
          <Route path="/login" element={<Navigate to="/" replace />} />

          {/* Any other unknown path for a logged-in user will redirect to the dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}