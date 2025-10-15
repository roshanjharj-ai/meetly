import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { FiSave, FiX, FiUsers, FiCalendar, FiFileText, FiLink } from 'react-icons/fi';
import type { CreateMeetingRequest, Meeting, Participant } from '../../types/meeting.types';
import { getParticipants } from '../../services/api';
import useMediaQuery from '../../hooks/useMediaQuery';
import Spinner from '../shared/Spinner';

interface MeetingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (meeting: CreateMeetingRequest | Meeting) => void;
  meetingToEdit?: Meeting | null;
  isLoading: boolean;
}

const initialFormState = { subject: '', agenda: '', dateTime: '', participants: [] as Participant[] };
const initialErrors = { subject: '', dateTime: '', participants: '' };

export default function MeetingDrawer({ isOpen, onClose, onSave, meetingToEdit, isLoading }: MeetingDrawerProps) {
  const [formState, setFormState] = useState(initialFormState);
  const [errors, setErrors] = useState(initialErrors);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const fetchAllParticipants = async () => {
      try {
        const data = await getParticipants();
        setAllParticipants(data);
      } catch (error) {
        console.error("Failed to fetch participants for drawer", error);
      }
    };
    if (isOpen) {
      fetchAllParticipants();
      if (meetingToEdit) {
        setFormState({
          subject: meetingToEdit.subject,
          agenda: meetingToEdit.agenda,
          dateTime: meetingToEdit.dateTime.substring(0, 16), // Format for datetime-local
          participants: meetingToEdit.participants,
        });
      } else {
        setFormState(initialFormState);
      }
      setErrors(initialErrors);
    }
  }, [isOpen, meetingToEdit]);

  const validate = () => {
    const newErrors = { ...initialErrors };
    let isValid = true;
    if (!formState.subject.trim()) { newErrors.subject = "Subject is required."; isValid = false; }
    if (!formState.dateTime) { newErrors.dateTime = "Date and time are required."; isValid = false; }
    if (formState.participants.length === 0) { newErrors.participants = "At least one participant is required."; isValid = false; }
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const dataToSave = { ...formState, dateTime: new Date(formState.dateTime).toISOString() };
      onSave(meetingToEdit ? { ...meetingToEdit, ...dataToSave } : dataToSave);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) { setErrors(prev => ({ ...prev, [name]: '' })); }
  };

  const handleAddParticipant = () => {
      const participantToAdd = allParticipants.find(p => p.id === selectedParticipantId);
      if (participantToAdd && !formState.participants.some(p => p.id === participantToAdd.id)) {
          setFormState(prev => ({ ...prev, participants: [...prev.participants, participantToAdd] }));
          setSelectedParticipantId('');
          setErrors(prev => ({ ...prev, participants: '' }));
      }
  };

  const handleRemoveParticipant = (id: string) => {
      setFormState(prev => ({ ...prev, participants: prev.participants.filter(p => p.id !== id) }));
  };
  
  const availableParticipants = allParticipants.filter(p => !formState.participants.some(fp => fp.id === p.id));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="position-fixed top-0 start-0 w-100 h-100" style={{ background: 'rgba(0, 0, 0, 0.6)', zIndex: 1040 }}
            onClick={onClose}
          />
          <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: 'tween', duration: 0.3 }}
            className="position-fixed top-0 end-0 h-100 bg-dark border-start border-secondary d-flex flex-column"
            style={{ width: isMobile ? '100%' : '600px', zIndex: 1050 }}
          >
            <div className="p-3 d-flex justify-content-between align-items-center border-bottom border-secondary">
              <h4 className="mb-0">{meetingToEdit ? "Edit Meeting" : "Create New Meeting"}</h4>
              <button className="btn btn-close" onClick={onClose}><FiX /></button>
            </div>
            <form className="p-4 overflow-auto flex-grow-1" onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <label htmlFor="subject" className="form-label">Subject</label>
                 <div className="input-group">
                   <span className="input-group-text"><FiFileText /></span>
                   <input type="text" className={`form-control ${errors.subject && 'is-invalid'}`} id="subject" name="subject" value={formState.subject} onChange={handleChange} required />
                   {errors.subject && <div className="invalid-feedback">{errors.subject}</div>}
                 </div>
              </div>
              <div className="mb-3">
                <label htmlFor="dateTime" className="form-label">Date & Time</label>
                 <div className="input-group">
                   <span className="input-group-text"><FiCalendar /></span>
                   <input type="datetime-local" className={`form-control ${errors.dateTime && 'is-invalid'}`} id="dateTime" name="dateTime" value={formState.dateTime} onChange={handleChange} required />
                   {errors.dateTime && <div className="invalid-feedback">{errors.dateTime}</div>}
                 </div>
              </div>
              <div className="mb-3">
                 <label htmlFor="agenda" className="form-label">Agenda (Optional)</label>
                 <textarea className="form-control" id="agenda" name="agenda" rows={4} value={formState.agenda} onChange={handleChange}></textarea>
              </div>
              <div className="mb-3">
                  <label className="form-label">Participants</label>
                   <div className="input-group">
                       <span className="input-group-text"><FiUsers /></span>
                       <select className="form-select" value={selectedParticipantId} onChange={e => setSelectedParticipantId(e.target.value)}>
                           <option value="">-- Select a participant to add --</option>
                           {availableParticipants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                       </select>
                       <button className="btn btn-outline-secondary" type="button" onClick={handleAddParticipant} disabled={!selectedParticipantId}>Add</button>
                   </div>
                   {errors.participants && <div className="d-block invalid-feedback text-danger small mt-1">{errors.participants}</div>}
                   <div className="mt-2 d-flex flex-wrap gap-2">
                       {formState.participants.map(p => (
                           <span key={p.id} className="badge bg-secondary d-flex align-items-center gap-2 p-2">
                               {p.name}
                               <button type="button" className="btn-close btn-close-white" style={{fontSize: '0.6rem'}} onClick={() => handleRemoveParticipant(p.id)}></button>
                           </span>
                       ))}
                   </div>
              </div>
              {meetingToEdit && (
                <div className="mb-3">
                  <label className="form-label">Meeting Link</label>
                  <div className="input-group">
                    <span className="input-group-text"><FiLink /></span>
                    <input type="text" className="form-control" value={meetingToEdit.meetingLink} readOnly />
                  </div>
                </div>
              )}
            </form>
            <div className="p-3 border-top border-secondary mt-auto">
              <button type="submit" className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2" onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? <Spinner /> : <><FiSave /> {meetingToEdit ? "Save Changes" : "Create & Send Invites"}</>}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}