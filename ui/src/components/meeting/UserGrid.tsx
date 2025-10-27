// src/components/UserGrid.tsx
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef } from "react";
import { FaMicrophoneSlash, FaThumbtack, FaVideoSlash } from "react-icons/fa";

// Define User type for export
export type User = {
  id: string;
  stream?: MediaStream;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  speaking?: boolean;
};

// Memoized component to prevent video streams from being re-attached on every render
const UserVideo = React.memo(
  ({ stream, isLocal }: { stream: MediaStream; isLocal: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: isLocal ? "scaleX(-1)" : "scaleX(1)", // Mirror local stream
        }}
      />
    );
  }
);

type Props = {
  users: User[];
  excludeUserId?: string | null;
  className?: string;
  // view?: "grid" | "circle"; // This is now controlled by MeetingLayout
  onPinUser?: (userId: string) => void; // NEW: Pin handler
  pinnedUserId?: string | null; // NEW: To show pin status
};

const COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7",
];

export default function UserGrid({
  users,
  excludeUserId = null,
  className = "",
  onPinUser,
  pinnedUserId,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shown = excludeUserId
    ? users.filter((u) => u.id !== excludeUserId)
    : users;

  // This effect dynamically calculates grid columns for responsiveness
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Check if we're in "filmstrip" mode (by checking parent's flex-direction or height)
    // A simple heuristic: if the container is much wider than it is tall, layout as a filmstrip.
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;

      if (h < w / 3 && h < 200) {
        // Looks like a filmstrip
        el.style.display = "flex";
        el.style.flexDirection = "row";
        el.style.overflowX = "auto";
        el.style.overflowY = "hidden";
        el.style.gridTemplateColumns = ""; // Unset grid
      } else {
        // Looks like a grid
        el.style.display = "grid";
        el.style.flexDirection = "";
        el.style.overflowX = "hidden";
        el.style.overflowY = "auto";
        const minTile = 160;
        const cols = Math.max(1, Math.floor(w / minTile));
        el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []); // Re-run if layout mode changes (e.g., filmstrip vs grid)

  return (
    <div
      ref={containerRef}
      className={`user-grid ${className}`}
      style={{ display: "grid", gap: "0.75rem", height: "100%", width: "100%" }}
    >
      <AnimatePresence>
        {shown.map((u, i) => (
          <motion.div
            key={u.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            // MODIFIED: Animate boxShadow for speaking
            animate={{
              opacity: 1,
              scale: 1,
              boxShadow: u.speaking
                ? "0 0 12px 4px rgba(16, 185, 129, 0.7)" // Pulsating green shadow
                : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", // Normal shadow
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            // MODIFIED: Add transition for boxShadow
            transition={{
              type: "spring", stiffness: 300, damping: 25,
              boxShadow: u.speaking
                ? {
                    duration: 0.8,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                  }
                : { type: "spring", stiffness: 300, damping: 25 },
            }}
            className="position-relative d-flex flex-column" // REMOVED shadow-lg (now handled by motion)
            style={{
              aspectRatio: "4 / 3",
              borderRadius: "0.75rem",
              overflow: "hidden",
              background: u.stream && !u.isCameraOff ? "#000" : COLORS[i % COLORS.length],
              // BORDER removed, replaced by boxShadow animation
              // Filmstrip-specific styles (for when display:flex is set by ResizeObserver)
              flexShrink: 0,
              width: "180px", // This will be the width in filmstrip mode
            }}
          >
            {/* NEW: Pin Button */}
            {onPinUser && (
              <button
                onClick={() => onPinUser(u.id)}
                className="btn btn-sm position-absolute"
                title={pinnedUserId === u.id ? "Unpin" : "Pin user"}
                style={{
                  zIndex: 10,
                  top: "0.5rem",
                  right: "0.5rem",
                  background: "rgba(0,0,0,0.5)",
                  color: "white",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FaThumbtack
                  className={pinnedUserId === u.id ? "text-warning" : ""}
                />
              </button>
            )}

            {!u.isCameraOff && u.stream ? (
              <UserVideo stream={u.stream} isLocal={!!u.isLocal} />
            ) : (
              <div className="flex-grow-1 d-flex align-items-center justify-content-center fw-bold text-white">
                <div style={{ fontSize: "clamp(2rem, 10vw, 4rem)" }}>
                  {u.id?.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <div
              className="position-absolute start-0 end-0 bottom-0 p-2 d-flex justify-content-between align-items-center"
              style={{
                background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
                color: "white",
              }}
            >
              <div
                className="fw-bold small"
                style={{ textShadow: "1px 1px 3px #000" }}
              >
                {u.isLocal ? `${u.id} (You)` : u.id}
              </div>
              <div className="d-flex gap-2 align-items-center">
                {u.isMuted && <FaMicrophoneSlash className="text-danger" />}
                {u.isCameraOff && <FaVideoSlash className="text-warning" />}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}