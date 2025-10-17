// src/pages/StartMeeting.tsx
import axios from "axios";
import { motion } from "framer-motion";
import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import aiLogo from "../../assets/ai-meet-icon.png";
import { UserContext } from "../../context/UserContext";
import useMediaQuery from "../../hooks/useMediaQuery";
import SplitScreen from "./SplitScreen";


const StartMeeting = () => {
    const { login } = useContext(UserContext);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const isMobile = useMediaQuery("(max-width: 768px)");

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            setError("Please enter both email and password.");
            return;
        }
        setIsLoading(true);
        setError("");
        try {
            const formData = new URLSearchParams();
            formData.append('username', email); // FastAPI's form expects 'username'
            formData.append('password', password);

            const response = await axios.post("http://127.0.0.1:8000/api/token", formData);

            login(response.data.access_token);
            navigate("/"); // Redirect on successful login
        } catch (err: any) {
            setError(err.response?.data?.detail || "Login failed. Please check your credentials.");
        } finally {
            setIsLoading(false);
        }
    };

    /** ---------- LOGIN FORM ---------- **/
    const loginForm = () => (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="card shadow-lg border-0 rounded-4 bg-white bg-opacity-75 backdrop-blur-sm"
        >
            <div className="card-body p-4 p-md-5">
                <div className="text-center mb-4">
                    <motion.img
                        src={aiLogo}
                        alt="AI Meeting"
                        width={70}
                        height={70}
                        className="rounded-circle border border-2 border-primary shadow-sm mb-3 bg-white p-2"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                    />
                    <h2 className="fw-bold text-primary">AI Meeting Login</h2>
                    <p style={{ color: false ? '#E0C3FF' : '#6E4AFF' }}>
                        Smart. Secure. Seamless video collaboration.
                    </p>
                </div>

                <form
                    onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
                >
                    <div className="d-flex flex-column gap-3">
                        <div className="form-floating">
                            <input
                                type="email" id="email" placeholder="Your email"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                className="form-control form-control-lg" required
                            />
                            <label htmlFor="email">Email Address</label>
                        </div>

                        <div className="form-floating">
                            <input
                                type="password" id="password" placeholder="Password"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                className="form-control form-control-lg" required
                            />
                            <label htmlFor="password">Password</label>
                        </div>
                        {error && <p className="text-danger small text-center mt-2">{error}</p>}
                        <button type="submit" className="w-100 btn btn-primary btn-lg mt-3" disabled={isLoading}>
                            {isLoading ? "Logging in..." : "Login"}
                        </button>
                        <div className="text-center mt-3">
                            <span className="text-muted">New here? </span>
                            <button
                                type="button"
                                className="btn btn-link p-0 text-primary fw-semibold"
                                onClick={() => navigate("/signup")}
                            >
                                Create an account
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </motion.div>
    );

    /** ---------- LEFT SIDE (MARKETING PANEL) ---------- **/
    const marketingPanel = () => (
        <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="d-flex flex-column align-items-center justify-content-center h-100 text-center text-light p-5"
            style={{
                background:
                    "linear-gradient(135deg, #6e4aff 0%, #3c1e8a 50%, #141414 100%)",
            }}
        >
            <motion.img
                src={aiLogo}
                alt="AI Meeting"
                width={90}
                height={90}
                className="rounded-circle border border-3 border-light bg-white bg-opacity-25 p-2 mb-4"
                animate={{ rotate: [0, 360] }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            />
            <h1 className="display-5 fw-bold mb-3">Meet Smarter with AI</h1>
            <p className="lead mb-4 px-4">
                Experience crystal-clear meetings, live transcription, and intelligent
                summaries — all powered by AI.
            </p>
            <ul className="list-unstyled small text-start mx-auto" style={{ maxWidth: 340 }}>
                <li>💡 Real-time Speech-to-Text Intelligence</li>
                <li>🔒 Encrypted Communication & Secure Access</li>
                <li>🌐 Works seamlessly on all browsers</li>
            </ul>
        </motion.div>
    );

    /** ---------- RENDER ---------- **/
    return isMobile ? (
        <div
            className="container-fluid d-flex align-items-center justify-content-center min-vh-100"
            style={{
                background: "linear-gradient(135deg, #a28bff 0%, #f5f5f5 100%)",
            }}
        >
            <div className="col-11 col-sm-10 col-md-8 col-lg-5 col-xl-4">
                {loginForm()}
            </div>
        </div>
    ) : (
        <SplitScreen leftWidth={2} rightWidth={1}>
            {marketingPanel()}
            <div className="d-flex align-items-center justify-content-center h-100 p-4">
                {loginForm()}
            </div>
        </SplitScreen>
    );
};

export default StartMeeting;
