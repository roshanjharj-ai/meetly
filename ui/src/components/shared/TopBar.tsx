import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiHome, FiLogOut } from 'react-icons/fi';
import { motion } from 'framer-motion';

interface TopBarProps {
  onLogout: () => void;
}

export default function TopBar({ onLogout }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // We are on the home page if the pathname is exactly "/"
  const isHomePage = location.pathname === '/';

  return (
    <motion.header 
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="navbar navbar-dark bg-black border-bottom border-secondary sticky-top"
    >
      <div className="container-fluid">
        <div className="d-flex align-items-center gap-2">
          {/* Back Button: Show on every page except Home */}
          {!isHomePage && (
            <button 
              className="btn btn-outline-secondary d-flex align-items-center" 
              onClick={() => navigate(-1)} // navigate(-1) goes to the previous page in history
              title="Go Back"
            >
              <FiArrowLeft />
            </button>
          )}

          {/* Home Button: Show on every page except Home */}
          {!isHomePage && (
             <Link to="/" className="btn btn-outline-secondary d-flex align-items-center" title="Go Home">
                <FiHome />
             </Link>
          )}
        </div>
        
        <span className="navbar-brand d-none d-md-inline mx-auto">Meeting Scheduler</span>

        <div className="d-flex align-items-center">
           <button className="btn btn-outline-danger d-flex align-items-center gap-2" onClick={onLogout}>
              <FiLogOut />
              <span className="d-none d-md-inline">Logout</span>
           </button>
        </div>
      </div>
    </motion.header>
  );
}