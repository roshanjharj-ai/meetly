import React from 'react';
import { Button, ButtonGroup, Container } from "react-bootstrap";
import { FiMic, FiMicOff, FiPhoneOff, FiShare2, FiVideo, FiVideoOff, FiXSquare } from "react-icons/fi";
import { VscLayoutSidebarRight, VscLayoutSidebarRightOff } from 'react-icons/vsc';
import { ControlActionTypes } from '../types';
import MicActivityIndicator from './MicActivityIndicator';

interface ControlsProps {
    performAction: (action: string) => void;
    status: string;
    room: string;
    isMuted: boolean;
    isCameraOff: boolean;
    isSharing: boolean;
    isSpeaking: boolean,
    isJoined: boolean,
    isSidebar: boolean
}

const Controls: React.FC<ControlsProps> = ({ performAction, status, room, isMuted, isCameraOff, isSharing, isSpeaking, isJoined, isSidebar }) => {
    return (
        <Container fluid className="bg-dark p-3 d-flex flex-row align-items-center justify-content-between gap-3 border-top border-secondary">
            {/* Status Display */}
            <div className="d-flex justify-content-center" style={{ minWidth: '150px' }}>
                <div className="px-3 py-2 border border-secondary rounded-pill text-white small text-truncate align-items-center d-flex">
                    <div className="text-white fw-bold">
                        {room}
                    </div>
                    {status}
                    {isJoined ? " Joined" : ""}
                </div>
                <MicActivityIndicator speaking={isSpeaking} />
            </div>

            {/* Control Buttons */}
            <ButtonGroup className="d-flex gap-3">
                {/* Mute Button */}
                <Button
                    variant={isMuted ? "danger" : "outline-light"}
                    onClick={() => performAction(ControlActionTypes.mute)}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                    className="rounded-circle d-flex align-items-center justify-content-center p-3"
                >
                    {isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}
                </Button>

                {/* Camera Button */}
                <Button
                    variant={isCameraOff ? "danger" : "outline-light"}
                    onClick={() => performAction(ControlActionTypes.camera)}
                    aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                    className="rounded-circle d-flex align-items-center justify-content-center p-3"
                >
                    {isCameraOff ? <FiVideoOff size={20} /> : <FiVideo size={20} />}
                </Button>

                {/* Share Content Button */}
                <Button
                    variant={isSharing ? "danger" : "outline-light"}
                    onClick={() => performAction("share")}
                    aria-label={isSharing ? "Stop sharing" : "Share screen"}
                    className="rounded-circle d-flex align-items-center justify-content-center p-3"
                >
                    {isSharing ? <FiXSquare size={20} /> : <FiShare2 size={20} />}
                </Button>

                {/* End Call Button */}
                <Button
                    variant="danger"
                    onClick={() => performAction(ControlActionTypes.end)}
                    aria-label="End call"
                    className="rounded-circle d-flex align-items-center justify-content-center p-3"
                >
                    <FiPhoneOff size={20} />
                </Button>
            </ButtonGroup>

            <ButtonGroup className="d-flex gap-3">
                <Button
                    variant={"outline-light"}
                    onClick={() => performAction(ControlActionTypes.sidebar)}
                    aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                    className="p-2"
                >
                    {isSidebar ? <VscLayoutSidebarRight size={20} /> : <VscLayoutSidebarRightOff size={20} />}
                </Button>
            </ButtonGroup>
        </Container>
    );
};

export default Controls;
