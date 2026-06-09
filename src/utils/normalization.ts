export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function normalizeListResponse<T>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (typeof payload.id === 'string') return [payload as T];

  for (const key of ['data', 'entry_exit_logs', 'logs', 'passes', 'items', 'results', 'settlements']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as T[];
    if (isRecord(value)) {
      const nested = normalizeListResponse<T>(value);
      if (nested.length) return nested;
    }
  }

  return [];
}

export function normalizeText(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

export function normalizePhone(value?: string | null): string {
  return (value || '').replace(/\D/g, '').trim();
}

export function centsFromAmount(value: number): number {
  return Math.round(value * 100);
}

export function centsFromInput(value: string): number {
  return Math.max(0, Math.round((Number(value) || 0) * 100));
}

export function formatAmountFromCents(cents: number): string {
  const amount = Math.max(0, cents) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
