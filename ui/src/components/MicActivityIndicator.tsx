import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { FaMicrophone } from "react-icons/fa6"; // Using one icon for a smoother transition

interface Props {
  speaking: boolean;
  stream?: MediaStream | null;
}

export default function MicActivityIndicator({ speaking, stream }: Props) {
  const [volume, setVolume] = useState(0);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setVolume(0);
      return;
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3; // Smoother volume changes

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      // Use a type assertion to avoid a common TypeScript error with Web Audio API
      (analyser as any).getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      
      // Apply a non-linear scale to make quiet sounds more visible
      const newVolume = Math.pow(avg / 255, 2);
      setVolume(newVolume);
      
      animationFrameId.current = requestAnimationFrame(loop);
    };
    loop();

    // Cleanup function to stop the loop and disconnect nodes
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      source.disconnect();
      analyser.disconnect();
    };
  }, [stream]);

  // Define animation variants for cleaner state management
  const containerVariants = {
    idle: {
      backgroundColor: "rgba(107, 114, 128, 0.1)", // gray-500 with 10% opacity
      boxShadow: "0 0 0px 0px rgba(239, 68, 68, 0)", // transparent red
    },
    speaking: {
      backgroundColor: "rgba(239, 68, 68, 0.1)", // red-500 with 10% opacity
      // The glow effect is dynamically animated below based on volume
    },
  };

  // The dynamic scale for the "breathing" icon
  const iconScale = speaking ? 1 + volume * 1.5 : 1;
  // The dynamic shadow for the "glowing" background
  const glowShadow = speaking
    ? `0 0 ${8 + volume * 20}px ${2 + volume * 8}px rgba(239, 68, 68, 0.7)`
    : "0 0 0px 0px rgba(239, 68, 68, 0)";

  return (
    <motion.div
      className="flex items-center justify-center w-14 h-14 rounded-full"
      variants={containerVariants}
      animate={speaking ? "speaking" : "idle"}
      // Animate the glow dynamically for a more responsive feel
      transition={{
        boxShadow: { duration: 0.2, ease: "easeOut" },
        backgroundColor: { duration: 0.2, ease: "easeOut" },
      }}
      style={{
        boxShadow: glowShadow,
      }}
    >
      <motion.div
        className="flex items-center justify-center"
        // Animate the scale dynamically for the breathing effect
        animate={{
          scale: iconScale,
          color: speaking ? "#ef4444" : "#6b7280", // red-500 : gray-500
        }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <FaMicrophone size={22} />
      </motion.div>
    </motion.div>
  );
}