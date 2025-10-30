import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import type { FullUserProfile } from "../types/meeting.types"; // **FIX**: Import the new user type

interface DecodedToken {
    sub: string; // Subject, which is the user's email
    exp: number;
}

interface UserContextType {
    user: FullUserProfile | null; // **FIX**: Use the richer user profile type
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
    isLoading: boolean;
    setUser: React.Dispatch<React.SetStateAction<FullUserProfile | null>>;
    // **FIX**: Add theme state and a toggle function to the context type
    theme: string;
    toggleTheme: () => void;
}

export const UserContext = createContext<UserContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },
    setUser: () => { },
    isLoading: true,
    // **FIX**: Provide default values for the new theme properties
    theme: 'dark',
    toggleTheme: () => { },
});

interface UserContextProviderRequest {
    children: ReactNode;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const UserContextProvider = ({ children }: UserContextProviderRequest) => {
    const [user, setUser] = useState<FullUserProfile | null>(null);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken")); // Use function for initial state
    const [isLoading, setIsLoading] = useState(true);
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    // **FIX**: Create a useEffect to apply the theme to the entire app
    useEffect(() => {
        // This attribute is what Bootstrap 5+ uses for its color modes
        document.documentElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // **FIX**: Create the function to toggle the theme
    const toggleTheme = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    const logout = useCallback(() => {
        localStorage.removeItem("authToken");
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
    }, []);

    // **FIX**: Create a reusable function to fetch user details
    const fetchUserDetails = useCallback(async (authToken: string) => {
        try {
            // Set the auth header for this request
            axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;

            // Fetch the full user profile from the backend
            const response = await axios.get(API_BASE_URL + '/users/me');
            const userProfile = response.data;

            // Combine the fetched profile with the basic info
            setUser({
                user_name: userProfile.user_name, // Or userProfile.username if you have one
                email: userProfile.email,
                full_name: userProfile.full_name,
                mobile: userProfile.mobile,
                picture: userProfile.picture,
                photo_url: userProfile.photo_url,
                customer_id: parseInt(userProfile.customer_id),
                customer_slug: userProfile.customer_slug,
                user_type: userProfile.user_type,
                license_status: userProfile.license_status
            });
        } catch (error) {
            console.error("Failed to fetch user details:", error);
            logout(); // If fetching fails, the token is likely invalid, so log out
        }
    }, [logout]);

    useEffect(() => {
        const initializeAuth = async () => {
            if (token) {
                try {
                    const decodedToken: DecodedToken = jwtDecode(token);
                    if (decodedToken.exp * 1000 < Date.now()) {
                        logout();
                    } else {
                        // **FIX**: Instead of setting a temporary user, fetch the full profile
                        await fetchUserDetails(token);
                    }
                } catch (error) {
                    console.error("Invalid token:", error);
                    logout();
                }
            }
            setIsLoading(false);
        };
        initializeAuth();
    }, [token, fetchUserDetails, logout]);

    const login = (newToken: string) => {
        localStorage.setItem("authToken", newToken);
        setToken(newToken);
        // **FIX**: Immediately fetch user details upon login
        // We don't need to await this here as the useEffect will handle it
    };

    return (
        <UserContext.Provider value={{ user, token, login, logout, isLoading, setUser, theme, toggleTheme }}>
            {children}
        </UserContext.Provider>
    );
};