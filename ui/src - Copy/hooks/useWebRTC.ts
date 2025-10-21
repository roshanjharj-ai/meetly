/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from "react";

// your existing imports and types remain unchanged

export type MeetingProgress = {
  tasks: any[];
  current_task_index: number;
  state: string;
  start_time?: string;
  end_time?: string;
};

// your existing class definition and hooks stay the same
class WebRTCManager {
  // ... all your properties, refs, and state remain untouched

  async createPeer(targetId: string, initiator: boolean) {
    const pc = new RTCPeerConnection(this.iceConfig);

    // ✅ FIX: initialize custom internal flags to avoid TS undefined warnings
    (pc as any)._makingOffer = false;
    (pc as any)._ignoreOffer = false;
    (pc as any)._polite = false;
    (pc as any)._queuedCandidates = [];

    // === your existing event handlers, logs, and logic stay the same ===

    pc.onnegotiationneeded = async () => {
      // ✅ FIX: prevent renegotiation loops
      if ((pc as any)._makingOffer || pc.signalingState !== "stable") return;
      (pc as any)._makingOffer = true;
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        this.wsSend({
          type: "signal",
          action: "offer",
          from: this.userId,
          to: targetId,
          payload: pc.localDescription,
        });
      } catch (err) {
        this.log("negotiationneeded error:", err);
      } finally {
        (pc as any)._makingOffer = false;
      }
    };

    pc.ontrack = (e) => {
      this.log("📡 ontrack from", targetId, e.track.kind);
      if (e.track.kind === "audio" && e.streams?.[0]) {
        const audioElem = document.createElement("audio");
        audioElem.srcObject = e.streams[0];
        // ✅ FIX: TS-safe inline playback for Safari/iOS
        (audioElem as any).playsInline = true;
        audioElem.autoplay = true;
        audioElem.muted = false;
        document.body.appendChild(audioElem);
      }
      this.onRemoteStream?.(targetId, e.streams?.[0]);
    };

    // === keep all your ICE, connection, datachannel, bot logic, etc. ===

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream));
    }

    return pc;
  }

  async handleSignal({ action, from, payload }: any) {
    // === your existing logic preserved ===
    // only ensure queuedCandidates is always defined before use
    const pc = this.peers[from];
    if (pc && !(pc as any)._queuedCandidates) (pc as any)._queuedCandidates = [];
    // rest of your handleSignal logic untouched
  }

  // ... rest of your WebRTCManager class and hook implementation remain exactly as uploaded
}

// ✅ optional: mobile audio unlock helper remains unchanged
document.body.addEventListener(
  "click",
  () => {
    document.querySelectorAll("audio").forEach((a) => a.play().catch(() => {}));
  },
  { once: true }
);

// export and hooks stay identical
export default WebRTCManager;
