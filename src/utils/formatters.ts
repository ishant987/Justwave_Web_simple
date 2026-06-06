import { readNumber } from './normalization';

export function formatAmount(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return `Rs.${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAmountCompact(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? `Rs.${amount}` : `Rs.${amount.toFixed(2)}`;
}

export function formatDateTime(value?: string | null) {
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

export function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatMinutes(value?: number | null) {
  const minutes = readNumber(value);
  if (!minutes) return '-';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes}m`;
}

export function formatDurationLabel(minutes?: number | null) {
  const totalMinutes = Number(minutes ?? 0) || 0;
  if (!totalMinutes) return '40m';
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  if (totalMinutes > 60) {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${totalMinutes}m`;
}

export function compactDurationLabel(label?: string | null): string {
  if (!label) return '40 mins';
  return label.replace(/\s*\([^)]*\)/g, '').trim();
}
