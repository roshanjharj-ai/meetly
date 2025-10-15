import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { 
    Meeting, 
    Participant, 
    CreateMeetingRequest, 
    CreateParticipantRequest, 
    UpdateMeetingRequest, 
    UpdateParticipantRequest 
} from "../types/meeting.types";

// Get the base URL from the environment variable. Fallback to an empty string if not set.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// --- FALLBACK MOCK DATA ---
// This data will be used ONLY if the API calls fail.
let fallbackParticipants: Participant[] = [
    { id: '1', name: 'Alice Johnson', email: 'alice@example.com', mobile: '111-222-3333' },
    { id: '2', name: 'Bob Williams', email: 'bob@example.com', mobile: '444-555-6666' },
    { id: '3', name: 'Charlie Brown', email: 'charlie@example.com', mobile: '777-888-9999' },
    { id: '4', name: 'Diana Prince', email: 'diana@example.com' },
    { id: '5', name: 'Ethan Hunt', email: 'ethan@example.com', mobile: '123-456-7890' },
];

let fallbackMeetings: Meeting[] = [
    {
        id: 'm1',
        subject: 'Q4 Project Kick-off',
        agenda: 'Discuss project goals, timelines, and assign initial tasks.',
        dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        participants: [fallbackParticipants[0], fallbackParticipants[1], fallbackParticipants[4]],
        meetingLink: 'https://meet.example.com/abc-123'
    },
    {
        id: 'm2',
        subject: 'Weekly Sync-Up',
        agenda: 'Review progress from last week and plan for the next.',
        dateTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        participants: [fallbackParticipants[0], fallbackParticipants[1], fallbackParticipants[2], fallbackParticipants[3]],
        meetingLink: 'https://meet.example.com/def-456'
    }
];

// --- MEETING API ---

export const getMeetings = async (): Promise<Meeting[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/getMeetings`);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for getMeetings. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackMeetings)); // Return a deep copy
    }
};

export const createMeeting = async (data: CreateMeetingRequest): Promise<Meeting> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/createMeeting`, data);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for createMeeting. Falling back to mock data.`, error);
        const newMeeting: Meeting = { ...data, id: uuidv4(), meetingLink: `https://meet.example.com/${uuidv4().substring(0, 8)}` };
        fallbackMeetings.push(newMeeting);
        return newMeeting;
    }
};

export const updateMeeting = async (data: UpdateMeetingRequest): Promise<Meeting> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/updateMeeting`, data);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for updateMeeting. Falling back to mock data.`, error);
        const index = fallbackMeetings.findIndex(m => m.id === data.id);
        if (index === -1) throw new Error("Mock meeting not found");
        fallbackMeetings[index] = data;
        return data;
    }
};

export const deleteMeeting = async (id: string): Promise<{ success: boolean }> => {
    try {
        await axios.delete(`${API_BASE_URL}/deleteMeeting/${id}`);
        return { success: true };
    } catch (error) {
        console.warn(`API call failed for deleteMeeting. Falling back to mock data.`, error);
        fallbackMeetings = fallbackMeetings.filter(m => m.id !== id);
        return { success: true };
    }
};

// --- PARTICIPANT API ---

export const getParticipants = async (): Promise<Participant[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/getParticipants`);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for getParticipants. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackParticipants)); // Return a deep copy
    }
};

export const createParticipant = async (data: CreateParticipantRequest): Promise<Participant> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/createParticipant`, data);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for createParticipant. Falling back to mock data.`, error);
        const newParticipant: Participant = { ...data, id: uuidv4() };
        fallbackParticipants.push(newParticipant);
        return newParticipant;
    }
};

export const updateParticipant = async (data: UpdateParticipantRequest): Promise<Participant> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/updateParticipant`, data);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for updateParticipant. Falling back to mock data.`, error);
        const index = fallbackParticipants.findIndex(p => p.id === data.id);
        if (index === -1) throw new Error("Mock participant not found");
        fallbackParticipants[index] = data;
        return data;
    }
};

export const deleteParticipant = async (id: string): Promise<{ success: boolean }> => {
    try {
        await axios.delete(`${API_BASE_URL}/deleteParticipant/${id}`);
        return { success: true };
    } catch (error) {
        console.warn(`API call failed for deleteParticipant. Falling back to mock data.`, error);
        fallbackParticipants = fallbackParticipants.filter(p => p.id !== id);
        return { success: true };
    }
};