// src/hooks/webrtc/signaling.ts
import type { SignalMsg } from './types';
import type { WebRTCManager } from './manager'; // Forward declaration

/**
 * Manages the WebSocket connection for signaling.
 */
export class SignalingChannel {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private manager: WebRTCManager; // Reference to the main manager

  constructor(manager: WebRTCManager, wsUrl: string) {
    this.manager = manager;
    this.wsUrl = wsUrl;
  }

  connect() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
        this.manager.log("WebSocket already connecting/open.");
        return;
    }
    this.manager.log("Connecting to WebSocket:", this.wsUrl);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => this.manager.log("WebSocket open:", this.wsUrl);
    this.ws.onerror = (ev) => this.manager.log("WebSocket error", ev);
    this.ws.onclose = (ev) => {
        this.manager.log("WebSocket closed", ev);
        this.ws = null; // Clear reference on close
        // Optional: Implement reconnection logic here if needed
    };
    this.ws.onmessage = async (evt) => {
      try {
        const msg: SignalMsg = JSON.parse(evt.data);
        // Delegate message handling back to the manager
        await this.manager.onWsMessage(msg);
      } catch (err) {
        this.manager.log("WS parse error", err);
      }
    };
  }

  disconnect() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
        this.manager.log("Closing WebSocket connection...");
        try {
            this.ws.close();
        } catch (e) {
             this.manager.log("Error closing WebSocket:", e);
        }
    }
    this.ws = null; // Ensure reference is cleared
  }

  send(obj: any) {
    if (!this.ws) {
        this.manager.log("Cannot send WebSocket message: Not connected.");
        return;
    }
    const s = JSON.stringify(obj);
    if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(s);
    } else if (this.ws.readyState === WebSocket.CONNECTING) {
      // Queue message to send upon opening
      this.manager.log("WebSocket connecting, queuing message:", obj.type);
      this.ws.addEventListener("open", () => this.ws?.send(s), { once: true });
    } else {
        this.manager.log(`WebSocket not open (state: ${this.ws.readyState}), cannot send message:`, obj.type);
    }
  }

  get readyState(): number {
      return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}