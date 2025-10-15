import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import CalendarView from './components/calendar/CalendarView';
import Home from './components/home/Home';
import MeetingList from './components/meetingList/MeetingList';
import ParticipantManager from './components/participant/ParticipantManager';
import type { UserAndRoom } from './types/meeting.types';

// The user prop is "drilled" from App -> PageRouter -> Home
interface PageRouterProps {
  user: UserAndRoom;
  onLogout: () => void;
}


export default function PageRouter({ user }: PageRouterProps) {
  return (
    <BrowserRouter>
      <Routes>
        {/* The Home page is the default route */}
        <Route path="/" element={<Home user={user} />} />

        {/* Other application pages */}
        <Route path="/meetings" element={<MeetingList />} />
        <Route path="/participants" element={<ParticipantManager />} />
        <Route path="/calendar" element={<CalendarView />} />

        {/* A catch-all route that redirects any unknown URL back to the Home page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}