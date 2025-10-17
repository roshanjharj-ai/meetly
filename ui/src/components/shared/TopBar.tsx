import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiLogOut, FiSun, FiMoon } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useContext } from 'react'; // **FIX**: Removed useState and useEffect
import { UserContext } from '../../context/UserContext';
import aiLogo from '../../assets/ai-meet-icon.png';

interface TopBarProps {
  onLogout: () => void;
}

export default function TopBar({ onLogout }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, theme, toggleTheme } = useContext(UserContext); // Use global context
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
          {/* Left Section */}
          <div className="d-flex align-items-center gap-2">
            <motion.div
              className="d-flex align-items-center gap-2"
              style={{ cursor: 'pointer' }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate('/')}
            >
              <div
                className="position-relative rounded-circle d-flex justify-content-center align-items-center"
                style={{
                  width: 42,
                  height: 42,
                  // **FIX**: Update styles to use the theme from context
                  background:
                    theme === 'dark'
                      ? 'radial-gradient(circle at 30% 30%, #7b5fff, #3b2fff)'
                      : 'radial-gradient(circle at 30% 30%, #bca7ff, #6e4aff)',
                  boxShadow:
                    theme === 'dark'
                      ? '0 0 10px rgba(123,95,255,0.8)'
                      : '0 0 10px rgba(130,90,255,0.4)',
                }}
              >
                <img
                  src={aiLogo}
                  alt="AI Meet"
                  width="26"
                  height="26"
                  style={{
                    filter:
                      theme === 'dark'
                        ? 'drop-shadow(0 0 2px rgba(255,255,255,0.6))'
                        : 'drop-shadow(0 0 2px rgba(100,100,100,0.4))',
                  }}
                />
              </div>
              {/* **FIX**: Text color is now handled automatically by Bootstrap */}
              <span className="fw-semibold text-decoration-none d-none d-sm-inline">
                AI Meeting {theme}
              </span>
            </motion.div>
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

          {/* Right Section */}
          <div className="d-flex align-items-center gap-3">
            {/* Theme Toggle */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              // **FIX**: Use a consistent button style that works in both themes
              className="btn btn-outline-secondary d-flex align-items-center"
              onClick={toggleTheme} // Use the function from context
              title="Switch Theme"
            >
              {/* **FIX**: Render the icon based on the global theme state */}
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
              {/* **FIX**: Text color is now handled automatically by Bootstrap */}
              <span className="fw-semibold d-none d-sm-inline">
                {user.user_name}
              </span>
            </motion.div>

            {/* Logout */}
            <button
              // **FIX**: Use a consistent button style
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