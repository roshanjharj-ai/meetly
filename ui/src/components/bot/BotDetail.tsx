// src/pages/Bot/BotDetail.tsx

import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } from 'chart.js';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { FiAlertTriangle, FiArrowDownRight, FiArrowUpRight, FiCheckCircle, FiClock, FiEdit, FiGitBranch, FiHash, FiMessageSquare, FiPieChart, FiPlus, FiTool, FiTrash2, FiTrendingUp, FiUsers, FiX, FiZap } from 'react-icons/fi'; // Added FiUser, FiUsers, FiX
import { useNavigate, useParams } from 'react-router-dom';
import { bargeIntoMeeting, type BotActivity, type BotConfig, type BotPerformance, deleteBotConfig, getBotActivities, getBotConfigs, getBotPerformance, updateBotConfig } from '../../services/api';
import AlertModal from '../shared/AlertModal';
import BotConfigDrawer from './BotConfigDrawer';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, ArcElement);

// --- MOCK DATA FOR PARTICIPANTS ---
interface ParticipantDetail {
    id: string;
    name: string;
    email: string;
    mobile?: string;
    status: 'live' | 'offline';
}

const mockBotParticipants: ParticipantDetail[] = [
    { id: 'p1', name: 'Roshan Sharma', email: 'roshan@synapt.com', mobile: '987-654-3210', status: 'live' },
    { id: 'p2', name: 'Alice Johnson', email: 'alice@synapt.com', mobile: '111-222-3333', status: 'live' },
    { id: 'p3', name: 'Bob Williams', email: 'bob@synapt.com', mobile: '444-555-6666', status: 'offline' },
    { id: 'p4', name: 'Diana Prince', email: 'diana@synapt.com', mobile: '555-666-7777', status: 'live' },
    { id: 'p5', name: 'Charlie Brown', email: 'charlie@synapt.com', status: 'offline' },
];

// --- NEW PARTICIPANTS DRAWER COMPONENT ---
interface BotParticipantsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    participants: ParticipantDetail[];
    botName: string;
}

const BotParticipantsDrawer: React.FC<BotParticipantsDrawerProps> = ({ isOpen, onClose, participants, botName }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="position-fixed top-0 end-0 h-100 bg-body border-start shadow-lg d-flex flex-column"
                style={{ width: 'min(95vw, 400px)', zIndex: 4000 }}
            >
                <div className="d-flex justify-content-between align-items-center p-4 border-bottom flex-shrink-0">
                    <h4 className="mb-0 d-flex align-items-center gap-2"><FiUsers /> Participants tracked by {botName}</h4>
                    <button className="btn btn-sm btn-outline-secondary" onClick={onClose}><FiX size={20} /></button>
                </div>

                <div className="flex-grow-1 overflow-auto p-4">
                    <ul className="list-group list-group-flush vstack gap-3">
                        {participants.map((p) => {
                            const isLive = p.status === 'live';
                            return (
                                <motion.li
                                    key={p.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="list-group-item d-flex align-items-center justify-content-between p-3 rounded-3"
                                    style={{ background: 'var(--bs-secondary-bg)' }}
                                >
                                    <div className="d-flex align-items-center gap-3">
                                        <div
                                            className="rounded-circle"
                                            style={{
                                                width: '10px',
                                                height: '10px',
                                                background: isLive ? 'var(--bs-success)' : 'var(--bs-danger)',
                                                boxShadow: isLive ? '0 0 5px var(--bs-success)' : 'none',
                                            }}
                                        ></div>
                                        <div>
                                            <strong className="d-block">{p.name}</strong>
                                            <span className="text-muted small">{p.email}</span>
                                            {p.mobile && <span className="text-muted small d-block">{p.mobile}</span>}
                                        </div>
                                    </div>
                                    <span className={`badge bg-opacity-75 bg-${isLive ? 'success' : 'danger'}`}>
                                        {isLive ? 'Live' : 'Offline'}
                                    </span>
                                </motion.li>
                            );
                        })}
                    </ul>
                </div>
            </motion.div>
        )}
    </AnimatePresence>
);

// --- CHART COLOR PALETTE (Fixed Hex Codes for Universal Visibility) ---
const CHART_VISIT_PALETTE = [
    '#5865F2', // Blue (Primary)
    '#16A34A', // Green (Success)
    '#F28E2B', // Orange (Warning)
    '#76B7B2', // Cyan/Teal (Info)
    '#94A3B8', // Gray (Secondary)
    '#E15759', // Red (Danger)
    '#AF7AA1', // Purple
];

const CHART_STATUS_COLORS = {
    smooth: '#10B981', // Emerald Green
    clarification: '#FBBF24', // Amber Yellow
    blocked: '#EF4444', // Red
};

// --- CHART UTILITIES ---

type ScaleOptions = {
    display: boolean;
    grid: { color: string; };
    ticks: { color: string; };
    beginAtZero?: boolean;
    title?: {
        display: boolean;
        text: string;
        color: string;
    };
};

// Utility to reliably get resolved CSS variables
const getThemeColors = () => {
    if (typeof window === 'undefined') return { textColor: '#FFFFFF', gridColor: '#3F3F46', bgColor: '#27272A', borderColor: '#3F3F46' };

    const style = getComputedStyle(document.body);
    return {
        textColor: style.getPropertyValue('--bs-body-color') || '#E9ECEF',
        gridColor: style.getPropertyValue('--bs-border-color') || '#495057',
        bgColor: style.getPropertyValue('--bs-body-bg') || '#212529',
        borderColor: style.getPropertyValue('--bs-border-color') || '#495057',
    };
};


const getChartOptions = (title: string, type: 'line' | 'bar' | 'doughnut', colors: ReturnType<typeof getThemeColors>): {
    responsive: boolean;
    maintainAspectRatio: boolean;
    plugins: any;
    indexAxis?: 'x' | 'y';
    scales: {
        x: ScaleOptions;
        y: ScaleOptions;
    };
} => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: type !== 'line',
            position: type === 'doughnut' ? 'right' as const : 'top' as const,
            labels: { color: colors.textColor }
        },
        title: {
            display: true,
            text: title,
            color: colors.textColor
        },
        tooltip: {
            backgroundColor: colors.bgColor,
            titleColor: colors.textColor,
            bodyColor: colors.textColor,
            borderColor: colors.borderColor,
            borderWidth: 1
        }
    },
    scales: {
        x: {
            display: true,
            grid: { color: colors.gridColor },
            ticks: { color: colors.textColor }
        },
        y: {
            display: true,
            beginAtZero: true,
            grid: { color: colors.gridColor },
            ticks: { color: colors.textColor }
        },
    },
} as const) as any;

/**
 * Implements a flow-like visualization by grouping nodes.
 */
const GraphFlowChart = ({ metrics }: { metrics: BotPerformance['graphMetrics'] }) => {
    const themeColors = useMemo(() => getThemeColors(), []);

    const flowData = useMemo(() => {
        const stepMap = new Map<string, number>();

        metrics.stepVisits.forEach(item => {
            let label = item.step;

            if (label === 'init' || label === 'show_tasks') {
                label = 'Setup & Presentation';
            } else if (label === 'wait_command' || label === 'prompt_for_start') {
                label = 'Waiting for Start Command';
            } else if (label === 'ask_update' || label === 'collecting') {
                label = 'Execution: Update Cycle';
            } else if (label === 'summary') {
                label = 'Meeting Summary';
            } else {
                return;
            }

            stepMap.set(label, (stepMap.get(label) || 0) + item.count);
        });

        return Array.from(stepMap.entries()).map(([step, count], index) => ({
            step, count, color: CHART_VISIT_PALETTE[index % CHART_VISIT_PALETTE.length]
        }));
    }, [metrics.stepVisits]);


    const data = {
        labels: flowData.map(f => f.step),
        datasets: [{
            label: 'Total Visits (Flow Volume)',
            data: flowData.map(f => f.count),
            backgroundColor: flowData.map(f => f.color),
            borderColor: themeColors.bgColor,
            borderWidth: 1,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
        }],
    };

    const options = getChartOptions('Execution Flow Volume (User-Friendly Nodes)', 'bar', themeColors);
    options.indexAxis = 'y';
    options.scales.x.title = { display: true, text: 'Total Visits', color: themeColors.textColor };
    options.scales.y.title = { display: true, text: 'Meeting Phase', color: themeColors.textColor };

    return <Bar data={data} options={options} />;
};

const GraphStatusChart = ({ metrics }: { metrics: BotPerformance['graphMetrics'] }) => {
    const themeColors = useMemo(() => getThemeColors(), []);

    const data = {
        labels: ['Smooth (No Clarification)', 'Clarification Needed', 'Stuck/Blocked'],
        datasets: [{
            data: [metrics.stepStatus.smooth, metrics.stepStatus.clarification, metrics.stepStatus.blocked],
            backgroundColor: [
                CHART_STATUS_COLORS.smooth,
                CHART_STATUS_COLORS.clarification,
                CHART_STATUS_COLORS.blocked,
            ],
            borderColor: themeColors.bgColor,
            borderWidth: 2,
        }],
    };

    const options = getChartOptions('Graph Execution Status Breakdown', 'doughnut', themeColors);
    options.scales.x.display = false;
    options.scales.y.display = false;

    return <Doughnut data={data} options={options} />;
};

const PerformanceChart = ({ performance }: { performance: BotPerformance }) => {
    const themeColors = useMemo(() => getThemeColors(), []);

    const data = {
        labels: performance.metrics.map(m => m.date),
        datasets: [
            {
                label: 'Avg. Meeting Duration (min)',
                data: performance.metrics.map(m => m.value),
                borderColor: CHART_VISIT_PALETTE[0],
                backgroundColor: 'rgba(88, 101, 242, 0.1)',
                tension: 0.4,
                fill: true,
            },
        ],
    };

    const options = getChartOptions('Average Duration Trend', 'line', themeColors);

    return <Line data={data} options={options} />;
};


const TaskBreakdownAnalysis = ({ breakdown }: { breakdown: BotPerformance['taskBreakdown'] }) => {
    if (breakdown.total === 0) {
        return <p className="text-center text-muted p-4">No tasks processed yet.</p>;
    }

    const { completed, commented, created, untouched, total } = breakdown;
    const data = [
        { label: 'Completed', value: completed, color: 'success' },
        { label: 'Commented/Updated', value: commented, color: 'info' },
        { label: 'Created', value: created, color: 'primary' },
        { label: 'Untouched/Ignored', value: untouched, color: 'danger' },
    ];

    const CompletionBar = () => (
        <div className="d-flex gap-1 mb-3 rounded-pill overflow-hidden" style={{ height: '15px' }}>
            {data.filter(d => d.value > 0).map(d => (
                <div
                    key={d.label}
                    className={`bg-${d.color}`}
                    style={{ width: `${(d.value / total) * 100}%`, transition: 'width 0.5s ease' }}
                    title={`${d.label}: ${d.value}`}
                ></div>
            ))}
        </div>
    );

    return (
        <div className="p-4">
            <h5 className="mb-3">Task Action Ratio (Total: {total})</h5>

            <CompletionBar />

            <ul className="list-unstyled small vstack gap-2">
                {data.map(d => (
                    <li key={d.label} className="d-flex justify-content-between align-items-center">
                        <span className="d-flex align-items-center gap-2">
                            <span className={`badge bg-${d.color}`} style={{ width: '10px', height: '10px', padding: 0 }}>&nbsp;</span>
                            {d.label}
                        </span>
                        <span className="fw-bold">{d.value} ({((d.value / total) * 100).toFixed(1)}%)</span>
                    </li>
                ))}
            </ul>
            <p className="small text-muted mt-3 mb-0">
                A high *Completed* and low *Untouched* ratio indicates high efficiency in task execution based on discussion points.
            </p>
        </div>
    );
};


// --- ACTIVITY LOG COMPONENT (Existing) ---
const ActivityLog = ({ activities }: { activities: BotActivity[] }) => (
    <div className="list-group list-group-flush">
        {activities.length > 0 ? activities.slice(0, 10).map((activity, index) => {
            const isAction = activity.type === 'action';
            const statusIcon = isAction ? {
                'completed': <FiCheckCircle className="text-success" />,
                'commented': <FiMessageSquare className="text-info" />,
                'created': <FiPlus className="text-primary" />,
            }[activity.taskStatus || 'completed'] : <FiMessageSquare className="text-secondary" />;

            const statusColor = isAction ? {
                'completed': 'bg-success-subtle',
                'commented': 'bg-info-subtle',
                'created': 'bg-primary-subtle',
            }[activity.taskStatus || 'completed'] : 'bg-body';

            return (
                <div key={index} className={`list-group-item d-flex align-items-start gap-3 p-3 ${statusColor}`} style={{ background: 'var(--bs-secondary-bg)' }}>
                    <div className="pt-1">{statusIcon}</div>
                    <div className="flex-grow-1">
                        <p className={`mb-0 small ${isAction ? 'fw-bold' : 'text-muted'}`}>{activity.content}</p>
                        <span className="small text-body-secondary">{new Date(activity.timestamp).toLocaleTimeString()}</span>
                    </div>
                </div>
            );
        }) : (
            <div className="p-3 text-center text-muted">No recent activity recorded for this bot.</div>
        )}
    </div>
);


// --- SKELETON COMPONENTS (Existing) ---

const DetailCardSkeleton = () => (
    <div className="card-body placeholder-glow">
        <div className="placeholder w-50 h4 mb-3"></div>
        <div className="placeholder w-75 small mb-1"></div>
        <div className="placeholder w-50 small"></div>
    </div>
);

const MetricPillSkeleton = () => (
    <div className="col-md-3 col-6">
        <div className="p-3 rounded-3 placeholder-glow" style={{ background: 'var(--bs-secondary-bg)' }}>
            <div className="placeholder w-75 h5 mb-2"></div>
            <div className="placeholder w-50 small"></div>
        </div>
    </div>
);

const ActivityLogSkeleton = () => (
    <div className="placeholder-glow">
        <div className="d-flex align-items-center mb-3">
            <div className="placeholder rounded-circle me-3" style={{ width: '12px', height: '12px' }}></div>
            <div className="placeholder w-75" style={{ height: '18px' }}></div>
        </div>
        <div className="d-flex align-items-center mb-3">
            <div className="placeholder rounded-circle me-3" style={{ width: '12px', height: '12px' }}></div>
            <div className="placeholder w-50" style={{ height: '18px' }}></div>
        </div>
        <div className="d-flex align-items-center mb-3">
            <div className="placeholder rounded-circle me-3" style={{ width: '12px', height: '12px' }}></div>
            <div className="placeholder w-90" style={{ height: '18px' }}></div>
        </div>
    </div>
);

const BotDetailSkeleton = () => (
    <div className="p-4 p-md-5">
        <div className="d-flex justify-content-between mb-4 placeholder-glow">
            <div className="placeholder w-25 h2"></div>
        </div>

        {/* Metric Pills */}
        <div className="row g-3 mb-5">
            <MetricPillSkeleton /><MetricPillSkeleton /><MetricPillSkeleton /><MetricPillSkeleton />
        </div>

        {/* Charts & Activities */}
        <div className="row g-5">
            <div className="col-lg-6">
                <div className="card" style={{ background: 'var(--bs-secondary-bg)' }}>
                    <DetailCardSkeleton />
                    <div className="p-4 placeholder-glow" style={{ height: '300px' }}>
                        <div className="placeholder w-100 h-100"></div>
                    </div>
                </div>
            </div>
            <div className="col-lg-6">
                <div className="card" style={{ background: 'var(--bs-secondary-bg)' }}>
                    <div className="card-header border-secondary placeholder-glow"><div className="placeholder w-50"></div></div>
                    <div className="card-body">
                        <ActivityLogSkeleton />
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// --- METRIC PILL COMPONENT (Existing) ---
const MetricPill = ({ icon: Icon, title, value, color }: { icon: any, title: string, value: string | number, color: string, description: string }) => (
    <div className="col-md-3 col-6">
        <div className="p-3 rounded-3 shadow-sm" style={{ background: 'var(--bs-secondary-bg)', border: `1px solid var(--bs-border-color)` }}>
            <div className={`text-${color} mb-2`}><Icon size={24} /></div>
            <h5 className="mb-1 fw-bold">{value}</h5>
            <p className="small text-muted mb-0">{title}</p>
        </div>
    </div>
);


// --- MAIN DETAIL COMPONENT (Updated sections) ---
export default function BotDetail() {
    const { botId } = useParams<{ botId: string }>();
    const navigate = useNavigate();
    const [bot, setBot] = useState<BotConfig | null>(null);
    const [activities, setActivities] = useState<BotActivity[]>([]);
    const [performance, setPerformance] = useState<BotPerformance | null>(null);
    // NEW STATE: For Participants Drawer
    const [isParticipantsDrawerOpen, setIsParticipantsDrawerOpen] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Simulating meeting data for the Barge In feature
    const mockLiveMeeting = useMemo(() => ({ id: 'm1', subject: 'Q4 Project Kick-off', isBotPresent: bot?.currentMeetingId === 'm1' }), [bot]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch configuration, activities, and performance concurrently
            const [config, activityData, performanceData] = await Promise.all([
                getBotConfigs().then(configs => configs.find(c => c.id.toString() === botId) || null),
                getBotActivities(botId!),
                getBotPerformance(botId!),
            ]);
            setBot(config);
            setActivities(activityData);
            setPerformance(performanceData);
        } catch (error) {
            console.error("Failed to fetch bot details", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (botId) {
            fetchData();
        } else {
            navigate('/bots');
        }
    }, [botId, navigate]);

    const handleSave = async (data: Omit<BotConfig, 'id' | 'status' | 'currentMeetingId' | 'currentMeetingSubject' | 'recent_completion_rate' | 'tasks_completed_last_week'> | BotConfig) => {
        setIsSubmitting(true);
        try {
            const payload: BotConfig = {
                ...bot!,
                ...data as any,
                recent_completion_rate: bot?.recent_completion_rate || 0,
                tasks_completed_last_week: bot?.tasks_completed_last_week || 0,
            };
            await updateBotConfig(payload);
            setBot(payload);
            setIsDrawerOpen(false);
        } catch (error) {
            console.error("Failed to save bot", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!bot) return;
        try {
            await deleteBotConfig(bot.id);
            navigate('/bots');
        } catch (error) {
            console.error("Failed to delete bot", error);
        } finally {
            setIsDeleteModalOpen(false);
        }
    };

    const handleBargeIn = async () => {
        if (!bot || !mockLiveMeeting.id) return;
        setIsSubmitting(true);
        try {
            await bargeIntoMeeting(bot.id, mockLiveMeeting.id);
            alert(`Bot ${bot.name} successfully barged into ${mockLiveMeeting.subject}!`);
            fetchData();
        } catch (error) {
            alert(`Failed to barge in: ${error}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <BotDetailSkeleton />;
    if (!bot) return <div className="p-4 p-md-5 text-center text-danger">Bot not found.</div>;

    const statusColor = bot.status === 'Attending' ? 'success' : bot.status === 'Ready' ? 'primary' : 'danger';
    const completionColor = performance && performance.completionRate >= 0.9 ? 'success' : performance && performance.completionRate >= 0.7 ? 'warning' : 'danger';
    const completionIcon = performance && performance.completionRate >= 0.9 ? FiArrowUpRight : FiArrowDownRight;

    return (
        <div className="p-4 p-md-5">
            {/* Header and Actions */}
            <div className="d-flex justify-content-between align-items-center mb-5">
                <h1 className="fw-light d-flex align-items-center gap-3">                    
                    {bot.name}
                </h1>
                <div className="d-flex gap-2">
                    {/* NEW PARTICIPANTS BUTTON */}
                    <button
                        className="btn btn-info d-flex align-items-center gap-2"
                        onClick={() => setIsParticipantsDrawerOpen(true)}
                        title="View tracked meeting participants"
                    >
                        <FiUsers /> Participants ({mockBotParticipants.length})
                    </button>

                    <button className="btn btn-secondary d-flex align-items-center gap-2" onClick={() => setIsDrawerOpen(true)}><FiEdit /> Configure</button>
                    <button className="btn btn-danger d-flex align-items-center gap-2" onClick={() => setIsDeleteModalOpen(true)}><FiTrash2 /> Delete</button>
                </div>
            </div>

            {/* --- Overview Section --- */}
            <div className="row g-4 mb-5">
                {/* Status Card */}
                <div className="col-lg-4">
                    <div className={`card shadow-sm h-100 border-${statusColor}`} style={{ background: `var(--bs-${statusColor}-bg-subtle, var(--bs-secondary-bg))` }}>
                        <div className="card-body">
                            <h5 className="card-title d-flex align-items-center gap-2 text-dark"><FiZap className={`text-${statusColor}`} /> Current Status</h5>
                            <h2 className={`fw-bold text-${statusColor}`}>{bot.status}</h2>
                            <p className="card-text small text-muted mb-0">
                                {bot.status === 'Attending' ? (
                                    <span>In meeting: <strong>{bot.currentMeetingSubject}</strong></span>
                                ) : (
                                    <span>{bot.description || 'No description.'}</span>
                                )}
                            </p>
                            {/* Innovative Barge In Button */}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleBargeIn}
                                disabled={isSubmitting || mockLiveMeeting.isBotPresent || bot.status === 'Offline'}
                                className="btn btn-sm btn-warning mt-3 w-100 d-flex align-items-center justify-content-center gap-2"
                            >
                                {isSubmitting ? (
                                    <><span className="spinner-border spinner-border-sm me-2"></span> Barging In...</>
                                ) : mockLiveMeeting.isBotPresent ? (
                                    <>Already Present</>
                                ) : bot.status === 'Attending' ? (
                                    <>Cannot Barge In (Busy)</>
                                ) : (
                                    <><FiAlertTriangle /> Barge Into Live Meeting</>
                                )}
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* Configuration Card */}
                <div className="col-lg-8">
                    <div className="row g-3">
                        <MetricPill icon={FiTool} title="PM Tool" value={bot.pmTool} color={bot.pmTool === 'None' ? 'secondary' : 'info'} description="Integrated project management tool." />
                        <MetricPill icon={FiHash} title="Tool ID" value={bot.pmToolConfig || 'N/A'} color={'secondary'} description="Project or Board Identifier." />
                        <MetricPill icon={FiMessageSquare} title="Tasks Completed" value={performance?.tasksCompleted || 0} color={'success'} description="Total tasks marked complete." />
                        <MetricPill icon={completionIcon} title="Task Completion Rate" value={`${(performance?.completionRate || 0) * 100}%`} color={completionColor} description="Success rate of actions taken." />
                    </div>
                </div>
            </div>

            {/* --- Graph Execution Analysis --- */}
            {performance?.graphMetrics && (
                <>
                    <h3 className="mt-5 mb-4 d-flex align-items-center gap-2 text-primary"><FiGitBranch /> Graph Execution Analysis (Total Runs: {performance.graphMetrics.totalRuns})</h3>
                    <div className="row g-5 mb-5">
                        <div className="col-lg-6">
                            <div className="card shadow-sm h-100" style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}>
                                <div className="card-body" style={{ minHeight: '350px' }}>
                                    <GraphStatusChart metrics={performance.graphMetrics} />
                                </div>
                            </div>
                        </div>
                        <div className="col-lg-6">
                            <div className="card shadow-sm h-100" style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}>
                                <div className="card-body" style={{ minHeight: '350px' }}>
                                    <GraphFlowChart metrics={performance.graphMetrics} />
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* --- Performance and Activity --- */}
            <h3 className="mt-5 mb-4 d-flex align-items-center gap-2 text-primary"><FiTrendingUp /> Detailed Performance</h3>
            <div className="row g-5">
                <div className="col-lg-6">
                    <div className="card shadow-sm h-100" style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}>
                        <div className="card-header border-bottom border-secondary d-flex align-items-center gap-2 text-primary">
                            <FiClock /> Average Duration Trend
                        </div>
                        <div className="card-body" style={{ minHeight: '350px' }}>
                            {performance ? <PerformanceChart performance={performance} /> : <p className="text-center text-muted">No historical data available.</p>}
                        </div>
                    </div>
                </div>

                <div className="col-lg-6">
                    <div className="card shadow-sm h-100" style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}>
                        <div className="card-header border-bottom border-secondary d-flex align-items-center gap-2 text-primary">
                            <FiPieChart /> Task Breakdown Analysis
                        </div>
                        <div className="card-body p-0">
                            {performance ? <TaskBreakdownAnalysis breakdown={performance.taskBreakdown} /> : <p className="text-center text-muted p-4">No task breakdown data available.</p>}
                        </div>
                    </div>
                </div>

                <div className="col-12">
                    <div className="card shadow-sm h-100" style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}>
                        <div className="card-header border-bottom border-secondary d-flex align-items-center gap-2 text-info">
                            <FiClock /> Recent Activity Log (Actions/Transcript)
                        </div>
                        <div className="card-body p-0">
                            <ActivityLog activities={activities} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals/Drawers */}
            <BotParticipantsDrawer
                isOpen={isParticipantsDrawerOpen}
                onClose={() => setIsParticipantsDrawerOpen(false)}
                participants={mockBotParticipants}
                botName={bot.name}
            />
            <BotConfigDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onSave={handleSave} botToEdit={bot} isLoading={isSubmitting} />
            <AlertModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Confirm Deletion"
                message={`Permanently delete bot "${bot.name}"?`}
            />
        </div>
    );
}