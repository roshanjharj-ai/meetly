// src/pages/Signup.tsx
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from '@react-oauth/google';
import axios from "axios";
import { motion } from "framer-motion";
import { useContext, useState } from "react";
import { FiArrowLeft, FiLock, FiMail, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import aiLogo from "../../assets/ai-meet-icon.png"; // Adjust the import path as needed
import { UserContext } from "../../context/UserContext"; // Adjust the import path as needed

// ❗ IMPORTANT: Replace with your actual Google Client ID from the Google Cloud Console
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';


const Signup = () => {
  const navigate = useNavigate();
  const { login } = useContext(UserContext);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Handles the local database sign-up process.
   * First, it creates the user via the /signup endpoint.
   * Then, it automatically logs them in by calling the /token endpoint.
   */
  const handleLocalSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
        setError("Please fill out all fields.");
        return;
    }

    setError("");
    setIsLoading(true);

    try {
      // Step 1: Create the user account in the database
      const signupPayload = {
        email: formData.email,
        password: formData.password,
        full_name: formData.name,
      };
      await axios.post(`${API_BASE_URL}/signup`, signupPayload);

      // Step 2: Automatically log the user in to get a token
      const loginFormData = new URLSearchParams();
      loginFormData.append('username', formData.email); // FastAPI's OAuth2 form uses 'username' for email
      loginFormData.append('password', formData.password);
      const tokenResponse = await axios.post(`${API_BASE_URL}/token`, loginFormData);

      // Step 3: Update the global state and redirect
      login(tokenResponse.data.access_token);
      navigate("/");

    } catch (err: any) {
      setError(err.response?.data?.detail || "Signup failed. The email might already be in use.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles successful Google Sign-In.
   * It sends the Google token to the backend for verification.
   * The backend validates the token, creates a user if one doesn't exist, and returns a JWT.
   */
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setError("");
    setIsLoading(true);
    try {
        const token = credentialResponse.credential;
        if (!token) {
            throw new Error("Google credential not found.");
        }
        
        // Send the Google token to our backend
        const response = await axios.post(`${API_BASE_URL}/auth/google`, { token });

        // Update global state with our app's token and redirect
        login(response.data.access_token);
        navigate("/");

    } catch (err: any) {
        setError(err.response?.data?.detail || "Google Sign-in failed. Please try again.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div
        className="container-fluid d-flex justify-content-center align-items-center"
        style={{
          background: "linear-gradient(135deg, #6e4aff 0%, #3c1e8a 50%, #141414 100%)",
          minHeight: "100vh",
          overflowY: "auto",
          padding: "40px 15px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="card border-0 shadow-lg rounded-4 p-4 p-md-5 text-center bg-white bg-opacity-10 text-light backdrop-blur-md"
          style={{ width: "100%", maxWidth: 460, margin: "auto" }}
        >
          {/* Header Section */}
          <div className="mb-4">
            <img
              src={aiLogo}
              alt="AI Meeting Logo"
              width={80}
              height={80}
              className="rounded-circle bg-white p-2 border border-3 border-primary shadow-sm mb-2"
            />
            <h2 className="fw-bold text-light">Create Your Account</h2>
            <p className="small" style={{ color: "#E0C3FF" }}>
              Join to experience smarter meetings.
            </p>
          </div>

          {/* Local Signup Form */}
          <form onSubmit={handleLocalSignup} className="text-start">
            <div className="form-floating mb-3">
              <input type="text" id="name" placeholder="Full Name" value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required />
              <label htmlFor="name" className="text-light"><FiUser className="me-2" /> Full Name</label>
            </div>
            <div className="form-floating mb-3">
              <input type="email" id="email" placeholder="Email" value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required />
              <label htmlFor="email" className="text-light"><FiMail className="me-2" /> Email</label>
            </div>
            <div className="form-floating mb-4">
              <input type="password" id="password" placeholder="Password" value={formData.password}
                onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required />
              <label htmlFor="password" className="text-light"><FiLock className="me-2" /> Password</label>
            </div>
            {error && <p className="text-danger small text-center mb-3">{error}</p>}
            <motion.button whileTap={{ scale: 0.95 }} type="submit" disabled={isLoading}
              className="btn btn-primary w-100 py-2 fw-semibold shadow-sm">
              {isLoading ? "Creating Account..." : "Sign Up with Email"}
            </motion.button>
          </form>

          {/* Divider and OAuth Section */}
          <hr className="border-light opacity-25 my-4" />
          <p className="small mb-3">Or continue with</p>
          <div className="d-flex justify-content-center mb-4">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => { setError("Google login failed. Please try again."); }}
              theme="outline"
              size="large"
              shape="pill"
            />
          </div>

          {/* Back to Login Link */}
          <button onClick={() => navigate("/login")}
            className="btn btn-outline-light d-flex align-items-center justify-content-center gap-2 w-100 mt-2">
            <FiArrowLeft /> Already have an account? Log In
          </button>
        </motion.div>
      </div>
    </GoogleOAuthProvider>
  );
};

export default Signup;