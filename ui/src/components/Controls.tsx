// src/components/Controls.tsx
import React, { useState } from 'react';
import { Button, ButtonGroup, Container } from "react-bootstrap";
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff } from "react-icons/fi";
import { ControlActionTypes } from '../types';
import { ImPhoneHangUp } from 'react-icons/im';

interface ControlsProps {
    performAction: (action: string) => void,
    status: string,
    room: string
}


const Controls: React.FC<ControlsProps> = ({ performAction, status, room }) => {
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [isCameraOff, setIsCameraOff] = useState<boolean>(false);

    return (
        <Container fluid className="bg-gray p-4 d-flex flex-row align-items-center justify-content-between gap-3">
            {/* Room Label */}
            <div className="text-white fw-bold">{room}</div>

            {/* Control Buttons */}
            <ButtonGroup className="d-flex gap-2">
                {/* Mute Button */}
                <Button
                    variant={isMuted ? "secondary" : "outline-light"}
                    onClick={() => setIsMuted(!isMuted)}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                    className="rounded-circle d-flex align-items-center justify-content-center"
                    style={{ width: "48px", height: "48px" }}
                >
                    {isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}
                </Button>

                {/* Camera Button */}
                <Button
                    variant={isCameraOff ? "secondary" : "outline-light"}
                    onClick={() => setIsCameraOff(!isCameraOff)}
                    aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                    className="rounded-circle d-flex align-items-center justify-content-center"
                    style={{ width: "48px", height: "48px" }}
                >
                    {isCameraOff ? <FiVideoOff size={20} /> : <FiVideo size={20} />}
                </Button>

                {/* End Call Button */}
                <Button
                    variant="danger"
                    onClick={() => performAction(ControlActionTypes.mute)}
                    aria-label="End call"
                    className="rounded-circle d-flex align-items-center justify-content-center"
                    style={{ width: "48px", height: "48px" }}
                >
                    <FiPhoneOff size={20} />
                </Button>

                {/* Toggle Sidebar / Hang Up */}
                <Button
                    variant="danger"
                    onClick={() => performAction(ControlActionTypes.end)}
                    aria-label="Show participants"
                    className="rounded-circle d-flex align-items-center justify-content-center"
                    style={{ width: "48px", height: "48px" }}
                >
                    <ImPhoneHangUp size={20} />
                </Button>
            </ButtonGroup>
            <div className="d-flex justify-content-center">
                <div className="px-3 py-2 border border-light rounded-pill text-white small">
                    {status}
                </div>
            </div>
        </Container>
    );
};

export default Controls;