// hooks/useWebSocket.ts
import { useRef, useCallback } from "react";
const socketUrl = import.meta.env.VITE_WEBSOCKET_URL;

export type Message =
  | { type: "initial_state"; user_list: string[]; content: string }
  | { type: "user_join" | "user_leave"; user_list: string[] }
  | { type: "content_update"; content: string }
  | { type: string; [key: string]: any };

export function useWebSocket(
  room: string,
  user: string,
  onUsers: (users: string[]) => void,
  onContent: (content: string) => void,
  onAudio: (data: ArrayBuffer | Blob) => void,
  onClose: () => void
) {
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const WEBSOCKET_URL = socketUrl || "ws://127.0.0.1:8000";
    const socket = new WebSocket(`${WEBSOCKET_URL}/ws/${room}/${user}`);
    socket.binaryType = "arraybuffer";

    socket.onmessage = async (evt: MessageEvent) => {
      if (evt.data instanceof ArrayBuffer || evt.data instanceof Blob) {
        onAudio(evt.data);
        return;
      }
      if (typeof evt.data === "string") {
        try {
          const msg: Message = JSON.parse(evt.data);
          switch (msg.type) {
            case "initial_state":
              onUsers(msg.user_list || []);
              onContent(msg.content || "");
              break;
            case "user_join":
            case "user_leave":
              onUsers(msg.user_list || []);
              break;
            case "content_update":
              onContent(msg.content || "");
              break;
          }
        } catch {
          console.warn("Invalid JSON WS message", evt.data);
        }
      }
    };

    socket.onclose = () => onClose();
    ws.current = socket;
  }, [room, user, onUsers, onContent, onAudio, onClose]);

  const send = useCallback((data: string | Blob) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(data);
    }
  }, []);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
  }, []);

  return { connect, send, disconnect, ws };
}
