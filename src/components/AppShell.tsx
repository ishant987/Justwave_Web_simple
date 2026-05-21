import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import * as locationApi from '../api/locationApi';
import { useAuth } from '../hooks/useAuth';

const links = [
  { to: '/walkin/new', label: 'New Walk-In', icon: 'walkin' },
  { to: '/walkin/occupancy', label: 'Live Occupancy', icon: 'occupancy' },
  { to: '/walkin/bills', label: 'Bill Dashboard', icon: 'bills' },
  { to: '/walkin/history', label: 'Visit History', icon: 'history' },
];

function normalizeLocations(payload: { data?: { id: string; name: string }[] } | { id: string; name: string }[] | undefined) {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.data ?? [];
}

function SidebarIcon({ type }: { type: string }) {
  if (type === 'walkin') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5a3 3 0 1 1 0 6a3 3 0 0 1 0-6Zm-7 12a4 4 0 0 1 4-4h1.4a5.6 5.6 0 0 0 3.2 1H15a1 1 0 0 1 1 1v2H5v-1Zm12-4v-2h2v2h2v2h-2v2h-2v-2h-2v-2h2Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'occupancy') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5Zm7-1a2 2 0 1 1 0 4a2 2 0 0 1 0-4ZM4 18a4.5 4.5 0 0 1 9 0v1H4v-1Zm10 1a3.5 3.5 0 0 1 7 0h-7Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'bills') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h10l3 3v15H4V3h3Zm1 4h8V5H8v2Zm0 4h8V9H8v2Zm0 4h5v-2H8v2Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4a8 8 0 1 1-5.65 13.65L3 21v-3.35A8 8 0 0 1 12 4Zm1 4h-2v5l4 2l1-1.73l-3-1.52V8Z" fill="currentColor" />
    </svg>
  );
}

function TopNavIcon({ type }: { type: string }) {
  const paths: Record<string, string> = {
    walkin: 'M12 5a3 3 0 1 1 0 6a3 3 0 0 1 0-6Zm-7 12a4 4 0 0 1 4-4h1.4a5.6 5.6 0 0 0 3.2 1H15a1 1 0 0 1 1 1v2H5v-1Zm12-4v-2h2v2h2v2h-2v2h-2v-2h-2v-2h2Z',
    bookings: 'M7 3v2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V3h-2v2H9V3H7Zm12 6H5v9h14V9ZM7 11h4v4H7v-4Z',
    kitchen: 'M10 4a4 4 0 0 0-4 4v3a4 4 0 0 0 3 3.87V20h2v-5.13A4 4 0 0 0 14 11V8a4 4 0 0 0-4-4Zm8 0h2v7a3 3 0 0 1-3 3h-1v6h-2V4h2v8h1a1 1 0 0 0 1-1V4Z',
    kisok: 'M12 4a3 3 0 1 1 0 6a3 3 0 0 1 0-6ZM5 18a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1h-2v-1a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v1H5v-1Z',
    branch: 'M12 2a7 7 0 0 1 7 7c0 4.7-7 13-7 13S5 13.7 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6a3 3 0 0 0 0-6Z',
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[type]} fill="currentColor" />
    </svg>
  );
}

export function AppShell() {
  const { token, user, logout } = useAuth();
  const locationsQuery = useQuery({
    queryKey: ['header-locations'],
    queryFn: () => locationApi.getLocations(token!),
    enabled: !!token,
  });
  const locations = normalizeLocations(locationsQuery.data);
  const branchName = locations[0]?.name || 'Loading branch...';

  return (
    <div className="app-shell">
      <header className="top-app-bar full-width">
        <div className="top-app-brand-spacer" />
        <nav className="top-app-nav">
          <span className="top-app-link active">
            <TopNavIcon type="walkin" />
            Walk-In
          </span>
          <span className="top-app-link">
            <TopNavIcon type="bookings" />
            Bookings
          </span>
          <span className="top-app-link">
            <TopNavIcon type="kitchen" />
            Kitchen
          </span>
          <span className="top-app-link">
            <TopNavIcon type="kisok" />
            Kisok
          </span>
        </nav>
        <div className="top-app-branch">
          <TopNavIcon type="branch" />
          <span>Branch: {branchName}</span>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand-lockup">
            <img src="/logo.svg" alt="Justwave" className="sidebar-brand-logo" />
          </div>
        </div>
        <nav className="nav-list">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-link-icon">
                <SidebarIcon type={link.icon} />
              </span>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">{user?.name?.slice(0, 2).toUpperCase() || 'SA'}</div>
            <div>
              <strong>{user?.name}</strong>
              <p className="muted small">{user?.email}</p>
            </div>
          </div>
          <button className="sidebar-signout-button" onClick={() => void logout()}>
            <span className="sidebar-signout-icon">↪</span>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="page-content">
        <div className="page-scroll-shell">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
