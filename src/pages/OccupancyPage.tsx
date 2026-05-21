import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import type { EntryExitLog } from '../types/entryExit';

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function normalizeSessions(payload: {
  occupancy_count?: number;
  active_sessions?: EntryExitLog[];
  data?: { occupancy_count?: number; active_sessions?: EntryExitLog[] };
} | undefined) {
  return payload?.active_sessions ?? payload?.data?.active_sessions ?? [];
}

export function OccupancyPage() {
  const { token } = useAuth();

  const query = useQuery({
    queryKey: ['occupancy'],
    queryFn: () => entryExitApi.getLiveOccupancy(token!),
    enabled: !!token,
    refetchInterval: 15000,
  });

  const occupancyCount = useMemo(
    () => query.data?.occupancy_count ?? query.data?.data?.occupancy_count ?? 0,
    [query.data],
  );
  const sessions = useMemo(() => normalizeSessions(query.data), [query.data]);
  const overtimeCount = useMemo(
    () =>
      sessions.filter((session) => {
        if (!session.booked_exit_time || session.actual_exit_time) return false;
        const bookedExit = new Date(session.booked_exit_time);
        return !Number.isNaN(bookedExit.getTime()) && bookedExit.getTime() < Date.now();
      }).length,
    [sessions],
  );
  const branchLabel = useMemo(() => {
    const branchNames = Array.from(new Set(sessions.map((session) => session.location_name).filter(Boolean)));
    if (!branchNames.length) return 'Branch';
    if (branchNames.length === 1) return branchNames[0] as string;
    return 'All Branches';
  }, [sessions]);
  const lastUpdatedLabel = useMemo(
    () => (query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null),
    [query.dataUpdatedAt],
  );

  return (
    <div className="page-stack occupancy-page">
      <section className="bill-summary-grid occupancy-summary-grid">
        <article className="bill-summary-card today occupancy-summary-card">
          <span>Inside Right Now</span>
          <strong>{occupancyCount}</strong>
          <small>{branchLabel}</small>
        </article>

        <article className="bill-summary-card occupancy-summary-card">
          <span>Active Sessions</span>
          <strong>{sessions.length}</strong>
          <small>Children currently checked in</small>
        </article>

        <article className="bill-summary-card amount-today occupancy-summary-card">
          <span>Overtime</span>
          <strong>{overtimeCount}</strong>
          <small>Booked exit time already crossed</small>
        </article>

        <article className="bill-summary-card amount-month occupancy-summary-card">
          <span>Last Updated</span>
          <strong>{formatTime(lastUpdatedLabel)}</strong>
          <small>{formatDateTime(lastUpdatedLabel)}</small>
        </article>
      </section>

      <section className="occupancy-table-panel">
        <div className="occupancy-table-top">
          <div>
            <h3>Active Sessions</h3>
            <p className="muted">{sessions.length ? `${sessions.length} live sessions loaded` : 'No active sessions right now'}</p>
          </div>
          <div className="occupancy-table-meta">
            <span className="occupancy-refresh-chip">{query.isFetching ? 'Refreshing...' : 'Auto refresh 15s'}</span>
            <strong className="occupancy-branch-label">{branchLabel}</strong>
          </div>
        </div>

        {query.isError ? (
          <StatusBanner
            tone="danger"
            message={query.error instanceof Error ? query.error.message : 'Could not load live occupancy.'}
          />
        ) : null}

        <div className="occupancy-table">
          <div className="occupancy-table-head">
            <span>Child</span>
            <span>Parent</span>
            <span>Branch</span>
            <span>Entry Time</span>
            <span>Status</span>
          </div>

          <div className="occupancy-table-body">
            {sessions.map((session) => (
              <div key={session.id} className="occupancy-table-row">
                <span className="occupancy-child-cell">
                  <strong>{session.child_name || session.customer_name || session.parent_name || 'Walk-In Child'}</strong>
                  <small>{session.booking_id ? `Booking: ${session.booking_id.slice(0, 8).toUpperCase()}` : 'Walk-In Session'}</small>
                </span>
                <span>{session.parent_name || session.customer_name || '-'}</span>
                <span>{session.location_name || 'Branch'}</span>
                <span>{formatDateTime(session.entry_time)}</span>
                <span>
                  <span className="occupancy-status-badge">Inside</span>
                </span>
              </div>
            ))}

            {!query.isLoading && !sessions.length ? (
              <div className="occupancy-empty-state">
                <p className="muted">No active sessions returned.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
