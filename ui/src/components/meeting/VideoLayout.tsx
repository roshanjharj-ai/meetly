import { useEffect, useRef } from 'react';

// A simple helper component to render a video stream
const VideoPlayer = ({ stream, muted = false, name }: { stream: MediaStream, muted?: boolean, name: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <div className="video-name-tag">{name}</div>
    </div>
  );
};

// Main layout component
interface VideoLayoutProps {
  userId: string;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  remoteScreens: Record<string, MediaStream>;
  sharingBy: string | null;
}

export const VideoLayout = ({
  userId,
  localStream,
  remoteStreams,
  remoteScreens,
  sharingBy,
}: VideoLayoutProps) => {

  const screenStream = sharingBy ? remoteScreens[sharingBy] || null : null;
  const isSharingLocally = sharingBy === userId;

  // Combine all regular peer videos into one list for the tiled view
  const peerVideos = Object.entries(remoteStreams)
    .filter(([id, stream]) => stream && id !== sharingBy) // Exclude the sharer's main video if they are sharing
    .map(([id, stream]) => ({ id, stream }));

  if (isSharingLocally) {
    return (
      <div className="video-layout-sharing">
        <div className="main-screen-view">
          <div className="sharing-notice">You are sharing your screen</div>
        </div>
        <div className="sidebar-videos">
          {localStream && <VideoPlayer stream={localStream} muted name={`${userId} (You)`} />}
          {peerVideos.map(({ id, stream }) => <VideoPlayer key={id} stream={stream} name={id} />)}
        </div>
      </div>
    );
  }

  if (sharingBy && screenStream) {
    return (
      <div className="video-layout-sharing">
        <div className="main-screen-view">
          <VideoPlayer stream={screenStream} name={`${sharingBy}'s Screen`} />
        </div>
        <div className="sidebar-videos">
          {localStream && <VideoPlayer stream={localStream} muted name={`${userId} (You)`} />}
          {peerVideos.map(({ id, stream }) => <VideoPlayer key={id} stream={stream} name={id} />)}
        </div>
      </div>
    );
  }

  // Default grid view when no one is sharing screen
  return (
    <div className="video-layout-grid">
      {localStream && <VideoPlayer stream={localStream} muted name={`${userId} (You)`} />}
      {peerVideos.map(({ id, stream }) => <VideoPlayer key={id} stream={stream} name={id} />)}
    </div>
  );
};

export default VideoLayout;