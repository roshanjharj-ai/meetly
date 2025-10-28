// src/components/ChatPanel.tsx
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BiPaperPlane } from "react-icons/bi";
import { FaCheckCircle, FaExclamationCircle, FaGlobe, FaLock, FaPaperclip, FaSmile, FaTimes, FaUpload } from "react-icons/fa";
import type { ChatMessagePayload } from "../hooks/useWebRTC";

// ⚠️ MOCK: Replace this with your actual UserContext import
// Assuming UserContext provides { theme: 'light' | 'dark' }
const UserContext = React.createContext<{ theme: 'light' | 'dark' }>({ theme: 'light' });

// --- Types for Local File Handling (Mock) ---
interface LocalAttachment {
  id: string;
  name: string;
  size: number; // in bytes
  progress: number; // 0 to 100
  status: 'pending' | 'uploading' | 'complete' | 'failed';
  dataUrl?: string;
  error?: string;
}

// The message payload now includes the optional 'to' field.
export type ChatMessagePayloadWithTarget = ChatMessagePayload;

export interface ChatPanelProps {
  messages: ChatMessagePayload[];
  sendMessage: (m: ChatMessagePayloadWithTarget) => void;
  localUserId: string;
  users: string[]; // List of all users in the room
  fetchChatHistory: () => Promise<ChatMessagePayload[]>;
  roomId: string;
}

// Hook for closing modal/popup when clicking outside
const useOutsideClick = (ref: React.RefObject<HTMLElement>, handler: () => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
};


const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  sendMessage,
  localUserId,
  users: recipientUsers,
  fetchChatHistory,
}) => {
  const { theme } = useContext(UserContext);
  const isDark = theme === 'dark';

  const [text, setText] = useState("");
  const [targetUser, setTargetUser] = useState<string>("Group");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);

  const endRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useOutsideClick(emojiPickerRef, () => setIsEmojiPickerOpen(false));


  // --- MODERN COLOR PALETTE ---
  const getModernColors = useCallback((isLocal: boolean, isPrivate: boolean, isForYou: boolean) => {

    const primaryBubble = '#075E54'; // Dark Green (WhatsApp sent)
    const secondaryBubble = '#3C4042'; // Dark Grey (Remote)
    const highlightBubble = '#7A4000'; // Amber/Brown (Private received)

    if (isLocal) {
      // Sent by me
      const localColor = isPrivate
        ? {
          bg: isDark ? '#4F4F4F' : '#E0F2F1', // Subtle gray/light green
          text: isDark ? '#EBEBEB' : '#000000', // White/Black text
          nameColor: isDark ? '#B3B3B3' : '#666666' // Light/Dark gray name
        }
        : {
          bg: isDark ? primaryBubble : '#DCF8C6', // Green
          text: isDark ? '#EBEBEB' : '#000000',
          nameColor: isDark ? '#B3B3B3' : '#666666'
        };
      return {
        ...localColor,
        indicatorBg: isPrivate ? 'var(--bs-primary)' : '#25D366'
      };
    }

    // Received by me
    const remoteColor = isForYou
      ? {
        bg: isDark ? highlightBubble : '#FFF0B0', // Highlighted Amber
        text: isDark ? '#EBEBEB' : '#000000',
        nameColor: isDark ? '#FFCC80' : '#8D6E63' // Light/Dark Amber name
      }
      : {
        bg: isDark ? secondaryBubble : '#EAEAEA', // Neutral Gray
        text: isDark ? '#EBEBEB' : '#000000',
        nameColor: isDark ? '#9A9A9A' : '#666666' // Light/Dark gray name
      };

    return {
      ...remoteColor,
      indicatorBg: isForYou ? 'var(--bs-warning)' : 'var(--bs-secondary)'
    };

  }, [isDark]);

  // --- Mock File Upload Logic ---

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear file input value
    }
  }, []);

  const mockFileUpload = useCallback((file: File) => {
    const newAttachment: LocalAttachment = {
      id: Date.now().toString(),
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending',
    };
    setAttachments([newAttachment]); // Only allow one file for simplicity

    // Simulate upload process
    const uploadInterval = setInterval(() => {
      setAttachments(prev => prev.map(att => {
        if (att.id === newAttachment.id) {
          const nextProgress = att.progress + Math.floor(Math.random() * 15) + 5;
          if (nextProgress >= 100) {
            clearInterval(uploadInterval);
            return { ...att, progress: 100, status: 'complete' as const };
          }
          return { ...att, progress: nextProgress, status: 'uploading' as const };
        }
        return att;
      }));
    }, 500);

    // Simulate potential failure after 4 seconds (10% chance)
    const failureTimeout = setTimeout(() => {
      if (Math.random() < 0.1) {
        clearInterval(uploadInterval);
        setAttachments(prev => prev.map(att => {
          if (att.id === newAttachment.id) {
            return { ...att, status: 'failed' as const, error: 'Network failure' };
          }
          return att;
        }));
      }
    }, 4000);

    return () => {
      clearInterval(uploadInterval);
      clearTimeout(failureTimeout);
    };
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      mockFileUpload(file);
    }
  }, [mockFileUpload]);


  // --- Core Effects and Handlers ---

  useEffect(() => {
    setIsLoadingHistory(true);
    fetchChatHistory().finally(() => setIsLoadingHistory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (targetUser !== "Group" && !recipientUsers.includes(targetUser)) {
      setTargetUser("Group");
    }
  }, [recipientUsers, targetUser]);


  const handleSend = useCallback(() => {
    const completedAttachments = attachments.filter(a => a.status === 'complete');
    const hasTextOrEmoji = text.trim().length > 0 || /\p{Emoji}/u.test(text);

    if (!hasTextOrEmoji && completedAttachments.length === 0) return;

    const msg: ChatMessagePayloadWithTarget = {
      id: `${localUserId}-${Date.now()}`,
      from: localUserId,
      text: text.trim() || (completedAttachments.length ? `[${completedAttachments.length} file(s)]` : undefined),
      ts: Date.now(),
      to: targetUser === "Group" ? undefined : targetUser,
      attachments: completedAttachments.map(a => ({ name: a.name, url: `/api/mock/file/${a.id}` }))
    };
    sendMessage(msg);
    setText("");
    setAttachments([]); // Clear attachments after sending
    setIsEmojiPickerOpen(false);
  }, [text, localUserId, targetUser, sendMessage, attachments]);


  const visibleMessages = useMemo(() => messages.filter(m =>
    !m.to || m.to.toLowerCase() === "group" || m.to === localUserId || m.from === localUserId
  ), [messages, localUserId]);

  // --- Subcomponent: Attachment Preview ---
  const AttachmentPreview: React.FC<{ attachment: LocalAttachment }> = ({ attachment }) => {
    const { id, name, progress, status, error } = attachment;
    const isError = status === 'failed';
    const isComplete = status === 'complete';
    const isUploading = status === 'uploading' || status === 'pending';

    const statusIcon = isError ? <FaExclamationCircle className="text-danger me-1" />
      : isComplete ? <FaCheckCircle className="text-success me-1" />
        : <FaUpload className="text-info me-1" />;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`d-flex flex-column p-2 rounded-3 mb-2 shadow-sm`}
        style={{
          background: 'var(--bs-secondary-bg-subtle)',
          border: `1px solid ${isError ? 'var(--bs-danger)' : 'var(--bs-border-color)'}`,
          color: 'var(--bs-body-color)',
          fontSize: '0.85rem'
        }}
      >
        <div className="d-flex justify-content-between align-items-center">
          <span className="text-truncate flex-grow-1 me-2">{statusIcon} {name}</span>
          <button
            type="button"
            className="btn-close"
            onClick={() => removeAttachment(id)}
            style={{ filter: isDark ? 'invert(0.7)' : 'none', background: 'none' }}
          />
        </div>

        {isUploading && (
          <div className="progress mt-2" style={{ height: '5px', background: 'var(--bs-secondary-bg)' }}>
            <div
              className={`progress-bar ${isError ? 'bg-danger' : 'bg-primary'}`}
              role="progressbar"
              style={{ width: `${progress}%` }}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}

        {isError && <span className="text-danger small mt-1">{error || "Upload failed."}</span>}
      </motion.div>
    );
  };


  // --- Chat Item Rendering (Refactored for Left/Right Alignment) ---
  const renderChatItem = (m: ChatMessagePayload) => {
    const isLocal = m.from === localUserId;
    const isPrivate = !!m.to && m.to.toLowerCase() !== "group";
    const isForYou = isPrivate && m.to === localUserId;

    const { bg, text: textColor, indicatorBg, nameColor } = getModernColors(isLocal, isPrivate, isForYou);

    const senderName = isLocal ? "You" : m.from;
    const isIndicatorVisible = isPrivate || !isLocal;

    return (
      // Main container aligns the entire message block (name, bubble, time)
      <div key={m.id} className={`d-flex mb-3 ${isLocal ? 'justify-content-end' : 'justify-content-start'}`}>
        <div
          className={`d-flex flex-column animate__animated animate__fadeInUp animate__faster`}
          style={{ maxWidth: "85%" }}
        >
          {/* TOP METADATA: NAME, INDICATOR */}
          <div className={`d-flex align-items-center mb-1 ${isLocal ? 'justify-content-end' : 'justify-content-start'}`}>
            {/* Sender Name & Indicator */}
            {isIndicatorVisible && (
              <span className={`fw-bold small me-2`} style={{ color: nameColor, fontSize: '0.75rem', order: isLocal ? 2 : 1 }}>
                {senderName}
              </span>
            )}

            {/* Private/Group Badge */}
            <span className="badge p-1" style={{ backgroundColor: indicatorBg, color: isDark ? '#fff' : '#000', opacity: 0.9, fontSize: '0.6rem', order: isLocal ? 1 : 2 }}>
              {isPrivate ? <FaLock size={8} className="me-1" /> : <FaGlobe size={8} className="me-1" />}
              {isLocal ? (isPrivate ? `Private to ${m.to}` : 'Group') : (isPrivate ? 'Private' : 'Group')}
            </span>
          </div>

          {/* CHAT BUBBLE */}
          <div
            className={`d-flex flex-column p-2 rounded-3 shadow-sm`}
            style={{
              backgroundColor: bg,
              color: textColor,
              transition: 'background-color 0.3s ease',
              // Use different rounding for local/remote to give the characteristic chat app look
              borderRadius: isLocal ? '10px 10px 0 10px' : '10px 10px 10px 0',
            }}
          >
            {/* Message Content */}
            {m.text &&
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: textColor, fontSize: '0.9rem' }}>
                {m.text}
              </div>}

            {/* Attachments Display */}
            {typeof m.attachments != 'undefined' && m.attachments.length > 0 && (
              <div className="mt-1 d-flex flex-column gap-1" style={{ fontSize: '0.8rem' }}>
                {m.attachments.map((att, index) => (
                  <div key={index} className="d-flex align-items-center p-1 rounded"
                    style={{
                      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)',
                      color: isDark ? '#90CAF9' : '#1976D2'
                    }}>
                    <FaPaperclip className="me-1" size={12} />
                    <span className="text-truncate">{att.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BOTTOM METADATA: TIMESTAMP */}
          <div className={`mt-1`} style={{
            color: isDark ? '#B0B0B0' : '#888',
            fontSize: '0.65rem',
            alignSelf: isLocal ? 'flex-end' : 'flex-start'
          }}>
            {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  };

  // --- MOCK EMOJI PICKER (Kept identical from previous step) ---
  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    setIsEmojiPickerOpen(false);
  };

  const MockEmojiPicker = () => (
    <motion.div
      ref={emojiPickerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="position-absolute bottom-100 p-3 shadow-lg rounded-3 mb-2"
      style={{
        zIndex: 3000,
        left: 10,
        background: 'var(--bs-secondary-bg)',
        border: '1px solid var(--bs-border-color)',
        width: 'calc(100% - 20px)',
        maxWidth: '300px'
      }}
    >
      <div className="d-flex justify-content-between align-items-center pb-2 mb-2"
        style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
        <span className="fw-bold" style={{ color: 'var(--bs-body-color)' }}>Select Emoji</span>
        <button
          type="button"
          className="btn-sm"
          onClick={() => setIsEmojiPickerOpen(false)}
          style={{ color: 'var(--bs-body-color)', border: 'none', background: 'none' }}
        >
          <FaTimes size={14} />
        </button>
      </div>
      <div className="d-flex flex-wrap gap-3">
        {['👍', '🔥', '🎉', '💡', '💯', '🤔', '👋', '👀', '✅', '❌', '❤️', '😅', '🤯', '🥳', '🥲', '🙏', '🚀', '⭐'].map(emoji => (
          <span
            key={emoji}
            style={{ cursor: 'pointer', fontSize: '1.5rem' }}
            onClick={() => handleEmojiSelect(emoji)}
          >
            {emoji}
          </span>
        ))}
      </div>
    </motion.div>
  );


  // Check if any attachment is pending/uploading/failed
  const isUploadInProgressOrFailed = attachments.some(a => a.status !== 'complete');
  const isSendButtonDisabled = isUploadInProgressOrFailed || (!(text.trim().length > 0 || /\p{Emoji}/u.test(text)) && attachments.length === 0);

  return (
    <div className={`d-flex flex-column h-100 w-100`} style={{
      background: 'var(--bs-body-bg)',
      color: 'var(--bs-body-color)'
    }}>

      {/* Message List Area */}
      <div className="flex-grow-1 overflow-auto p-3" style={{ flexBasis: '70%', minHeight: '0' }}>
        {isLoadingHistory && (
          <div className="text-center p-5" style={{ color: 'var(--bs-secondary-color)' }}>
            <div className="spinner-border" role="status"></div>
            <p className="mt-2">Loading chat history...</p>
          </div>
        )}
        {!isLoadingHistory && visibleMessages.length === 0 && (
          <div className="text-center p-5" style={{ marginTop: '20vh', color: 'var(--bs-secondary-color)' }}>
            <h4 className="mb-3">Start a Conversation! 💬</h4>
            <p>Chat is persistent and supports private messaging.</p>
          </div>
        )}
        {!isLoadingHistory && visibleMessages.map(renderChatItem)}
        <div ref={endRef} />
      </div>

      {/* Input Area (Modernized Footer) */}
      <div
        className="p-3 border-top position-relative"
        style={{
          flexShrink: 0,
          borderColor: 'var(--bs-border-color)',
          background: 'var(--bs-secondary-bg)',
        }}
      >
        <AnimatePresence>
          {isEmojiPickerOpen && <MockEmojiPicker />}

          {/* Attachment Preview Area */}
          {attachments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }}
              className="mb-2"
            >
              <AttachmentPreview attachment={attachments[0]} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recipient Selector */}
        <div className="mb-2">
          <label className="form-label small fw-bold mb-1" style={{ color: 'var(--bs-body-color)' }}>
            Recipient:
          </label>
          <select
            className="form-select form-select-sm shadow-none"
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            style={{
              background: 'var(--bs-body-bg)',
              color: 'var(--bs-body-color)',
              borderColor: 'var(--bs-border-color)',
              borderRadius: '0.5rem',
            }}
          >
            <option value="Group">🌐 Group Chat (All Participants)</option>
            {recipientUsers.map(user => (
              <option key={user} value={user}>
                🔒 Private to: {user}
              </option>
            ))}
          </select>
        </div>

        {/* Chat Input Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="d-flex gap-2 align-items-center">

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Attachment Button */}
          <button
            type="button"
            className="btn btn-sm flex-shrink-0"
            title="Attach File"
            onClick={() => fileInputRef.current?.click()}
            style={{
              color: 'var(--bs-body-color)',
              background: 'transparent',
              borderRadius: '50%',
              padding: '0.4rem',
            }}
            disabled={attachments.length > 0 && attachments[0].status !== 'failed'}
          >
            <FaPaperclip size={18} />
          </button>

          {/* Emoji Button */}
          <button
            type="button"
            className="btn btn-sm flex-shrink-0"
            title="Select Emoji"
            onClick={() => setIsEmojiPickerOpen(p => !p)}
            style={{
              color: 'var(--bs-body-color)',
              background: 'transparent',
              borderRadius: '50%',
              padding: '0.4rem',
            }}
          >
            <FaSmile size={18} />
          </button>

          {/* Text Input */}
          <input
            className="form-control form-control-sm flex-grow-1 shadow-none"
            placeholder="Type your message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              background: 'var(--bs-body-bg)',
              color: 'var(--bs-body-color)',
              borderColor: 'var(--bs-border-color)',
              borderRadius: '0.75rem',
              minHeight: '40px',
              fontSize: '0.9rem'
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />

          {/* Send Button */}
          <button
            type="submit"
            className="btn btn-sm flex-shrink-0"
            disabled={isSendButtonDisabled}
            style={{
              backgroundColor: isSendButtonDisabled ? 'var(--bs-secondary)' : 'var(--bs-primary)',
              color: '#fff',
              borderRadius: '50%',
              padding: '0.5rem',
              transition: 'background-color 0.2s ease',
            }}
          >
            <BiPaperPlane size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;