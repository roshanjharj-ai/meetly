import { Outlet } from 'react-router-dom';
import TopBar from './shared/TopBar';

interface MainLayoutProps {
    onLogout: () => void;
}

export default function MainLayout({ onLogout }: MainLayoutProps) {
  return (
    <div className="d-flex flex-column h-100">
      <TopBar onLogout={onLogout} />
      <main className="flex-grow-1 overflow-auto">
        {/* The Outlet component renders the active child route (e.g., /meetings, /participants) */}
        <Outlet />
      </main>
    </div>
  );
}