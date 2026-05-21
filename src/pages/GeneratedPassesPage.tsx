import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { useAuth } from '../hooks/useAuth';
import type { EntryExitLog, PaginatedApiResponse } from '../types/entryExit';

function normalizePasses(payload: PaginatedApiResponse<EntryExitLog> | EntryExitLog[] | undefined) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  return [];
}

export function GeneratedPassesPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const query = useQuery({
    queryKey: ['generated-passes', search, status],
    queryFn: () =>
      entryExitApi.listPasses(
        token!,
        `search=${encodeURIComponent(search)}${status ? `&status=${encodeURIComponent(status)}` : ''}&per_page=20`,
      ),
    enabled: !!token,
  });

  const passes = useMemo(() => normalizePasses(query.data), [query.data]);

  return (
    <div className="page-stack">
      <section className="hero-card">
        <p className="eyebrow">Passes</p>
        <h2>Generated Passes</h2>
        <p className="muted">Review issued passes, follow up on pending payments, and reprint paid passes.</p>
      </section>

      <section className="panel">
        <div className="toolbar-grid">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pass, parent, child, phone" />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </section>

      <section className="panel">
        <div className="data-table">
          <div className="data-table-head generated-grid">
            <span>Pass</span>
            <span>Guest</span>
            <span>Branch</span>
            <span>Payment</span>
            <span>Issued</span>
            <span>Action</span>
          </div>
          {passes.map((passItem) => {
            const code = `WIP-${passItem.id.slice(0, 8)}`;
            const guest = passItem.child_name || passItem.customer_name || passItem.parent_name || 'Guest';
            const action = passItem.payment_status === 'paid' ? 'Print' : 'Take Payment';
            return (
              <div key={passItem.id} className="data-table-row generated-grid">
                <span>{code}</span>
                <span>{guest}</span>
                <span>{passItem.location_name || 'Branch'}</span>
                <span>{passItem.payment_status === 'paid' ? `Paid • Rs.${Number(passItem.pass_price ?? 0).toFixed(2)}` : `Pending • Rs.${Number(passItem.pass_price ?? 0).toFixed(2)}`}</span>
                <span>{passItem.issued_at || '-'}</span>
                <span>{action}</span>
              </div>
            );
          })}
          {!passes.length ? <p className="muted">No generated passes found.</p> : null}
        </div>
      </section>
    </div>
  );
}
