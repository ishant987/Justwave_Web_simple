import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import type { BillDashboardQueryParams, BillDashboardResponse, EntryExitLog } from '../types/entryExit';

type PaymentModeKey = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other' | 'razorpay';
type BillCategory = NonNullable<BillDashboardQueryParams['category']>;
type BillStatus = 'all' | 'pending' | 'completed' | 'active' | 'expired';
type BillSort = 'bill' | 'created_at' | 'amount' | 'duration' | 'status' | 'entry_time' | 'exit_time';
type BillDirection = 'asc' | 'desc';

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readOptionalObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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

function normalizeModeLabel(value: unknown) {
  return readString(value).toLowerCase().replace(/[\s_-]/g, '');
}

function getBillStatusTone(row: EntryExitLog): BillStatus {
  if (row.pass_lifecycle_status === 'used_checked_out' || row.actual_exit_time) {
    return 'completed';
  }
  if (row.pass_lifecycle_status === 'claimed_inside' || row.entry_time) {
    return 'active';
  }
  if (row.pass_lifecycle_status === 'expired') {
    return 'expired';
  }
  return 'pending';
}

function getApiBillAmount(row: EntryExitLog) {
  const raw = readObject(row);
  const collectedPassAmount = row.payment_status === 'paid' ? readNumber(row.bill_base_amount ?? row.pass_price) : 0;
  const collectedOvertimeAmount = row.overtime_paid
    ? readNumber(row.overtime_amount_paid ?? row.bill_overtime_amount ?? row.overtime_charge)
    : 0;
  const collectedFallback = collectedPassAmount + collectedOvertimeAmount;

  return readNumber(
    raw.collected_bill_total ??
      raw.collected_total ??
      raw.total_collection ??
      raw.total_amount ??
      (collectedFallback > 0 ? collectedFallback : undefined) ??
      row.bill_total_amount ??
      row.pass_price,
  );
}

function isTodayBill(row: EntryExitLog) {
  const source = row.created_at || row.issued_at;
  if (!source) return false;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function normalizePaymentMode(value?: string | null): PaymentModeKey | null {
  if (value === 'cash' || value === 'upi' || value === 'card' || value === 'bank_transfer' || value === 'other' || value === 'razorpay') {
    return value;
  }
  return null;
}

function readPaymentModeBreakdown(data: Record<string, unknown>, mode: PaymentModeKey) {
  const root =
    data.payment_mode_breakdown ??
    data.paymentModeBreakdown ??
    data.collection_by_payment_mode ??
    data.collectionByPaymentMode ??
    data.payment_modes ??
    data.paymentModes ??
    data.collection_breakdown;

  if (Array.isArray(root)) {
    const item = root.find((candidate) => {
      const object = readObject(candidate);
      const normalizedMode = normalizeModeLabel(mode);
      return (
        object.mode === mode ||
        object.payment_mode === mode ||
        object.key === mode ||
        normalizeModeLabel(object.label) === normalizedMode ||
        normalizeModeLabel(object.name) === normalizedMode
      );
    });
    return readObject(item);
  }

  const rootObject = readObject(root);
  return readObject(
    rootObject[mode] ??
      rootObject[paymentModeLabel(mode)] ??
      rootObject[paymentModeLabel(mode).toLowerCase()] ??
      rootObject[normalizeModeLabel(paymentModeLabel(mode))],
  );
}

function buildBillDashboardParams(params: {
  category: BillCategory;
  status: BillStatus;
  search: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  sort: BillSort;
  direction: BillDirection;
  perPage: number;
  page: number;
}): BillDashboardQueryParams {
  return {
    category: params.category,
    status: params.status,
    search: params.search.trim(),
    date_from: params.dateFrom,
    date_to: params.dateTo,
    amount_min: params.amountMin,
    amount_max: params.amountMax,
    sort: params.sort,
    direction: params.direction,
    per_page: params.perPage,
    page: params.page,
  };
}

export function BillDashboardPage() {
  const { token } = useAuth();
  const billsSectionRef = useRef<HTMLElement | null>(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [filters, setFilters] = useState({
    category: 'all_time' as BillCategory,
    status: 'all' as BillStatus,
    search: '',
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
    sort: 'created_at' as BillSort,
    direction: 'desc' as BillDirection,
    perPage: 15,
    page: 1,
  });

  const billDashboardParams = useMemo(() => buildBillDashboardParams(filters), [filters]);

  const query = useQuery({
    queryKey: ['bill-dashboard', billDashboardParams],
    queryFn: () => entryExitApi.getBillDashboard(token!, billDashboardParams),
    enabled: !!token,
  });

  const payload = useMemo(() => (query.data ?? {}) as BillDashboardResponse, [query.data]);
  const dataContainer = readObject(payload.data);
  const summary = payload.data?.summary ?? {};
  const billsContainer = readObject(payload.data?.bills);
  const meta = readObject(billsContainer.meta);
  const rows = useMemo(() => readArray<EntryExitLog>(billsContainer.data), [billsContainer]);
  const filteredTotal = readNumber(
    dataContainer.collected_filtered_total ??
      dataContainer.filtered_collection_total ??
      dataContainer.total_collection ??
      dataContainer.total_amount ??
      payload.data?.filtered_total,
  );
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
  const summaryObject = readObject(summary);
  const collectedRowsTotal = rows.reduce((sum, row) => sum + getApiBillAmount(row), 0);
  const collectedTodayRowsTotal = rows.filter(isTodayBill).reduce((sum, row) => sum + getApiBillAmount(row), 0);
  const amountTodayTotal = readNumber(
    dataContainer.collected_amount_today ??
      dataContainer.amount_today_collected ??
      summaryObject.collected_amount_today ??
      summaryObject.amount_today_collected ??
      (filters.category === 'amount_today' ? collectedRowsTotal || filteredTotal : undefined) ??
      (collectedTodayRowsTotal || undefined) ??
      summary.amount_today,
  );
  const amountMonthTotal = readNumber(
    dataContainer.collected_amount_month ??
      dataContainer.amount_month_collected ??
      summaryObject.collected_amount_month ??
      summaryObject.amount_month_collected ??
      (filters.category === 'amount_month' ? collectedRowsTotal || filteredTotal : undefined) ??
      summary.amount_month,
  );

  const summaryCards = useMemo(
    () => [
      {
        key: 'pending' as BillCategory,
        label: 'Pending Bills',
        value: String(readNumber(summary.pending)),
        hint: 'Awaiting exit completion',
        tone: 'pending',
      },
      {
        key: 'generated_today' as BillCategory,
        label: 'Generated Today',
        value: String(readNumber(summary.generated_today)),
        hint: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()),
        tone: 'today',
      },
      {
        key: 'all_time' as BillCategory,
        label: 'All Time Bills',
        value: String(readNumber(summary.all_time)),
        hint: 'Total bills in system',
        tone: 'all',
      },
      {
        key: 'amount_today' as BillCategory,
        label: 'Amount Today',
        value: formatAmount(amountTodayTotal),
        hint: `${readNumber(summary.amount_today_count)} bills`,
        tone: 'amount-today',
      },
      {
        key: 'amount_month' as BillCategory,
        label: 'Amount This Month',
        value: formatAmount(amountMonthTotal),
        hint: `${readNumber(summary.amount_month_count ?? 0)} bills`,
        tone: 'amount-month',
      },
    ],
    [amountMonthTotal, amountTodayTotal, summary],
  );

  const paymentModeCards = useMemo(() => {
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
        const passAmount = readNumber(row.bill_base_amount ?? row.pass_price);
        const splits = Array.isArray(row.payment_splits) ? row.payment_splits : [];

        if (splits.length) {
          splits.forEach((split) => {
            const mode = normalizePaymentMode(split.mode);
            if (!mode) return;
            const amount = readNumber(split.amount);
            derived[mode].passAmount += amount;
            derived[mode].total += amount;
            derived[mode].passCount += 1;
            derived[mode].txns += 1;
          });
        } else {
          const mode = normalizePaymentMode(row.payment_mode) ?? 'cash';
          derived[mode].passAmount += passAmount;
          derived[mode].total += passAmount;
          derived[mode].passCount += 1;
          derived[mode].txns += 1;
        }
      }

      if (row.overtime_paid) {
        const mode = normalizePaymentMode(row.overtime_payment_mode) ?? normalizePaymentMode(row.payment_mode) ?? 'cash';
        const amount = readNumber(row.overtime_amount_paid ?? row.bill_overtime_amount ?? row.overtime_charge);
        derived[mode].overtimeAmount += amount;
        derived[mode].total += amount;
        derived[mode].overtimeCount += 1;
        derived[mode].txns += 1;
      }
    });

    return modes.map((mode) => {
      const item = readPaymentModeBreakdown(dataContainer, mode);
      const derivedItem = derived[mode];
      const total = readNumber(
        item.total_collected ??
          item.collection_total ??
          item.total_collection ??
          item.total_amount ??
          item.amount ??
          item.value ??
          item.total ??
          derivedItem.total,
      );
      const txns = readNumber(item.transactions ?? item.transaction_count ?? item.txns ?? item.count ?? item.total_txns ?? derivedItem.txns);
      const passAmount = readNumber(
        item.pass_collection_amount ??
          item.pass_collection ??
          item.pass_amount ??
          item.pass_total ??
          derivedItem.passAmount,
      );
      const passCount = readNumber(
        item.pass_transactions ?? item.pass_collection_count ?? item.pass_count ?? item.pass_txns ?? derivedItem.passCount,
      );
      const overtimeAmount = readNumber(
        item.overtime_collection_amount ??
          item.overtime_collection ??
          item.overtime_amount ??
          item.overtime_total ??
          derivedItem.overtimeAmount,
      );
      const overtimeCount = readNumber(
        item.overtime_transactions ??
          item.overtime_collection_count ??
          item.overtime_count ??
          item.overtime_txns ??
          derivedItem.overtimeCount,
      );

      return {
        key: mode,
        label: readString(item.label) || paymentModeLabel(mode),
        total,
        txns,
        passAmount,
        passCount,
        overtimeAmount,
        overtimeCount,
      };
    });
  }, [dataContainer, rows]);

  function clearFilters() {
    setSearchDraft('');
    setFilters({
      category: 'all_time',
      status: 'all',
      search: '',
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      sort: 'created_at',
      direction: 'desc',
      perPage: 15,
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
            <h3>Bill Dashboard</h3>
            <p className="muted">Filters call the bill dashboard API and display the totals and bill rows returned by the backend.</p>
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
                <option value="all_time">All Time</option>
                <option value="pending">Pending</option>
                <option value="generated_today">Generated Today</option>
                <option value="amount_today">Amount Today</option>
                <option value="amount_month">Amount This Month</option>
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
              <input
                type="number"
                min="0"
                value={filters.amountMin}
                onChange={(event) => setFilters((current) => ({ ...current, amountMin: event.target.value, page: 1 }))}
                placeholder="Min amount"
              />
            </div>

            <div className="bill-filter-field">
              <input
                type="number"
                min="0"
                value={filters.amountMax}
                onChange={(event) => setFilters((current) => ({ ...current, amountMax: event.target.value, page: 1 }))}
                placeholder="Max amount"
              />
            </div>

            <div className="bill-filter-field">
              <select
                value={filters.sort}
                onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as BillSort, page: 1 }))}
              >
                <option value="created_at">Sort: Created</option>
                <option value="bill">Sort: Bill</option>
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
                <option value={15}>15 rows</option>
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
              const amount = getApiBillAmount(item);
              const billStatusTone = getBillStatusTone(item);
              const billStatusLabel = item.pass_lifecycle_label || billStatusTone.replace('_', ' ');
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
                    <span className={`bill-status-chip ${billStatusTone}`}>{billStatusLabel}</span>
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
