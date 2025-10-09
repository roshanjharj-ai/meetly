// src/components/MicActivityIndicator.tsx

import { motion } from "framer-motion";
import { FaMicrophoneLines } from "react-icons/fa6";
import { GrMicrophone } from "react-icons/gr";

interface Props {
  speaking: boolean;
}

export default function MicActivityIndicator({ speaking }: Props) {
  return (
    <motion.div
      className="d-flex align-items-center justify-content-center p-3"
      animate={{
        scale: speaking ? [1, 1.2, 1] : 1,
        color: speaking ? "#ef4444" : "#9ca3af",
        background: "transparent"
      }}
      transition={{
        duration: 0.6,
        repeat: speaking ? Infinity : 0,
      }}
    >
      {speaking ? (
        <FaMicrophoneLines size={20} />
      ) : (
        <GrMicrophone size={20} />
      )}
    </motion.div>
  );
}
