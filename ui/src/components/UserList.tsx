// UserList.tsx
import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaMicrophoneSlash, FaVideoSlash, FaRobot, FaMicrophone } from "react-icons/fa";
import { BotNames } from "../Constants"; // keep as in your project

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
  // optionally exclude a user (e.g. active sharer) from grid thumbnails
  excludeUserId?: string | null;
}

/** color palette you used previously — unchanged */
const COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2",
  "#59a14f", "#edc949", "#af7aa1", "#ff9da7",
  "#9c755f", "#bab0ab",
];

const BotBox = () => (
  <motion.div
    drag
    dragMomentum={false}
    whileHover={{ scale: 1.03 }}
    className="position-fixed bg-dark text-white px-4 py-3 rounded-4 shadow"
    style={{
      bottom: 24,
      right: 24,
      border: "1px solid var(--primary)",
      boxShadow: "0 0 12px rgba(0,191,255,0.4)",
      zIndex: 1200,
      cursor: "grab",
    }}
  >
    <div className="d-flex align-items-center gap-3">
      <FaRobot className="text-info" size={20} />
      <div>
        <strong>Bot Active</strong>
        <div className="text-secondary small">AI Assistant Running</div>
      </div>
    </div>
  </motion.div>
);

const UserCard: React.FC<{ user: User; color: string; singleView?: boolean }> = ({ user, color, singleView }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && user.stream) {
      try {
        videoRef.current.srcObject = user.stream;
        const p = videoRef.current.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        console.warn("attach stream failed", e);
      }
    }
  }, [user.stream]);

  const showPlaceholder = !user.stream || user.isCameraOff;

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.01 }}
      animate={{
        scale: user.speaking ? 1.03 : 1,
        boxShadow: user.speaking ? "0 0 18px rgba(0,255,140,0.45)" : "0 0 8px rgba(0,0,0,0.2)",
      }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="d-flex flex-column position-relative rounded-3"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        border: `2px solid ${user.speaking ? "rgba(16,185,129,0.8)" : "transparent"}`,
        background: "var(--surface)",
      }}
    >
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: showPlaceholder ? color : "#000" }}>
        {showPlaceholder ? (
          <div style={{ color: "#fff", fontSize: singleView ? 96 : 40, fontWeight: 700 }}>{user.id.charAt(0).toUpperCase()}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted={user.isLocal} style={{ width: "100%", height: "100%", objectFit: singleView ? "contain" : "cover" }} />
        )}

        {user.speaking && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(16,185,129,0.9)", color: "#fff", padding: "6px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            <FaMicrophone /> Speaking
          </motion.div>
        )}
      </div>

      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.25))", color: "#fff" }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{user.isLocal ? `${user.id} (You)` : user.id}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {user.isMuted && <FaMicrophoneSlash className="text-danger" />}
          {user.isCameraOff && <FaVideoSlash className="text-warning" />}
        </div>
      </div>
    </motion.div>
  );
};

const UserList: React.FC<UserListProps> = ({ users, excludeUserId = null }) => {
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setIsMobile(e.contentRect.width < 650);
      }
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  if (!users || users.length === 0) return null;

  const realUsers = users.filter((u) => !BotNames.map(b=>b.toLowerCase()).includes(u.id.toLowerCase()));
  const botUsers = users.filter((u) => BotNames.map(b=>b.toLowerCase()).includes(u.id.toLowerCase()));

  // exclude the active sharer from grid thumbnails
  const shownUsers = excludeUserId ? realUsers.filter(u => u.id !== excludeUserId) : realUsers;

  const singleView = shownUsers.length === 1;

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", padding: 12 }}>
      <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <AnimatePresence>
          {shownUsers.map((u, i) => (
            <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <UserCard user={u} color={COLORS[i % COLORS.length]} singleView={singleView} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {botUsers.length > 0 && <BotBox />}
    </div>
  );
};

export default UserList;
