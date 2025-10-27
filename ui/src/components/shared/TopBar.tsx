import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiLogOut, FiSun, FiMoon } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useContext } from 'react'; 
import { UserContext } from '../../context/UserContext';

// --- APPLICATION NAME ---
const APP_NAME = "Synapt";

// --- NEW COMPONENT: ROTATING ICON ---

const RotatingIcon: React.FC = () => {
    // Using CSS variables for theme adaptability
    // These should be defined in your global CSS for light/dark themes
    const strokeColorPrimary = 'var(--bs-primary)';   
    const strokeColorAccent = 'var(--bs-info)';    
    const fillColorAccent = 'var(--bs-warning)';   

    return (
        <motion.div
            animate={{ rotate: 360 }}
            transition={{ 
                repeat: Infinity, 
                duration: 12, 
                ease: "linear" 
            }}
            style={{ 
                width: '56px', 
                height: '56px', 
                position: 'relative' 
            }}
        >
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                
                {/* 1. Bot Head (Vertical Mode) / Meeting Connector (Horizontal Mode) */}
                <path 
                    d="M 20 30 L 80 30 C 85 30, 85 40, 80 40 L 80 60 C 85 60, 85 70, 80 70 L 20 70 C 15 70, 15 60, 20 60 L 20 40 C 15 40, 15 30, 20 30 Z" 
                    stroke={strokeColorPrimary} 
                    strokeWidth="4"
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* 2. Antennae / Sharing Points (Top and Bottom Elements) */}
                <circle cx="30" cy="20" r="4" fill={strokeColorPrimary} />
                <circle cx="70" cy="20" r="4" fill={strokeColorPrimary} />
                
                {/* 3. Meeting/Sharing Arc (The 'eye' or connected nodes) */}
                <path 
                    d="M 20 80 C 40 100, 60 100, 80 80" 
                    stroke={strokeColorAccent} 
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                />
                <path 
                    d="M 20 80 C 40 60, 60 60, 80 80" 
                    stroke={strokeColorAccent} 
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    style={{ transform: 'translateY(-10px)' }}
                />

                {/* 4. Core Connection Points (Highlighting sharing/data) */}
                <circle cx="20" cy="80" r="5" fill={fillColorAccent} />
                <circle cx="80" cy="80" r="5" fill={fillColorAccent} />
                <circle cx="50" cy="70" r="5" fill={fillColorAccent} />

                {/* Subtle glow effect (defined in CSS variables if theme requires it) */}
                <filter id="glow">
                    <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <circle cx="50" cy="45" r="4" fill={strokeColorAccent} style={{ filter: 'url(#glow)' }}/>
            </svg>
        </motion.div>
    );
}

// --- TOPBAR COMPONENT ---

interface TopBarProps {
  onLogout: () => void;
}

export default function TopBar({ onLogout }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, theme, toggleTheme } = useContext(UserContext); 
  const isHomePage = location.pathname === '/';

  return (
    user && (
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="navbar sticky-top border-bottom shadow-sm"
        style={{
          backgroundColor: `rgba(var(--bs-body-bg-rgb), 0.75)`,
          borderColor: 'var(--bs-border-color)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div className="container-fluid d-flex justify-content-between align-items-center px-3">
          {/* Left Section (Icon, Title, Back Button) */}
          <div className="d-flex align-items-center gap-3">
            <motion.div
              className="d-flex align-items-center gap-2"
              style={{ cursor: 'pointer' }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate('/')}
            >
              {/* 1. Rotating Icon */}
              <div
                className="d-flex justify-content-center align-items-center"
                style={{ width: 56, height: 56 }}
              >
                  <RotatingIcon />
              </div>
              
              {/* 2. Application Title (Synapt) */}
              <span className="fw-bolder fs-5 text-primary text-decoration-none d-none d-sm-inline">
                {APP_NAME}
              </span>
            </motion.div>
            
            {/* 3. Back button (After the Icon/Title block) */}
            {!isHomePage && (
              <button
                className="btn btn-outline-secondary d-flex align-items-center"
                onClick={() => navigate(-1)}
                title="Go Back"
              >
                <FiArrowLeft />
              </button>
            )}
          </div>

          {/* Right Section (Theme Toggle, User, Logout) */}
          <div className="d-flex align-items-center gap-3">
            {/* Theme Toggle */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              className="btn btn-outline-secondary d-flex align-items-center"
              onClick={toggleTheme} 
              title="Switch Theme"
            >
              {theme === 'dark' ? <FiSun /> : <FiMoon />}
            </motion.button>

            {/* User Info with Motion and Picture */}
            <motion.div
              className="d-flex align-items-center gap-2"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/profile')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="View Profile"
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.user_name || 'Profile'}
                  className="rounded-circle"
                  style={{ width: 36, height: 36, objectFit: 'cover' }}
                />
              ) : (
                <div
                  className="rounded-circle bg-primary d-flex justify-content-center align-items-center"
                  style={{ width: 36, height: 36 }}
                >
                  {user.user_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="fw-semibold d-none d-sm-inline">
                {user.user_name}
              </span>
            </motion.div>

            {/* Logout */}
            <button
              className="btn btn-outline-danger d-flex align-items-center gap-2"
              onClick={onLogout}
            >
              <FiLogOut />
              <span className="d-none d-md-inline">Logout</span>
            </button>
          </div>
        </div>
      </motion.header>
    )
  );
}