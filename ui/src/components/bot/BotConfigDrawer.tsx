// src/pages/Bot/BotConfigDrawer.tsx

import { AnimatePresence, motion } from 'framer-motion';
import React, { useState, useEffect } from 'react';
import { FiSave, FiX, FiInfo, FiHash, FiTool, FiDatabase } from 'react-icons/fi';
import type { BotConfig } from '../../services/api'; 

interface BotConfigDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    botToEdit: BotConfig | null;
    isLoading: boolean;
}

const pmTools = [
    { value: 'ADO', label: 'Azure DevOps (ADO)', icon: <FiDatabase className="text-info" /> },
    { value: 'monday', label: 'monday.com', icon: <FiTool className="text-primary" /> },
    { value: 'None', label: 'None (Transcript Only)', icon: <FiX className="text-secondary" /> },
];

const BotConfigDrawer: React.FC<BotConfigDrawerProps> = ({ isOpen, onClose, onSave, botToEdit, isLoading }) => {
    const isEditing = !!botToEdit;
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [pmTool, setPmTool] = useState<'ADO' | 'monday' | 'None'>('None');
    const [pmToolConfig, setPmToolConfig] = useState('');

    useEffect(() => {
        if (botToEdit) {
            setName(botToEdit.name);
            setDescription(botToEdit.description);
            setPmTool(botToEdit.pmTool);
            setPmToolConfig(botToEdit.pmToolConfig);
        } else {
            setName('');
            setDescription('');
            setPmTool('None');
            setPmToolConfig('');
        }
    }, [botToEdit, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const data = { name, description, pmTool, pmToolConfig };
        if (botToEdit) {
            await onSave({ ...botToEdit, ...data });
        } else {
            await onSave(data);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="position-fixed top-0 end-0 h-100 bg-body border-start shadow-lg d-flex flex-column"
                    style={{ width: 'min(90vw, 450px)', zIndex: 3000 }}
                >
                    <div className="d-flex justify-content-between align-items-center p-4 border-bottom flex-shrink-0">
                        <h4 className="mb-0">{isEditing ? `Edit Bot: ${botToEdit?.name}` : 'Create New Bot'}</h4>
                        <button className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={isLoading}><FiX size={20} /></button>
                    </div>

                    <form onSubmit={handleSubmit} className="flex-grow-1 d-flex flex-column overflow-hidden">
                        <div className="p-4 overflow-auto flex-grow-1">
                            {/* Bot Name */}
                            <div className="mb-3">
                                <label className="form-label d-flex align-items-center gap-2"><FiInfo /> Bot Name</label>
                                <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} required disabled={isLoading} />
                            </div>

                            {/* Description */}
                            <div className="mb-3">
                                <label className="form-label d-flex align-items-center gap-2"><FiInfo /> Description</label>
                                <textarea className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={isLoading} />
                            </div>

                            <hr className="my-4" style={{ borderColor: 'var(--bs-border-color)' }} />
                            <h5 className="mb-3 text-primary d-flex align-items-center gap-2"><FiTool /> PM Tool Integration</h5>

                            {/* PM Tool Selection */}
                            <div className="mb-3">
                                <label className="form-label">Select Project Management Tool</label>
                                <select className="form-select" value={pmTool} onChange={(e) => setPmTool(e.target.value as any)} disabled={isLoading}>
                                    {pmTools.map(tool => (
                                        <option key={tool.value} value={tool.value}>{tool.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* PM Tool Configuration (Conditional) */}
                            {pmTool !== 'None' && (
                                <div className="mb-3">
                                    <label className="form-label d-flex align-items-center gap-2"><FiHash /> {pmTool} Project ID/Key</label>
                                    <input type="text" className="form-control" value={pmToolConfig} onChange={(e) => setPmToolConfig(e.target.value)} required disabled={isLoading} placeholder={`Enter ${pmTool} project identifier...`} />
                                    <div className="form-text">
                                        This key allows the bot to access and update tasks.
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer/Save Button */}
                        <div className="p-3 border-top flex-shrink-0">
                            <button type="submit" className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2" disabled={isLoading}>
                                {isLoading ? (
                                    <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...</>
                                ) : (
                                    <><FiSave size={20} /> Save Configuration</>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default BotConfigDrawer;