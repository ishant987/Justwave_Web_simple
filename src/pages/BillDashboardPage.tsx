import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import type { BillDashboardResponse, EntryExitLog } from '../types/entryExit';

type PaymentModeKey = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other' | 'razorpay';
type BillCategory = 'all' | 'pending' | 'generated_today' | 'amount_today' | 'amount_month' | 'all_time';
type BillStatus = 'all' | 'pending' | 'completed' | 'active' | 'expired';
type BillSort = 'created_at' | 'amount' | 'duration' | 'status' | 'entry_time' | 'exit_time';
type BillDirection = 'asc' | 'desc';

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function formatAmount(value: number) {
  return `Rs.${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

function formatMinutes(value?: number | null) {
  const minutes = readNumber(value);
  if (!minutes) return '-';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes}m`;
}

function paymentModeLabel(mode: PaymentModeKey) {
  if (mode === 'upi') return 'UPI';
  if (mode === 'bank_transfer') return 'Bank Transfer';
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function normalizePaymentMode(value?: string | null): PaymentModeKey | null {
  if (!value) return null;
  if (value === 'cash' || value === 'upi' || value === 'card' || value === 'bank_transfer' || value === 'other' || value === 'razorpay') {
    return value;
  }
  return null;
}

function getBillStatus(row: EntryExitLog): { label: string; tone: BillStatus } {
  if (row.pass_lifecycle_status === 'used_checked_out' || row.actual_exit_time) {
    return { label: 'Completed', tone: 'completed' };
  }
  if (row.pass_lifecycle_status === 'claimed_inside' || row.entry_time) {
    return { label: 'Active', tone: 'active' };
  }
  if (row.pass_lifecycle_status === 'expired') {
    return { label: 'Expired', tone: 'expired' };
  }
  return { label: 'Pending', tone: 'pending' };
}

function buildBillDashboardQuery(params: {
  category: BillCategory;
  status: BillStatus;
  search: string;
  dateFrom: string;
  dateTo: string;
  sort: BillSort;
  direction: BillDirection;
  perPage: number;
  page: number;
}) {
  const query = new URLSearchParams();
  if (params.category !== 'all') query.set('category', params.category);
  if (params.status !== 'all') query.set('status', params.status);
  if (params.search.trim()) query.set('search', params.search.trim());
  if (params.dateFrom) query.set('date_from', params.dateFrom);
  if (params.dateTo) query.set('date_to', params.dateTo);
  query.set('sort', params.sort);
  query.set('direction', params.direction);
  query.set('per_page', String(params.perPage));
  query.set('page', String(params.page));
  return query.toString();
}

export function BillDashboardPage() {
  const { token } = useAuth();
  const billsSectionRef = useRef<HTMLElement | null>(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [filters, setFilters] = useState({
    category: 'all' as BillCategory,
    status: 'all' as BillStatus,
    search: '',
    dateFrom: '',
    dateTo: '',
    sort: 'created_at' as BillSort,
    direction: 'desc' as BillDirection,
    perPage: 25,
    page: 1,
  });

  const queryString = useMemo(() => buildBillDashboardQuery(filters), [filters]);

  const query = useQuery({
    queryKey: ['bill-dashboard', queryString],
    queryFn: () => entryExitApi.getBillDashboard(token!, queryString),
    enabled: !!token,
  });

  const payload = useMemo(() => (query.data ?? {}) as BillDashboardResponse, [query.data]);
  const summary = payload.data?.summary ?? {};
  const billsContainer = readObject(payload.data?.bills);
  const meta = readObject(billsContainer.meta);
  const rows = useMemo(() => readArray<EntryExitLog>(billsContainer.data), [billsContainer]);
  const filteredTotal = readNumber(payload.data?.filtered_total);
  const currentPage = readNumber(meta.current_page) || filters.page;
  const lastPage = readNumber(meta.last_page) || 1;
  const from = readNumber(meta.from);
  const to = readNumber(meta.to);
  const totalRows = readNumber(meta.total);
  const branchLabel = useMemo(() => {
    const branchNames = Array.from(new Set(rows.map((row) => readString(row.location_name)).filter(Boolean)));
    if (!branchNames.length) return 'Branch';
    if (branchNames.length === 1) return branchNames[0];
    return 'All Branches';
  }, [rows]);

  const summaryCards = useMemo(
    () => [
      {
        key: 'pending' as BillCategory,
        label: 'Pending Bills',
        value: String(readNumber(summary.pending_count ?? summary.pending)),
        hint: 'Awaiting exit completion',
        tone: 'pending',
      },
      {
        key: 'generated_today' as BillCategory,
        label: 'Generated Today',
        value: String(readNumber(summary.generated_today_count ?? summary.generated_today)),
        hint: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()),
        tone: 'today',
      },
      {
        key: 'all_time' as BillCategory,
        label: 'All Time Bills',
        value: String(readNumber(summary.all_time_count ?? summary.all_time)),
        hint: 'Total bills in system',
        tone: 'all',
      },
      {
        key: 'amount_today' as BillCategory,
        label: 'Amount Today',
        value: formatAmount(readNumber(summary.total_amount_today ?? summary.amount_today)),
        hint: `${readNumber(summary.amount_today_count ?? summary.generated_today_count ?? summary.generated_today)} bills`,
        tone: 'amount-today',
      },
      {
        key: 'amount_month' as BillCategory,
        label: 'Amount This Month',
        value: formatAmount(readNumber(summary.total_amount_month ?? summary.amount_month)),
        hint: `${readNumber(summary.amount_month_count ?? 0)} bills`,
        tone: 'amount-month',
      },
    ],
    [summary],
  );

  const paymentModeCards = useMemo(() => {
    const container = readObject(payload.data);
    const breakdownRoot =
      readObject(container.payment_mode_breakdown) ||
      readObject(container.paymentModeBreakdown) ||
      readObject(container.collection_by_payment_mode) ||
      readObject(container.collectionByPaymentMode);

    const modes: PaymentModeKey[] = ['cash', 'upi', 'card', 'bank_transfer', 'other', 'razorpay'];
    const derived = modes.reduce<Record<PaymentModeKey, {
      total: number;
      txns: number;
      passAmount: number;
      passCount: number;
      overtimeAmount: number;
      overtimeCount: number;
    }>>(
      (acc, mode) => {
        acc[mode] = {
          total: 0,
          txns: 0,
          passAmount: 0,
          passCount: 0,
          overtimeAmount: 0,
          overtimeCount: 0,
        };
        return acc;
      },
      {} as Record<PaymentModeKey, {
        total: number;
        txns: number;
        passAmount: number;
        passCount: number;
        overtimeAmount: number;
        overtimeCount: number;
      }>,
    );

    rows.forEach((row) => {
      if (row.payment_status === 'paid') {
        const mode = normalizePaymentMode(row.payment_mode) ?? 'cash';
        derived[mode].passAmount += readNumber(row.bill_base_amount ?? row.pass_price);
        derived[mode].passCount += 1;
        derived[mode].txns += 1;
      }

      if (row.overtime_paid) {
        const overtimeMode = normalizePaymentMode(row.overtime_payment_mode) ?? normalizePaymentMode(row.payment_mode) ?? 'cash';
        derived[overtimeMode].overtimeAmount += readNumber(row.overtime_amount_paid ?? row.bill_overtime_amount ?? row.overtime_charge);
        derived[overtimeMode].overtimeCount += 1;
        derived[overtimeMode].txns += 1;
      }
    });

    return modes.map((mode) => {
      const item = readObject(breakdownRoot[mode]);
      const derivedItem = derived[mode];
      const passAmount = readNumber(item.pass_collection_amount ?? item.pass_amount ?? item.pass_total ?? derivedItem.passAmount);
      const passCount = readNumber(item.pass_collection_count ?? item.pass_count ?? item.pass_txns ?? derivedItem.passCount);
      const overtimeAmount = readNumber(
        item.overtime_collection_amount ?? item.overtime_amount ?? item.overtime_total ?? derivedItem.overtimeAmount,
      );
      const overtimeCount = readNumber(
        item.overtime_collection_count ?? item.overtime_count ?? item.overtime_txns ?? derivedItem.overtimeCount,
      );
      const total = readNumber(item.total_collected ?? item.total_amount ?? item.amount ?? item.total ?? passAmount + overtimeAmount);
      const txns = readNumber(item.transaction_count ?? item.count ?? item.total_txns ?? derivedItem.txns);

      return {
        key: mode,
        label: paymentModeLabel(mode),
        total,
        txns,
        passAmount,
        passCount,
        overtimeAmount,
        overtimeCount,
      };
    });
  }, [payload, rows]);

  function clearFilters() {
    setSearchDraft('');
    setFilters({
      category: 'all',
      status: 'all',
      search: '',
      dateFrom: '',
      dateTo: '',
      sort: 'created_at',
      direction: 'desc',
      perPage: 25,
      page: 1,
    });
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFilters((current) => {
        const normalizedSearch = searchDraft.trim();
        if (current.search === normalizedSearch) return current;
        return {
          ...current,
          search: normalizedSearch,
          page: 1,
        };
      });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchDraft]);

  return (
    <div className="page-stack bill-dashboard-page">
      <section className="bill-summary-grid">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`bill-summary-card ${card.tone} ${filters.category === card.key ? 'active' : ''}`}
            onClick={() => setFilters((current) => ({ ...current, category: card.key, page: 1 }))}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.hint}</small>
          </button>
        ))}
      </section>

      <section className="bill-collection-panel">
        <div className="bill-collection-top">
          <div className="bill-collection-copy">
            <h3>Collection By Payment Mode</h3>
            <p className="muted">Use the real API filters below to inspect payment collection, summary totals, and bill rows together.</p>
          </div>

          <div className="bill-filter-total bill-filter-total-desktop">Filtered Total: {formatAmount(filteredTotal)}</div>
        </div>

        <div className="bill-filters-card">
          <div className="bill-filters-top">
            <strong>Filters</strong>
            <button type="button" className="bill-clear-button" onClick={clearFilters}>
              Clear All
            </button>
          </div>

          <div className="bill-filter-grid">
            <div className="bill-filter-field bill-filter-search">
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search child, parent, branch, booking..."
              />
            </div>

            <div className="bill-filter-field">
              <select
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, category: event.target.value as BillCategory, page: 1 }))
                }
              >
                <option value="all">All Categories</option>
                <option value="pending">Pending</option>
                <option value="generated_today">Generated Today</option>
                <option value="amount_today">Amount Today</option>
                <option value="amount_month">Amount This Month</option>
                <option value="all_time">All Time</option>
              </select>
            </div>

            <div className="bill-filter-field">
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, status: event.target.value as BillStatus, page: 1 }))
                }
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            <div className="bill-filter-field">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value, page: 1 }))}
              />
            </div>

            <div className="bill-filter-field">
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value, page: 1 }))}
              />
            </div>

            <div className="bill-filter-field">
              <select
                value={filters.sort}
                onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as BillSort, page: 1 }))}
              >
                <option value="created_at">Sort: Created</option>
                <option value="amount">Sort: Amount</option>
                <option value="duration">Sort: Duration</option>
                <option value="status">Sort: Status</option>
                <option value="entry_time">Sort: Entry Time</option>
                <option value="exit_time">Sort: Exit Time</option>
              </select>
            </div>

            <div className="bill-filter-field">
              <select
                value={filters.direction}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, direction: event.target.value as BillDirection, page: 1 }))
                }
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>

            <div className="bill-filter-field">
              <select
                value={filters.perPage}
                onChange={(event) => setFilters((current) => ({ ...current, perPage: Number(event.target.value), page: 1 }))}
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
              </select>
            </div>

          </div>
        </div>

        <div className="bill-mode-grid">
          {paymentModeCards.map((card) => (
            <article key={card.key} className="bill-mode-card">
              <div className="bill-mode-header">
                <span>{card.label}</span>
                <small>{card.txns} txns</small>
              </div>

              <strong>{formatAmount(card.total)}</strong>

              <div className="bill-mode-breakdown">
                <div className="bill-mode-row">
                  <div>
                    <span>Pass Collection</span>
                    <small>{card.passCount} pass txns</small>
                  </div>
                  <strong>{formatAmount(card.passAmount)}</strong>
                </div>

                <div className="bill-mode-row">
                  <div>
                    <span>Overtime Collection</span>
                    <small>{card.overtimeCount} overtime txns</small>
                  </div>
                  <strong>{formatAmount(card.overtimeAmount)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section ref={billsSectionRef} className="bill-table-panel">
        <div className="bill-table-top">
          <div>
            <p className="muted">
              {from && to ? `Showing ${from} to ${to} of ${totalRows || rows.length} bills` : `${rows.length} bills loaded`}
            </p>
          </div>
          <strong className="bill-branch-label">{branchLabel}</strong>
        </div>

        {query.isError ? (
          <StatusBanner
            tone="danger"
            message={query.error instanceof Error ? query.error.message : 'Could not load bill dashboard data.'}
          />
        ) : null}

        <div className="bill-table">
          <div className="bill-table-head">
            <span>Bill</span>
            <span>Guest</span>
            <span>Duration</span>
            <span>Amount</span>
            <span>Payment</span>
            <span>Status</span>
            <span>Generated</span>
          </div>

          <div className="bill-table-body">
            {rows.map((item, index) => {
              const billCode = `WIB-${readString(item.id).slice(0, 8).toUpperCase()}`;
              const customer =
                readString(item.child_name) ||
                readString(item.parent_name) ||
                readString(item.customer_name) ||
                'Walk-In Guest';
              const amount = readNumber(item.bill_total_amount ?? item.pass_price);
              const billStatus = getBillStatus(item);
              const paymentLabel =
                item.payment_status === 'paid'
                  ? `${readString(item.payment_mode || 'cash').toUpperCase()}${item.overtime_paid ? ' + OT' : ''}`
                  : 'Pending';

              return (
                <div key={`${billCode}-${index}`} className="bill-table-row">
                  <span className="bill-code-cell">{billCode}</span>
                  <span className="bill-guest-cell">
                    <strong>{customer}</strong>
                    <small>{readString(item.parent_name) || readString(item.customer_name) || '-'}</small>
                  </span>
                  <span>{formatMinutes(item.expected_duration_minutes)}</span>
                  <span className="bill-amount-cell">{formatAmount(amount)}</span>
                  <span>{paymentLabel}</span>
                  <span>
                    <span className={`bill-status-chip ${billStatus.tone}`}>{billStatus.label}</span>
                  </span>
                  <span>{formatDateTime(item.issued_at || item.created_at)}</span>
                </div>
              );
            })}

            {!query.isLoading && !rows.length ? (
              <div className="bill-empty-state">
                <p className="muted">No bills found for the current filters.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="bill-table-footer">
          <span>
            Page {currentPage} of {lastPage}
          </span>
          <div className="bill-pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={currentPage <= 1 || query.isFetching}
              onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={currentPage >= lastPage || query.isFetching}
              onClick={() => setFilters((current) => ({ ...current, page: Math.min(lastPage, current.page + 1) }))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
