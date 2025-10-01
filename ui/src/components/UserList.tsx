// src/components/UserList.tsx
import React, { useRef, useEffect } from 'react';
import { FaMicrophoneSlash, FaVideoSlash } from 'react-icons/fa';
import { Container, Row, Col, Card } from "react-bootstrap";
import { motion, AnimatePresence } from "framer-motion";

// User now includes their stream and full status
interface User {
  id: string;
  stream?: MediaStream;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
}

interface UserListProps {
  users: User[];
}

const UserCard = ({ user }: { user: User }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && user.stream) {
      videoRef.current.srcObject = user.stream;
    }
  }, [user.stream]);

  return (
    <Card className="text-white shadow-sm bg-dark border-secondary h-100 position-relative">
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={user.isLocal} // Mute your own video to prevent echo
        className="w-100 h-100"
        style={{ objectFit: 'cover', display: user.isCameraOff ? 'none' : 'block' }}
      />
      {/* Avatar Fallback */}
      {user.isCameraOff && (
        <div className="w-100 h-100 d-flex align-items-center justify-content-center">
           <div
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "80px", height: "80px", backgroundColor: "rgba(255,255,255,0.1)", fontSize: "2rem" }}
            >
              {user.id.charAt(0).toUpperCase()}
            </div>
        </div>
      )}
      {/* Name and Status Overlay */}
      <div className="position-absolute bottom-0 start-0 p-2 d-flex align-items-center gap-2">
        <span>{user.isLocal ? `${user.id} (You)` : user.id}</span>
        {user.isMuted && <FaMicrophoneSlash className="text-danger" />}
        {user.isCameraOff && <FaVideoSlash className="text-warning" />}
      </div>
    </Card>
  );
};

const UserList: React.FC<UserListProps> = ({ users }) => {
  const count = users.length;
  
  const cardVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
  };

  return (
    <Container fluid className="p-3 d-flex flex-column" style={{ height: "calc(100vh - 100px)" }}>
      <Row className="flex-grow-1 g-3">
        <AnimatePresence>
          {users.map((user) => {
            let colSize = 12;
            if (count === 2 || count === 4) colSize = 6;
            else if (count >= 3) colSize = 4;
            
            return (
              <Col key={user.id} xs={12} md={colSize} className="d-flex">
                 <motion.div
                    layout
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.3 }}
                    className="w-100"
                 >
                   <UserCard user={user} />
                 </motion.div>
              </Col>
            );
          })}
        </AnimatePresence>
      </Row>
    </Container>
  );
};

export default UserList;