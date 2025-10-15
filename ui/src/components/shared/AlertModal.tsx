import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertTriangle } from 'react-icons/fi';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export default function AlertModal({ isOpen, onClose, onConfirm, title, message }: AlertModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ background: 'rgba(0, 0, 0, 0.6)', zIndex: 9999 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
            className="bg-dark border border-secondary rounded-3 shadow-lg p-4"
            style={{ minWidth: '300px', maxWidth: '500px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="modal-title d-flex align-items-center gap-2">
                <FiAlertTriangle className="text-warning" /> {title}
              </h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <p className="text-muted">{message}</p>
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { onConfirm(); onClose(); }}>Confirm</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}