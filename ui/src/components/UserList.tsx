import React from 'react';
import { FaMicrophoneSlash, FaVideoSlash } from 'react-icons/fa';
import { Container, Row, Col, Card } from "react-bootstrap";

interface User {
  name: string;
  micOff?: boolean;
  videoOff?: boolean;
}

interface UserListProps {
  users: User[];
  cardBgColor?: string;      // e.g., 'bg-green-500'
  cardBorderColor?: string;  // e.g., 'border-blue-400'
}

const UserList: React.FC<UserListProps> = ({
  users,
  cardBgColor = "bg-dark",
  cardBorderColor = "border-secondary",
}) => {

  const count = users.length;
  return (
    <Container fluid className="vw-100 pt-4 px-3 pb-0 d-flex flex-column" style={{ height: "calc(100vh - 100px)" }}>
      {/* Handle special 3-user layout */}
      {count === 3 ? (
        <>
          {/* Top full-width user */}
          <Row className="flex-grow-1 g-2" style={{ flex: 1 }}>
            <Col>
              <Card
                className={`text-white shadow-sm ${cardBgColor} ${cardBorderColor} h-100`}
              >
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
                    {users[0].name.charAt(0).toUpperCase()}
                  </div>
                  <div className="fw-medium text-truncate w-100 text-center">
                    {users[0].name}
                  </div>
                  <div className="position-absolute top-0 end-0 d-flex gap-2 p-2">
                    {users[0].micOff && <FaMicrophoneSlash className="text-danger" />}
                    {users[0].videoOff && <FaVideoSlash className="text-warning" />}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          {/* Bottom two users */}
          <Row className="flex-grow-1 g-2" style={{ flex: 1 }}>
            {users.slice(1).map((user, index) => (
              <Col key={index}>
                <Card
                  className={`text-white shadow-sm ${cardBgColor} ${cardBorderColor} h-100`}
                >
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
                    <div className="fw-medium text-truncate w-100 text-center">
                      {user.name}
                    </div>
                    <div className="position-absolute top-0 end-0 d-flex gap-2 p-2">
                      {user.micOff && <FaMicrophoneSlash className="text-danger" />}
                      {user.videoOff && <FaVideoSlash className="text-warning" />}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      ) : (
        // Default grid layout for 1, 2, 4+ users
        <Row
          className="flex-grow-1 g-2"
          style={{ height: "100%", display: "flex", flexWrap: "wrap" }}
        >
          {users.map((user, index) => {
            let colSize = 12; // default full width
            if (count === 2) colSize = 6; // 2 users side by side
            else if (count === 4) colSize = 6; // 2x2 grid
            else if (count === 5 || count === 6) colSize = 4; // 3 per row
            return (
              <Col key={index} xs={12} sm={colSize} className="d-flex">
                <Card
                  className={`text-white shadow-sm ${cardBgColor} ${cardBorderColor} flex-fill`}
                >
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
                    <div className="fw-medium text-truncate w-100 text-center">
                      {user.name}
                    </div>
                    <div className="position-absolute top-0 end-0 d-flex gap-2 p-2">
                      {user.micOff && <FaMicrophoneSlash className="text-danger" />}
                      {user.videoOff && <FaVideoSlash className="text-warning" />}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </Container>
  );
};

export default UserList;
