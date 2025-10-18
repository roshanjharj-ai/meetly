// src/pages/Meeting/DevicePreview.tsx
import React, { useState, useEffect, useRef } from 'react';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiRefreshCw, FiVolume2 } from 'react-icons/fi';
import { motion } from 'framer-motion';

interface DevicePreviewProps {
  initialAudioEnabled: boolean;
  initialVideoEnabled: boolean;
  onPreferencesChange: (prefs: { audioEnabled: boolean; videoEnabled: boolean }) => void;
}

const DevicePreview: React.FC<DevicePreviewProps> = ({
  initialAudioEnabled,
  initialVideoEnabled,
  onPreferencesChange,
}) => {
  const [audioEnabled, setAudioEnabled] = useState(initialAudioEnabled);
  const [videoEnabled, setVideoEnabled] = useState(initialVideoEnabled);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioMeterRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  const getDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); // Request permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      // Set default devices if not already selected
      if (!selectedAudioDevice && audioDevices.length > 0) setSelectedAudioDevice(audioDevices[0].deviceId);
      if (!selectedVideoDevice && videoDevices.length > 0) setSelectedVideoDevice(videoDevices[0].deviceId);
    } catch (err) {
      console.error("Error enumerating devices:", err);
    }
  };

  useEffect(() => {
    getDevices();
    // Cleanup function for audio context
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      analyserRef.current?.disconnect();
      sourceRef.current?.disconnect();
      audioContextRef.current?.close().catch(console.error);
    };
  }, []);

  useEffect(() => {
    const startStream = async () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      analyserRef.current?.disconnect();
      sourceRef.current?.disconnect();

      try {
        const constraints: MediaStreamConstraints = {
          audio: audioEnabled ? { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined } : false,
          video: videoEnabled ? { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined } : false,
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }

        // Setup audio meter if audio is enabled
        if (audioEnabled && newStream.getAudioTracks().length > 0) {
          if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
             audioContextRef.current = new AudioContext();
          }
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          sourceRef.current = audioContextRef.current.createMediaStreamSource(newStream);
          sourceRef.current.connect(analyserRef.current);
          
          const bufferLength = analyserRef.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const updateMeter = () => {
            if (analyserRef.current && audioMeterRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              const avg = dataArray.reduce((sum, val) => sum + val, 0) / bufferLength;
              const volume = Math.min(100, Math.max(0, avg * 1.5)); // Scale volume
              audioMeterRef.current.style.width = `${volume}%`;
            }
            animationFrameRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        } else {
            if (audioMeterRef.current) audioMeterRef.current.style.width = '0%';
        }

      } catch (err) {
        console.error("Error getting media stream:", err);
        setStream(null); // Clear stream on error
         if (audioMeterRef.current) audioMeterRef.current.style.width = '0%';
      }
    };

    startStream();

    // Cleanup stream on component unmount or when dependencies change
    return () => {
      stream?.getTracks().forEach(track => track.stop());
       if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
       analyserRef.current?.disconnect();
       sourceRef.current?.disconnect();
       if (audioMeterRef.current) audioMeterRef.current.style.width = '0%';
    };
  }, [audioEnabled, videoEnabled, selectedAudioDevice, selectedVideoDevice]); // Re-run when settings change

  useEffect(() => {
    onPreferencesChange({ audioEnabled, videoEnabled });
  }, [audioEnabled, videoEnabled, onPreferencesChange]);

  const toggleAudio = () => setAudioEnabled(prev => !prev);
  const toggleVideo = () => setVideoEnabled(prev => !prev);

  return (
    <motion.div 
      className="device-preview-container card card-body"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
       <style>{`
          .device-preview-container { background-color: var(--bs-tertiary-bg); border: 1px solid var(--bs-border-color); border-radius: 12px; }
          .video-preview { width: 100%; aspect-ratio: 16/9; background-color: #000; border-radius: 8px; overflow: hidden; margin-bottom: 1rem; position: relative; }
          .video-preview video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); } /* Mirror effect */
          .placeholder-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #6c757d; font-size: 0.9rem; }
          .controls { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
          .device-select { flex-grow: 1; }
          .control-button { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; transition: background-color 0.2s; }
          .control-button.on { background-color: var(--bs-secondary); color: var(--bs-light); }
          .control-button.off { background-color: var(--bs-danger); color: var(--bs-light); }
          .audio-meter-track { width: 100%; height: 5px; background-color: var(--bs-secondary-bg); border-radius: 3px; overflow: hidden; margin-top: 5px; }
          .audio-meter-fill { height: 100%; background-color: var(--bs-success); border-radius: 3px; width: 0%; transition: width 0.1s linear; }
      `}</style>
      <div className="video-preview">
        {videoEnabled && stream ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className="placeholder-text">Camera Off</div>
        )}
      </div>
      <div className="controls mb-2">
        <button onClick={toggleAudio} className={`control-button ${audioEnabled ? 'on' : 'off'}`}>
          {audioEnabled ? <FiMic size={18} /> : <FiMicOff size={18} />}
        </button>
        <div className="device-select">
          <select 
            className="form-select form-select-sm" 
            value={selectedAudioDevice} 
            onChange={e => setSelectedAudioDevice(e.target.value)}
            disabled={!audioEnabled}
          >
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Audio Input ${audioDevices.indexOf(device) + 1}`}</option>
            ))}
            {audioDevices.length === 0 && <option>No audio devices</option>}
          </select>
          {audioEnabled && (
             <div className="audio-meter-track"><div ref={audioMeterRef} className="audio-meter-fill"></div></div>
          )}
        </div>
      </div>
      <div className="controls">
         <button onClick={toggleVideo} className={`control-button ${videoEnabled ? 'on' : 'off'}`}>
          {videoEnabled ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
        </button>
        <select 
          className="form-select form-select-sm device-select" 
          value={selectedVideoDevice} 
          onChange={e => setSelectedVideoDevice(e.target.value)}
          disabled={!videoEnabled}
        >
          {videoDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>{device.label || `Video Input ${videoDevices.indexOf(device) + 1}`}</option>
          ))}
          {videoDevices.length === 0 && <option>No video devices</option>}
        </select>
      </div>
       <button className="btn btn-sm btn-outline-secondary mt-2 w-100" onClick={getDevices}>
        <FiRefreshCw size={14} className="me-1"/> Refresh Devices
       </button>
    </motion.div>
  );
};

export default DevicePreview;