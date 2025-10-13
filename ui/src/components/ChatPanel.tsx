// src/components/ChatPanel.tsx
import React, { useEffect, useRef, useState } from "react";
import { BiPaperPlane } from "react-icons/bi";
import { FiPaperclip } from "react-icons/fi";
import type { ChatMessagePayload } from "../hooks/useWebRTC";

export interface ChatPanelProps {
  messages: ChatMessagePayload[];
  sendMessage: (m: ChatMessagePayload) => void;
  localUserId: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, sendMessage, localUserId }) => {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    const msg: ChatMessagePayload = {
      id: `${localUserId}-${Date.now()}`,
      from: localUserId,
      text: text.trim(),
      ts: Date.now(),
    };
    sendMessage(msg);
    setText("");
  };

  return (
    <div className="d-flex flex-column h-100 w-100">
      {/* Message List */}
      <div className="flex-grow-1 overflow-auto p-2">
        {messages.map((m) => (
          <div key={m.id} className={`d-flex mb-3 ${m.from === localUserId ? "justify-content-end" : "justify-content-start"}`}>
            <div style={{ maxWidth: "80%" }}>
              <div className="p-2 rounded" style={{ background: m.from === localUserId ? "var(--bs-primary)" : "rgba(255,255,255,0.1)", color: "#fff" }}>
                <div className="fw-bold small">{m.from === localUserId ? "You" : m.from}</div>
                {m.text && <div className="mt-1" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>}
                <div className="text-end small opacity-75 mt-1">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-2 border-top border-secondary">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="d-flex gap-2">
          <input
            className="form-control form-control-sm"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn btn-sm btn-primary flex-shrink-0" disabled={!text.trim()}>
            <BiPaperPlane />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;