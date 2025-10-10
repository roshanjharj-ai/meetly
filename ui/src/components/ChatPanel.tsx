// src/components/ChatPanel.tsx
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { BiPaperPlane } from "react-icons/bi";
import {
  FiPaperclip,
  FiX
} from "react-icons/fi";
import type { ChatMessagePayload } from "../hooks/useWebRTC";

export interface ChatPanelProps {
  messages: ChatMessagePayload[];
  sendMessage: (m: ChatMessagePayload) => void;
  localUserId: string;
  className?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  sendMessage,
  localUserId,
  className = "",
}) => {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<
    { name: string; dataUrl: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachments((p) => [...p, { name: file.name, dataUrl }]);
    };
    reader.readAsDataURL(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleSend() {
    if (!text.trim() && attachments.length === 0) return;
    const msg: ChatMessagePayload = {
      id: `${localUserId}-${Date.now()}`,
      from: localUserId,
      text: text.trim() ? text.trim() : undefined,
      attachments: attachments.length ? attachments : undefined,
      ts: Date.now(),
    };
    sendMessage(msg);
    setText("");
    setAttachments([]);
  }

  return (
    <div
      className={`chat-panel h-100 ${className}`}
      style={{
        maxWidth: "38vw",
        zIndex: 1800,
      }}
    >

      <AnimatePresence initial={false}>
        <motion.div
          className="h-100"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            background: "var(--surface)",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 8px 26px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ maxHeight: 380, overflowY: "auto", padding: 12, height: "calc(100% - 50px)" }} >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  marginBottom: 12,
                  display: "flex",
                  justifyContent:
                    m.from === localUserId ? "flex-end" : "flex-start",
                }}
              >
                <div style={{ maxWidth: "78%" }}>
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background:
                        m.from === localUserId
                          ? "var(--primary)"
                          : "rgba(255,255,255,0.06)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {m.from === localUserId ? "You" : m.from}
                    </div>
                    {m.text && <div style={{ marginTop: 6 }}>{m.text}</div>}
                    {m.attachments && m.attachments.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {m.attachments.map((a, idx) => (
                          <div key={idx}>
                            <a
                              href={a.dataUrl}
                              download={a.name}
                              className="text-decoration-none"
                              style={{ color: "inherit" }}
                            >
                              {a.name}
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.65)",
                        textAlign: "right",
                        marginTop: 6,
                      }}
                    >
                      {new Date(m.ts).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div
            style={{
              padding: "10px 20px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="form-control form-control-sm"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <input
                ref={inputRef}
                type="file"
                className="d-none"
                id="chat-file"
                onChange={handleFilePick}
              />
              <label
                htmlFor="chat-file"
                className="btn btn-sm btn-outline-light"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <FiPaperclip />
              </label>
              <button className="btn btn-sm btn-primary" onClick={handleSend}>
                <BiPaperPlane />
              </button>
            </div>

            {attachments.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      padding: "4px 8px",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: 160,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {a.name}
                    </div>
                    <button
                      className="btn btn-sm btn-link text-white p-0"
                      onClick={() =>
                        setAttachments((p) => p.filter((_, idx) => idx !== i))
                      }
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default ChatPanel;
