import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FiCalendar, FiClock, FiEdit, FiPlus, FiTrash2, FiUsers, FiX } from 'react-icons/fi';
import useMediaQuery from '../../hooks/useMediaQuery';
import { createMeeting, deleteMeeting, getMeetings, updateMeeting } from '../../services/api';
import type { CreateMeetingRequest, Meeting } from '../../types/meeting.types';
import AlertModal from '../shared/AlertModal';
import MeetingDrawer from './MeetingDrawer';

const ParticipantsPanel = ({ meeting, onClose }: { meeting: Meeting | undefined; onClose: () => void; }) => {
    if (!meeting) return null;
    return (
        <>
            <div className="p-3 d-flex justify-content-between align-items-center border-bottom border-secondary flex-shrink-0">
                <h5 className="mb-0 d-flex align-items-center gap-2"><FiUsers/> Participants</h5>
                <button className="btn btn-close" onClick={onClose}><FiX/></button>
            </div>
            <div className="p-3 overflow-auto">
                <p className="small">For: <strong>{meeting.subject}</strong></p>
                <ul className="list-unstyled vstack gap-2">
                    {meeting.participants.map(p => (
                        <li key={p.id} className="p-2 rounded bg-secondary bg-opacity-10">
                            <strong>{p.name}</strong><br /><small className="text-body-secondary">{p.email}</small>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    )
}

// --- NEW SKELETON COMPONENT ---
const MeetingCardSkeleton = () => (
    <div className="card border-secondary placeholder-glow">
        <div className="card-body">
            <div className="d-flex justify-content-between">
                {/* Title and Action Buttons */}
                <div className="placeholder w-50" style={{ height: '24px' }}></div>
                <div className="d-flex gap-2">
                    <div className="placeholder btn btn-sm btn-outline-secondary" style={{ width: '30px', height: '30px' }}></div>
                    <div className="placeholder btn btn-sm btn-outline-danger" style={{ width: '30px', height: '30px' }}></div>
                </div>
            </div>
            {/* Datetime */}
            <h6 className="card-subtitle mb-2 text-body-secondary d-flex align-items-center gap-2 small mt-2">
                <div className="placeholder w-75" style={{ height: '18px' }}></div>
            </h6>
            {/* Agenda */}
            <p className="card-text small">
                <div className="placeholder w-100 mb-1"></div>
                <div className="placeholder w-50"></div>
            </p>
            {/* Participants and View All */}
            <div className="d-flex align-items-center gap-3 mt-3">
                <div className="d-flex">
                    <span className="placeholder badge rounded-pill bg-secondary me-1" style={{ width: '25px' }}></span>
                    <span className="placeholder badge rounded-pill bg-secondary me-1" style={{ width: '25px' }}></span>
                    <span className="placeholder badge rounded-pill bg-secondary me-1" style={{ width: '25px' }}></span>
                </div>
                <div className="placeholder btn btn-link btn-sm p-0" style={{ width: '100px', height: '20px' }}></div>
            </div>
        </div>
    </div>
);

const MeetingListSkeleton = () => (
    <main className="flex-grow-1 p-3 p-md-4 overflow-auto">
        {/* Header Skeleton */}
        <div className="d-flex flex-column flex-md-row justify-content-md-between align-items-md-center mb-4 gap-3 placeholder-glow">
          <div className="d-flex align-items-center gap-3">
             <div className="placeholder w-50" style={{ height: '30px' }}></div>
          </div>
          <div className="placeholder btn btn-primary" style={{ width: '150px', height: '38px' }}></div>
        </div>
        
        {/* List Skeletons */}
        <div className="vstack gap-3">
            <MeetingCardSkeleton />
            <MeetingCardSkeleton />
            <MeetingCardSkeleton />
        </div>
    </main>
);
// --- END SKELETON COMPONENT ---


export default function MeetingList() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  // Use state to track loading: true/false
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [activeParticipantsPanel, setActiveParticipantsPanel] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const fetchMeetings = async () => {
    setIsLoading(true);
    try {
      // Adding a small delay to clearly show the skeleton effect
      await new Promise(resolve => setTimeout(resolve, 500)); 

      const data = await getMeetings();
      setMeetings(data.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()));
    } catch (error) {
      console.error("Failed to fetch meetings", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);
  
  const handleAddClick = () => {
    setMeetingToEdit(null);
    setIsDrawerOpen(true);
  };

  const handleEditClick = (meeting: Meeting) => {
    setMeetingToEdit(meeting);
    setIsDrawerOpen(true);
  };
  
  const handleSave = async (data: CreateMeetingRequest | Meeting) => {
    setIsSubmitting(true);
    try {
        if ('id' in data) {
            await updateMeeting(data);
        } else {
            await createMeeting(data);
        }
        await fetchMeetings();
        setIsDrawerOpen(false);
    } catch (error) {
        console.error("Failed to save meeting", error);
    } finally {
        setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
      if (!meetingToDelete) return;
      try {
          await deleteMeeting(meetingToDelete.id);
          setMeetings(prev => prev.filter(m => m.id !== meetingToDelete.id));
      } catch (error) {
          console.error("Failed to delete meeting", error);
      } finally {
          setMeetingToDelete(null);
      }
  };

  const formatDate = (isoString: string) => {
      return new Date(isoString).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
      });
  };

  // Renders the skeleton during loading
  if (isLoading) return <div className="d-flex" style={{ height: "100%" }}><MeetingListSkeleton /></div>; 
  
  const activeMeetingForPanel = meetings.find(m => m.id === activeParticipantsPanel);

  return (
    <div className="d-flex" style={{ height: "100%" }}>
      <main className="flex-grow-1 p-3 p-md-4 overflow-auto">
        <div className="d-flex flex-column flex-md-row justify-content-md-between align-items-md-center mb-4 gap-3">
          <div className="d-flex align-items-center gap-3">
             {/* <button className="btn btn-outline-secondary d-inline-flex align-items-center" onClick={onBack}><FiArrowLeft/></button> */}
             <h2 className="mb-0 d-flex align-items-center gap-2"><FiCalendar /> My Meetings</h2>
          </div>
          <button className="btn btn-primary d-flex align-items-center justify-content-center gap-2" onClick={handleAddClick}><FiPlus /> New Meeting</button>
        </div>
        <div className="vstack gap-3">
          {meetings.length === 0 ? ( <p className="text-center text-body-secondary mt-5">You have no upcoming meetings.</p> ) : (
            meetings.map(meeting => (
              <div key={meeting.id} className="card border-secondary">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <h5 className="card-title text-primary">{meeting.subject}</h5>
                    <div className="d-flex gap-2">
                       <button className="btn btn-sm btn-outline-secondary" onClick={() => handleEditClick(meeting)}><FiEdit/></button>
                       <button className="btn btn-sm btn-outline-danger" onClick={() => setMeetingToDelete(meeting)}><FiTrash2/></button>
                    </div>
                  </div>
                  <h6 className="card-subtitle mb-2 text-body-secondary d-flex align-items-center gap-2 small"><FiClock /> {formatDate(meeting.dateTime)}</h6>
                  <p className="card-text small">{meeting.agenda}</p>
                  <div className="d-flex align-items-center gap-3">
                      <div className="d-flex">
                          {meeting.participants.slice(0, 3).map(p => <span key={p.id} className="badge rounded-pill bg-secondary me-1">{p.name.split(' ').map(n=>n[0]).join('')}</span>)}
                          {meeting.participants.length > 3 && <span className="badge rounded-pill border border-secondary">+{meeting.participants.length - 3}</span>}
                      </div>
                      <button className="btn btn-link btn-sm p-0" onClick={() => setActiveParticipantsPanel(meeting.id)}>View All ({meeting.participants.length})</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
      <AnimatePresence>
        {activeParticipantsPanel && !isMobile && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="h-100 border-start border-secondary flex-shrink-0 d-flex flex-column"
          >
            <ParticipantsPanel meeting={activeMeetingForPanel} onClose={() => setActiveParticipantsPanel(null)} />
          </motion.aside>
        )}
      </AnimatePresence>
      {isMobile && (
          <AnimatePresence>
              {activeParticipantsPanel && (
                  <motion.div
                      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                      transition={{ type: 'tween', duration: 0.3 }}
                      className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column"
                      style={{ zIndex: 2000 }}>
                      <ParticipantsPanel meeting={activeMeetingForPanel} onClose={() => setActiveParticipantsPanel(null)} />
                  </motion.div>
              )}
          </AnimatePresence>
      )}
      <MeetingDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onSave={handleSave} meetingToEdit={meetingToEdit} isLoading={isSubmitting} />
      <AlertModal isOpen={!!meetingToDelete} onClose={() => setMeetingToDelete(null)} onConfirm={confirmDelete} title="Delete Meeting" message={`Are you sure you want to delete "${meetingToDelete?.subject}"?`} />
    </div>
  );
}