import type { EntryExitLog } from '../types/entryExit';

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function formatAmount(value?: number | null) {
  return `Rs.${Number(value ?? 0).toFixed(2)}`;
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
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes} mins`;
}

function getAmount(ticket: EntryExitLog) {
  return readNumber(ticket.bill_total_amount ?? ticket.bill_base_amount ?? ticket.pass_price);
}

function getStatus(ticket: EntryExitLog) {
  return ticket.pass_lifecycle_label || ticket.pass_lifecycle_status || ticket.payment_status || 'Available';
}

function getPaymentLabel(ticket: EntryExitLog) {
  if (ticket.payment_status !== 'paid') return 'Pending';
  const mode = readString(ticket.payment_mode || 'cash').toUpperCase();
  return ticket.overtime_paid ? `${mode} + OT` : mode;
}

export function TicketDetailsCard({
  title,
  ticket,
}: {
  title: string;
  ticket: EntryExitLog | null | undefined;
}) {
  if (!ticket) return null;

  const guestName = readString(ticket.child_name) || readString(ticket.customer_name) || 'Walk-In Guest';
  const guardianName = readString(ticket.parent_name) || readString(ticket.customer_name) || '-';
  const billCode = readString(ticket.id) ? `WIB-${readString(ticket.id).slice(0, 8).toUpperCase()}` : '-';

  return (
    <section className="ticket-details-card">
      <div className="ticket-details-header">
        <div>
          <h3>{title}</h3>
          <p className="muted">Ticket details for the scanned QR.</p>
        </div>
        <span className="ticket-details-bill">{billCode}</span>
      </div>

      <div className="ticket-details-grid">
        <div>
          <span className="section-kicker">Guest</span>
          <strong>{guestName}</strong>
        </div>
        <div>
          <span className="section-kicker">Guardian</span>
          <strong>{guardianName}</strong>
        </div>
        <div>
          <span className="section-kicker">Phone</span>
          <strong>{readString(ticket.phone) || '-'}</strong>
        </div>
        <div>
          <span className="section-kicker">Branch</span>
          <strong>{readString(ticket.location_name) || '-'}</strong>
        </div>
        <div>
          <span className="section-kicker">Duration</span>
          <strong>{formatMinutes(ticket.expected_duration_minutes)}</strong>
        </div>
        <div>
          <span className="section-kicker">Amount</span>
          <strong>{formatAmount(getAmount(ticket))}</strong>
        </div>
        <div>
          <span className="section-kicker">Payment</span>
          <strong>{getPaymentLabel(ticket)}</strong>
        </div>
        <div>
          <span className="section-kicker">Status</span>
          <strong>{getStatus(ticket)}</strong>
        </div>
        <div>
          <span className="section-kicker">Issued</span>
          <strong>{formatDateTime(ticket.issued_at || ticket.created_at)}</strong>
        </div>
        <div>
          <span className="section-kicker">Entry Time</span>
          <strong>{formatDateTime(ticket.entry_time)}</strong>
        </div>
        <div>
          <span className="section-kicker">Booked Exit</span>
          <strong>{formatDateTime(ticket.booked_exit_time)}</strong>
        </div>
        <div>
          <span className="section-kicker">Actual Exit</span>
          <strong>{formatDateTime(ticket.actual_exit_time)}</strong>
        </div>
      </div>
    </section>
  );
}
