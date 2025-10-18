// src/hooks/webrtc/dataChannel.ts
import type { DataChannelMessage } from './types';
import type { WebRTCManager } from './manager';

/**
 * Handles sending and receiving messages over RTCDataChannels.
 */
export class DataChannelManager {
    private manager: WebRTCManager;
    channels: Record<string, RTCDataChannel> = {};

    constructor(manager: WebRTCManager) {
        this.manager = manager;
    }

    addChannel(peerId: string, channel: RTCDataChannel) {
        this.channels[peerId] = channel;
        channel.onmessage = (ev) => this.handleMessage(ev, peerId);
        channel.onopen = () => this.manager.log(`DataChannel open for ${peerId}`);
        channel.onclose = () => {
            this.manager.log(`DataChannel closed for ${peerId}`);
            delete this.channels[peerId];
        };
        channel.onerror = (ev) => this.manager.log(`DataChannel error for ${peerId}:`, ev);
    }

    removeChannel(peerId: string) {
        const channel = this.channels[peerId];
        if (channel && channel.readyState !== 'closed') {
            channel.close();
        }
        delete this.channels[peerId];
    }

    handleMessage(ev: MessageEvent, peerId: string) {
        try {
          const obj = JSON.parse(ev.data) as DataChannelMessage;
          this.manager.log(`DataChannel message received from ${peerId}:`, obj.type);
          switch(obj.type) {
              case "content_update":
                  this.manager.onSharedContent?.(obj.payload);
                  break;
              case "status_update":
                  this.manager.onPeerStatus?.(peerId, obj.payload);
                  break;
              case "chat_message":
                  this.manager.onChat?.(obj.payload);
                  break;
              case "screen_update":
                  const { sharing, by } = obj.payload;
                  // Only update if the sharer is different or stopping
                  if (this.manager.sharingBy !== by) {
                      this.manager.sharingBy = sharing ? by : null;
                      this.manager.onSharingBy?.(this.manager.sharingBy);
                      this.manager.log(`Screen sharing status updated via DataChannel: ${sharing ? `started by ${by}`: 'stopped'}`);
                  }
                  break;
              default:
                   this.manager.log(`Unknown DataChannel message type from ${peerId}:`, obj);
          }
        } catch (err) {
          this.manager.log(`DataChannel parse error from ${peerId}:`, err, ev.data);
        }
    }

    broadcast(message: DataChannelMessage) {
        const s = JSON.stringify(message);
        let sentCount = 0;
        Object.entries(this.channels).forEach(([peerId, dc]) => {
          if (dc.readyState === "open") {
              try {
                  dc.send(s);
                  sentCount++;
              } catch (e) {
                  this.manager.log(`Failed to send DC message to ${peerId}:`, e);
              }
          }
        });
        if (sentCount > 0) {
            this.manager.log(`Broadcasted DC message of type ${message.type} to ${sentCount} peers.`);
        }
    }

    closeAll() {
        this.manager.log("Closing all data channels...");
        Object.values(this.channels).forEach(dc => {
            if (dc.readyState !== 'closed') {
                dc.close();
            }
        });
        this.channels = {};
    }
}