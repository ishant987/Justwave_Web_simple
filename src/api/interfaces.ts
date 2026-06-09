import type {
  AuthResponse,
  User,
  ParentLookupResponse,
  DurationPrice,
  PassCreatePayload,
  PassCreateResponse,
  PaginatedApiResponse,
  EntryExitLog,
  MarkPassPaidPayload,
  MarkPassPaidResponse,
  OvertimeSettlementItem,
  PaymentMode,
  ScanExitResponse,
  BillDashboardQueryParams,
  BillDashboardResponse,
  Location,
} from '../types/entryExit';

export interface IAuthApi {
  login(payload: { email: string; password: string; device_name: string }): Promise<AuthResponse>;
  me(token: string): Promise<User>;
  logout(token: string): Promise<{ message?: string }>;
}

export interface IEntryExitApi {
  lookupParentByPhone(token: string, phone: string): Promise<ParentLookupResponse>;
  searchParents(
    token: string,
    query: string,
  ): Promise<{ data?: ParentLookupResponse['data'][] } | ParentLookupResponse['data'][]>;
  getCustomer(
    token: string,
    customerId: string,
  ): Promise<
    | { data?: { id?: string; name?: string; phone?: string } }
    | { id?: string; name?: string; phone?: string }
  >;
  updateCustomer(
    token: string,
    customerId: string,
    payload: { name: string; phone: string },
  ): Promise<{ data?: { id?: string; name?: string; phone?: string }; message?: string }>;
  updateParentChild(
    token: string,
    childId: string,
    payload: { name: string; dob?: string | null; gender?: string | null },
  ): Promise<{ data?: { id?: string; name?: string; dob?: string | null; gender?: string | null }; message?: string }>;
  getDurationPrices(token: string): Promise<{ data?: DurationPrice[] } | DurationPrice[]>;
  createPass(token: string, payload: PassCreatePayload): Promise<PassCreateResponse>;
  listPasses(token: string, query: string): Promise<PaginatedApiResponse<EntryExitLog> | EntryExitLog[]>;
  lookupPasses(token: string, query: string): Promise<{ data?: EntryExitLog[] } | EntryExitLog[]>;
  markPassPaid(token: string, payload: MarkPassPaidPayload): Promise<MarkPassPaidResponse>;
  recordPrint(token: string, ids: string[]): Promise<{ message?: string; print_counts?: Record<string, number> }>;
  scanEntry(token: string, scan_token: string): Promise<{ message?: string; data?: EntryExitLog }>;
  getOvertimeSettlements(
    token: string,
    phone: string,
  ): Promise<{ data?: OvertimeSettlementItem[] } | OvertimeSettlementItem[]>;
  settleOvertime(token: string, id: string, payment_mode: PaymentMode): Promise<{ message?: string }>;
  scanExit(token: string, scan_token: string): Promise<ScanExitResponse>;
  verifyExitOtp(token: string, scan_token: string, otp: string): Promise<{ message?: string; data?: EntryExitLog }>;
  getLiveOccupancy(
    token: string,
  ): Promise<{
    occupancy_count?: number;
    active_sessions?: EntryExitLog[];
    data?: { occupancy_count?: number; active_sessions?: EntryExitLog[] };
  }>;
  forceCheckoutAll(token: string): Promise<{ message?: string }>;
  getBillDashboard(token: string, params: BillDashboardQueryParams): Promise<BillDashboardResponse>;
  getVisitHistory(token: string, query: string): Promise<PaginatedApiResponse<EntryExitLog> | EntryExitLog[]>;
}

export interface ILocationApi {
  getLocations(token: string): Promise<{ data?: Location[] } | Location[]>;
}
