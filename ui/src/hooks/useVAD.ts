// hooks/useVAD.ts
import { useRef } from "react";
import { encodeWAV } from "../utils/audio";

export function useVAD(
  isMuted: boolean,
  onSend: (blob: Blob) => void,
  onStatus: (status: string) => void
) {
  const vad = useRef<any>(null);

  async function init(stream: MediaStream) {
    onStatus("Initializing VAD...");
    try {
      const { MicVAD } = await import("@ricky0123/vad-web");

      const vadInstance = await MicVAD.new({
        stream,
        onSpeechStart: () => {
          if (!isMuted) onStatus("Speaking...");
        },
        onSpeechEnd: (audio: Float32Array) => {
          if (isMuted) return;
          const wavBlob = encodeWAV(audio, 16000);
          onSend(wavBlob);
          onStatus("Listening...");
        },
        onVADMisfire: () => console.debug("VAD misfire ignored"),
        onnxWASMBasePath:
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
        baseAssetPath:
          "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.28/dist/",
      } as any);

      vadInstance.start();
      vad.current = vadInstance;
      onStatus("Listening...");
    } catch (err) {
      console.error("VAD init error", err);
      onStatus("VAD init failed");
    }
  }

  function cleanup() {
    vad.current?.pause?.();
    vad.current?.destroy?.();
    vad.current = null;
  }

  return { init, cleanup };
}
