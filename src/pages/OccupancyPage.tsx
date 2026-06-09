import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { entryExitApi } from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import type { EntryExitLog } from '../types/entryExit';
import { formatDate, formatDateTime, formatTime } from '../utils/formatters';
import { normalizeListResponse } from '../utils/normalization';

function getTodayDateInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getOccupancyStatus(row: EntryExitLog) {
  if (row.pass_lifecycle_status === 'used_checked_out' || row.actual_exit_time) {
    return { label: 'Checked Out', tone: 'success' as const };
  }

  if (row.pass_lifecycle_status === 'claimed_inside' || row.entry_time) {
    return { label: 'Inside', tone: 'info' as const };
  }

  return { label: 'Pass Issued', tone: 'warning' as const };
}

export function OccupancyPage() {
  const { token } = useAuth();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [occupancyDateFilter, setOccupancyDateFilter] = useState(() => getTodayDateInputValue());

  const occupancyQuery = useMemo(() => {
    const params = new URLSearchParams({
      status: 'active',
      date_from: occupancyDateFilter,
      date_to: occupancyDateFilter,
      per_page: '100',
      sort: 'entry_time',
      direction: 'asc',
    });

    return params.toString();
  }, [occupancyDateFilter]);

  const isTodaySelection = occupancyDateFilter === getTodayDateInputValue();

  const query = useQuery({
    queryKey: ['occupancy', occupancyQuery],
    queryFn: () => entryExitApi.getVisitHistory(token!, occupancyQuery),
    enabled: !!token && !!occupancyDateFilter,
    refetchInterval: isTodaySelection ? 15000 : false,
  });

  const sessions = useMemo(
    () => normalizeListResponse<EntryExitLog>(query.data).filter((session) => getOccupancyStatus(session).label === 'Inside'),
    [query.data],
  );
  const occupancyCount = sessions.length;
  const insideCount = useMemo(
    () => sessions.length,
    [sessions],
  );
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

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  }

  return (
    <div className="page-stack occupancy-page">
      <section className="bill-summary-grid occupancy-summary-grid">
        <article className="bill-summary-card today occupancy-summary-card">
          <span>Sessions on Day</span>
          <strong>{occupancyCount}</strong>
          <small>{formatDate(occupancyDateFilter)}</small>
        </article>

        <article className="bill-summary-card occupancy-summary-card">
          <span>Inside</span>
          <strong>{insideCount}</strong>
          <small>{branchLabel}</small>
        </article>

        <article className="bill-summary-card amount-today occupancy-summary-card">
          <span>Inside</span>
          <strong>{insideCount}</strong>
          <small>Children currently inside</small>
        </article>

        <article className="bill-summary-card amount-month occupancy-summary-card">
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
            <h3>Day Occupancy</h3>
            <p className="muted">
              {sessions.length
                ? `${sessions.length} child records loaded for ${formatDate(occupancyDateFilter)}`
                : 'No inside child records found for the selected day'}
            </p>
          </div>
          <div className="occupancy-table-meta">
            <div className="history-filter-input-wrap history-filter-input-date occupancy-header-date">
              <input
                ref={dateInputRef}
                aria-label="Occupancy date"
                type="date"
                value={occupancyDateFilter}
                onChange={(event) => setOccupancyDateFilter(event.target.value)}
              />
              <button type="button" className="history-filter-icon-button" onClick={openDatePicker} aria-label="Open calendar">
                <svg viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="4.5" width="14" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M6.5 3V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M13.5 3V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M3 8H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <span className="occupancy-refresh-chip">
              {query.isFetching ? 'Refreshing...' : isTodaySelection ? 'Auto refresh 15s' : 'Date view'}
            </span>
            <strong className="occupancy-branch-label">{branchLabel}</strong>
          </div>
        </div>

        {query.isError ? (
          <StatusBanner
            tone="danger"
            message={query.error instanceof Error ? query.error.message : 'Could not load occupancy records.'}
          />
        ) : null}

        <div className="occupancy-table">
          <div className="occupancy-table-head">
            <span>Child</span>
            <span>Parent</span>
            <span>Branch</span>
            <span>Entry Time</span>
            <span>Exit Time</span>
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
                  {formatDateTime(session.actual_exit_time)}
                </span>
                <span>
                  <span className={`history-status-badge ${getOccupancyStatus(session).tone}`}>{getOccupancyStatus(session).label}</span>
                </span>
              </div>
            ))}

            {!query.isLoading && !sessions.length ? (
              <div className="occupancy-empty-state">
                <p className="muted">No inside child records returned for the selected day.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
