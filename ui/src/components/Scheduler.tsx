// src/App.tsx
import { useState } from 'react';
import MeetingList from './meetingList/MeetingList';
import ParticipantManager from './participant/ParticipantManager';
import CalendarView from './calendar/CalendarView';

type Tab = 'meetings' | 'participants' | 'calendar';

export default function Scheduler() {
  const [activeTab, setActiveTab] = useState<Tab>('meetings');

  const renderContent = () => {
    switch (activeTab) {
      case 'meetings': return <MeetingList />;
      case 'participants': return <ParticipantManager />;
      case 'calendar': return <CalendarView />;
      default: return <MeetingList />;
    }
  };

  return (
    <div className="bg-dark text-white vh-100 d-flex flex-column" data-bs-theme="dark">
      <nav className="navbar navbar-expand-lg navbar-dark bg-black border-bottom border-secondary">
        <div className="container-fluid">
          <a className="navbar-brand" href="#">Meeting Scheduler</a>
          <div className="collapse navbar-collapse">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'meetings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('meetings')}
                >
                  My Meetings
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'participants' ? 'active' : ''}`}
                  onClick={() => setActiveTab('participants')}
                >
                  Participants
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'calendar' ? 'active' : ''}`}
                  onClick={() => setActiveTab('calendar')}
                >
                  My Calendar
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>
      <div className="flex-grow-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}