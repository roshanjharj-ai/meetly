import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  user: any; // In a real app, use a more specific type for the user object
  children: JSX.Element;
}

export default function ProtectedRoute({ user, children }: ProtectedRouteProps) {
  if (!user) {
    // If the user is not authenticated, redirect to the /login page
    return <Navigate to="/login" replace />;
  }

  // If the user is authenticated, render the component they were trying to access
  return children;
}