// src/components/UserGrid.tsx
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { FaMicrophone, FaMicrophoneSlash, FaVideoSlash } from "react-icons/fa";

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
      const minTile = 220; // px; controls how many columns show
      const cols = Math.max(1, Math.floor(w / minTile));
      el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`user-grid ${className}`} style={{ display: "grid", gap: 12 }}>
      <AnimatePresence>
        {shown.map((u, i) => (
          <motion.div
            key={u.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              borderRadius: view === "circle" ? "999px" : 12,
              overflow: "hidden",
              background: u.stream ? "#000" : COLORS[i % COLORS.length],
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            }}
          >
            {/* Video */}
            {!u.isCameraOff && u.stream ? (
              <video
                autoPlay
                playsInline
                muted={!!u.isLocal}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: view === "circle" ? "999px" : 12 }}
                ref={(el) => {
                  if (el && u.stream) {
                    try {
                      if (el.srcObject !== u.stream) el.srcObject = u.stream;
                    } catch { }
                  }
                }}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
                <div style={{ fontSize: 40 }}>{u.id.charAt(0).toUpperCase()}</div>
              </div>
            )}

            {/* Footer */}
            <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#fff", fontWeight: 700, textShadow: "0 2px 6px rgba(0,0,0,0.6)", background: "rgba(0,0,0,0.35)", padding: "4px 8px", borderRadius: 8 }}>
                {u.isLocal ? `${u.id} (You)` : u.id}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {u.isMuted && <FaMicrophoneSlash className="text-danger" />}
                {u.isCameraOff && <FaVideoSlash className="text-warning" />}
                {u.speaking && (
                  <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.9)", padding: "4px 8px", borderRadius: 20, color: "#fff", fontWeight: 700 }}>
                    <FaMicrophone size={12} />
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
