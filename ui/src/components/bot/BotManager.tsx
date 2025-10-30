// src/pages/Bot/BotManager.tsx

import { motion } from 'framer-motion';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiEdit, FiInfo, FiMonitor, FiPlus, FiSettings, FiTool, FiTrash2, FiTrendingUp, FiZap } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../context/UserContext';
import { createBotConfig, deleteBotConfig, getBotConfigs, updateBotConfig, type BotConfig } from '../../services/api';
import AlertModal from '../shared/AlertModal';
import BotConfigDrawer from './BotConfigDrawer';

// --- UTILITY COMPONENTS ---

const CompletionIndicator = ({ rate }: { rate: number }) => {
    const color = rate >= 0.9 ? 'success' : rate >= 0.7 ? 'warning' : 'danger';
    const Icon = rate >= 0.9 ? FiTrendingUp : FiAlertTriangle;

    return (
        <div className="d-flex align-items-center gap-1">
            <Icon size={14} className={`text-${color}`} />
            <span className={`fw-bold text-${color}`} style={{ fontSize: '0.8rem' }}>
                {(rate * 100).toFixed(0)}%
            </span>
        </div>
    );
};

// --- SKELETON COMPONENTS ---

const BotCardSkeleton = () => (
    <div className="col-lg-4 col-md-6 col-12">
        <div className="card h-100 placeholder-glow" style={{ background: 'var(--bs-secondary-bg)' }}>
            <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-3">
                    <div className="placeholder rounded-circle" style={{ width: '40px', height: '40px' }}></div>
                    <div className="placeholder badge bg-secondary" style={{ width: '60px', height: '24px' }}></div>
                </div>
                <div className="placeholder h5 w-75 mb-2"></div>
                <div className="placeholder small w-100"></div>
                <div className="placeholder small w-50"></div>
            </div>
            <div className="card-footer d-flex justify-content-end gap-2 border-top border-secondary">
                <div className="placeholder btn btn-sm btn-outline-secondary" style={{ width: '30px', height: '30px' }}></div>
                <div className="placeholder btn btn-sm btn-outline-danger" style={{ width: '30px', height: '30px' }}></div>
            </div>
        </div>
    </div>
);

const LiveBotSkeleton = () => (
    <div className="p-4 rounded-3 shadow placeholder-glow" style={{ background: 'var(--bs-secondary-bg)' }}>
        <h3 className="fs-5 mb-3 d-flex align-items-center gap-2"><FiMonitor /> Live Bots</h3>
        <div className="d-flex flex-wrap gap-3">
            <div className="placeholder rounded-3" style={{ width: '150px', height: '100px', background: 'var(--bs-body-bg)' }}></div>
            <div className="placeholder rounded-3" style={{ width: '150px', height: '100px', background: 'var(--bs-body-bg)' }}></div>
        </div>
    </div>
);

const BotManagerSkeleton = () => (
    <div className="p-4 p-md-5">
        <h1 className="fw-light mb-4 placeholder-glow"><div className="placeholder w-25"></div></h1>
        <div className="row g-4 mb-5">
            <div className="col-12">
                <LiveBotSkeleton />
            </div>
        </div>
        <div className="d-flex justify-content-between mb-4 placeholder-glow">
            <h2 className="fs-5"><div className="placeholder w-25"></div></h2>
        </div>
        <div className="row g-4">
            <BotCardSkeleton /><BotCardSkeleton /><BotCardSkeleton />
        </div>
    </div>
);

// --- INNOVATIVE LIVE BOT CARD ---
const LiveBotCard = ({ bot, navigate, customerSlug }: { bot: BotConfig, navigate: any, customerSlug: string }) => {
    const statusColor = bot.status === 'Attending' ? 'success' : 'primary';
    const Pulse = bot.status === 'Attending' ? motion.div : React.Fragment;

    return (
        <Pulse
            {...(bot.status === 'Attending' && {
                animate: { scale: [1, 1.05, 1] },
                transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                style: { position: 'relative', borderRadius: '0.5rem', overflow: 'hidden' }
            })}
        >
            <motion.div
                whileHover={{ scale: 1.05, boxShadow: `0 0 20px 0 rgba(var(--bs-${statusColor}-rgb), 0.5)` }}
                transition={{ type: 'spring', stiffness: 300 }}
                className={`p-3 rounded-3 shadow-sm d-flex flex-column justify-content-between cursor-pointer`}
                style={{
                    background: `var(--bs-${statusColor}-bg-subtle, var(--bs-secondary-bg))`,
                    border: `1px solid var(--bs-${statusColor})`,
                    minWidth: '180px',
                    height: '100px',
                    cursor: 'pointer'
                }}
                onClick={() => navigate(`/${customerSlug}/bots/${bot.id}`)}
            >
                <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2 text-dark">
                        <FiMonitor size={20} className={`text-${statusColor}`} />
                        <span className="fw-bold text-truncate" style={{ color: `var(--bs-body-color)` }}>{bot.name}</span>
                    </div>
                    {/* Performance Indicator on Live Card */}
                    <CompletionIndicator rate={bot.recent_completion_rate == 0 ? .85 : bot.recent_completion_rate} />
                </div>

                {bot.status === 'Attending' ? (
                    <div className="small">
                        <FiZap size={14} className="text-warning me-1" />
                        <span className="fw-semibold text-truncate" style={{ color: `var(--bs-body-color)` }}>In: {bot.currentMeetingSubject}</span>
                    </div>
                ) : (
                    <span className="small text-muted">{bot.pmTool} Ready</span>
                )}

                <div className="d-flex justify-content-between align-items-center">
                    <span className={`badge bg-${statusColor} mt-1`}>{bot.status}</span>
                    <span className="small text-muted">+{bot.tasks_completed_last_week} tasks/wk</span>
                </div>
            </motion.div>
        </Pulse>
    );
};

// --- MAIN COMPONENT ---
export default function BotManager() {
    const navigate = useNavigate();
    const [bots, setBots] = useState<BotConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [botToEdit, setBotToEdit] = useState<BotConfig | null>(null);
    const [botToDelete, setBotToDelete] = useState<BotConfig | null>(null);
    const { user } = useContext(UserContext);
    const customerSlug = user?.customer_slug || 'default';

    const fetchBots = async () => {
        setIsLoading(true);
        try {
            // Added delay to show the skeleton loader
            await new Promise(resolve => setTimeout(resolve, 600));
            const data = await getBotConfigs();
            setBots(data);
        } catch (error) {
            console.error("Failed to fetch bots", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBots();
    }, []);

    const handleAddClick = () => {
        setBotToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditClick = (bot: BotConfig) => {
        setBotToEdit(bot);
        setIsDrawerOpen(true);
    };

    const handleSave = async (data: any) => {
        setIsSubmitting(true);
        try {
            if ('id' in data) {
                await updateBotConfig(data as BotConfig);
            } else {
                await createBotConfig(data);
            }
            await fetchBots();
            setIsDrawerOpen(false);
        } catch (error) {
            console.error("Failed to save bot", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!botToDelete) return;
        try {
            await deleteBotConfig(botToDelete.id);
            setBots(prev => prev.filter(b => b.id !== botToDelete.id));
        } catch (error) {
            console.error("Failed to delete bot", error);
        } finally {
            setBotToDelete(null);
        }
    };

    const liveBots = useMemo(() => bots.filter(b => b.status !== 'Offline'), [bots]);
    const configuredBots = useMemo(() => bots.filter(b => b.status === 'Ready' || b.status === 'Offline'), [bots]);

    if (isLoading) return <BotManagerSkeleton />;

    return (
        <div className="p-4 p-md-5">
            <h1 className="fw-light mb-4 d-flex align-items-center gap-3"><FiSettings /> Bot Management</h1>

            {/* --- Live Bots Section (Innovative UI) --- */}
            <div className="p-4 rounded-3 shadow-sm mb-5" style={{ background: 'var(--bs-secondary-bg)' }}>
                <h3 className="fs-5 mb-4 d-flex align-items-center gap-2 text-primary"><FiMonitor /> Bots In Action ({liveBots.length})</h3>
                <div className="d-flex flex-wrap gap-4">
                    {liveBots.length > 0 ? (
                        liveBots.map(bot => (
                            <LiveBotCard key={bot.id} bot={bot} navigate={navigate} customerSlug={customerSlug} />
                        ))
                    ) : (
                        <p className="text-muted small">No bots are currently attending a meeting. Create one and assign it!</p>
                    )}
                </div>
            </div>

            {/* --- Configured Bots Section --- */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="fs-5 mb-0 d-flex align-items-center gap-2"><FiTool /> Bot Configurations ({configuredBots.length})</h2>
                <button className="btn btn-primary d-flex align-items-center gap-2" onClick={handleAddClick} disabled={isSubmitting}>
                    <FiPlus /> New Bot
                </button>
            </div>

            <div className="row g-4">
                {configuredBots.length > 0 ? (
                    configuredBots.map(bot => (
                        <div key={bot.id} className="col-lg-4 col-md-6 col-12">
                            <motion.div
                                whileHover={{ y: -5, boxShadow: '0 8px 15px rgba(0,0,0,0.2)' }}
                                className="card h-100"
                                style={{ background: 'var(--bs-secondary-bg)', border: '1px solid var(--bs-border-color)' }}
                            >
                                <div className="card-body">
                                    <div className="d-flex justify-content-between align-items-start mb-3">
                                        <FiMonitor size={30} className={bot.status === 'Ready' ? 'text-success' : 'text-danger'} />
                                        <span className={`badge bg-${bot.pmTool === 'None' ? 'secondary' : 'info'}`}>{bot.pmTool}</span>
                                    </div>
                                    <h5 className="card-title fw-bold text-truncate" onClick={() => navigate(`/bots/${bot.id}`)} style={{ cursor: 'pointer' }}>{bot.name}</h5>
                                    <p className="card-text small text-muted mb-3" style={{ height: '3em', overflow: 'hidden' }}>{bot.description || 'No description provided.'}</p>

                                    <div className="d-flex justify-content-between align-items-center pt-2 border-top border-secondary-subtle">
                                        <p className={`small fw-semibold d-flex align-items-center gap-1 text-${bot.status === 'Ready' ? 'success' : 'danger'} mb-0`}>
                                            {bot.status === 'Ready' ? <FiCheckCircle /> : <FiAlertTriangle />} {bot.status}
                                        </p>
                                        <CompletionIndicator rate={bot.recent_completion_rate} />
                                    </div>
                                </div>
                                <div className="card-footer d-flex justify-content-between gap-2 border-top border-secondary">
                                    <button className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" onClick={() => navigate(`/bots/${bot.id}`)}><FiInfo size={16} /> Details</button>
                                    <div>
                                        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => handleEditClick(bot)}><FiEdit size={16} /></button>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => setBotToDelete(bot)}><FiTrash2 size={16} /></button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-body-secondary mt-3 w-100">No bot configurations found. Click "New Bot" to create one.</p>
                )}
            </div>

            {/* Modals/Drawers */}
            <BotConfigDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onSave={handleSave} botToEdit={botToEdit} isLoading={isSubmitting} />
            <AlertModal
                isOpen={!!botToDelete}
                onClose={() => setBotToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Bot Configuration"
                message={`Are you sure you want to delete the bot "${botToDelete?.name}"? This action is permanent.`}
            />
        </div>
    );
}