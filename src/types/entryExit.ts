export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other' | 'razorpay';

export interface User {
  id: string;
  name: string;
  email: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthResponse {
  message: string;
  token_type: string;
  access_token: string;
  user: User;
}

export interface Location {
  id: string;
  name: string;
}

export interface ChildRecord {
  id: string;
  name: string;
  age?: number;
}

export interface ParentLookupResponse {
  status: string;
  data: {
    record_type: string;
    customer?: { id: string; name: string; phone: string };
    parent?: { id: string; name: string; phone: string };
    children?: ChildRecord[];
    active_sessions?: EntryExitLog[];
  };
}

export interface DurationPrice {
  id: string;
  price_type: string;
  duration_minutes: number;
  duration_label: string;
  price: number;
  is_active: boolean;
  sort_order: number;
}

export interface EntryExitLog {
  id: string;
  location_id?: string;
  location_name?: string;
  customer_id?: string;
  customer_name?: string;
  parent_id?: string;
  parent_name?: string;
  child_id?: string;
  child_name?: string;
  booking_id?: string | null;
  phone?: string;
  entry_type?: string;
  entry_time?: string | null;
  booked_exit_time?: string | null;
  actual_exit_time?: string | null;
  expected_duration_minutes?: number | null;
  pass_price?: number | null;
  bill_base_amount?: number | null;
  bill_overtime_amount?: number | null;
  bill_total_amount?: number | null;
  payment_status?: string;
  payment_mode?: string | null;
  paid_at?: string | null;
  issued_at?: string | null;
  print_count?: number;
  overtime_minutes?: number;
  overtime_charge?: number;
  overtime_paid?: boolean;
  overtime_payment_mode?: string | null;
  overtime_paid_at?: string | null;
  overtime_amount_paid?: number | null;
  chargeable_minutes?: number | null;
  grace_minutes?: number | null;
  pass_expires_at?: string | null;
  pass_lifecycle_status?: string;
  pass_lifecycle_label?: string;
  guardian_verification_mode?: string | null;
  guardian_verified_by?: string | null;
  guardian_verified_by_name?: string | null;
  created_at?: string | null;
}

export interface PaginatedList<T> {
  data?: T[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

export interface PaginatedApiResponse<T> {
  data?: PaginatedList<T> | T[];
}

export interface BillDashboardSummary {
  pending?: number;
  pending_count?: number;
  generated_today?: number;
  generated_today_count?: number;
  all_time?: number;
  all_time_count?: number;
  amount_today?: number;
  total_amount_today?: number;
  amount_today_count?: number;
  amount_month?: number;
  total_amount_month?: number;
  amount_month_count?: number;
}

export interface BillDashboardResponse {
  data?: {
    summary?: BillDashboardSummary;
    filtered_total?: number;
    filters?: Record<string, unknown>;
    bills?: PaginatedList<EntryExitLog>;
  };
}

export interface PassCreatePayload {
  location_id: string;
  phone: string;
  parent_id?: string;
  customer_id?: string;
  customer_name?: string;
  child_ids?: string[];
  child_count?: number;
  child_names?: string[];
  hours?: number;
  duration_minutes?: number;
  duration_price_id?: string;
}

export interface PassCreateResponse {
  message?: string;
  data: EntryExitLog[];
  payment?: {
    required?: boolean;
  };
}

export interface OvertimeSettlementItem extends EntryExitLog {
  settlement_status?: string;
  can_settle?: boolean;
  can_scan_exit?: boolean;
  chargeable_minutes?: number | null;
  grace_minutes?: number | null;
}

export interface ScanExitResponse {
  status: string;
  message: string;
  data?: EntryExitLog & {
    otp_expires_at?: string;
    otp_phone?: string;
    can_verify_exit?: boolean;
    verify_url?: string;
    overtime_minutes?: number | null;
    chargeable_minutes?: number | null;
    overtime_charge?: number | null;
    grace_minutes?: number | null;
  };
}
