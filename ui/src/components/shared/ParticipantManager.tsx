// src/components/participant/ParticipantManager.tsx
import { useEffect, useState } from 'react';
import { FiEdit, FiPlus, FiTrash2, FiUsers } from 'react-icons/fi';
import { createParticipant, deleteParticipant, getParticipants, updateParticipant } from '../../services/api';
import type { Participant, CreateParticipantRequest } from '../../types/meeting.types';
import AlertModal from '../shared/AlertModal';
import Spinner from '../shared/Spinner';
import ParticipantDrawer from './ParticipantDrawer';

export default function ParticipantManager() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [participantToEdit, setParticipantToEdit] = useState<Participant | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<Participant | null>(null);

  const fetchParticipants = async () => {
    setIsLoading(true);
    try {
      const data = await getParticipants();
      setParticipants(data);
    } catch (error) {
      console.error("Failed to fetch participants", error);
      // Here you can set an error state and show a toast/message
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const handleAddClick = () => {
    setParticipantToEdit(null);
    setIsDrawerOpen(true);
  };

  const handleEditClick = (participant: Participant) => {
    setParticipantToEdit(participant);
    setIsDrawerOpen(true);
  };

  const handleDeleteClick = (participant: Participant) => {
    setParticipantToDelete(participant);
  };

  const confirmDelete = async () => {
    if (!participantToDelete) return;
    try {
      await deleteParticipant(participantToDelete.id);
      setParticipants(prev => prev.filter(p => p.id !== participantToDelete.id));
    } catch (error) {
      console.error("Failed to delete participant", error);
    } finally {
      setParticipantToDelete(null);
    }
  };

  const handleSave = async (data: Participant | CreateParticipantRequest) => {
    setIsSubmitting(true);
    try {
      if ('id' in data) { // Editing existing participant
        const updated = await updateParticipant(data);
        setParticipants(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else { // Creating new participant
        const created = await createParticipant(data);
        setParticipants(prev => [...prev, created]);
      }
      setIsDrawerOpen(false);
    } catch (error) {
      console.error("Failed to save participant", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="d-flex align-items-center gap-2"><FiUsers /> Participants</h2>
        <button className="btn btn-primary d-flex align-items-center gap-2" onClick={handleAddClick}>
          <FiPlus /> Add Participant
        </button>
      </div>

      <div className="list-group">
        {participants.length === 0 ? (
            <p className="text-center text-muted">No participants found. Add one to get started!</p>
        ) : (
            participants.map(p => (
                <div key={p.id} className="list-group-item list-group-item-action bg-dark text-white d-flex justify-content-between align-items-center">
                    <div>
                        <h5 className="mb-1">{p.name}</h5>
                        <p className="mb-1 text-muted">{p.email} {p.mobile && `| ${p.mobile}`}</p>
                    </div>
                    <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => handleEditClick(p)}><FiEdit /></button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteClick(p)}><FiTrash2 /></button>
                    </div>
                </div>
            ))
        )}
      </div>

      <ParticipantDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSave={handleSave}
        participantToEdit={participantToEdit}
        isLoading={isSubmitting}
      />

      <AlertModal
        isOpen={!!participantToDelete}
        onClose={() => setParticipantToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Participant"
        message={`Are you sure you want to delete ${participantToDelete?.name}? This action cannot be undone.`}
      />
    </div>
  );
}