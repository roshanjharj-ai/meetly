// src/hooks/webrtc/mediaStreams.ts
import type { WebRTCManager } from './manager';

/**
 * Manages local media streams (camera/mic and screen sharing).
 */
export class MediaStreamManager {
    private manager: WebRTCManager;
    localStream: MediaStream | null = null;
    screenStream: MediaStream | null = null;

    constructor(manager: WebRTCManager) {
        this.manager = manager;
    }

    async ensureLocalStream(audioEnabled: boolean, videoEnabled: boolean): Promise<MediaStream | null> {
        this.manager.log(`Ensuring local stream. Requested: Audio=${audioEnabled}, Video=${videoEnabled}`);

        if (this.localStream) {
            this.manager.log("Local stream already exists. Applying desired state.");
            this.localStream.getAudioTracks().forEach(t => t.enabled = audioEnabled);
            this.localStream.getVideoTracks().forEach(t => t.enabled = videoEnabled);
            return this.localStream;
        }

        if (!audioEnabled && !videoEnabled) {
          this.manager.log("Initial audio and video explicitly disabled. Not requesting media stream yet.");
          return null;
        }

        const constraints = { audio: true, video: true }; // Request both, control state later

        try {
          this.manager.log("Requesting initial media stream...");
          this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
          this.manager.log("Media stream obtained.");

          // Apply desired initial state immediately
          this.localStream.getAudioTracks().forEach(t => {
              this.manager.log(`Setting initial audio track enabled state to: ${audioEnabled}`);
              t.enabled = audioEnabled;
          });
          this.localStream.getVideoTracks().forEach(t => {
               this.manager.log(`Setting initial video track enabled state to: ${videoEnabled}`);
              t.enabled = videoEnabled;
          });

          return this.localStream;
        } catch (err) {
          this.manager.log("Initial getUserMedia failed:", err);
          this.localStream = null;
          throw err;
        }
    }

    async startScreenShare(audioMode: "none" | "mic" | "system"): Promise<boolean> {
        if (this.screenStream) {
            this.manager.log("Screen share already active.");
            return false;
        }
        this.manager.log(`Starting screen share with audio mode: ${audioMode}`);
        try {
          const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
              video: { cursor: "always" },
              audio: audioMode === 'system' // Request system audio only if needed
          });

          // Add mic audio if requested
          if (audioMode === 'mic' && this.localStream) {
            const micTrack = this.localStream.getAudioTracks()[0];
            if (micTrack) {
                this.manager.log("Adding microphone track to screen share.");
                displayStream.addTrack(micTrack.clone()); // Use clone if possible
            } else {
                 this.manager.log("Mic requested for screen share, but no local mic track available.");
            }
          }

          this.screenStream = displayStream;

          // Add screen tracks to all existing peers
          this.manager.addScreenTracksToPeers(displayStream);

          // Listen for the user stopping the share via browser controls
          displayStream.getVideoTracks()[0].onended = () => {
            this.manager.log("Screen share stopped via browser control.");
            this.stopScreenShare(false); // Call internal stop without broadcasting again
          };

          // Notify manager and peers
          this.manager.sharingBy = this.manager.userId;
          this.manager.onSharingBy?.(this.manager.userId);
          this.manager.broadcastDataChannel({ type: "screen_update", payload: { sharing: true, by: this.manager.userId } });

          this.manager.log("Screen share started successfully.");
          return true;

        } catch (err) {
          this.manager.log("startScreenShare failed:", err);
          this.screenStream = null; // Ensure cleanup on failure
          return false;
        }
    }

    stopScreenShare(broadcast: boolean = true) {
        if (!this.screenStream) {
             this.manager.log("No active screen share to stop.");
            return;
        }
        this.manager.log("Stopping screen share...");

        // Remove tracks from peers first
        this.manager.removeScreenTracksFromPeers();

        // Stop the tracks
        this.screenStream.getTracks().forEach(track => {
            track.onended = null; // Remove listener
            track.stop();
        });
        this.screenStream = null;

        // Notify manager and peers if initiated by us
        if (broadcast) {
            this.manager.sharingBy = null;
            this.manager.onSharingBy?.(null);
            this.manager.broadcastDataChannel({ type: "screen_update", payload: { sharing: false, by: null } }); // Use null explicitly
        }
         this.manager.log("Screen share stopped.");
    }

    // Called during disconnect
    stopAllStreams() {
        this.manager.log("Stopping all media streams...");
        const stopTracks = (stream: MediaStream | null, name: string) => {
            if (stream) {
                let count = 0;
                stream.getTracks().forEach(track => {
                    if (track.readyState === 'live') {
                        track.stop();
                        count++;
                    }
                });
                this.manager.log(`Stopped ${count} tracks for ${name}.`);
                return null;
            }
            return null;
        };
        this.localStream = stopTracks(this.localStream, "localStream");
        this.screenStream = stopTracks(this.screenStream, "screenStream");
         this.manager.log("All media streams stopped.");
    }

    getLocalStream(): MediaStream | null {
        return this.localStream;
    }
}