import React from 'react';
import { FaMicrophoneSlash, FaVideoSlash } from 'react-icons/fa';
import { Container, Row, Col, Card } from "react-bootstrap";
import { motion, AnimatePresence } from "framer-motion"; // Import framer-motion

interface User {
  name: string;
  micOff?: boolean;
  videoOff?: boolean;
}

interface UserListProps {
  users: User[];
  cardBgColor?: string;
  cardBorderColor?: string;
}

const UserList: React.FC<UserListProps> = ({
  users,
  cardBgColor = "bg-dark",
  cardBorderColor = "border-secondary",
}) => {
  const count = users.length;

  // Animation properties for each user card
  const cardVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
  };

  const renderUserCard = (user: User) => (
    <Card className={`text-white shadow-sm ${cardBgColor} ${cardBorderColor} h-100`}>
      <Card.Body className="d-flex flex-column align-items-center justify-content-center position-relative">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center"
          style={{
            width: "64px",
            height: "64px",
            backgroundColor: "rgba(255,255,255,0.2)",
            fontSize: "1.25rem",
          }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="fw-medium text-truncate w-100 text-center">{user.name}</div>
        <div className="position-absolute top-0 end-0 d-flex gap-2 p-2">
          {user.micOff && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <FaMicrophoneSlash className="text-danger" />
            </motion.div>
          )}
          {user.videoOff && <FaVideoSlash className="text-warning" />}
        </div>
      </Card.Body>
    </Card>
  );

  return (
    <Container fluid className="vw-100 pt-4 px-3 pb-0 d-flex flex-column" style={{ height: "calc(100vh - 100px)" }}>
      {count === 3 ? (
        <>
          <Row className="flex-grow-1 g-2" style={{ flex: 1 }}>
            <Col>
              <motion.div layout variants={cardVariants} initial="hidden" animate="visible" className="h-100">
                {renderUserCard(users[0])}
              </motion.div>
            </Col>
          </Row>
          <Row className="flex-grow-1 g-2" style={{ flex: 1 }}>
            <AnimatePresence>
              {users.slice(1).map((user) => (
                <Col key={user.name}>
                  <motion.div layout variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="h-100">
                    {renderUserCard(user)}
                  </motion.div>
                </Col>
              ))}
            </AnimatePresence>
          </Row>
        </>
      ) : (
        <Row className="flex-grow-1 g-2" style={{ height: "100%", display: "flex", flexWrap: "wrap" }}>
          <AnimatePresence>
            {users.map((user) => {
              let colSize = 12;
              if (count === 2 || count === 4) colSize = 6;
              else if (count === 5 || count === 6) colSize = 4;

              return (
                <Col key={user.name} xs={12} sm={colSize} className="d-flex">
                  <motion.div layout variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="flex-fill">
                    {renderUserCard(user)}
                  </motion.div>
                </Col>
              );
            })}
          </AnimatePresence>
        </Row>
      )}
    </Container>
  );
};

export default UserList;