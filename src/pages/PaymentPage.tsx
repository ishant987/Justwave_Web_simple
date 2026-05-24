import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { useAuth } from '../hooks/useAuth';
import { StatusBanner } from '../components/StatusBanner';
import type { EntryExitLog, PaginatedApiResponse, PassPaymentMode } from '../types/entryExit';

function normalizePasses(payload: PaginatedApiResponse<EntryExitLog> | EntryExitLog[] | undefined) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  return [];
}

function parseRouteState(state: unknown): { ids: string[]; phone: string } {
  if (!state || typeof state !== 'object') {
    return { ids: [], phone: '' };
  }

  const candidate = state as { ids?: unknown; phone?: unknown };
  const ids = Array.isArray(candidate.ids) ? candidate.ids.filter((id): id is string => typeof id === 'string') : [];
  const phone = typeof candidate.phone === 'string' ? candidate.phone : '';

  return { ids, phone };
}

export function PaymentPage() {
  const { token } = useAuth();
  const location = useLocation();
  const routeState = useMemo(() => parseRouteState(location.state), [location.state]);
  const seededPhone = routeState.phone;
  const [search, setSearch] = useState(seededPhone);
  const [selectedIds, setSelectedIds] = useState<string[]>(routeState.ids);
  const [paymentMode, setPaymentMode] = useState<PassPaymentMode>('upi');
  const [message, setMessage] = useState('');
  const [searchTouched, setSearchTouched] = useState(Boolean(routeState.phone));

  const passesQuery = useQuery({
    queryKey: ['passes', search],
    queryFn: () => entryExitApi.listPasses(token!, `status=pending&search=${encodeURIComponent(search)}`),
    enabled: !!token && searchTouched,
  });

  const markPaidMutation = useMutation({
    mutationFn: () => entryExitApi.markPassPaid(token!, { ids: selectedIds, payment_mode: paymentMode }),
    onSuccess: async (response) => {
      setMessage(response.message || 'Payment recorded.');
      if (selectedIds.length) {
        await entryExitApi.recordPrint(token!, selectedIds);
      }
      await passesQuery.refetch();
    },
  });

  const passes = useMemo(() => normalizePasses(passesQuery.data), [passesQuery.data]);

  return (
    <div className="page-stack">
      <section className="hero-card">
        <p className="eyebrow">Screen 2</p>
        <h2>Collect Payment</h2>
        <p className="muted">Search pending passes, mark them paid, then record print count in the backend.</p>
      </section>

      <section className="panel">
        <div className="inline-form">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search phone or name"
          />
          <button
            className="secondary-button"
            onClick={() => {
              setSearchTouched(true);
              void passesQuery.refetch();
            }}
          >
            Find Passes
          </button>
        </div>
        {!routeState.ids.length && !routeState.phone ? (
          <p className="muted small">
            This page can be opened directly. Search by phone or name to load pending passes.
          </p>
        ) : null}
      </section>

      <section className="grid two-col">
        <div className="panel">
          <h3>Pending Passes</h3>
          <div className="table-list">
            {passes.map((passItem) => (
              <label key={passItem.id} className="table-row selectable-row">
                <span>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(passItem.id)}
                    onChange={(event) =>
                      setSelectedIds((current) =>
                        event.target.checked ? [...current, passItem.id] : current.filter((id) => id !== passItem.id),
                      )
                    }
                  />
                  {' '}
                  {passItem.child_name || passItem.customer_name || passItem.parent_name}
                </span>
                <span>Rs. {passItem.bill_total_amount ?? passItem.pass_price ?? 0}</span>
              </label>
            ))}
            {passesQuery.isError ? (
              <StatusBanner
                tone="danger"
                message={passesQuery.error instanceof Error ? passesQuery.error.message : 'Could not load pending passes.'}
              />
            ) : null}
            {!passes.length && !passesQuery.isLoading ? <p className="muted">No pending passes found.</p> : null}
          </div>
        </div>

        <div className="panel">
          <h3>Take Payment</h3>
          <label>
            Payment Mode
            <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PassPaymentMode)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </label>
          <p className="muted">Selected passes: {selectedIds.length}</p>
          <button
            className="primary-button big-button"
            disabled={!selectedIds.length || markPaidMutation.isPending}
            onClick={() => markPaidMutation.mutate()}
          >
            {markPaidMutation.isPending ? 'Saving Payment...' : 'Take Payment'}
          </button>
          {markPaidMutation.isError ? (
            <StatusBanner tone="danger" message={markPaidMutation.error instanceof Error ? markPaidMutation.error.message : 'Payment failed.'} />
          ) : null}
          {message ? <StatusBanner tone="success" message={message} /> : null}
        </div>
      </section>
    </div>
  );
}
