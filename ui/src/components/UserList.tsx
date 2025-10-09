import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaMicrophoneSlash, FaVideoSlash, FaRobot } from "react-icons/fa";
import { BotNames } from "../Constants";

interface User {
  id: string;
  stream?: MediaStream;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  speaking?: boolean;
}

interface UserListProps {
  users: User[];
  view: "grid" | "circle";
}

const COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2",
  "#59a14f", "#edc949", "#af7aa1", "#ff9da7",
  "#9c755f", "#bab0ab",
];

// ─────────────────────────────
// Single user or grid card
// ─────────────────────────────
const UserCard = ({
  user,
  color,
  singleView = false,
}: {
  user: User;
  color: string;
  singleView?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && user.stream) {
      videoRef.current.srcObject = user.stream;
    }
  }, [user.stream]);

  const showPlaceholder = !user.stream || user.isCameraOff;

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.01 }}
      className="shadow-sm d-flex flex-column position-relative"
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "14px",
        border: `2px solid ${user.speaking ? "var(--accent)" : "var(--border)"}`,
        background: "var(--surface)",
        overflow: "hidden",
        justifyContent: "flex-start",
      }}
    >
      {/* Video / Placeholder */}
      <div
        className="flex-grow-1 d-flex align-items-center justify-content-center position-relative"
        style={{
          width: "100%",
          height: singleView ? "calc(100% - 44px)" : "100%",
          overflow: "hidden",
          background: showPlaceholder ? color : "#000",
          display: "flex",
        }}
      >
        {showPlaceholder ? (
          <div
            className="d-flex align-items-center justify-content-center w-100 h-100"
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: singleView ? 120 : 48,
              textShadow: "0 0 8px rgba(0,0,0,0.6)",
            }}
          >
            {user.id.charAt(0).toUpperCase()}
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={user.isLocal}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "100%",
              maxHeight: singleView ? "calc(100vh - 200px)" : "100%",
              objectFit: singleView ? "contain" : "cover",
              borderRadius: "14px",
              display: "block",
              background: "#000",
            }}
          />
        )}
      </div>

      {/* Footer with name & icons */}
      <div
        className="w-100 d-flex align-items-center justify-content-between px-3"
        style={{
          height: 44,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.8) 100%)",
          color: "#fff",
          fontWeight: 600,
          fontSize: 14,
          position: "absolute",
          bottom: 0,
          left: 0,
          borderBottomLeftRadius: "14px",
          borderBottomRightRadius: "14px",
        }}
      >
        <div className="text-truncate" style={{ maxWidth: "75%" }}>
          {user.isLocal ? `${user.id} (You)` : user.id}
        </div>
        <div className="d-flex align-items-center gap-2">
          {user.isMuted && <FaMicrophoneSlash className="text-danger" />}
          {user.isCameraOff && <FaVideoSlash className="text-warning" />}
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────
// Movable Bot box
// ─────────────────────────────
const BotBox = () => (
  <motion.div
    drag
    dragMomentum={false}
    whileHover={{ scale: 1.05 }}
    className="position-fixed bg-dark text-white px-4 py-3 rounded-4 shadow"
    style={{
      bottom: 24,
      right: 24,
      border: "1px solid var(--primary)",
      boxShadow: "0 0 12px rgba(0,191,255,0.4)",
      zIndex: 1000,
      cursor: "grab",
    }}
  >
    <div className="d-flex align-items-center gap-3">
      <FaRobot className="text-info" size={22} />
      <div>
        <strong>Bot Active</strong>
        <div className="text-secondary" style={{ fontSize: 13 }}>
          AI Assistant Running
        </div>
      </div>
    </div>
  </motion.div>
);

// ─────────────────────────────
// User list grid/circle
// ─────────────────────────────
const UserList: React.FC<UserListProps> = ({ users, view }) => {
  if (!users?.length) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // 👇 Switch to vertical when width < 650px (tweakable)
        setIsMobileLayout(width < 650);
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);


  const botUsers = users.filter((u) =>
    BotNames.some((b) => b.toLowerCase() === u.id.toLowerCase())
  );
  const realUsers = users.filter(
    (u) => !BotNames.some((b) => b.toLowerCase() === u.id.toLowerCase())
  );

  const total = realUsers.length;
  const colorForUser = (i: number) => COLORS[i % COLORS.length];

  if (view === "circle") {
    return (
      <div
        className="d-flex flex-wrap justify-content-center align-content-start gap-3 p-3 w-100 h-100"
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          overflow: "auto",
        }}
      >
        {realUsers.map((u, i) => (
          <div
            key={u.id}
            className="rounded-circle d-flex align-items-center justify-content-center text-white"
            style={{
              width: 96,
              height: 96,
              background: colorForUser(i),
              border: `2px solid ${u.speaking ? "var(--accent)" : "var(--border)"
                }`,
              fontWeight: 600,
              fontSize: 28,
            }}
          >
            {u.id.charAt(0).toUpperCase()}
          </div>
        ))}
        {botUsers.length > 0 && <BotBox />}
      </div>
    );
  }

  const singleView = total === 1;

  return (
    <div
      ref={containerRef}
      className="w-100 h-100 p-3 participant-grid overflow-auto"
      style={{
        display: isMobileLayout ? "flex" : "grid",
        flexDirection: isMobileLayout ? "column" : undefined,
        alignItems: "center",
        justifyContent: isMobileLayout ? "center" : undefined,
        gridTemplateColumns: isMobileLayout ? undefined : "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem",
      }}
    >
      <AnimatePresence>
        {realUsers.map((u: any, i: number) => (
          <motion.div
            key={u.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            style={{
              width: isMobileLayout ? "100%" : "auto",
              aspectRatio: isMobileLayout ? "1 / 1" : undefined,
              maxWidth: isMobileLayout ? "400px" : "auto",
            }}
            className="participant-card-wrapper"
          >
            <UserCard user={u} color={colorForUser(i)} singleView={singleView} />
          </motion.div>
        ))}
      </AnimatePresence>
      {botUsers?.length > 0 && <BotBox />}
    </div>
  );
};

export default UserList;
