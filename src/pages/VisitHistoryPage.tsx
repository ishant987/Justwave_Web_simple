import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { entryExitApi } from '../api/entryExitApi';
import { useAuth } from '../hooks/useAuth';
import { StatusBanner } from '../components/StatusBanner';
import type { EntryExitLog, OvertimeSettlementItem, PaymentMode } from '../types/entryExit';
import { buildPassPrintDocument } from '../utils/passPrint';
import {
  formatAmount,
  formatAmountCompact,
  formatDateTime,
  formatDate,
  formatTime,
  formatDurationLabel,
} from '../utils/formatters';
import {
  normalizeListResponse,
  normalizeText,
  normalizePhone,
  readNumber,
  readString,
} from '../utils/normalization';

function extractCustomerPhone(
  payload: { data?: { phone?: string | null } } | { phone?: string | null } | undefined,
) {
  if (!payload) return '';
  if ('data' in payload && payload.data?.phone) return payload.data.phone;
  if ('phone' in payload && payload.phone) return payload.phone;
  return '';
}

function buildPassSearchValue(row: EntryExitLog | null) {
  if (!row) return '';
  return row.booking_id || row.child_id || row.child_name || row.parent_name || row.customer_name || row.id || '';
}

function matchesVisitSearch(row: EntryExitLog, searchTerm: string) {
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return true;

  const searchableValues = [row.child_name, row.customer_name, row.parent_name, row.phone, row.booking_id, row.id].map(normalizeText);
  const matchesText = searchableValues.some((value) => value.includes(normalizedSearch));

  const phoneSearch = normalizePhone(searchTerm);
  const matchesPhone = phoneSearch ? normalizePhone(row.phone).includes(phoneSearch) : false;

  return matchesText || matchesPhone;
}

function shouldApplyLocalVisitSearch(row: EntryExitLog, searchTerm: string) {
  const phoneSearch = normalizePhone(searchTerm);
  if (!phoneSearch) return true;
  return Boolean(normalizePhone(row.phone));
}

function isPaymentCompleted(row?: EntryExitLog | null) {
  if (!row) return false;
  return row.payment_status?.toLowerCase() === 'paid' || Boolean(row.paid_at);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printHtmlDocument(html: string) {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      iframe.remove();
      reject(new Error('Could not prepare print view. Please try again.'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 400);
    };

    const triggerPrint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
      resolve();
    };

    if (doc.readyState === 'complete') {
      window.setTimeout(triggerPrint, 150);
      return;
    }

    iframe.onload = () => window.setTimeout(triggerPrint, 150);
  });
}

function getTodayDateInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getPassTimingRange(row: EntryExitLog) {
  const from = row.entry_time || row.issued_at || row.created_at;
  const to = row.booked_exit_time || row.effective_booked_exit_time || row.pass_expires_at;

  return { from, to };
}

function getEntryExitRange(row: EntryExitLog) {
  const from = row.entry_time;
  const to = row.actual_exit_time;

  return { from, to };
}

function formatTimingRange(from?: string | null, to?: string | null) {
  if (from && to) return `${formatTime(from)} - ${formatTime(to)}`;
  if (from) return formatTime(from);
  if (to) return formatTime(to);
  return '-';
}

function formatTimingDate(from?: string | null, to?: string | null) {
  return formatDate(from || to);
}

function formatValidTillDisplay(to?: string | null) {
  if (!to) return '-';
  return `${formatTime(to)} (${formatDate(to)})`;
}

function findMatchingPassDetails(candidates: EntryExitLog[], row: EntryExitLog | null) {
  if (!row) return null;

  return (
    candidates.find((item) => item.id === row.id) ||
    candidates.find((item) => item.booking_id && row.booking_id && item.booking_id === row.booking_id) ||
    candidates.find((item) => item.child_id && row.child_id && item.child_id === row.child_id) ||
    candidates.find((item) => item.child_name && row.child_name && item.child_name === row.child_name) ||
    candidates.find((item) => item.parent_name && row.parent_name && item.parent_name === row.parent_name) ||
    candidates.find((item) => item.customer_name && row.customer_name && item.customer_name === row.customer_name) ||
    candidates[0] ||
    null
  );
}

function hasGraceExpired(row: EntryExitLog) {
  if (!row.booked_exit_time || row.actual_exit_time) return false;

  const bookedExit = new Date(row.booked_exit_time);
  if (Number.isNaN(bookedExit.getTime())) return false;

  const graceMinutes = readNumber(row.grace_minutes);
  return Date.now() > bookedExit.getTime() + graceMinutes * 60 * 1000;
}

function getVisitStatus(row: EntryExitLog) {
  if (row.pass_lifecycle_status === 'used_checked_out') {
    return {
      label: 'Checked Out',
      tone: 'success',
    };
  }

  if (row.pass_lifecycle_status === 'claimed_inside') {
    return {
      label: 'Inside',
      tone: 'info',
    };
  }

  if (row.actual_exit_time) {
    return {
      label: 'Checked Out',
      tone: 'success',
    };
  }

  if (row.entry_time) {
    return {
      label: 'Inside',
      tone: 'info',
    };
  }

  return {
    label: 'Pass Issued',
    tone: 'warning',
  };
}

export function VisitHistoryPage() {
  const { token } = useAuth();
  const rowsPerPage = 25;
  const visitDateInputRef = useRef<HTMLInputElement | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeSearchFilter, setActiveSearchFilter] = useState('');
  const [visitDateFilter, setVisitDateFilter] = useState(() => getTodayDateInputValue());
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass_issued' | 'inside' | 'checked_out'>('all');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'settled' | 'due' | 'none'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPass, setSelectedPass] = useState<EntryExitLog | null>(null);
  const [selectedPassQr, setSelectedPassQr] = useState('');
  const [printMessage, setPrintMessage] = useState('');
  const [printMessageTone, setPrintMessageTone] = useState<'success' | 'warning'>('success');
  const [settlementRow, setSettlementRow] = useState<EntryExitLog | null>(null);
  const [settlementMessage, setSettlementMessage] = useState('');
  const [settlementLookupPhone, setSettlementLookupPhone] = useState('');
  const [settlementPaymentModeById, setSettlementPaymentModeById] = useState<Record<string, PaymentMode>>({});
  const [showAllSettlementKids, setShowAllSettlementKids] = useState(false);

  const visitHistoryQuery = useMemo(() => {
    const params = new URLSearchParams({ per_page: '50' });
    if (activeSearchFilter) {
      params.set('search', activeSearchFilter);
    }
    return params.toString();
  }, [activeSearchFilter]);

  const query = useQuery({
    queryKey: ['visit-history', visitHistoryQuery],
    queryFn: () => entryExitApi.getVisitHistory(token!, visitHistoryQuery),
    enabled: !!token,
  });

  const selectedPassSearch = useMemo(() => buildPassSearchValue(selectedPass), [selectedPass]);
  const settlementPassSearch = useMemo(() => buildPassSearchValue(settlementRow), [settlementRow]);

  const selectedPassCustomerQuery = useQuery({
    queryKey: ['visit-history-selected-pass-customer', selectedPass?.customer_id],
    queryFn: () => entryExitApi.getCustomer(token!, selectedPass?.customer_id || ''),
    enabled: !!token && !!selectedPass?.customer_id,
  });

  const selectedPassQuery = useQuery({
    queryKey: ['visit-history-selected-pass-details', selectedPassSearch],
    queryFn: () => entryExitApi.listPasses(token!, `search=${encodeURIComponent(selectedPassSearch)}&per_page=10`),
    enabled: !!token && !!selectedPassSearch,
  });

  const settlementCustomerQuery = useQuery({
    queryKey: ['visit-history-customer', settlementRow?.customer_id],
    queryFn: () => entryExitApi.getCustomer(token!, settlementRow?.customer_id || ''),
    enabled: !!token && !!settlementRow?.customer_id,
  });

  const settlementPassQuery = useQuery({
    queryKey: ['visit-history-pass-details', settlementPassSearch],
    queryFn: () => entryExitApi.listPasses(token!, `search=${encodeURIComponent(settlementPassSearch)}&per_page=10`),
    enabled: !!token && !!settlementPassSearch,
  });

  const selectedPassDetails = useMemo(
    () => findMatchingPassDetails(normalizeListResponse(selectedPassQuery.data), selectedPass),
    [selectedPassQuery.data, selectedPass],
  );
  const settlementPassDetails = useMemo(
    () => findMatchingPassDetails(normalizeListResponse(settlementPassQuery.data), settlementRow),
    [settlementPassQuery.data, settlementRow],
  );
  const selectedPassCustomerPhone = useMemo(() => extractCustomerPhone(selectedPassCustomerQuery.data), [selectedPassCustomerQuery.data]);
  const settlementCustomerPhone = useMemo(() => extractCustomerPhone(settlementCustomerQuery.data), [settlementCustomerQuery.data]);

  const rows = useMemo(() => normalizeListResponse<EntryExitLog>(query.data), [query.data]);
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const searchTerm = activeSearchFilter.trim();
      const status = getVisitStatus(row);
      const overtimeMinutes = readNumber(row.overtime_minutes);
      const overtimeCharge = readNumber(row.overtime_charge);
      const overtimeBillAmount = readNumber(row.bill_overtime_amount);
      const overtimePaidAmount = readNumber(row.overtime_amount_paid);
      const overtimeAmount = overtimeCharge || overtimeBillAmount || overtimePaidAmount;
      const graceExpired = hasGraceExpired(row);
      const overtimeDue =
        !row.overtime_paid &&
        (overtimeMinutes > 0 || overtimeAmount > 0 || (graceExpired && row.pass_lifecycle_status === 'claimed_inside'));
      const visitDateSource = row.entry_time || row.issued_at || row.created_at || row.booked_exit_time || '';
      const visitDate = visitDateSource ? new Date(visitDateSource) : null;
      const visitDateValue =
        visitDate && !Number.isNaN(visitDate.getTime())
          ? `${visitDate.getFullYear()}-${String(visitDate.getMonth() + 1).padStart(2, '0')}-${String(visitDate.getDate()).padStart(2, '0')}`
          : '';

      if (shouldApplyLocalVisitSearch(row, searchTerm) && !matchesVisitSearch(row, searchTerm)) {
        return false;
      }

      if (visitDateFilter && visitDateValue !== visitDateFilter) {
        return false;
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'pass_issued' && status.label !== 'Pass Issued') return false;
        if (statusFilter === 'inside' && status.label !== 'Inside') return false;
        if (statusFilter === 'checked_out' && status.label !== 'Checked Out') return false;
      }

      if (settlementFilter !== 'all') {
        if (settlementFilter === 'settled' && !row.overtime_paid) return false;
        if (settlementFilter === 'due' && !overtimeDue) return false;
        if (settlementFilter === 'none' && (row.overtime_paid || overtimeDue)) return false;
      }

      return true;
    });
  }, [activeSearchFilter, rows, settlementFilter, statusFilter, visitDateFilter]);
  const settlementTicketsQuery = useQuery({
    queryKey: ['visit-history-settlement-tickets', settlementLookupPhone],
    queryFn: () => entryExitApi.getOvertimeSettlements(token!, settlementLookupPhone),
    enabled: !!token && !!settlementLookupPhone,
  });
  const settlementTickets = useMemo(() => {
    const tickets = normalizeListResponse<OvertimeSettlementItem>(settlementTicketsQuery.data);
    if (!settlementRow || showAllSettlementKids) return tickets;

    return tickets.filter((item) => {
      if (settlementRow.child_id) return item.child_id === settlementRow.child_id;
      if (settlementRow.child_name) return item.child_name === settlementRow.child_name;
      return item.id === settlementRow.id;
    });
  }, [settlementRow, settlementTicketsQuery.data, showAllSettlementKids]);

  const settlementMutation = useMutation({
    mutationFn: ({ id, paymentMode }: { id: string; paymentMode: PaymentMode }) => {
      if (!id) {
        throw new Error('No overtime settlement selected.');
      }
      return entryExitApi.settleOvertime(token!, id, paymentMode);
    },
    onSuccess: async (response) => {
      setSettlementMessage(response.message || 'Overtime settled.');
      await settlementTicketsQuery.refetch();
      await query.refetch();
    },
  });

  const printPassMutation = useMutation({
    mutationFn: (pass: EntryExitLog) => entryExitApi.recordPrint(token!, [pass.id]),
    onSuccess: async (response) => {
      if (selectedPass) {
        const nextPrintCount = response.print_counts?.[selectedPass.id] ?? readNumber(selectedPass.print_count) + 1;
        setSelectedPass({
          ...selectedPass,
          print_count: nextPrintCount,
        });
        setPrintMessageTone('success');
        setPrintMessage(`Printed ${nextPrintCount}x.`);
      }
      await query.refetch();
    },
  });

  function clearFilters() {
    setSearchFilter('');
    setActiveSearchFilter('');
    setVisitDateFilter(getTodayDateInputValue());
    setStatusFilter('all');
    setSettlementFilter('all');
    setCurrentPage(1);
  }

  const totalCount = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, rowsPerPage, safeCurrentPage]);
  const showingFrom = totalCount ? (safeCurrentPage - 1) * rowsPerPage + 1 : 0;
  const showingTo = totalCount ? Math.min(safeCurrentPage * rowsPerPage, totalCount) : 0;

  useEffect(() => {
    const normalized = searchFilter.trim();

    if (normalized.length === 0) {
      setActiveSearchFilter('');
      return;
    }

    if (normalized.length < 2) {
      setActiveSearchFilter('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveSearchFilter(normalized);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [searchFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeSearchFilter, visitDateFilter, statusFilter, settlementFilter]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  useEffect(() => {
    let cancelled = false;

    async function buildQR() {
      if (!selectedPass) {
        setSelectedPassQr('');
        return;
      }

      const dataUrl = await QRCode.toDataURL(selectedPass.id, {
        margin: 1,
        width: 220,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      if (!cancelled) {
        setSelectedPassQr(dataUrl);
      }
    }

    void buildQR();

    return () => {
      cancelled = true;
    };
  }, [selectedPass]);

  useEffect(() => {
    if (!settlementRow) return;

    const resolvedPhone = settlementCustomerPhone || settlementRow.phone || settlementPassDetails?.phone || '';
    setSettlementLookupPhone(resolvedPhone);
    setSettlementPaymentModeById({});
  }, [settlementCustomerPhone, settlementPassDetails?.phone, settlementRow]);

  useEffect(() => {
    if (!settlementRow) {
      setShowAllSettlementKids(false);
    }
  }, [settlementRow]);

  useEffect(() => {
    setPrintMessage('');
    setPrintMessageTone('success');
    printPassMutation.reset();
  }, [selectedPass?.id]);

  async function printSelectedPass(pass: EntryExitLog) {
    const qrSrc =
      selectedPassQr ||
      (await QRCode.toDataURL(pass.id, {
        margin: 1,
        width: 220,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      }));
    const nextPrintCount = readNumber(pass.print_count) + 1;
    const resolvedPass = selectedPassDetails || pass;
    const amount = formatAmountCompact(resolvedPass.bill_total_amount ?? resolvedPass.pass_price ?? 0);
    const durationLabel = formatDurationLabel(resolvedPass.expected_duration_minutes);
    const guardianName = resolvedPass.parent_name || resolvedPass.customer_name || '-';
    const phone = selectedPassCustomerPhone || resolvedPass.phone || pass.phone || '-';

    await printHtmlDocument(
      buildPassPrintDocument(
        [
          {
            amount,
            childName: pass.child_name || 'Walk-In Child',
            code: pass.id.slice(0, 8).toUpperCase(),
            durationLabel,
            guardianName,
            phone,
            printCountLabel: `Printed ${nextPrintCount}x`,
            qrSrc,
          },
        ],
        'Child Pass',
      ),
    );

    if (!isPaymentCompleted(resolvedPass)) {
      setPrintMessageTone('warning');
      setPrintMessage('Pass printed. Complete payment before recording print count.');
      return;
    }

    try {
      await printPassMutation.mutateAsync(pass);
    } catch {
      // React Query stores the error for the banner below; avoid an unhandled promise from the click handler.
    }
  }

  function openVisitDatePicker() {
    const input = visitDateInputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  }

  return (
    <div className="page-stack history-page">
      <section className="history-filter-card">
        <div className="history-filter-top">
          <div className="history-filter-title">
            <span className="history-filter-title-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 4.5C3 3.95 3.45 3.5 4 3.5H16C16.55 3.5 17 3.95 17 4.5C17 4.74 16.91 4.98 16.74 5.16L12 10.35V15.25C12 15.62 11.8 15.96 11.47 16.13L8.97 17.43C8.3 17.78 7.5 17.29 7.5 16.53V10.35L3.26 5.16C3.09 4.98 3 4.74 3 4.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="history-filter-kicker">Filter Visits</p>
          </div>
          <button type="button" className="history-clear-button" onClick={clearFilters}>
            Clear All
          </button>
        </div>

        <div className="history-filter-grid">
          <div className="history-filter-input-wrap history-filter-input-search">
            <input
              aria-label="Search visits by name or phone"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Search customer, parent, child, phone"
            />
            <span className="history-filter-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          </div>

          <div className="history-filter-divider" aria-hidden="true" />

          <div className="history-filter-input-wrap history-filter-input-date">
            <input
              ref={visitDateInputRef}
              aria-label="Date"
              type="date"
              value={visitDateFilter}
              onChange={(event) => setVisitDateFilter(event.target.value)}
            />
            <button type="button" className="history-filter-icon-button" onClick={openVisitDatePicker} aria-label="Open calendar">
              <svg viewBox="0 0 20 20" fill="none">
                <rect x="3" y="4.5" width="14" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M6.5 3V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M13.5 3V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M3 8H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="history-filter-input-wrap">
            <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All Statuses</option>
              <option value="pass_issued">Pass Issued</option>
              <option value="inside">Inside</option>
              <option value="checked_out">Checked Out</option>
            </select>
          </div>

          <div className="history-filter-input-wrap">
            <select
              aria-label="Settlement"
              value={settlementFilter}
              onChange={(event) => setSettlementFilter(event.target.value as typeof settlementFilter)}
            >
              <option value="all">All Settlements</option>
              <option value="settled">Settled</option>
              <option value="due">Due</option>
              <option value="none">No Settlement</option>
            </select>
          </div>
        </div>
      </section>

      <section className="history-table-card">
        <div className="history-table-head">
          <span>Status</span>
          <span>Child</span>
          <span>Pass Valid Till</span>
          <span>Duration</span>
          <span>Entry & Exit</span>
          <span>Payment</span>
          <span>Settlement</span>
          <span>Actions</span>
        </div>

        <div className="history-table-body">
          {paginatedRows.map((row) => {
            const status = getVisitStatus(row);
            const guestName = row.child_name || row.customer_name || 'Walk-In Child';
            const guardianName = row.parent_name || row.customer_name || '-';
            const amount = row.bill_total_amount ?? row.pass_price ?? 0;
            const overtimeMinutes = readNumber(row.overtime_minutes);
            const overtimeCharge = readNumber(row.overtime_charge);
            const overtimeBillAmount = readNumber(row.bill_overtime_amount);
            const overtimePaidAmount = readNumber(row.overtime_amount_paid);
            const overtimeAmount = overtimeCharge || overtimeBillAmount || overtimePaidAmount;
            const graceExpired = hasGraceExpired(row);
            const overtimeDue =
              !row.overtime_paid &&
              (overtimeMinutes > 0 || overtimeAmount > 0 || (graceExpired && row.pass_lifecycle_status === 'claimed_inside'));
            const passTiming = getPassTimingRange(row);
            const entryExitTiming = getEntryExitRange(row);

            return (
              <article key={row.id} className="history-pass-row">
                <div className="history-status-cell">
                  <span className={`history-status-badge ${status.tone}`}>{status.label}</span>
                </div>

                <div className="history-detail-cell history-pass-person">
                  <strong>{guestName}</strong>
                  <span>({guardianName})</span>
                </div>

                <div className="history-detail-cell history-pass-timing-cell">
                  <strong>{formatValidTillDisplay(passTiming.to)}</strong>
                </div>

                <div className="history-detail-cell history-single-line-cell history-pass-duration-cell">
                  <strong>{formatDurationLabel(selectedPassDetails?.expected_duration_minutes ?? row.expected_duration_minutes)}</strong>
                </div>

                <div className="history-detail-cell history-pass-timing-cell">
                  <strong>{formatTimingRange(entryExitTiming.from, entryExitTiming.to)}</strong>
                  <span>{formatTimingDate(entryExitTiming.from, entryExitTiming.to)}</span>
                </div>

                <div className="history-detail-cell history-single-line-cell">
                  <strong>{formatAmount(amount)}</strong>
                  <span>{(row.payment_mode || 'cash').toLowerCase()}</span>
                </div>

                <div className="history-detail-cell history-verification-cell history-single-line-cell">
                  {row.overtime_paid ? (
                    <span className="history-verified-badge">◉ Settled</span>
                  ) : overtimeDue ? (
                    <button
                      type="button"
                      className="history-settle-button"
                      onClick={() => {
                        setSettlementMessage('');
                        setSettlementRow(row);
                      }}
                    >
                      Settle
                    </button>
                  ) : (
                    <span className="history-settlement-empty">-</span>
                  )}
                </div>

                <div className="history-action-cell">
                  <button type="button" className="history-pass-button" onClick={() => setSelectedPass(row)}>
                    Pass
                  </button>
                </div>
              </article>
            );
          })}

          {!paginatedRows.length ? (
            <div className="history-empty-state">
              <p className="muted">No visit history rows found.</p>
            </div>
          ) : null}
        </div>

        <div className="history-table-footer">
          <span>
            Showing {showingFrom} to {showingTo} of {totalCount} entries
          </span>
          <div className="history-pagination">
            <button
              type="button"
              className="history-page-nav"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="history-page-current">{safeCurrentPage}</span>
            <button
              type="button"
              className="history-page-nav"
              disabled={safeCurrentPage >= pageCount}
              onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {selectedPass ? (
        <div className="modal-backdrop" onClick={() => setSelectedPass(null)}>
          <div className="modal-card ticket-modal-card history-pass-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Child Pass</h3>
                <p className="muted">Preview the selected child pass.</p>
              </div>
              <div className="history-pass-header-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={printPassMutation.isPending}
                  onClick={() => {
                    void printSelectedPass(selectedPass);
                  }}
                >
                  {printPassMutation.isPending ? 'Recording...' : 'Print Pass'}
                </button>
                <button type="button" className="secondary-button" onClick={() => setSelectedPass(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="history-single-pass-shell">
              <div className="ticket-card">
                <div className="ticket-print-count">Printed {readNumber(selectedPass.print_count)}x</div>
              <div className="ticket-left">
                <div className="ticket-brand">JUSTWAVE</div>
                <div className="ticket-badge">CHILD PASS</div>
                <div className="ticket-admit">ADMIT ONE</div>
                <div className="ticket-child-name">{selectedPass.child_name || 'Walk-In Child'}</div>
                <div className="ticket-meta-grid">
                  <div>
                    <span>TIME / DURATION</span>
                    <strong>{formatDurationLabel(selectedPassDetails?.expected_duration_minutes ?? selectedPass.expected_duration_minutes)}</strong>
                  </div>
                  <div>
                    <span>AMOUNT</span>
                    <strong>{formatAmountCompact(selectedPassDetails?.bill_total_amount ?? selectedPassDetails?.pass_price ?? selectedPass.bill_total_amount ?? selectedPass.pass_price ?? 0)}</strong>
                  </div>
                  <div>
                    <span>GUARDIAN</span>
                    <strong>{selectedPassDetails?.parent_name || selectedPassDetails?.customer_name || selectedPass.parent_name || selectedPass.customer_name || '-'}</strong>
                  </div>
                  <div>
                    <span>PHONE</span>
                    <strong>{selectedPassCustomerPhone || selectedPassDetails?.phone || selectedPass.phone || '-'}</strong>
                  </div>
                </div>
              </div>

                <div className="ticket-right">
                  <div className="ticket-qr-frame">
                    {selectedPassQr ? (
                      <img src={selectedPassQr} alt={`QR for ${selectedPass.child_name || selectedPass.id}`} className="ticket-qr-image" />
                    ) : null}
                  </div>
                  <div className="ticket-code">{selectedPass.id.slice(0, 8).toUpperCase()}</div>
                </div>
              </div>
            </div>

            {printMessage ? <StatusBanner tone={printMessageTone} message={printMessage} /> : null}
            {printPassMutation.isError ? (
              <StatusBanner
                tone="danger"
                message={printPassMutation.error instanceof Error ? printPassMutation.error.message : 'Could not record print count.'}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {settlementRow ? (
        <div className="modal-backdrop" onClick={() => setSettlementRow(null)}>
          <div className="modal-card history-settlement-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Settle Overtime</h3>
              </div>
              <div className="history-settlement-header-actions">
                <button
                  type="button"
                  className="history-settlement-all-button"
                  onClick={() => setShowAllSettlementKids(true)}
                  disabled={showAllSettlementKids || !settlementLookupPhone}
                >
                  Settle for All Kids
                </button>
                <button type="button" className="secondary-button" onClick={() => setSettlementRow(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="form-stack history-settlement-body">
              <section className="overtime-table-card history-settlement-table-card">
                <div className="overtime-table-intro">
                  <h2>Active Tickets</h2>
                  <p className="muted">
                    {showAllSettlementKids
                      ? 'Showing all kids linked to this phone number.'
                      : 'Only the selected child is shown here. Use "Settle for All Kids" to view everyone on this number.'}
                  </p>
                </div>

                <div className="overtime-table-head">
                  <span>Guest</span>
                  <span>Booked Exit</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                <div className="overtime-table-body">
                  {settlementTickets.map((item) => {
                    const status = item.settlement_status || (item.overtime_paid ? 'settled' : item.can_settle ? 'due' : 'not_due');
                    const canSettle = item.can_settle ?? (!item.overtime_paid && readNumber(item.overtime_charge) > 0);
                    const paymentMode = settlementPaymentModeById[item.id] || 'cash';

                    return (
                      <article key={item.id} className="overtime-row">
                        <div className="overtime-guest-cell">
                          <strong>{item.child_name || item.customer_name || item.parent_name}</strong>
                          <span>{item.phone || '-'}</span>
                        </div>

                        <div className="overtime-booked-cell">
                          <strong>{formatTime(item.booked_exit_time)}</strong>
                          <span>{formatDate(item.booked_exit_time)}</span>
                        </div>

                        <div className="overtime-charge-cell">
                          <strong>{formatAmount(item.overtime_charge || item.bill_overtime_amount)}</strong>
                        </div>

                        <div className="overtime-status-cell">
                          <span className={status === 'settled' ? 'overtime-status settled' : status === 'due' ? 'overtime-status due' : 'overtime-status not-due'}>
                            {status === 'settled' ? 'Settled' : status === 'due' ? 'Due' : 'Not Due'}
                          </span>
                        </div>

                        <div className="overtime-action-cell">
                          <select
                            value={paymentMode}
                            onChange={(event) =>
                              setSettlementPaymentModeById((current) => ({
                                ...current,
                                [item.id]: event.target.value as PaymentMode,
                              }))
                            }
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="other">Other</option>
                          </select>
                          <button
                            type="button"
                            className="overtime-settle-button"
                            onClick={() => settlementMutation.mutate({ id: item.id, paymentMode })}
                            disabled={!canSettle || settlementMutation.isPending}
                          >
                            {settlementMutation.isPending ? 'Settling' : 'Settle'}
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  {!settlementTickets.length ? (
                    <div className="overtime-empty">
                      <p className="muted">
                        {settlementLookupPhone ? 'No active tickets loaded for this phone.' : 'Resolving phone number for this child...'}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>

              {settlementMutation.isError ? (
                <StatusBanner
                  tone="danger"
                  message={settlementMutation.error instanceof Error ? settlementMutation.error.message : 'Settlement failed.'}
                />
              ) : null}
              {settlementTicketsQuery.isError ? (
                <StatusBanner
                  tone="warning"
                  message={settlementTicketsQuery.error instanceof Error ? settlementTicketsQuery.error.message : 'Could not load overtime tickets.'}
                />
              ) : null}
              {settlementPassQuery.isError ? (
                <StatusBanner
                  tone="warning"
                  message={settlementPassQuery.error instanceof Error ? settlementPassQuery.error.message : 'Could not load pass details.'}
                />
              ) : null}

              <div className="modal-actions">
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {settlementMessage ? <StatusBanner tone="success" message={settlementMessage} /> : null}
    </div>
  );
}
