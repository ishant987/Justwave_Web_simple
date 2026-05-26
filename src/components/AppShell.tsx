import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import * as locationApi from '../api/locationApi';
import { useAuth } from '../hooks/useAuth';

const links = [
  { to: '/walkin/new', label: 'New Walk-In' },
   { to: '/walkin/history', label: 'Visit History' },
  { to: '/walkin/occupancy', label: 'Live Occupancy' },
  { to: '/walkin/bills', label: 'Bill Dashboard' },
 
];

function normalizeLocations(payload: { data?: { id: string; name: string }[] } | { id: string; name: string }[] | undefined) {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.data ?? [];
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
        <nav className="top-app-nav">
          <span className="top-app-link active">Walk-In</span>
        </nav>
        <div className="top-app-branch">Branch: {branchName}</div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand-lockup">
            <img className="sidebar-brand-logo" src="/logo2.svg" alt="JustWave" />
          </div>
        </div>
        <nav className="nav-list">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{user?.name}</strong>
            <p className="muted small">{user?.email}</p>
          </div>
          <button className="secondary-button" onClick={() => void logout()}>
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
