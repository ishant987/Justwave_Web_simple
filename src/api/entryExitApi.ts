import { request } from './http';
import type {
  BillDashboardResponse,
  BillDashboardQueryParams,
  DurationPrice,
  EntryExitLog,
  OvertimeSettlementItem,
  PaginatedApiResponse,
  ParentLookupResponse,
  MarkPassPaidPayload,
  PassCreatePayload,
  PassCreateResponse,
  PaymentMode,
  ScanExitResponse,
} from '../types/entryExit';

export function lookupParentByPhone(token: string, phone: string) {
  return request<ParentLookupResponse>(`/entry-exit/parents/lookup?phone=${encodeURIComponent(phone)}`, { token });
}

export function getCustomer(token: string, customerId: string) {
  return request<{ data?: { id?: string; name?: string; phone?: string } } | { id?: string; name?: string; phone?: string }>(
    `/customers/${customerId}`,
    { token },
  );
}

export function updateCustomer(token: string, customerId: string, payload: { name: string; phone: string }) {
  return request<{ data?: { id?: string; name?: string; phone?: string }; message?: string }>(
    `/customers/${customerId}`,
    {
      method: 'PUT',
      body: payload,
      token,
    },
  );
}

export function getDurationPrices(token: string) {
  return request<{ data?: DurationPrice[] } | DurationPrice[]>(`/entry-exit/duration-prices?price_type=standard`, { token });
}

export function createPass(token: string, payload: PassCreatePayload) {
  return request<PassCreateResponse>('/entry-exit/passes', { method: 'POST', body: payload, token });
}

export function listPasses(token: string, query: string) {
  return request<PaginatedApiResponse<EntryExitLog> | EntryExitLog[]>(`/entry-exit/passes${query ? `?${query}` : ''}`, { token });
}

export function markPassPaid(token: string, payload: MarkPassPaidPayload) {
  return request<{ message?: string }>('/entry-exit/passes/mark-paid', {
    method: 'POST',
    body: payload,
    token,
  });
}

export function recordPrint(token: string, ids: string[]) {
  return request<{ message?: string; print_counts?: Record<string, number> }>('/entry-exit/passes/record-print', {
    method: 'POST',
    body: { ids },
    token,
  });
}

export function scanEntry(token: string, scan_token: string) {
  return request<{ message?: string; data?: EntryExitLog }>('/entry-exit/passes/scan-entry', {
    method: 'POST',
    body: { scan_token },
    token,
  });
}

export function getOvertimeSettlements(token: string, phone: string) {
  return request<{ data?: OvertimeSettlementItem[] } | OvertimeSettlementItem[]>(
    `/entry-exit/overtime-settlements?phone=${encodeURIComponent(phone)}`,
    { token },
  );
}

export function settleOvertime(token: string, id: string, payment_mode: PaymentMode) {
  return request<{ message?: string }>('/entry-exit/overtime-settlements', {
    method: 'POST',
    body: { id, payment_mode },
    token,
  });
}

export function scanExit(token: string, scan_token: string) {
  return request<ScanExitResponse>('/entry-exit/passes/scan-exit', {
    method: 'POST',
    body: { scan_token },
    token,
  });
}

export function verifyExitOtp(token: string, scan_token: string, otp: string) {
  return request<{ message?: string; data?: EntryExitLog }>('/entry-exit/passes/verify-exit-otp', {
    method: 'POST',
    body: { scan_token, otp },
    token,
  });
}

export function getLiveOccupancy(token: string) {
  return request<{ occupancy_count?: number; active_sessions?: EntryExitLog[]; data?: { occupancy_count?: number; active_sessions?: EntryExitLog[] } }>(
    '/entry-exit/live-occupancy',
    { token },
  );
}

export function getBillDashboard(token: string, params: BillDashboardQueryParams) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return request<BillDashboardResponse>(`/entry-exit/bill-dashboard${queryString ? `?${queryString}` : ''}`, { token });
}

export function getVisitHistory(token: string, query: string) {
  return request<PaginatedApiResponse<EntryExitLog> | EntryExitLog[]>(`/entry-exit/logs${query ? `?${query}` : ''}`, { token });
}
