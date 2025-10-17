// src/pages/Meeting/MeetingProgressBar.tsx
import React from 'react';
import './MeetingProgressBar.css';
import { type MeetingProgress } from '../../hooks/useWebRTC';
import { FaCheckCircle, FaExclamationCircle, FaHourglassHalf, FaCircle } from 'react-icons/fa';

interface Task {
  id: number;
  title: string;
  owner: string;
  status: string;
}

interface MeetingProgressBarProps {
  progress: MeetingProgress | null;
}

const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  let Icon = FaHourglassHalf; // Default for InProgress
  let className = 'status-inprogress';

  if (s === 'done' || s === 'complete') {
    Icon = FaCheckCircle;
    className = 'status-done';
  } else if (s === 'stuck') {
    Icon = FaExclamationCircle;
    className = 'status-stuck';
  } else if (s !== 'inprogress') {
    Icon = FaCircle; // Generic circle for pending/other statuses
    className = 'status-pending';
  }

  return (
    <div className={`tooltip-status ${className}`}>
      <Icon className="tooltip-status-icon" />
      <span>{status || 'Pending'}</span>
    </div>
  );
};

const MeetingProgressBar: React.FC<MeetingProgressBarProps> = ({ progress }) => {
  if (!progress || !progress.tasks || !progress.tasks.length) {
    return null;
  }

  const { tasks, current_task_index, state } = progress;
  const isMeetingEnded = state === 'summary' || state === 'done';
  const totalTasks = tasks.length;
  
  const completedSteps = isMeetingEnded ? totalTasks : current_task_index;
  const progressPercentage = totalTasks > 1 ? (completedSteps / (totalTasks - 1)) * 100 : (isMeetingEnded ? 100 : 0);

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }} />
        {tasks.map((task: Task, index: number) => {
          let stepStatusClass = '';
          const taskStatusLower = (task.status || '').toLowerCase();

          if (isMeetingEnded || index < current_task_index) {
            if (taskStatusLower === 'done' || taskStatusLower === 'complete') stepStatusClass = 'is-done';
            else if (taskStatusLower === 'stuck') stepStatusClass = 'is-stuck';
            else stepStatusClass = 'is-done'; // Default past tasks to green
          } else if (!isMeetingEnded && index === current_task_index) {
            stepStatusClass = 'is-active';
          } else {
            stepStatusClass = 'is-pending';
          }

          return (
            <div className={`progress-step ${stepStatusClass}`} key={task.id}>
              <div className="step-indicator" />
              <div className="tooltip">
                <div className="tooltip-title">{task.title}</div>
                <div className="tooltip-owner">Owner: {task.owner}</div>
                <StatusIndicator status={task.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeetingProgressBar;