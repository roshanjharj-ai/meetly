import { FiCalendar, FiLogOut, FiUsers, FiGrid, FiLogIn } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom'; // Import Link for navigation
import type { UserAndRoom } from '../../types/meeting.types';

interface HomeProps {
    user: UserAndRoom;
}

const cardVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
};

export default function Home({ user }: HomeProps) {
    return (
        <div className="container my-4 my-md-5">
            <header className="text-center mb-5">
                <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="display-5">Welcome, {user.user}!</motion.h1>
                <p className="lead text-muted">{user.email}</p>
            </header>
            <main>
                <div className="row g-4 justify-content-center">
                    <div className="col-xl-3 col-lg-4 col-md-6">
                        <motion.div className="card h-100 bg-dark border-secondary text-center" variants={cardVariants} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
                            <div className="card-body d-flex flex-column p-4">
                                <FiLogIn className="display-4 text-warning mx-auto mb-3" />
                                <h5 className="card-title">Join a Meeting</h5>
                                <p className="card-text text-muted flex-grow-1">Quickly join a meeting using a room ID.</p>
                                <Link to="/join" className="btn btn-warning">Join Now</Link>
                            </div>
                        </motion.div>
                    </div>
                    <div className="col-lg-4 col-md-6">
                        <motion.div className="card h-100 bg-dark border-secondary text-center" variants={cardVariants} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
                            <div className="card-body d-flex flex-column p-4">
                                <FiCalendar className="display-4 text-primary mx-auto mb-3" />
                                <h5 className="card-title">My Meetings</h5>
                                <p className="card-text text-muted flex-grow-1">View, create, and manage your scheduled meetings.</p>
                                {/* Use Link component for navigation */}
                                <Link to="/meetings" className="btn btn-primary">Go to Meetings</Link>
                            </div>
                        </motion.div>
                    </div>
                    <div className="col-lg-4 col-md-6">
                        <motion.div className="card h-100 bg-dark border-secondary text-center" variants={cardVariants} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
                            <div className="card-body d-flex flex-column p-4">
                                <FiUsers className="display-4 text-info mx-auto mb-3" />
                                <h5 className="card-title">Participants</h5>
                                <p className="card-text text-muted flex-grow-1">Manage your contacts and participant lists.</p>
                                {/* Use Link component for navigation */}
                                <Link to="/participants" className="btn btn-info">Manage Participants</Link>
                            </div>
                        </motion.div>
                    </div>
                    <div className="col-lg-4 col-md-6">
                        <motion.div className="card h-100 bg-dark border-secondary text-center" variants={cardVariants} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
                            <div className="card-body d-flex flex-column p-4">
                                <FiGrid className="display-4 text-success mx-auto mb-3" />
                                <h5 className="card-title">Calendar View</h5>
                                <p className="card-text text-muted flex-grow-1">See all your upcoming meetings on a calendar.</p>
                                {/* Use Link component for navigation */}
                                <Link to="/calendar" className="btn btn-success">Open Calendar</Link>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>
        </div>
    );
}