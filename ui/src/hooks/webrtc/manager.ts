// src/hooks/webrtc/manager.ts
import { DataChannelManager } from './dataChannel';
import { MediaStreamManager } from './mediaStreams';
import { PeerConnectionManager } from './peerConnection';
import { SignalingChannel } from './signaling';
// Import types and value functions/constants separately
import type { ChatMessagePayload, DataChannelMessage, MeetingProgress, PeerStatus, SignalMsg } from './types';
import { isBot, isRecorderBot } from './types'; // Import values

/**
 * Main class orchestrating WebRTC functionalities.
 */
export class WebRTCManager {
  // Public properties for identification
  room: string;
  userId: string;

  // Modules for different functionalities
  signaling: SignalingChannel;
  media: MediaStreamManager;
  dataChannels: DataChannelManager;
  peers: PeerConnectionManager;

  // Internal state
  sharingBy: string | null = null;
  lastUserList: string[] = [];
  screenSenders: Record<string, RTCRtpSender[]> = {}; // Tracks screen share RTP senders per peer

  // Callbacks for the React hook
  onProgressUpdate?: (p: MeetingProgress) => void;
  onUsers?: (u: string[]) => void;
  onRemoteStream?: (peerId: string, s: MediaStream | null) => void;
  onRemoteScreen?: (peerId: string, s: MediaStream | null) => void;
  onSharingBy?: (by: string | null) => void;
  onPeerStatus?: (peerId: string, status: PeerStatus) => void;
  onSharedContent?: (c: string) => void;
  onChat?: (m: ChatMessagePayload) => void;
  onBotAudio?: (data: string, fmt?: string, speaker?: string) => void;
  onBotMessage?: (m: ChatMessagePayload) => void;
  onBotActive?: (active: boolean) => void;
  onUsersCount?: (n: number) => void;
  onRecordingUpdate?: (is_recording: boolean) => void;
  onSpeakerUpdate?: (speakers: Record<string, boolean>) => void;

  constructor(room: string, userId: string, baseSignalingUrl?: string) {
    this.room = room;
    this.userId = userId;

    // Instantiate modules, passing 'this' (the manager instance)
    this.signaling = new SignalingChannel(this, this.getWsUrl(baseSignalingUrl));
    this.media = new MediaStreamManager(this);
    this.dataChannels = new DataChannelManager(this);
    this.peers = new PeerConnectionManager(this);
  }

  log(...args: any[]) { console.log(`[WRTC Mgr ${this.userId}]`, ...args); }

  private getWsUrl(baseSignalingUrl?: string): string {
    const base = baseSignalingUrl || import.meta.env.VITE_WEBSOCKET_URL || '';
    return base.replace(/\/+$/, "") + `/ws/${this.room}/${this.userId}`;
  }

  // --- Core Methods ---
  async connect(initialAudioEnabled: boolean = true, initialVideoEnabled: boolean = true) {
    try {
      await this.media.ensureLocalStream(initialAudioEnabled, initialVideoEnabled);
    } catch (err) {
      this.log("Could not get initial media stream, proceeding without it.", err);
    }
    // Start WebSocket connection regardless of media stream success
    this.signaling.connect();
  }

  disconnect() {
    this.log("🔌 Manager disconnect initiated");
    // Order: Stop media -> Close peers -> Close signaling -> Close data channels
    this.media.stopAllStreams();
    this.peers.closeAll();
    this.signaling.disconnect();
    this.dataChannels.closeAll();

    // Reset internal state
    this.sharingBy = null;
    this.lastUserList = [];
    this.screenSenders = {};

    // Trigger callbacks to reset UI state
    this.onUsers?.([]);
    this.onSharingBy?.(null);
    // Trigger stream removal for all peers (pass empty ID as signal)
    this.onRemoteStream?.('', null);
    this.onRemoteScreen?.('', null);

    this.log("🔌 Disconnect completed.");
  }

  // --- WebSocket Message Handling ---
  async onWsMessage(msg: SignalMsg) {
    if (!msg) return;
    this.log("Received WS message:", msg.type);

    switch (msg.type) {
      case "recording_update": this.onRecordingUpdate?.(!!msg.is_recording); break;
      case "speaker_update": this.onSpeakerUpdate?.(msg.speakers || {}); break;
      case "content_update": this.onSharedContent?.(msg.payload || ""); break;
      case "user_list":
        const newList = msg.users || [];
        // Prevent unnecessary updates if the list hasn't changed
        if (JSON.stringify(newList.sort()) === JSON.stringify(this.lastUserList.sort())) return;

        this.log("User list updated:", newList);
        this.lastUserList = newList;
        this.onUsers?.(newList);
        this.onUsersCount?.(newList.length);

        const otherUsers = newList.filter((u) => u !== this.userId);
        // Connect to new users
        for (const peerId of otherUsers) {
            // Check peers module to see if connection exists or is being created
            if (!this.peers.peers[peerId] && !this.peers.creatingPeer[peerId]) {
                // Use the correctly imported isRecorderBot function
                if (isRecorderBot(peerId)) {
                    this.log(`Recorder Bot '${peerId}' detected. Passively waiting for its offer.`);
                    continue; // Be passive ONLY to the recorder.
                }
                const isUserBot = isBot(peerId); // Also use imported isBot
                // Consistent initiator logic: Bots initiate, otherwise sort by ID
                const initiator = isUserBot || this.userId < peerId;
                this.log(`Initiating peer connection with ${peerId}. Initiator: ${initiator}`);
                this.peers.createPeer(peerId, initiator).catch(e => {
                    this.log(`Failed to create peer connection with ${peerId}`, e);
                });
            }
        }
        // TODO: Handle disconnected users explicitly if needed (though peer state change usually covers this)
        break;
      case "bot_audio": this.onBotAudio?.(msg.data || msg.payload || "", msg.format, msg.speaker); break;
      case "bot_message":
        const chatMsg: ChatMessagePayload = { id: `bot-${Date.now()}`, from: msg.speaker || "Bot", text: msg.message || msg.payload as string, ts: Date.now() };
        this.onBotMessage?.(chatMsg);
        this.onChat?.(chatMsg); // Add bot messages to main chat
        break;
      case "signal":
        await this.peers.handleSignal(msg);
        break;
      case "progress_update":
        this.onProgressUpdate?.(msg.payload as MeetingProgress);
        break;
      default:
        this.log("Unknown WS message type:", msg.type);
    }
  }

  // --- Screen Share Track Management ---
  // **FIX**: Restored full implementation
  addScreenTracksToPeers(screenStream: MediaStream) {
    this.log("Adding screen tracks to existing peers...");
    Object.entries(this.peers.peers).forEach(([peerId, pc]) => {
        // Only add tracks if the peer connection is stable
        if (pc && (pc.connectionState === 'connected' || pc.connectionState === 'connecting')) {
           this.addScreenTracksToPeer(pc, peerId, screenStream);
        } else {
            this.log(`Skipping add screen tracks for peer ${peerId}, state is ${pc?.connectionState}`);
        }
    });
  }

  // **FIX**: Restored full implementation
  addScreenTracksToPeer(pc: RTCPeerConnection, peerId: string, screenStream: MediaStream) {
     this.log(`Adding screen tracks for peer ${peerId}`);
     const senders: RTCRtpSender[] = [];
     screenStream.getTracks().forEach(track => {
         try {
             // Check if a sender for this track kind already exists to avoid duplicates
             const existingSender = pc.getSenders().find(s => s.track?.kind === track.kind);
             if (!existingSender || !existingSender.track) { // Add track if no sender exists or its track is null
                 const sender = pc.addTrack(track, screenStream);
                 if (sender) senders.push(sender);
             } else {
                 this.log(`Sender for ${track.kind} already exists for peer ${peerId}, skipping addTrack.`);
             }
         } catch(e) {
             this.log(`Error adding screen track (${track.kind}) for peer ${peerId}:`, e);
         }
     });
     if (senders.length) {
         // Append new senders to any existing ones for this peer
         this.screenSenders[peerId] = (this.screenSenders[peerId] || []).concat(senders);
         this.log(`Added ${senders.length} new screen tracks for peer ${peerId}`);
     }
  }

  // **FIX**: Restored full implementation
  removeScreenTracksFromPeers() {
    this.log("Removing screen tracks from peers...");
    Object.entries(this.screenSenders).forEach(([peerId, senders]) => {
      const pc = this.peers.peers[peerId];
      // Check if PC exists and is not closed before trying to remove tracks
      if (pc && pc.connectionState !== 'closed') {
        this.log(`Removing ${senders.length} screen tracks for peer ${peerId}`);
        senders.forEach(sender => {
          try {
            // Check if the sender is still part of the connection before removing
            if (pc.getSenders().includes(sender)) {
               pc.removeTrack(sender);
            }
          } catch (e) {
             this.log(`Error removing screen track for peer ${peerId}:`, e);
          }
        });
      } else {
          this.log(`Peer connection for ${peerId} not available or closed, skipping removeTrack.`);
      }
    });
    this.screenSenders = {}; // Clear the tracking object after attempting removal
  }

  // --- Wrappers for Module Actions (Remain the same) ---
  getLocalStream(): MediaStream | null { return this.media.getLocalStream(); }
  startScreenShare(audioMode: "none" | "mic" | "system" = "none") { return this.media.startScreenShare(audioMode); }
  stopScreenShare() { this.media.stopScreenShare(true); } // Ensure broadcast on manual stop
  broadcastDataChannel(message: DataChannelMessage) { this.dataChannels.broadcast(message); }
  sendSpeakingUpdate(speaking: boolean) { this.signaling.send({ type: "speaking_update", payload: { speaking } }); }
  sendContentUpdate(content: string) { this.broadcastDataChannel({ type: "content_update", payload: content }); }
  broadcastStatus(status: PeerStatus) { this.broadcastDataChannel({ type: "status_update", payload: status }); }
  sendChatMessage(payload: ChatMessagePayload) { this.broadcastDataChannel({ type: "chat_message", payload }); }
  startRecording() { this.signaling.send({ type: "start_recording" }); }
  stopRecording() { this.signaling.send({ type: "stop_recording" }); }
}