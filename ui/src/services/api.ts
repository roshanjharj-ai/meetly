import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type {
    CreateParticipantRequest,
    Meeting,
    Participant,
    UpdateParticipantRequest
} from "../types/meeting.types";

// Get the base URL from the environment variable. Fallback to an empty string if not set.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// --- FALLBACK MOCK DATA ---
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

// --- BOT MOCK DATA & TYPES ---

export interface BotConfig {
    id: string;
    name: string;
    description: string;
    status: 'Ready' | 'Attending' | 'Offline';
    pmTool: 'ADO' | 'monday' | 'None';
    pmToolConfig: string; // JSON string or identifier
    currentMeetingId: string | null;
    currentMeetingSubject: string | null;
    recent_completion_rate: number; // 0.0 to 1.0
    tasks_completed_last_week: number;
}

export interface BotActivity {
    timestamp: string;
    type: 'transcript' | 'action';
    content: string; // Transcript line or action description
    taskStatus?: 'completed' | 'commented' | 'created';
}

export interface BotPerformance {
    totalMeetings: number;
    avgDurationMinutes: number;
    tasksCompleted: number;
    tasksCommented: number;
    completionRate: number;
    metrics: { date: string, value: number }[]; // For charts
    taskBreakdown: {
        completed: number;
        commented: number;
        created: number;
        untouched: number;
        total: number;
    };
    graphMetrics: {
        totalRuns: number;
        stepVisits: { step: string, count: number }[];
        stepStatus: { smooth: number, clarification: number, blocked: number };
    };
}

// NEW INTERFACES
export interface LLMCostEntry {
    date: string;
    cost: number;
    tokens_used: number;
}

export interface LLMUsage {
    model_name: string;
    total_cost_ytd: number;
    avg_cost_per_meeting: number;
    cost_history: LLMCostEntry[];
}


const fallbackBots: BotConfig[] = [
    {
        id: 'b1',
        name: 'Jarvis',
        description: 'Assists the Core Dev Team in sprint syncs.',
        status: 'Attending',
        pmTool: 'ADO',
        pmToolConfig: 'Project-X-ADO-ID',
        currentMeetingId: 'm1',
        currentMeetingSubject: 'Q4 Project Kick-off',
        recent_completion_rate: 0.95,
        tasks_completed_last_week: 12,
    },
    {
        id: 'b2',
        name: 'AI-Assistant',
        description: 'Monitors Design and Marketing reviews.',
        status: 'Ready',
        pmTool: 'monday',
        pmToolConfig: 'Design-Board-ID-45',
        currentMeetingId: null,
        currentMeetingSubject: null,
        recent_completion_rate: 0.70,
        tasks_completed_last_week: 3,
    },
    {
        id: 'b3',
        name: 'Bot',
        description: 'New bot, pending configuration.',
        status: 'Offline',
        pmTool: 'None',
        pmToolConfig: '',
        currentMeetingId: null,
        currentMeetingSubject: null,
        recent_completion_rate: 0.0,
        tasks_completed_last_week: 0,
    },
];

const fallbackBotActivities: { [botId: string]: BotActivity[] } = {
    'b1': [
        { timestamp: new Date(Date.now() - 300000).toISOString(), type: 'transcript', content: 'Alice: "So, the first task should be marked as done, right?"' },
        { timestamp: new Date(Date.now() - 280000).toISOString(), type: 'action', content: 'Marked ADO Task #451 as completed.', taskStatus: 'completed' },
        { timestamp: new Date(Date.now() - 180000).toISOString(), type: 'transcript', content: 'Bob: "Can you add a comment to task 452 about the image asset?"' },
        { timestamp: new Date(Date.now() - 160000).toISOString(), type: 'action', content: 'Added comment to ADO Task #452: "Check image asset."', taskStatus: 'commented' },
    ],
    'b2': [],
    'b3': [],
};

const fallbackBotPerformance: { [botId: string]: BotPerformance } = {
    'b1': {
        totalMeetings: 45,
        avgDurationMinutes: 35,
        tasksCompleted: 88,
        tasksCommented: 120,
        completionRate: 0.95,
        metrics: [
            { date: 'Jul', value: 48 },
            { date: 'Aug', value: 42 },
            { date: 'Sep', value: 38 },
            { date: 'Oct', value: 35 },
            { date: 'Nov', value: 33 },
        ],
        taskBreakdown: { completed: 88, commented: 120, created: 30, untouched: 5, total: 243 },
        graphMetrics: {
            totalRuns: 500,
            stepVisits: [
                { step: 'init', count: 500 },
                { step: 'show_tasks', count: 500 },
                { step: 'wait_command', count: 480 },
                { step: 'ask_update', count: 350 },
                { step: 'collecting', count: 350 },
                { step: 'should_continue_router', count: 350 },
                { step: 'summary', count: 120 },
                { step: 'prompt_for_start', count: 20 },
            ],
            stepStatus: { smooth: 420, clarification: 65, blocked: 15 },
        },
    },
    'b2': {
        totalMeetings: 10,
        avgDurationMinutes: 50,
        tasksCompleted: 5,
        tasksCommented: 12,
        completionRate: 0.75,
        metrics: [
            { date: 'Aug', value: 55 }, { date: 'Sep', value: 50 },
            { date: 'Oct', value: 48 }, { date: 'Nov', value: 45 },
        ],
        taskBreakdown: { completed: 5, commented: 12, created: 2, untouched: 10, total: 29 },
        graphMetrics: {
            totalRuns: 80,
            stepVisits: [
                { step: 'init', count: 80 },
                { step: 'show_tasks', count: 80 },
                { step: 'wait_command', count: 80 },
                { step: 'ask_update', count: 50 },
                { step: 'collecting', count: 50 },
                { step: 'should_continue_router', count: 50 },
                { step: 'summary', count: 30 },
                { step: 'prompt_for_start', count: 0 },
            ],
            stepStatus: { smooth: 60, clarification: 15, blocked: 5 },
        },
    },
    'b3': {
        totalMeetings: 0,
        avgDurationMinutes: 0,
        tasksCompleted: 0,
        tasksCommented: 0,
        completionRate: 0,
        metrics: [],
        taskBreakdown: { completed: 0, commented: 0, created: 0, untouched: 0, total: 0 },
        graphMetrics: {
            totalRuns: 0,
            stepVisits: [],
            stepStatus: { smooth: 0, clarification: 0, blocked: 0 },
        }
    },
};

// NEW MOCK DATA FOR LLM USAGE
const fallbackLLMUsage: LLMUsage = {
    model_name: "GPT-3.5-Turbo (Azure)",
    total_cost_ytd: 145.75,
    avg_cost_per_meeting: 0.85,
    cost_history: [
        { date: "2025-08-01", cost: 15.20, tokens_used: 1800000 },
        { date: "2025-08-08", cost: 21.50, tokens_used: 2400000 },
        { date: "2025-08-15", cost: 18.00, tokens_used: 2100000 },
        { date: "2025-08-22", cost: 25.10, tokens_used: 3100000 },
        { date: "2025-08-29", cost: 22.90, tokens_used: 2800000 },
        { date: "2025-09-05", cost: 19.50, tokens_used: 2200000 },
        { date: "2025-09-12", cost: 23.55, tokens_used: 2900000 },
    ]
};

interface signUpRequest {
    email: string,
    password: string,
    full_name: string,
    user_name: string,
    customer_id: string
}

export const SignUp = async (request: signUpRequest): Promise<string> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/signup`, request);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for getBotConfigs. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackBots));
    }
};

export const getBotConfigs = async (): Promise<BotConfig[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/bots/configs`);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for getBotConfigs. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackBots));
    }
};

export const createBotConfig = async (data: Omit<BotConfig, 'id' | 'status' | 'currentMeetingId' | 'currentMeetingSubject' | 'recent_completion_rate' | 'tasks_completed_last_week'>): Promise<BotConfig> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/bots/create`, data);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for createBotConfig. Falling back to mock data.`, error);
        const newBot: BotConfig = {
            ...data,
            id: uuidv4(),
            status: 'Offline',
            currentMeetingId: null,
            currentMeetingSubject: null,
            recent_completion_rate: 0.0,
            tasks_completed_last_week: 0,
        };
        fallbackBots.push(newBot);
        return newBot;
    }
};

export const updateBotConfig = async (data: BotConfig): Promise<BotConfig> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/bots/update/${data.id}`, data);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for updateBotConfig. Falling back to mock data.`, error);
        const index = fallbackBots.findIndex(b => b.id === data.id);
        if (index !== -1) fallbackBots[index] = data;
        return data;
    }
};

export const deleteBotConfig = async (id: string): Promise<{ success: boolean }> => {
    try {
        await axios.delete(`${API_BASE_URL}/bots/delete/${id}`);
        return { success: true };
    } catch (error) {
        console.warn(`API call failed for deleteBotConfig. Falling back to mock data.`, error);
        const index = fallbackBots.findIndex(b => b.id === id);
        if (index !== -1) fallbackBots.splice(index, 1);
        return { success: true };
    }
};

export const getBotActivities = async (botId: string): Promise<BotActivity[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/bots/${botId}/activities`);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for getBotActivities for ${botId}. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackBotActivities[botId] || []));
    }
};

export const getBotPerformance = async (botId: string): Promise<BotPerformance> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/bots/${botId}/performance`);
        return response.data;
    } catch (error) {
        console.warn(`API call failed for getBotPerformance for ${botId}. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackBotPerformance[botId] || fallbackBotPerformance['b1']));
    }
};

export const bargeIntoMeeting = async (botId: string, meetingId: string): Promise<{ success: boolean }> => {
    try {
        await axios.post(`${API_BASE_URL}/bots/${botId}/barge`, { meetingId });
        return { success: true };
    } catch (error) {
        console.warn(`API call failed for bargeIntoMeeting. Falling back to mock success.`, error);
        return { success: true };
    }
};

// NEW API FUNCTION
export const getLLMUsage = async (botId: string): Promise<LLMUsage> => {
    try {
        // NOTE: This endpoint is not fully implemented on the server yet, 
        // so we intentionally throw an error to use the mock data.
        throw new Error("LLM Usage API not implemented yet.");
        // const response = await axios.get(`${API_BASE_URL}/bots/${botId}/llm-usage`);
        // return response.data;
    } catch (error) {
        console.warn(`API call failed for getLLMUsage for ${botId}. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackLLMUsage));
    }
};

export interface UserProfileUpdate {
    full_name?: string;
    user_name?: string;
    mobile?: string;
    picture?: string;
}

export const updateUserProfile = async (data: UserProfileUpdate): Promise<any> => {
    const response = await axios.put(`${API_BASE_URL}/users/me`, data);
    return response.data;
};

// --- MEETING API ---

export const getMeetings = async (): Promise<Meeting[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/getMeetings`);
        return response.data.map((meeting: any) => ({
            ...meeting,
            participants: meeting.participants || [],
            dateTime: meeting.date_time || meeting.dateTime
        }));
    } catch (error) {
        console.warn(`API call failed for getMeetings. Falling back to mock data.`, error);
        return JSON.parse(JSON.stringify(fallbackMeetings));
    }
};

interface MeetingFormData {
    subject: string;
    agenda: string;
    dateTime: string;
    participants: Participant[];
}

export const createMeeting = async (data: MeetingFormData): Promise<Meeting> => {
    const payload = {
        subject: data.subject,
        agenda: data.agenda,
        date_time: data.dateTime,
        participant_ids: data.participants.map(p => parseInt(p.id, 10))
    };

    try {
        const response = await axios.post(`${API_BASE_URL}/createMeeting`, payload);
        return {
            ...response.data,
            participants: response.data.participants || [],
            dateTime: response.data.date_time || response.data.dateTime
        };
    } catch (error) {
        console.warn(`API call failed for createMeeting. Falling back to mock data.`, error);
        const newMeeting: Meeting = {
            ...data,
            id: uuidv4(),
            meetingLink: `https://meet.example.com/${uuidv4().substring(0, 8)}`
        };
        fallbackMeetings.push(newMeeting);
        return newMeeting;
    }
};

export const updateMeeting = async (data: Meeting): Promise<Meeting> => {
    const payload = {
        id: data.id,
        subject: data.subject,
        agenda: data.agenda,
        date_time: data.dateTime,
        participant_ids: data.participants.map(p => parseInt(p.id, 10))
    };
    try {
        const response = await axios.put(`${API_BASE_URL}/updateMeeting/${data.id}`, payload);
        return {
            ...response.data,
            participants: response.data.participants || [],
            dateTime: response.data.date_time || response.data.dateTime
        };
    } catch (error) {
        console.warn(`API call failed for updateMeeting. Falling back to mock data.`, error);
        const index = fallbackMeetings.findIndex(m => m.id === data.id);
        if (index === -1) throw new Error("Mock meeting not found");
        fallbackMeetings[index] = { ...fallbackMeetings[index], ...data };
        return fallbackMeetings[index];
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
        return JSON.parse(JSON.stringify(fallbackParticipants));
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
        const response = await axios.put(`${API_BASE_URL}/updateParticipant/${data.id}`, data);
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



interface ValidateJoinPayload {
    email: string;
    room: string;
    user_name?: string;
}

interface VerifyCodePayload {
    email: string;
    room: string;
    code: string;
}

export const validateJoinRequest = async (payload: ValidateJoinPayload): Promise<{ message: string }> => {
    const response = await axios.post(`${API_BASE_URL}/meetings/validate-join`, payload);
    return response.data;
};

export const verifyJoinCode = async (payload: VerifyCodePayload): Promise<{ valid: boolean; message: string; token?: string }> => {
    const response = await axios.post(`${API_BASE_URL}/meetings/verify-code`, payload);
    return response.data;
};