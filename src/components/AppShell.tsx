import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { locationApi } from '../api/locationApi';
import { useAuth } from '../hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import { normalizeListResponse } from '../utils/normalization';

const links = [
  {
    to: '/walkin/new',
    label: 'New Walk-In',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
  },
  {
    to: '/walkin/history',
    label: 'History',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    to: '/walkin/occupancy',
    label: 'Occupancy',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    to: '/walkin/bills',
    label: 'Bills',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5M3.75 4.5v13.5m0-13.5L12 10.5M20.25 4.5v13.5m0-13.5L12 10.5M12 10.5v10.5m-3.75-3h7.5" />
      </svg>
    ),
  },
];

export function AppShell() {
  const { token, user, logout } = useAuth();
  const { flash, clearFlash } = useFlash();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('jw-sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem('jw-sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const locationsQuery = useQuery({
    queryKey: ['header-locations'],
    queryFn: () => locationApi.getLocations(token!),
    enabled: !!token,
  });
  const locations = normalizeListResponse<{ id: string; name: string }>(locationsQuery.data);
  const branchName = locations[0]?.name || 'Loading branch...';

  return (
    <div className={isSidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      {/* Mobile Top Header */}
      <header className="mobile-top-header">
        <div className="mobile-header-brand">
          <img src="/logo2.svg" alt="JustWave" className="mobile-brand-logo" />
        </div>
        <div className="mobile-header-right">
          <span className="mobile-branch-tag">{branchName}</span>
          <button className="mobile-logout-btn" onClick={() => void logout()} title="Sign Out" aria-label="Sign Out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="logout-icon" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </header>

      {/* Desktop Top App Bar */}
      <header className="top-app-bar full-width">
        <nav className="top-app-nav">
          <span className="top-app-link active">Walk-In</span>
        </nav>
        <div className="top-app-branch">Branch: {branchName}</div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand-row">
            <div className="sidebar-brand-lockup">
              <img className="sidebar-brand-logo" src="/logo2.svg" alt="JustWave" />
            </div>
            <button
              type="button"
              className="sidebar-collapse-button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {isSidebarCollapsed ? (
                  <path
                    fill="currentColor"
                    d="M11.293 17.293a1 1 0 0 1 0-1.414L14.172 13H5a1 1 0 1 1 0-2h9.172l-2.879-2.879a1 1 0 1 1 1.415-1.415l4.586 4.586a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.415 0Z"
                  />
                ) : (
                  <path
                    fill="currentColor"
                    d="M12.707 6.707a1 1 0 0 1 0 1.414L9.828 11H19a1 1 0 1 1 0 2H9.828l2.879 2.879a1 1 0 1 1-1.415 1.415l-4.586-4.586a1 1 0 0 1 0-1.414l4.586-4.586a1 1 0 0 1 1.415 0Z"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
        <nav className="nav-list">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-link-icon">{link.icon}</span>
              <span className="nav-link-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <strong>{user?.name}</strong>
            <p className="muted small">{user?.email}</p>
          </div>
          <button className="secondary-button sidebar-signout-button" onClick={() => void logout()}>
            <span className="sidebar-signout-icon" aria-hidden="true">
              ↪
            </span>
            <span className="sidebar-signout-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Page Content */}
      <main className="page-content">
        {flash ? (
          <div className="app-flash-wrap">
            <button type="button" className={`app-flash ${flash.tone}`} onClick={clearFlash}>
              <span>{flash.message}</span>
            </button>
          </div>
        ) : null}
        <div className="page-scroll-shell">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? 'mobile-nav-link active' : 'mobile-nav-link')}
          >
            {link.icon}
            <span className="mobile-nav-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
