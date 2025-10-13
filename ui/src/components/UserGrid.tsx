// src/components/UserGrid.tsx
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef } from "react";
import { FaMicrophoneSlash, FaVideoSlash } from "react-icons/fa";

// Memoized component to prevent video streams from being re-attached on every render
const UserVideo = React.memo(({ stream, isLocal }: { stream: MediaStream, isLocal: boolean }) => {
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
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
    );
});

type User = {
  id: string;
  stream?: MediaStream;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  speaking?: boolean;
};

type Props = {
  users: User[];
  excludeUserId?: string | null;
  className?: string;
  view?: "grid" | "circle";
};

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7"];

export default function UserGrid({ users, excludeUserId = null, className = "", view = "grid" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shown = excludeUserId ? users.filter((u) => u.id !== excludeUserId) : users;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const minTile = 180;
      const cols = Math.max(1, Math.floor(w / minTile));
      el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`user-grid ${className}`} style={{ display: "grid", gap: "1rem" }}>
      <AnimatePresence>
        {shown.map((u, i) => (
          <motion.div
            key={u.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="position-relative d-flex flex-column shadow-lg"
            style={{
              aspectRatio: "4 / 3",
              borderRadius: view === "circle" ? "50%" : "0.75rem",
              overflow: "hidden",
              background: u.stream && !u.isCameraOff ? "#000" : COLORS[i % COLORS.length],
              border: u.speaking ? '3px solid #10b981' : '3px solid transparent',
              transition: 'border 0.2s ease-in-out',
            }}
          >
            {!u.isCameraOff && u.stream ? (
              <UserVideo stream={u.stream} isLocal={!!u.isLocal} />
            ) : (
              <div className="flex-grow-1 d-flex align-items-center justify-content-center text-white fw-bold">
                <div style={{ fontSize: "clamp(2rem, 10vw, 4rem)" }}>
                  {u.id.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <div className="position-absolute start-0 end-0 bottom-0 p-2 d-flex justify-content-between align-items-center"
                 style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }}
            >
              <div className="text-white fw-bold small shadow-sm" style={{ textShadow: "1px 1px 3px #000" }}>
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