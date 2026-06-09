import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { entryExitApi } from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import type { EntryExitLog, OvertimeSettlementItem, PaymentMode } from '../types/entryExit';
import { formatAmount, formatDate, formatDateTime, formatTime } from '../utils/formatters';
import { normalizeListResponse, readNumber } from '../utils/normalization';

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

function getOvertimeCharge(row: EntryExitLog | OvertimeSettlementItem) {
  return readNumber(row.overtime_charge ?? row.bill_overtime_amount);
}

function canSettleOvertime(row: EntryExitLog | OvertimeSettlementItem) {
  return !row.overtime_paid && getOvertimeCharge(row) > 0;
}

function getOvertimeStatus(row: OvertimeSettlementItem) {
  if (row.overtime_paid || row.settlement_status === 'settled') {
    return { label: 'Settled', tone: 'success' as const };
  }

  if (canSettleOvertime(row)) {
    return { label: 'Due', tone: 'warning' as const };
  }

  return { label: 'Not Due', tone: 'info' as const };
}

function getSettlementSummary(row: OvertimeSettlementItem) {
  const amount = getOvertimeCharge(row);
  const minutes = readNumber(row.overtime_minutes);
  return `${formatAmount(amount)} • ${minutes} min`;
}

export function OccupancyPage() {
  const { token } = useAuth();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [occupancyDateFilter, setOccupancyDateFilter] = useState(() => getTodayDateInputValue());
  const [settlementPhone, setSettlementPhone] = useState('');
  const [settlementTargetId, setSettlementTargetId] = useState('');
  const [selectedSettlementIds, setSelectedSettlementIds] = useState<string[]>([]);
  const [settlementPaymentMode, setSettlementPaymentMode] = useState<PaymentMode>('cash');
  const [settlementNotice, setSettlementNotice] = useState<{
    tone: 'success' | 'warning' | 'danger' | 'info';
    message: string;
  } | null>(null);

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

  const overtimeSettlementQuery = useQuery({
    queryKey: ['occupancy-overtime-settlements', settlementPhone],
    queryFn: () => entryExitApi.getOvertimeSettlements(token!, settlementPhone),
    enabled: !!token && !!settlementPhone,
  });

  const settleMutation = useMutation({
    mutationFn: async ({ ids, paymentMode }: { ids: string[]; paymentMode: PaymentMode }) => {
      for (const id of ids) {
        await entryExitApi.settleOvertime(token!, id, paymentMode);
      }
      return ids;
    },
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
  const settlementItems = useMemo(
    () => normalizeListResponse<OvertimeSettlementItem>(overtimeSettlementQuery.data),
    [overtimeSettlementQuery.data],
  );
  const settlementTargetItem = useMemo(
    () => settlementItems.find((item) => item.id === settlementTargetId) || null,
    [settlementItems, settlementTargetId],
  );
  const selectedSettlementItems = useMemo(
    () => settlementItems.filter((item) => selectedSettlementIds.includes(item.id) && canSettleOvertime(item)),
    [selectedSettlementIds, settlementItems],
  );
  const selectedSettlementTotal = useMemo(
    () => selectedSettlementItems.reduce((total, item) => total + getOvertimeCharge(item), 0),
    [selectedSettlementItems],
  );
  const selectedSettlementMinutes = useMemo(
    () => selectedSettlementItems.reduce((total, item) => total + readNumber(item.overtime_minutes), 0),
    [selectedSettlementItems],
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

  function closeSettlement() {
    setSettlementPhone('');
    setSettlementTargetId('');
    setSelectedSettlementIds([]);
    setSettlementPaymentMode('cash');
  }

  function selectOnlyTarget() {
    if (!settlementTargetItem || !canSettleOvertime(settlementTargetItem)) {
      setSelectedSettlementIds([]);
      return;
    }

    setSelectedSettlementIds([settlementTargetItem.id]);
  }

  function selectAllDueChildren() {
    setSelectedSettlementIds(settlementItems.filter((item) => canSettleOvertime(item)).map((item) => item.id));
  }

  function toggleSelectedSettlement(id: string) {
    setSelectedSettlementIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]));
  }

  async function settleSelectedChildren() {
    if (!selectedSettlementIds.length) return;

    try {
      await settleMutation.mutateAsync({ ids: selectedSettlementIds, paymentMode: settlementPaymentMode });
      await Promise.all([query.refetch(), overtimeSettlementQuery.refetch()]);
      setSettlementNotice({
        tone: 'success',
        message:
          selectedSettlementIds.length === 1
            ? 'Overtime settled for 1 child.'
            : `Overtime settled for ${selectedSettlementIds.length} children.`,
      });
      closeSettlement();
    } catch {
      // Error banner is shown inside the modal.
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

      {settlementNotice ? <StatusBanner tone={settlementNotice.tone} message={settlementNotice.message} /> : null}

      {settlementPhone ? (
        <div className="modal-backdrop" onClick={closeSettlement}>
          <div className="modal-card occupancy-settlement-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Settle Overtime</h3>
                <p className="muted">
                  Phone: {settlementPhone}
                  {settlementTargetItem?.parent_name || settlementTargetItem?.customer_name
                    ? ` • ${settlementTargetItem.parent_name || settlementTargetItem.customer_name}`
                    : ''}
                </p>
              </div>
              <button type="button" className="secondary-button" onClick={closeSettlement}>
                Close
              </button>
            </div>

            {overtimeSettlementQuery.isLoading ? <StatusBanner tone="info" message="Loading overtime settlement details..." /> : null}
            {overtimeSettlementQuery.isError ? (
              <StatusBanner
                tone="danger"
                message={overtimeSettlementQuery.error instanceof Error ? overtimeSettlementQuery.error.message : 'Could not load overtime details.'}
              />
            ) : null}

            <div className="payment-modal-top occupancy-settlement-top">
              <div className="payment-pass-box occupancy-settlement-list-box">
                <div className="payment-box-title">Children linked to this phone</div>
                <div className="payment-pass-list">
                  {overtimeSettlementQuery.isLoading ? (
                    <div className="occupancy-settlement-loader" aria-live="polite" aria-busy="true">
                      <div className="occupancy-settlement-spinner" />
                      <div className="occupancy-settlement-loader-copy">
                        <strong>Loading settlements</strong>
                        <span>Fetching child names, overtime minutes, and charges...</span>
                      </div>
                    </div>
                  ) : (
                    settlementItems.map((item) => {
                      const isSelected = selectedSettlementIds.includes(item.id);
                      const isDue = canSettleOvertime(item);
                      const status = getOvertimeStatus(item);

                      return (
                        <label key={item.id} className={`payment-pass-row occupancy-settlement-row ${isSelected ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectedSettlement(item.id)}
                            disabled={!isDue}
                          />
                          <span className="occupancy-settlement-main">
                            <strong>{item.child_name || item.customer_name || item.parent_name || 'Walk-In Child'}</strong>
                            <small>
                              {item.parent_name || item.customer_name || '-'}
                              {item.location_name ? ` • ${item.location_name}` : ''}
                            </small>
                            <small>
                              {status.label} • {getSettlementSummary(item)}
                            </small>
                          </span>
                          <span className="occupancy-settlement-meta">
                            <strong>{formatAmount(getOvertimeCharge(item))}</strong>
                            <small>{readNumber(item.overtime_minutes)} min</small>
                          </span>
                        </label>
                      );
                    })
                  )}

                  {!settlementItems.length && !overtimeSettlementQuery.isLoading ? (
                    <div className="occupancy-empty-state">
                      <p className="muted">No overtime settlements returned for this phone number.</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="payment-plan occupancy-settlement-plan">
                <div className="payment-total-box">
                  <span>Selected Overtime</span>
                  <strong>{formatAmount(selectedSettlementTotal)}</strong>
                  <small>
                    {selectedSettlementItems.length
                      ? `${selectedSettlementItems.length} child${selectedSettlementItems.length === 1 ? '' : 'ren'} • ${selectedSettlementMinutes} min`
                      : 'Select one child or all due children'}
                  </small>
                </div>

                <div className="occupancy-settlement-switches">
                  <button type="button" className="secondary-button" onClick={selectOnlyTarget} disabled={!settlementTargetItem}>
                    Selected child
                  </button>
                  <button type="button" className="secondary-button" onClick={selectAllDueChildren} disabled={!settlementItems.some(canSettleOvertime)}>
                    All kids due
                  </button>
                </div>

                <label className="occupancy-settlement-payment-mode">
                  Payment Mode
                  <select value={settlementPaymentMode} onChange={(event) => setSettlementPaymentMode(event.target.value as PaymentMode)}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                {settleMutation.isError ? (
                  <StatusBanner
                    tone="danger"
                    message={settleMutation.error instanceof Error ? settleMutation.error.message : 'Settlement failed.'}
                  />
                ) : null}

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeSettlement}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void settleSelectedChildren()}
                    disabled={!selectedSettlementItems.length || settleMutation.isPending}
                  >
                    {settleMutation.isPending ? 'Settling...' : 'Pay'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
