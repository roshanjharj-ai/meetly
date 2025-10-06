// src/components/MicActivityIndicator.tsx

import { motion } from "framer-motion";
import { Button } from "react-bootstrap";
import { IoMic, IoMicOff } from "react-icons/io5";

interface Props {
  speaking: boolean;
}

export default function MicActivityIndicator({ speaking }: Props) {
  return (
    <motion.button
      className="rounded-circle d-flex align-items-center justify-content-center p-3"
      animate={{
        scale: speaking ? [1, 1.2, 1] : 1,
        backgroundColor: speaking ? "#ef4444" : "#9ca3af",
      }}
      transition={{
        duration: 0.6,
        repeat: speaking ? Infinity : 0,
      }}
    >
      {speaking ? (
        <IoMic className="text-white w-8 h-8" />
      ) : (
        <IoMicOff className="text-white w-8 h-8" />
      )}
    </motion.button>
  );
}
