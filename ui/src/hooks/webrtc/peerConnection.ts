// src/hooks/webrtc/peerConnection.ts
import { defaultIceConfig, type SignalMsg } from './types';
import type { WebRTCManager } from './manager';

/**
 * Manages RTCPeerConnection instances.
 */
export class PeerConnectionManager {
    private manager: WebRTCManager;
    peers: Record<string, RTCPeerConnection> = {};
    creatingPeer: Record<string, boolean> = {}; // Prevents race conditions

    constructor(manager: WebRTCManager) {
        this.manager = manager;
    }

    async createPeer(targetId: string, initiator: boolean): Promise<RTCPeerConnection> {
        if (this.peers[targetId] || this.creatingPeer[targetId]) {
             this.manager.log(`Peer connection already exists or is being created for ${targetId}.`);
            return this.peers[targetId];
        }
        this.manager.log(`Creating new peer connection for ${targetId}. Initiator: ${initiator}`);
        this.creatingPeer[targetId] = true;

        try {
            const pc = new RTCPeerConnection(defaultIceConfig);

            pc.onicecandidate = e => {
                if (e.candidate) {
                    this.manager.signaling?.send({
                        type: "signal", action: "ice", from: this.manager.userId, to: targetId, payload: e.candidate
                    });
                }
            };

            pc.ontrack = evt => {
              const stream = evt.streams && evt.streams[0];
              if (!stream) return; // Should not happen with Unified Plan, but safety check

              this.manager.log(`Received track [${evt.track.kind}] from ${targetId}`);

              // Heuristic: If we know someone is sharing screen and we receive a video track,
              // assume it's the screen share stream. Otherwise, it's the regular camera stream.
              if (evt.track.kind === 'video') {
                   if (this.manager.sharingBy && this.manager.sharingBy === targetId) {
                       this.manager.log(`Assigning incoming video track from ${targetId} as screen share.`);
                       this.manager.onRemoteScreen?.(targetId, stream);
                   } else {
                       this.manager.log(`Assigning incoming video track from ${targetId} as camera.`);
                       this.manager.onRemoteStream?.(targetId, stream);
                   }
              } else if (evt.track.kind === 'audio') {
                   this.manager.log(`Assigning incoming audio track from ${targetId} to remote stream.`);
                   // Audio always goes with the main remote stream
                   this.manager.onRemoteStream?.(targetId, stream);
              }
            };

            pc.onconnectionstatechange = () => {
              this.manager.log(`Connection state change for ${targetId}: ${pc.connectionState}`);
              if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
                this.manager.log(`Peer connection lost or closed for ${targetId}. Cleaning up.`);
                this.manager.onRemoteStream?.(targetId, null); // Notify UI to remove stream
                this.manager.onRemoteScreen?.(targetId, null); // Notify UI to remove screen
                this.manager.dataChannels?.removeChannel(targetId); // Clean up data channel
                delete this.peers[targetId];
                // Optional: Trigger user list update if needed, though WS usually handles this
              }
            };

            // Setup Data Channel
            if (initiator) {
              const dc = pc.createDataChannel("datachannel", { negotiated: true, id: 0 });
              this.manager.dataChannels?.addChannel(targetId, dc);
            } else {
              // For non-initiator, the channel is created via ondatachannel
              pc.ondatachannel = e => {
                this.manager.log(`Received data channel from ${targetId}`);
                this.manager.dataChannels?.addChannel(targetId, e.channel);
              };
            }

            // Add local tracks (camera/mic)
            this.attachLocalTracks(pc);

            // Add screen share tracks if we are currently sharing
            if (this.manager.media?.screenStream) {
                this.manager.addScreenTracksToPeer(pc, targetId, this.manager.media.screenStream);
            }

            if (initiator) {
              this.manager.log(`Creating offer for ${targetId}`);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.manager.signaling?.send({
                    type: "signal", action: "offer", from: this.manager.userId, to: targetId, payload: pc.localDescription
                });
                this.manager.log(`Offer sent to ${targetId}`);
              } catch (err) {
                this.manager.log(`createOffer failed for ${targetId}:`, err);
              }
            }

            this.peers[targetId] = pc;
            return pc;
        } catch (error) {
            this.manager.log(`Error creating peer connection for ${targetId}:`, error);
            throw error; // Re-throw to indicate failure
        } finally {
            delete this.creatingPeer[targetId];
        }
    }

    attachLocalTracks(pc: RTCPeerConnection) {
        if (this.manager.media?.localStream) {
            this.manager.media.localStream.getTracks().forEach(track => {
                try {
                    pc.addTrack(track, this.manager.media!.localStream!);
                } catch (e) {
                     this.manager.log(`Error adding local ${track.kind} track:`, e);
                }
            });
            this.manager.log("Attached local tracks to peer connection.");
        } else {
            this.manager.log("No local stream available to attach tracks.");
        }
    }

    async handleSignal(msg: SignalMsg) {
        const { action, from, payload } = msg;
        if (!from) {
             this.manager.log("Received signal message without 'from' ID.");
            return;
        }

        let pc = this.peers[from];

        // If receiving an offer and no PC exists, create one as non-initiator
        if (!pc && action === "offer") {
          this.manager.log(`Received offer from new peer ${from}, creating connection.`);
          pc = await this.createPeer(from, false); // Create as non-initiator
        }

        if (!pc) {
          this.manager.log(`Received signal action '${action}' from ${from}, but no peer connection exists.`);
          return;
        }

        this.manager.log(`Handling signal '${action}' from ${from}`);
        try {
          if (action === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            this.manager.log(`Set remote offer from ${from}. Creating answer...`);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.manager.signaling?.send({ type: "signal", action: "answer", from: this.manager.userId, to: from, payload: pc.localDescription });
            this.manager.log(`Sent answer to ${from}`);
          } else if (action === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            this.manager.log(`Set remote answer from ${from}.`);
          } else if (action === "ice" && payload) {
            await pc.addIceCandidate(payload);
             this.manager.log(`Added ICE candidate from ${from}.`);
          }
        } catch (err) {
          this.manager.log(`handleSignal error on action ${action} from ${from}:`, err);
        }
    }

    closeAll() {
        this.manager.log("Closing all peer connections...");
        Object.entries(this.peers).forEach(([peerId, pc]) => {
            if (pc && pc.connectionState !== "closed") {
                try {
                    pc.close();
                } catch (e) {
                    this.manager.log(`Error closing peer ${peerId}:`, e);
                }
            }
        });
        this.peers = {};
        this.creatingPeer = {};
    }
}