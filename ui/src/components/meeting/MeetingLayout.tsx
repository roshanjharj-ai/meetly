// src/pages/Meeting/MeetingLayout.tsx
import DOMPurify from "dompurify";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BsPinAngle,
  BsPinAngleFill,
  BsRobot,
  BsSoundwave,
} from "react-icons/bs";
import {
  FaMicrophoneSlash,
  FaVideoSlash,
} from "react-icons/fa";
import "./MeetingLayout.css"; // We'll create this new CSS file

// --- Constants ---

const COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc949",
  "#af7aa1",
  "#ff9da7",
];
const TILE_ASPECT_RATIO = 4 / 3;

// --- Types ---

type User = {
  id: string;
  stream?: MediaStream;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  speaking?: boolean;
};

type MeetingLayoutProps = {
  users: User[];
  botNames: string[];
  botSpeaker: string;
  sharingBy: string | null;
  sharedContent: string | null;
  remoteScreenStream: MediaStream | null;
  pinnedUserId: string | null;
  onPinUser: (userId: string) => void;
  theme: string;
  isMobile: boolean;
  isChatSidebarOpen: boolean;
};

// --- Sub-component: UserVideo ---

const UserVideo = React.memo(
  ({ stream, isLocal }: { stream: MediaStream; isLocal: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="participant-video"
      />
    );
  }
);

// --- Sub-component: ParticipantCard ---

const ParticipantCard = React.memo(
  ({
    user,
    onPinUser,
    isPinned,
    isLargeView = false,
  }: {
    user: User;
    onPinUser: (id: string) => void;
    isPinned: boolean;
    isLargeView?: boolean;
  }) => {
    const color = useMemo(
      () =>
        COLORS[
        user.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
        COLORS.length
        ],
      [user.id]
    );

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="participant-card"
        data-speaking={user.speaking}
        style={{ aspectRatio: isLargeView ? "unset" : `${TILE_ASPECT_RATIO}` }}
      >
        <div
          className="participant-card-inner"
          style={{ background: !user.stream || user.isCameraOff ? color : "#2c2c2c" }}
        >
          {/* Video or Avatar */}
          {!user.isCameraOff && user.stream ? (
            <UserVideo stream={user.stream} isLocal={!!user.isLocal} />
          ) : (
            <div className="participant-avatar">
              <div
                className="participant-avatar-initial"
                style={{ fontSize: `clamp(2rem, ${isLargeView ? '10vw' : '5vw'}, 6rem)` }}
              >
                {user.id?.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          {/* Overlays */}
          <div className="participant-overlay-bottom">
            <span className="participant-name">
              {user.isLocal ? `${user.id} (You)` : user.id}
            </span>

            <div className="participant-status-icons">
              <AnimatePresence>
                {user.isMuted && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="status-icon-wrapper"
                  >
                    <FaMicrophoneSlash className="icon-danger" />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {user.isCameraOff && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="status-icon-wrapper"
                  >
                    <FaVideoSlash className="icon-warning" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Pin Button */}
          <button
            className="participant-pin-button"
            title={isPinned ? "Unpin" : "Pin to main view"}
            onClick={() => onPinUser(user.id)}
          >
            {isPinned ? <BsPinAngleFill /> : <BsPinAngle />}
          </button>
        </div>
      </motion.div>
    );
  }
);

// --- Sub-component: DynamicGrid ---
export const DynamicGrid = ({
  users,
  onPinUser,
  pinnedUserId,
}: {
  users: User[];
  onPinUser: (id: string) => void;
  pinnedUserId: string | null;
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridStyle, setGridStyle] = useState({
    gridTemplateColumns: "1fr",
    gridAutoRows: "1fr",
  });

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || users.length === 0) return;

    const ro = new ResizeObserver(() => {
      const n = users.length;
      if (n === 0) return;

      const w = el.clientWidth;
      const h = el.clientHeight;

      let maxTileW = 0;
      let bestCols = 1;
      let computedTileWidth = 0;

      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const tileW = w / c;
        const tileH = tileW / TILE_ASPECT_RATIO;

        if (tileH * r <= h) {
          if (tileW > maxTileW) {
            maxTileW = tileW;
            bestCols = c;
          }
        }
      }

      if (maxTileW === 0) {
        let maxTileH = 0;
        bestCols = n;
        for (let r = 1; r <= n; r++) {
          const c = Math.ceil(n / r);
          const tileH = h / r;
          const tileW = tileH * TILE_ASPECT_RATIO;
          if (tileW * c <= w) {
            if (tileH > maxTileH) {
              maxTileH = tileH;
              bestCols = c;
              computedTileWidth = tileW;
            }
          }
        }
      }

      let columnTemplate = `repeat(${bestCols}, 1fr)`;

      if (computedTileWidth > 0) {
        columnTemplate = `repeat(${bestCols}, minmax(0, ${computedTileWidth}px))`;
      }

      setGridStyle({
        gridTemplateColumns: columnTemplate,
        gridAutoRows: "min-content",
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [users.length]);


  return (
    <div ref={gridRef} className="dynamic-grid" style={gridStyle}>
      <AnimatePresence>
        {users.map((user) => (
          <ParticipantCard
            key={user.id}
            user={user}
            onPinUser={onPinUser}
            isPinned={user.id === pinnedUserId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

const FloatingBot = ({
  user,
  isSpeaking,
}: {
  user: User;
  isSpeaking: boolean;
}) => {
  const dragControls = useDragControls();

  // 3. ADD a ref to the bot element itself
  const botRef = useRef<HTMLDivElement>(null);

  // 4. ADD state to hold the dynamic constraints
  const [dragConstraints, setDragConstraints] = useState({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });

  // 5. ADD effect to calculate viewport constraints
  useLayoutEffect(() => {
    const botEl = botRef.current;
    if (!botEl) return;

    const updateConstraints = () => {
      // Use window.innerHeight / innerWidth as the container boundaries (viewport)
      const { innerWidth, innerHeight } = window;
      const { width, height, top, left } = botEl.getBoundingClientRect();

      setDragConstraints({
        // The constraints are relative to the initial position (top: 1.5rem, left: 1.5rem)
        // Set constraints relative to the viewport edges
        top: -top,
        left: -left,
        right: innerWidth - (left + width),
        bottom: innerHeight - (top + height),
      });
    };

    updateConstraints();

    window.addEventListener("resize", updateConstraints);
    return () => window.removeEventListener("resize", updateConstraints);
  }, []);

  return (
    <motion.div
      ref={botRef} // 6. ATTACH the ref
      className="floating-bot"
      drag
      dragControls={dragControls}
      dragListener={false}
      whileDrag={{ scale: 1.1, boxShadow: "0px 10px 30px rgba(0,0,0,0.3)" }}
      data-speaking={isSpeaking}
      dragConstraints={dragConstraints} // 7. APPLY the dynamic constraints
      dragElastic={0} // 8. SET elastic to 0 to prevent bouncing past the edge
    >
      <motion.div
        className="floating-bot-icon"
        onPointerDown={(e) => dragControls.start(e)}
        style={{ cursor: "grab" }}
        animate={isSpeaking ? { scale: [1, 1.1, 1] } : { scale: 1 }}
        transition={
          isSpeaking
            ? { repeat: Infinity, duration: 1, ease: "easeInOut" }
            : {}
        }
      >
        <BsRobot />
      </motion.div>

      <div className="floating-bot-name">{user.id}</div>

      {/* Speaking Animation */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            className="floating-bot-speaking-indicator"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1, marginLeft: "0.5rem" }}
            exit={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <motion.div
              animate={{ scaleY: [1, 1.4, 0.8, 1.2, 1] }}
              transition={{
                repeat: Infinity,
                duration: 0.7,
                ease: "easeInOut",
              }}
            >
              <BsSoundwave className="text-success" size={20} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Main Layout Component ---
const MeetingLayout: React.FC<MeetingLayoutProps> = ({
  users,
  botNames,
  botSpeaker,
  sharingBy,
  sharedContent,
  remoteScreenStream,
  pinnedUserId,
  onPinUser,
  theme,
  isMobile,
  isChatSidebarOpen,
}: MeetingLayoutProps) => {

  // --- Filter Users ---
  const humanUsers = useMemo(
    () => (users || []).filter((u) => !botNames.includes(u.id)),
    [users, botNames]
  );

  const botUsers = useMemo(
    () => (users || []).filter((u) => botNames.includes(u.id)),
    [users, botNames]
  );

  // --- Determine Main View ---
  const pinnedUser = useMemo(
    () => humanUsers.find((u) => u.id === pinnedUserId),
    [humanUsers, pinnedUserId]
  );

  // useEffect(() => {
  //   const isScreenSharingActive = remoteScreenStream !== null && sharingBy !== null;

  //   if (isScreenSharingActive && pinnedUserId !== sharingBy) {
  //     onPinUser(sharingBy);
  //   }
  // }, [remoteScreenStream, sharingBy]);

  // FIX 1: Re-order mainViewType logic to prioritize sharing
  const mainViewType = useMemo(() => {
    if (remoteScreenStream) return "share";
    if (sharedContent) return "content";
    if (pinnedUser) return "pin";
    return "grid";
  }, [pinnedUser, remoteScreenStream, sharedContent]);

  // FIX 2: Update sidePaneUsers logic to filter sharer/pinned user
  const sidePaneUsers = useMemo(() => {
    if (mainViewType === "grid") {
      return [];
    }
    if (mainViewType === "pin") {
      return humanUsers.filter(u => u.id !== pinnedUserId);
    }
    if (mainViewType === "share") {
      return humanUsers.filter(u => u.id !== sharingBy);
    }
    // Fallback for "content" or other types
    return humanUsers;
  }, [humanUsers, mainViewType, pinnedUserId, sharingBy]);


  // --- Screen Share Video Ref ---
  const shareRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (shareRef.current) {
      shareRef.current.srcObject = remoteScreenStream;
    }
  }, [remoteScreenStream]);


  return (
    <div
      className="meeting-layout-container"
      data-bs-theme={theme}
    >
      {/* --- Floating Bots --- */}
      <AnimatePresence>
        {botUsers.map((bot) => (
          <FloatingBot
            key={bot.id}
            user={bot}
            isSpeaking={botSpeaker === bot.id}
          />
        ))}
      </AnimatePresence>

      {/* --- Main View --- */}
      <div className="meeting-main-view">
        {mainViewType === "grid" && (
          <DynamicGrid
            users={humanUsers}
            onPinUser={onPinUser}
            pinnedUserId={pinnedUserId}
          />
        )}

        {mainViewType === "pin" && pinnedUser && (
          <div className="main-view-pinned">
            <ParticipantCard
              user={pinnedUser}
              onPinUser={onPinUser}
              isPinned={true}
              isLargeView={true}
            />
          </div>
        )}

        {mainViewType === "share" && (
          <motion.div
            className="main-view-shared"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <video
              ref={shareRef}
              autoPlay
              playsInline
              className="main-view-shared-video"
            />
          </motion.div>
        )}

        {mainViewType === "content" && sharedContent != null && (
          <div
            className="main-view-shared-content"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sharedContent) }}
          />
        )}
      </div>

      {/* --- Side Pane --- */}
      <AnimatePresence>
        {!isMobile && !isChatSidebarOpen && mainViewType !== "grid" && sidePaneUsers.length > 0 && (
          <motion.div
            className="meeting-side-pane"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "tween", duration: 0.3 }}
          >
            <DynamicGrid
              users={sidePaneUsers}
              onPinUser={onPinUser}
              pinnedUserId={pinnedUserId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MeetingLayout;