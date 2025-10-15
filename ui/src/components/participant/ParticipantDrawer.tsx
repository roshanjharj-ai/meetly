import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FiSave, FiUser, FiMail, FiPhone, FiX } from 'react-icons/fi';
import type { Participant, CreateParticipantRequest } from '../../types/meeting.types';
import Spinner from '../shared/Spinner';
import useMediaQuery from '../../hooks/useMediaQuery';

interface ParticipantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (participant: Participant | CreateParticipantRequest) => void;
  participantToEdit?: Participant | null;
  isLoading: boolean;
}

const initialFormState = { name: '', email: '', mobile: '' };

export default function ParticipantDrawer({ isOpen, onClose, onSave, participantToEdit, isLoading }: ParticipantDrawerProps) {
  const [formState, setFormState] = useState(initialFormState);
  const [errors, setErrors] = useState(initialFormState);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    if (participantToEdit) {
      setFormState({ name: participantToEdit.name, email: participantToEdit.email, mobile: participantToEdit.mobile || '' });
    } else {
      setFormState(initialFormState);
    }
    setErrors(initialFormState);
  }, [isOpen, participantToEdit]);

  const validate = () => {
    const newErrors = { ...initialFormState };
    let isValid = true;
    if (!formState.name.trim()) { newErrors.name = "Name is required."; isValid = false; }
    if (!formState.email.trim()) { newErrors.email = "Email is required."; isValid = false; }
    else if (!/\S+@\S+\.\S+/.test(formState.email)) { newErrors.email = "Email is invalid."; isValid = false; }
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const dataToSave = participantToEdit ? { ...participantToEdit, ...formState } : formState;
      onSave(dataToSave);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) { setErrors(prev => ({ ...prev, [name]: '' })); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="position-fixed top-0 start-0 w-100 h-100" style={{ background: 'rgba(0, 0, 0, 0.6)', zIndex: 1040 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: 'tween', duration: 0.3 }}
            className="position-fixed top-0 end-0 h-100 bg-dark border-start border-secondary d-flex flex-column"
            style={{ width: isMobile ? '100%' : '450px', zIndex: 1050 }}
          >
            <div className="p-3 d-flex justify-content-between align-items-center border-bottom border-secondary">
              <h4 className="mb-0">{participantToEdit ? "Edit Participant" : "Add Participant"}</h4>
              <button className="btn btn-close" onClick={onClose}><FiX /></button>
            </div>
            <form className="p-4 overflow-auto flex-grow-1" onSubmit={handleSubmit} noValidate>
               <div className="mb-3">
                <label htmlFor="name" className="form-label">Full Name</label>
                <div className="input-group">
                  <span className="input-group-text"><FiUser /></span>
                  <input type="text" className={`form-control ${errors.name && 'is-invalid'}`} id="name" name="name" value={formState.name} onChange={handleChange} required />
                  {errors.name && <div className="invalid-feedback">{errors.name}</div>}
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="email" className="form-label">Email Address</label>
                <div className="input-group">
                  <span className="input-group-text"><FiMail /></span>
                  <input type="email" className={`form-control ${errors.email && 'is-invalid'}`} id="email" name="email" value={formState.email} onChange={handleChange} required />
                  {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="mobile" className="form-label">Mobile Number (Optional)</label>
                <div className="input-group">
                  <span className="input-group-text"><FiPhone /></span>
                  <input type="tel" className="form-control" id="mobile" name="mobile" value={formState.mobile} onChange={handleChange} />
                </div>
              </div>
            </form>
            <div className="p-3 border-top border-secondary mt-auto">
              <button type="submit" className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2" onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? <Spinner /> : <><FiSave /> Save Participant</>}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}