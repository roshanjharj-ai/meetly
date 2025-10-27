// src/components/UserList.tsx
import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import { FaMicrophone, FaMicrophoneSlash, FaVideoSlash } from "react-icons/fa";

interface User {
  id: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  speaking?: boolean;
}

const ParticipantItem = React.memo(
  ({ id, isLocal, isMuted, isCameraOff, speaking }: User) => {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{
          duration: 0.2,
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
        className="d-flex align-items-center justify-content-between p-2 rounded w-100"
        style={{
          // Use theme-aware colors for a professional look
          background: speaking
            ? "var(--bs-success-bg-subtle, rgba(22, 163, 74, 0.2))"
            : "var(--bs-secondary-bg-subtle, rgba(255,255,255,0.08))",
          border: speaking ? '1px solid var(--bs-success)' : '1px solid transparent',
          transition: 'background 0.3s ease, border 0.3s ease',
        }}
      >
        <div className="fw-bold text-truncate pe-2">
          {isLocal ? `${id} (You)` : id}
        </div>
        <div className="d-flex gap-3 align-items-center flex-shrink-0">
          {speaking && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <FaMicrophone className="text-success" />
            </motion.div>
          )}
          {isMuted && <FaMicrophoneSlash className="text-danger" />}
          {isCameraOff && <FaVideoSlash className="text-warning" />}
        </div>
      </motion.div>
    );
  }
);

interface UserListProps {
  users: User[];
  botSpeaker: string;
  botNames: string[];
  excludeUserId?: string | null;
}

const UserListComponent: React.FC<UserListProps> = ({
  users,
  excludeUserId = null,
  botNames,
}) => {
  const shownUsers = users.filter(
    (u) => u.id !== excludeUserId && !botNames.includes(u.id)
  );

  return (
    <div className="d-flex flex-column gap-2 w-100">
      <AnimatePresence>
        {shownUsers.map((user) => (
          <ParticipantItem
            key={user.id}
            id={user.id}
            isLocal={user.isLocal}
            isMuted={user.isMuted}
            isCameraOff={user.isCameraOff}
            speaking={user.speaking}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(UserListComponent);