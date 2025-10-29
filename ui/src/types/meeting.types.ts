// src/types/meeting.types.ts

export interface Participant {
    id: string;
    name: string;
    email: string;
    mobile?: string;
}

export interface Meeting {
    id: string;
    subject: string;
    agenda: string;
    dateTime: string;
    participants: Participant[];
    meetingLink: string;
}

// API Request/Response Interfaces

export interface CreateMeetingRequest extends Omit<Meeting, 'id' | 'meetingLink'> { }
export interface CreateMeetingResponse extends Meeting { }

export interface UpdateMeetingRequest extends Meeting { }
export interface UpdateMeetingResponse extends Meeting { }

export interface CreateParticipantRequest extends Omit<Participant, 'id'> { }
export interface CreateParticipantResponse extends Participant { }

export interface UpdateParticipantRequest extends Participant { }
export interface UpdateParticipantResponse extends Participant { }

export type UserAndRoom = {
    email: string;
    password?: string;
    user_name: string,
    full_name?: string;
    mobile?: string;
    picture?: string;
    customer_slug?: string;
    customer_id?: string;
    user_type?: string;
}

export interface FullUserProfile extends UserAndRoom {
    full_name?: string;
    mobile?: string;
    photo_url?: string;
    // Add any other fields that your backend's User schema provides
}

export const ControlActionTypes = {
    end: "end",
    mute: "mute",
    share: "share",
    raiseHand: "raiseHand",
    camera: "camera",
    sidebar: "sidebar",
    shareStop: "share-none"
}