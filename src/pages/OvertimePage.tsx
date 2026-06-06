import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { entryExitApi } from '../api/entryExitApi';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import type { OvertimeSettlementItem, PaymentMode } from '../types/entryExit';
import { formatAmount, formatDate, formatTime } from '../utils/formatters';
import { readNumber } from '../utils/normalization';

function normalizeSettlements(
  payload:
    | { data?: OvertimeSettlementItem[] | { settlements?: OvertimeSettlementItem[] } }
    | OvertimeSettlementItem[]
    | undefined,
) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.settlements)) return payload.data.settlements;
  return [];
}

export function OvertimePage() {
  const { token } = useAuth();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [paymentModeById, setPaymentModeById] = useState<Record<string, PaymentMode>>({});

  const query = useQuery({
    queryKey: ['overtime', phone],
    queryFn: () => entryExitApi.getOvertimeSettlements(token!, phone),
    enabled: false,
  });

  const mutation = useMutation({
    mutationFn: ({ id, paymentMode }: { id: string; paymentMode: PaymentMode }) =>
      entryExitApi.settleOvertime(token!, id, paymentMode),
    onSuccess: async (response) => {
      setMessage(response.message || 'Overtime settled.');
      await query.refetch();
    },
  });

  const items = useMemo(() => normalizeSettlements(query.data), [query.data]);

  return (
    <div className="page-stack">
      <section className="overtime-search-card">
        <label>
          Phone Number
          <div className="overtime-search-row">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
              placeholder="06291121370"
              inputMode="numeric"
            />
            <button className="primary-button overtime-find-button" onClick={() => void query.refetch()} disabled={!phone}>
              Find Tickets
            </button>
          </div>
        </label>
      </section>

      <section className="overtime-table-card">
        <div className="overtime-table-intro">
          <h2>Active Tickets</h2>
          <p className="muted">Only tickets that are still inside are shown here.</p>
        </div>

        <div className="overtime-table-head">
          <span>Guest</span>
          <span>Booked Exit</span>
          <span>Overtime</span>
          <span>Status</span>
          <span>Action</span>
        </div>

        <div className="overtime-table-body">
          {items.map((item) => {
            const status = item.settlement_status || (item.overtime_paid ? 'settled' : item.can_settle ? 'due' : 'not_due');
            const canSettle = item.can_settle ?? (!item.overtime_paid && readNumber(item.overtime_charge) > 0);
            const paymentMode = paymentModeById[item.id] || 'cash';

            return (
              <article key={item.id} className="overtime-row">
                <div className="overtime-guest-cell">
                  <strong>{item.child_name || item.customer_name || item.parent_name}</strong>
                  <span>{item.phone || '-'}</span>
                  <span>{item.id.slice(0, 16)}...</span>
                </div>

                <div className="overtime-booked-cell">
                  <strong>{formatDate(item.booked_exit_time)}</strong>
                  <span>{formatTime(item.booked_exit_time)}</span>
                </div>

                <div className="overtime-charge-cell">
                  <strong>{readNumber(item.overtime_minutes)} min</strong>
                  <span>Charged {readNumber(item.chargeable_minutes || item.overtime_minutes)} min</span>
                  <strong>{formatAmount(item.overtime_charge)}</strong>
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
                      setPaymentModeById((current) => ({
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
                    className="overtime-settle-button"
                    onClick={() => mutation.mutate({ id: item.id, paymentMode })}
                    disabled={!canSettle || mutation.isPending}
                  >
                    {mutation.isPending ? 'Settling' : 'Settle'}
                  </button>
                  <button type="button" className="overtime-razorpay-button" disabled>
                    Pay Razorpay
                  </button>
                </div>
              </article>
            );
          })}

          {!items.length ? <div className="overtime-empty"><p className="muted">No active tickets loaded yet.</p></div> : null}
        </div>
      </section>

      {query.isError ? (
        <StatusBanner tone="danger" message={query.error instanceof Error ? query.error.message : 'Could not load tickets.'} />
      ) : null}
      {mutation.isError ? (
        <StatusBanner tone="danger" message={mutation.error instanceof Error ? mutation.error.message : 'Settlement failed.'} />
      ) : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}
    </div>
  );
}
