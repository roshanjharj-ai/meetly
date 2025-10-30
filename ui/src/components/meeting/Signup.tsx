// src/pages/Signup.tsx
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from '@react-oauth/google';
import axios from "axios";
import { motion } from "framer-motion";
import { useContext, useState, useEffect } from "react"; // Added useEffect
import { FiArrowLeft, FiLock, FiMail, FiUser } from "react-icons/fi"; // Added FaSpinner for loading UI
import { useNavigate, useParams } from "react-router-dom";

import aiLogo from "../../assets/ai-meet-icon.png"; 
import { UserContext } from "../../context/UserContext"; 
import { SignUp } from '../../services/api';
import { FaSpinner } from 'react-icons/fa';

// ❗ IMPORTANT: Replace with your actual Google Client ID from the Google Cloud Console
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

// NOTE: You must implement this function in your services/api.ts
// This is a placeholder/mock of the required function.
const getCustomerBySlug = async (slug: string): Promise<{ id: number, name: string, url_slug: string }> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/customers/slug/${slug}`);
        return response.data;
    } catch (error) {
        // Fallback for when slug is 'default' or API endpoint is missing
        console.warn(`[Signup] Failed to fetch customer data for slug: ${slug}. Defaulting to ID 1.`);
        return { id: 1, name: 'Default Organization', url_slug: 'default' };
    }
};


const Signup = () => {
  const navigate = useNavigate();
  const { login } = useContext(UserContext);

  const { customerSlug } = useParams<{ customerSlug: string }>();
  const redirectPath = customerSlug ? `/${customerSlug}/dashboard` : "/";

  // New state to hold the resolved customer ID
  const [resolvedCustomerId, setResolvedCustomerId] = useState<number | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const [formData, setFormData] = useState({
    user_name: "",
    name: "",
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // --- EFFECT: Resolve Customer ID from Slug ---
  useEffect(() => {
    const slug = customerSlug || 'default';
    
    const resolveCustomer = async () => {
        try {
            const customerData = await getCustomerBySlug(slug);
            setResolvedCustomerId(customerData.id);
        } catch (e) {
            // If API fails or slug is bad, default to 1, but keep error for visibility
            setError(`Could not resolve organization for slug '${slug}'. Defaulting to Organization ID 1.`);
            setResolvedCustomerId(1);
        } finally {
            setInitialLoading(false);
        }
    };
    
    resolveCustomer();
  }, [customerSlug]);


  /**
   * Handles the local database sign-up process.
   */
  const handleLocalSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password || !formData.user_name || resolvedCustomerId === null) {
      setError("Please fill out all fields and ensure the organization ID is resolved.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      // Step 1: Create the user account in the database with the RESOLVED ID
      const signupPayload = {
        email: formData.email,
        password: formData.password,
        full_name: formData.name,
        user_name: formData.user_name,
        customer_id: resolvedCustomerId, // Use the dynamically resolved ID
        user_type: 1 // Assuming 1 maps to 'Member' or 'User' role in your system
      };
      // NOTE: Assuming SignUp API returns status code/response that indicates success
      await SignUp(signupPayload);

      // Step 2: Automatically log the user in to get a token
      const loginFormData = new URLSearchParams();
      loginFormData.append('username', formData.email); 
      loginFormData.append('password', formData.password);
      const tokenResponse = await axios.post(`${API_BASE_URL}/token`, loginFormData);

      // Step 3: Update the global state and redirect
      login(tokenResponse.data.access_token);
      navigate(redirectPath);

    } catch (err: any) {
      // Check for specific error status codes if needed
      setError(err.response?.data?.detail || "Signup failed. The email might already be in use.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles successful Google Sign-In.
   */
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    // Note: The backend needs to be smart enough to assign the user to 
    // the correct organization based on the resolvedCustomerId or a claim in the Google token.
    setError("");
    setIsLoading(true);
    try {
      const token = credentialResponse.credential;
      if (!token) {
        throw new Error("Google credential not found.");
      }

      // Send the Google token to our backend
      // NOTE: You may need to pass customerSlug/resolvedCustomerId to the backend auth endpoint here.
      const response = await axios.post(`${API_BASE_URL}/auth/google`, { token }); 

      // Update global state with our app's token and redirect
      login(response.data.access_token);
      navigate(redirectPath);

    } catch (err: any) {
      setError(err.response?.data?.detail || "Google Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Disable form submission if we are still loading the customer ID
  const isFormDisabled = isLoading || initialLoading;

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
              Joining organization: **{customerSlug || 'default'}** (ID: {resolvedCustomerId !== null ? resolvedCustomerId : '...' })
            </p>
          </div>
          
          {/* Initial Loading Indicator */}
          {initialLoading && (
              <div className="text-center text-light mb-4">
                  <FaSpinner className="spinner-border" size={20} /> Resolving organization...
              </div>
          )}

          {/* Local Signup Form */}
          <form onSubmit={handleLocalSignup} className="text-start">
            <div className="form-floating mb-3">
              <input type="text" id="user_name" placeholder="User Name" value={formData.user_name}
                onChange={(e) => setFormData((p) => ({ ...p, user_name: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required disabled={isFormDisabled} />
              <label htmlFor="user_name" className="text-light"><FiUser className="me-2" /> User Name</label>
            </div>
            <div className="form-floating mb-3">
              <input type="text" id="name" placeholder="Full Name" value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required disabled={isFormDisabled} />
              <label htmlFor="name" className="text-light"><FiUser className="me-2" /> Full Name</label>
            </div>
            <div className="form-floating mb-3">
              <input type="email" id="email" placeholder="Email" value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required disabled={isFormDisabled} />
              <label htmlFor="email" className="text-light"><FiMail className="me-2" /> Email</label>
            </div>
            <div className="form-floating mb-4">
              <input type="password" id="password" placeholder="Password" value={formData.password}
                onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                className="form-control form-control-lg bg-transparent text-light border-light" required disabled={isFormDisabled} />
              <label htmlFor="password" className="text-light"><FiLock className="me-2" /> Password</label>
            </div>
            {error && <p className="text-danger small text-center mb-3">{error}</p>}
            <motion.button whileTap={{ scale: 0.95 }} type="submit" disabled={isFormDisabled}
              className="btn btn-primary w-100 py-2 fw-semibold shadow-sm">
              {isFormDisabled ? "Loading..." : "Sign Up with Email"}
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
              //disabled={isFormDisabled}
            />
          </div>

          {/* Back to Login Link */}
          <button onClick={() => navigate(customerSlug ? `/${customerSlug}/login` : "/login")}
            className="btn btn-outline-light d-flex align-items-center justify-content-center gap-2 w-100 mt-2">
            <FiArrowLeft /> Already have an account? Log In
          </button>
        </motion.div>
      </div>
    </GoogleOAuthProvider>
  );
};

export default Signup;