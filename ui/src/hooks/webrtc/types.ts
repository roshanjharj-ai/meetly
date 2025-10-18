// src/hooks/webrtc/types.ts

/** Represents the overall progress of the meeting. */
export type MeetingProgress = {
  tasks: any[];
  current_task_index: number;
  state: string;
  start_time?: string;
  end_time?: string;
};

/** Represents the mute/camera status of a peer. */
export type PeerStatus = { isMuted: boolean; isCameraOff: boolean };

/** Represents a chat message payload. */
export type ChatMessagePayload = {
  id: string;
  from: string;
  text?: string;
  attachments?: { name: string; dataUrl: string }[];
  ts: number;
};

/** Structure for messages exchanged via the WebSocket signaling server. */
export type SignalMsg = {
  type?: string; // e.g., 'user_list', 'signal', 'bot_audio', 'progress_update'
  action?: string; // e.g., 'offer', 'answer', 'ice' (for type: 'signal')
  from?: string; // Sender's user ID
  to?: string; // Target user ID (if not broadcast)
  payload?: any; // Main data (SDP, ICE candidate, content, status, chat)
  users?: string[]; // List of users (for type: 'user_list')
  data?: string; // Base64 audio data (for type: 'bot_audio')
  format?: string; // Audio format (e.g., 'wav')
  speaker?: string; // Speaker name (usually for bot messages)
  message?: string; // Bot text message
  is_recording?: boolean; // Recording status
  speakers?: Record<string, boolean>; // Active speakers update
};

/** Structure for messages exchanged via the RTCDataChannel. */
export type DataChannelMessage =
  | { type: "content_update"; payload: string }
  | { type: "status_update"; payload: PeerStatus }
  | { type: "screen_update"; payload: { sharing: boolean; by: string | null } } // Ensure 'by' can be null
  | { type: "chat_message"; payload: ChatMessagePayload };

/** Configuration for STUN/TURN servers. */
export const defaultIceConfig: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/** Names used to identify bot users. */
export const DEFAULT_BOT_NAMES = (window as any).__BOT_NAMES__ || ["Jarvis"];

/** Checks if a user ID belongs to a known bot. */
export const isBot = (name: string): boolean => DEFAULT_BOT_NAMES.includes(name);

/** Checks if a user ID belongs to the recorder bot. */
export const isRecorderBot = (name: string): boolean => name.startsWith("RecorderBot");

/** Base URL for the signaling server. */
export const DEFAULT_WS_URL = import.meta.env.VITE_WEBSOCKET_URL || '';

/** Base URL for the recording service API. */
export const RECORDER_API_URL = import.meta.env.VITE_RECORDER_API_URL || "http://localhost:8001";