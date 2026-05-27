import { useMemo, useRef, useState } from 'react';
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
type QuickFilterKey = 'all_time' | 'pending' | 'today' | 'this_month';

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

function paymentModeLabel(mode: PaymentModeKey) {
  if (mode === 'upi') return 'UPI';
  if (mode === 'bank_transfer') return 'Bank Transfer';
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function normalizeModeLabel(value: unknown) {
  return readString(value).toLowerCase().replace(/[\s_-]/g, '');
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

const defaultFilters = {
  category: 'amount_today' as BillCategory,
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
};

function getQuickFilterKey(category: BillCategory): QuickFilterKey {
  if (category === 'pending') return 'pending';
  if (category === 'amount_month') return 'this_month';
  if (category === 'generated_today' || category === 'amount_today') return 'today';
  return 'all_time';
}

function getCategoryForQuickFilter(key: QuickFilterKey): BillCategory {
  if (key === 'pending') return 'pending';
  if (key === 'this_month') return 'amount_month';
  if (key === 'today') return 'generated_today';
  return 'all_time';
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

  const [isFilterViewOpen, setIsFilterViewOpen] = useState(false);
  const [filterDrafts, setFilterDrafts] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);

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
        label: 'Pending',
        value: String(readNumber(summary.pending)),
        hint: 'Awaiting exit',
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
        hint: 'Every bill',
        tone: 'all',
      },
      {
        key: 'amount_today' as BillCategory,
        label: 'Total Amount Today',
        value: formatAmount(amountTodayTotal),
        hint: `${readNumber(summary.amount_today_count)} bills`,
        tone: 'amount-today',
      },
      {
        key: 'amount_month' as BillCategory,
        label: 'Total Amount Month',
        value: formatAmount(amountMonthTotal),
        hint: new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date()),
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
      return {
        key: mode,
        label: readString(item.label) || paymentModeLabel(mode),
        total: readNumber(
          item.total_collected ??
            item.collection_total ??
            item.total_collection ??
            item.total_amount ??
            item.amount ??
            item.value ??
            item.total ??
            derivedItem.total,
        ),
        txns: readNumber(item.transactions ?? item.transaction_count ?? item.txns ?? item.count ?? item.total_txns ?? derivedItem.txns),
        passAmount: readNumber(item.pass_collection_amount ?? item.pass_collection ?? item.pass_amount ?? item.pass_total ?? derivedItem.passAmount),
        passCount: readNumber(item.pass_transactions ?? item.pass_collection_count ?? item.pass_count ?? item.pass_txns ?? derivedItem.passCount),
        overtimeAmount: readNumber(
          item.overtime_collection_amount ?? item.overtime_collection ?? item.overtime_amount ?? item.overtime_total ?? derivedItem.overtimeAmount,
        ),
        overtimeCount: readNumber(
          item.overtime_transactions ?? item.overtime_collection_count ?? item.overtime_count ?? item.overtime_txns ?? derivedItem.overtimeCount,
        ),
      };
    });
  }, [dataContainer, rows]);

  function showAllBills() {
    const nextFilters: typeof defaultFilters = {
      ...defaultFilters,
      category: 'all_time',
    };
    setIsFilterViewOpen(true);
    setFilterDrafts(nextFilters);
    setFilters(nextFilters);
  }

  function openFilterView(category: BillCategory) {
    setIsFilterViewOpen(true);
    setFilterDrafts((current) => ({ ...current, category, page: 1 }));
    setFilters((current) => ({ ...current, category, page: 1 }));
  }

  function applyDashboardCollectionFilter() {
    setFilters((current) => ({ ...current, category: filterDrafts.category, page: 1 }));
  }

  function applyFilters() {
    setFilters({ ...filterDrafts, page: 1 });
  }

  function resetFilters() {
    setFilterDrafts(defaultFilters);
    setFilters(defaultFilters);
    setIsFilterViewOpen(false);
  }

  const activeQuickFilter = getQuickFilterKey(filters.category);
  const quickFilters: Array<{ key: QuickFilterKey; label: string }> = [
    { key: 'all_time', label: 'All Time' },
    { key: 'pending', label: 'Pending' },
    { key: 'today', label: 'Today' },
    { key: 'this_month', label: 'This Month' },
  ];

  return (
    <div className="page-stack bill-dashboard-page">
      <section className="bill-dashboard-hero">
        <div>
          <h2>Bill Dashboard</h2>
          <p>Payment-mode collection details for the selected filter.</p>
        </div>
        <button type="button" className="bill-show-button" onClick={showAllBills}>
          Show All Bills
        </button>
      </section>

      <section className="bill-summary-grid">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`bill-summary-card ${card.tone} ${filters.category === card.key ? 'active' : ''}`}
            onClick={() => openFilterView(card.key)}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.hint}</small>
          </button>
        ))}
      </section>

      {!isFilterViewOpen ? (
        <section className="bill-collection-panel">
          <div className="bill-collection-top">
            <div className="bill-collection-copy">
              <h3>Collection By Payment Mode</h3>
              <p className="muted">Detailed today totals by Cash, UPI, Card, Bank Transfer, Other, and Razorpay.</p>
            </div>

            <div className="bill-filter-strip">
              <div className="bill-filter-field">
                <select
                  value={filterDrafts.category}
                  onChange={(event) => setFilterDrafts((current) => ({ ...current, category: event.target.value as BillCategory }))}
                >
                  <option value="amount_today">Today</option>
                  <option value="amount_month">This Month</option>
                  <option value="all_time">All Time</option>
                </select>
              </div>
              <button type="button" className="bill-filter-button" onClick={applyDashboardCollectionFilter}>
                Filter
              </button>
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
                      <span>Pass collection</span>
                      <small>{card.passCount} pass txns</small>
                    </div>
                    <strong>{formatAmount(card.passAmount)}</strong>
                  </div>
                  <div className="bill-mode-row">
                    <div>
                      <span>Overtime collection</span>
                      <small>{card.overtimeCount} overtime txns</small>
                    </div>
                    <strong>{formatAmount(card.overtimeAmount)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="bill-collection-panel">
            <div className="bill-collection-copy">
              <h3>Bills Filters</h3>
              <p className="muted">Use the summary cards or quick buttons below to switch between Pending, Today, All Time, and This Month.</p>
            </div>

            <div className="bill-filters-layout">
              <label className="bill-filter-field bill-filter-search">
                <span>Search</span>
                <input
                  type="text"
                  value={filterDrafts.search}
                  onChange={(event) => setFilterDrafts((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Bill, customer, phone, child, branch, Razorpay ID"
                />
              </label>

              <label className="bill-filter-field">
                <span>Status</span>
                <select
                  value={filterDrafts.status}
                  onChange={(event) => setFilterDrafts((current) => ({ ...current, status: event.target.value as BillStatus }))}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="expired">Expired</option>
                </select>
              </label>

              <label className="bill-filter-field">
                <span>Collection</span>
                <select
                  value={filterDrafts.category}
                  onChange={(event) => setFilterDrafts((current) => ({ ...current, category: event.target.value as BillCategory }))}
                >
                  <option value="amount_today">Pass + Overtime</option>
                  <option value="generated_today">Generated Today</option>
                  <option value="pending">Pending</option>
                  <option value="all_time">All Time</option>
                  <option value="amount_month">This Month</option>
                </select>
              </label>

              <label className="bill-filter-field">
                <span>From</span>
                <input
                  type="date"
                  value={filterDrafts.dateFrom}
                  onChange={(event) => setFilterDrafts((current) => ({ ...current, dateFrom: event.target.value }))}
                />
              </label>

              <label className="bill-filter-field">
                <span>To</span>
                <input
                  type="date"
                  value={filterDrafts.dateTo}
                  onChange={(event) => setFilterDrafts((current) => ({ ...current, dateTo: event.target.value }))}
                />
              </label>
              <div className="bill-filter-actions">
                <button type="button" className="secondary-button" onClick={() => setIsFilterViewOpen(false)}>
                  Dashboard
                </button>
                <button type="button" className="secondary-button" onClick={resetFilters}>
                  Reset
                </button>
                <button type="button" className="primary-button" onClick={applyFilters}>
                  Apply Filters
                </button>
              </div>
            </div>

            <div className="bill-quick-filters">
              {quickFilters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`bill-quick-filter ${activeQuickFilter === item.key ? 'active' : ''}`}
                  onClick={() => openFilterView(getCategoryForQuickFilter(item.key))}
                >
                  {item.label}
                </button>
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
        </>
      )}
    </div>
  );
}
