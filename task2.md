# Bill Dashboard Design Page Specification

This document describes how to recreate the Entry Exit Bill Dashboard page, including the page layout, visible UI sections, filters, table columns, API endpoints, query parameters, and response fields.

## Goal

Build a bill dashboard that lets staff review walk-in pass billing activity, check pending sessions, view collection totals, filter bill records, and export bill rows.

The existing Laravel page has two main screens:

- Summary dashboard: `/entry-exit/bill-dashboard`
- Detailed bill table: `/entry-exit/bill-dashboard/bills`

The JSON API version for app or SPA use is:

- `GET /api/v1/entry-exit/bill-dashboard`

## Access

Web pages require:

- Authenticated user
- Verified user
- Permission: `entry_exit.view_logs`

API calls require:

- Sanctum bearer token
- Permission: `entry_exit.view_logs`

Use this header for API calls:

```http
Authorization: Bearer <token>
Accept: application/json
```

## Page 1: Summary Dashboard

Route:

```text
GET /entry-exit/bill-dashboard
```

Blade view:

```text
Modules/EntryExit/resources/views/entry-exit/bill-dashboard-summary.blade.php
```

### Visual Layout

Use a full-width application layout with a constrained content area:

```text
Page padding: py-8
Container: max-w-7xl, centered
Main spacing: vertical gap between sections
Cards: rounded-lg, bordered, subtle shadow
Dark mode: supported with dark: classes
```

### Header Area

Top header text:

```text
Track walk-in pass bills, pending sessions, and collection totals from one place.
```

Inside the page body, show:

- Title: `Bill Dashboard`
- Subtitle: `Payment-mode collection details for the selected filter.`
- Primary action button: `Show All Bills`

The `Show All Bills` button links to:

```text
/entry-exit/bill-dashboard/bills
```

### Summary Cards

Display five clickable cards in a responsive grid:

```text
Mobile/tablet: 1-2 columns
Desktop: 5 columns
```

Cards:

| Card | Value | Hint | Click target |
| --- | --- | --- | --- |
| Pending | `summary.pending` | `Awaiting exit` | `/entry-exit/bill-dashboard/bills?category=pending` |
| Generated Today | `summary.generated_today` | Current date, e.g. `24 May 2026` | `/entry-exit/bill-dashboard/bills?category=generated_today` |
| All Time Bills | `summary.all_time` | `Every bill` | `/entry-exit/bill-dashboard/bills` |
| Total Amount Today | `summary.amount_today` | Bill count from `summary.amount_today_count` | `/entry-exit/bill-dashboard/bills?category=amount_today` |
| Total Amount Month | `summary.amount_month` | Current month, e.g. `May 2026` | `/entry-exit/bill-dashboard/bills?category=amount_month` |

Suggested color intent:

| Card | Style intent |
| --- | --- |
| Pending | Amber warning tone |
| Generated Today | Sky/blue information tone |
| All Time Bills | Neutral white/slate tone |
| Total Amount Today | Emerald success tone |
| Total Amount Month | Indigo monthly total tone |

### Collection By Payment Mode Section

Show this as a large bordered panel below the summary cards.

Left side:

- Heading: `Collection By Payment Mode`
- Helper text: `Detailed today totals by Cash, UPI, Card, Bank Transfer, Other, and Razorpay.`

Right side filter form:

| Field | Type | Values |
| --- | --- | --- |
| `summary_period` | Select | `today`, `monthly`, `date_range`, `date` |
| `date_from` | Date input | Visible for `date` and `date_range` |
| `date_to` | Date input | Visible only for `date_range` |
| Submit | Button | `Filter` |
| Filtered total badge | Read-only display | `Filtered Total: Rs.0.00` |

Example URLs:

```text
GET /entry-exit/bill-dashboard?summary_period=today
GET /entry-exit/bill-dashboard?summary_period=monthly
GET /entry-exit/bill-dashboard?summary_period=date&date_from=2026-05-24
GET /entry-exit/bill-dashboard?summary_period=date_range&date_from=2026-05-01&date_to=2026-05-24
```

### Payment Mode Cards

Below the filter row, display payment mode cards in a responsive grid:

```text
Desktop: 2-3 columns
Each card: mode label, total amount, transaction count, and a small table
```

Payment modes shown by default:

- Cash
- UPI
- Card
- Bank Transfer
- Other
- Razorpay

Each payment mode card shows:

| Display | Data field |
| --- | --- |
| Payment mode label | `paymentModeBreakdown[*].label` |
| Total amount | `paymentModeBreakdown[*].amount` |
| Total transactions | `paymentModeBreakdown[*].transactions` |
| Pass collection amount | `paymentModeBreakdown[*].pass_amount` |
| Pass transaction count | `paymentModeBreakdown[*].pass_transactions` |
| Overtime collection amount | `paymentModeBreakdown[*].overtime_amount` |
| Overtime transaction count | `paymentModeBreakdown[*].overtime_transactions` |

## Page 2: Detailed Bill Table

Route:

```text
GET /entry-exit/bill-dashboard/bills
```

Blade view:

```text
Modules/EntryExit/resources/views/entry-exit/bill-dashboard.blade.php
```

### Visual Layout

Use the same application layout and top header as the summary dashboard.

Main sections:

1. Five summary cards
2. Filter panel
3. Bill table panel

The selected category card should show an active ring.

### Summary Cards On Table Page

Use the same five cards from the summary dashboard. Each card keeps the current query string except `page`, then changes `category`.

Categories:

```text
all_time
pending
generated_today
amount_today
amount_month
```

### Filter Panel

The filter panel is a bordered white/dark card with a GET form.

Form action:

```text
GET /entry-exit/bill-dashboard/bills
```

Hidden fields:

| Field | Purpose |
| --- | --- |
| `category` | Keeps selected category |
| `sort` | Keeps selected sort |
| `direction` | Keeps current sort direction |

Visible filters:

| Field | Type | Options / Behavior |
| --- | --- | --- |
| `search` | Text input | Searches bill ID, customer, phone, child, branch, Razorpay ID |
| `status` | Select | `all`, `pending`, `active`, `completed`, `expired` |
| `payment_mode` | Select | `all`, `cash`, `upi`, `card`, `bank_transfer`, `other`, `razorpay`, `split` |
| `collection_type` | Select | `all`, `pass`, `overtime` |
| `location_id` | Select | All branches, or locked to staff branch |
| `date_from` | Date input | Filters `created_at >= date_from` |
| `date_to` | Date input | Filters `created_at <= date_to` |
| `per_page` | Select | `10`, `15`, `25`, `50` |

Quick filter buttons:

| Button | Behavior |
| --- | --- |
| All Time | Clears category/date range |
| Pending | Sets `category=pending` |
| Today | Sets `category=generated_today`, `date_from=today`, `date_to=today` |
| This Month | Sets `category=amount_month` |

Action buttons:

| Button | Target |
| --- | --- |
| Dashboard | `/entry-exit/bill-dashboard` |
| Reset | `/entry-exit/bill-dashboard/bills` |
| Export Excel | `/entry-exit/bill-dashboard/bills/export` with current query |
| Apply Filters | Submits the form |

Example filter URL:

```text
GET /entry-exit/bill-dashboard/bills?category=all_time&status=all&payment_mode=all&collection_type=all&search=&sort=created_at&direction=desc&per_page=15
```

### Bill Table Header

Above the table, show:

- Heading: `Bills`
- Count text: `Showing :first to :last of :total bills`
- Filtered total badge: `Filtered Total: Rs.0.00`

If pagination has multiple pages, show Laravel pagination above and below the table.

### Bill Table Columns

| Column | Sort key | Display |
| --- | --- | --- |
| Bill | `bill` | Short code and truncated UUID |
| Customer | none | Customer/parent/child display name and phone |
| Branch | none | Branch name and staff name |
| Duration | `duration` | Duration minutes or `Flexible`, plus lifecycle time hint |
| Amount | `amount` | Total amount, optional pass + overtime split, payment details |
| Status | `status` | Colored lifecycle badge |
| Generated | `created_at` | Date and time |

Sortable headers toggle `direction` between `asc` and `desc`.

Supported sort keys:

```text
bill
amount
created_at
duration
status
entry_time
exit_time
```

### Bill Row Display Mapping

| UI field | Source |
| --- | --- |
| Bill short code | `WIB-` + first 8 uppercase chars of `entry_exit_logs.id` |
| UUID subtitle | Truncated `entry_exit_logs.id` |
| Customer name | `child.name`, else `parentGuardian.name`, else `customer.name`, else `Walk-in Guest` |
| Phone | `parentGuardian.phone`, else `customer.phone`, else `No phone` |
| Branch | `location.name`, else `Unknown` |
| Staff | `staff.name`, else `Reception` |
| Duration | `expected_duration_minutes`, else `Flexible` |
| Used hint | `Used at actual_exit_time` |
| Claimed hint | `Claimed at entry_time` |
| Unscanned hint | `Entry not scanned` |
| Pass amount | `collectedPassAmount()` |
| Overtime amount | `collectedOvertimeAmount()` |
| Total amount | `collectedBillTotal()` |
| Payment details | Payment mode, split payments, Razorpay IDs from payment detail partial |
| Generated date/time | `created_at` |

### Status Badges

| Condition | Label | Style intent |
| --- | --- | --- |
| `actual_exit_time` is not null | `Used / Checked out` | Slate/neutral |
| `entry_time` is null and `pass_expires_at` is past | `Expired` | Rose/error |
| `entry_time` is not null and no actual exit | `Claimed / Inside` | Sky/info |
| Pass is paid but not scanned | `Issued / Not scanned` | Emerald/success |
| Otherwise | `Payment Pending` | Amber/warning |

### Empty State

If no bills match the filters, show one centered row:

```text
No bills match the current filters.
```

## Export API

Route:

```text
GET /entry-exit/bill-dashboard/bills/export
```

This endpoint accepts the same web table filters and streams an `.xlsx` file.

Export filename format:

```text
entry-exit-bills-{collection_type}-{YYYYMMDD-HHMMSS}.xlsx
```

Export columns:

| Column |
| --- |
| Bill ID |
| Customer |
| Phone |
| Branch |
| Staff |
| Duration Minutes |
| Status |
| Generated At |
| Entry Time |
| Exit Time |
| Pass Collection |
| Overtime Collection |
| Total Collection |
| Payment Mode |
| Overtime Payment Mode |
| Razorpay Payment ID |
| Overtime Razorpay Payment ID |

## JSON API

Endpoint:

```text
GET /api/v1/entry-exit/bill-dashboard
```

Use this endpoint if you are building the same page in a mobile app, SPA, or external frontend.

### Query Parameters

| Parameter | Type / Values | Default | Notes |
| --- | --- | --- | --- |
| `category` | `all_time`, `pending`, `generated_today`, `amount_today`, `amount_month` | `all_time` | Controls summary-card category filter |
| `status` | `all`, `pending`, `completed`, `active`, `expired` | `all` | Filters lifecycle status |
| `location_id` | Existing `locations.id` | empty | Branch filter |
| `date_from` | Date | empty | Filters by `created_at` |
| `date_to` | Date, after/equal `date_from` | empty | Filters by `created_at` |
| `amount_min` | Number >= 0 | empty | API only |
| `amount_max` | Number >= 0 and >= `amount_min` | empty | API only |
| `search` | String, max 100 | empty | Searches bill/customer/phone/child/branch |
| `sort` | `bill`, `amount`, `created_at`, `duration`, `status`, `entry_time`, `exit_time` | `created_at` | Sort field |
| `direction` | `asc`, `desc` | `desc` | Sort direction |
| `per_page` | Integer 10-50 | `15` | Pagination size |

Example:

```http
GET /api/v1/entry-exit/bill-dashboard?status=completed&search=Rahul&amount_min=300&amount_max=1000&sort=amount&direction=desc&per_page=15
Authorization: Bearer <token>
Accept: application/json
```

### API Response Shape

```json
{
  "data": {
    "summary": {
      "pending": 0,
      "generated_today": 0,
      "all_time": 0,
      "amount_today": 0,
      "amount_today_count": 0,
      "amount_month": 0,
      "amount_month_count": 0
    },
    "filtered_total": 0,
    "filters": {
      "category": "all_time",
      "status": "all",
      "location_id": "",
      "date_from": "",
      "date_to": "",
      "amount_min": "",
      "amount_max": "",
      "search": "",
      "sort": "created_at",
      "direction": "desc",
      "per_page": 15
    },
    "bills": {
      "data": [],
      "meta": {
        "current_page": 1,
        "from": null,
        "last_page": 1,
        "per_page": 15,
        "to": null,
        "total": 0
      }
    }
  }
}
```

### API Bill Object Fields

Each item in `data.bills.data` contains:

| Field | Notes |
| --- | --- |
| `id` | Entry exit log ID |
| `location_id` | Branch ID |
| `location_name` | Branch name |
| `customer_id` | Customer ID |
| `customer_name` | Customer name |
| `parent_id` | Parent/guardian ID |
| `parent_name` | Parent/guardian name |
| `child_id` | Child ID |
| `child_name` | Child name |
| `booking_id` | Linked booking ID, if any |
| `entry_type` | Entry type |
| `pass_lifecycle_status` | Machine status |
| `pass_lifecycle_label` | Human label |
| `entry_time` | ISO timestamp |
| `booked_exit_time` | ISO timestamp |
| `effective_booked_exit_time` | ISO timestamp adjusted for pause/extension |
| `actual_exit_time` | ISO timestamp |
| `is_timer_paused` | Boolean |
| `pause_started_at` | ISO timestamp |
| `paused_minutes_total` | Integer |
| `extension_minutes_total` | Integer |
| `break_reason_required_after_minutes` | Integer setting |
| `time_adjustments` | Latest loaded timer adjustments, usually empty for dashboard |
| `guardian_verification_mode` | Verification mode |
| `guardian_verified_by` | User/staff ID |
| `expected_duration_minutes` | Pass duration |
| `pass_price` | Pass price |
| `bill_base_amount` | Same as pass price |
| `bill_overtime_amount` | Overtime charge |
| `bill_total_amount` | Pass + overtime |
| `payment_status` | Pass payment status |
| `payment_mode` | Pass payment mode |
| `payment_splits` | Split payment array |
| `razorpay_order_id` | Pass Razorpay order ID |
| `razorpay_payment_id` | Pass Razorpay payment ID |
| `razorpay_signature` | Pass Razorpay signature |
| `paid_at` | Pass paid timestamp |
| `issued_at` | Pass issued timestamp |
| `print_count` | Number of pass prints |
| `overtime_minutes` | Overtime minutes |
| `overtime_charge` | Overtime charge |
| `overtime_paid` | Boolean |
| `overtime_payment_mode` | Overtime payment mode |
| `overtime_razorpay_order_id` | Overtime Razorpay order ID |
| `overtime_razorpay_payment_id` | Overtime Razorpay payment ID |
| `overtime_razorpay_signature` | Overtime Razorpay signature |
| `overtime_paid_at` | Overtime paid timestamp |
| `overtime_amount_paid` | Actual overtime amount paid |
| `pass_expires_at` | Pass expiry timestamp |
| `created_at` | Created timestamp |
| `updated_at` | Updated timestamp |

### API Status Values

`pass_lifecycle_status` can be:

| Status | Label |
| --- | --- |
| `used_checked_out` | `Used / Checked out` |
| `claimed_inside` | `Claimed / Inside` |
| `expired` | `Expired` |
| `issued_not_scanned` | `Issued / Not scanned` |
| `payment_pending` | `Payment Pending` |

## Filtering Logic

### Category Filters

| Category | Query logic |
| --- | --- |
| `pending` | `actual_exit_time IS NULL` |
| `generated_today` | `created_at` is today |
| `amount_today` | `created_at` is today |
| `amount_month` | `created_at` is in the current month |
| `all_time` | No category restriction |

### Status Filters

| Status | Query logic |
| --- | --- |
| `pending` | `actual_exit_time IS NULL` |
| `completed` | `actual_exit_time IS NOT NULL` |
| `active` | `entry_time IS NOT NULL` and `actual_exit_time IS NULL` |
| `expired` | `entry_time IS NULL`, `pass_expires_at IS NOT NULL`, and `pass_expires_at` is past |

### Web-Only Filters

| Filter | Logic |
| --- | --- |
| `payment_mode` | Matches pass payment mode, overtime payment mode, or pass split mode |
| `collection_type=pass` | Paid pass rows with `pass_price > 0` |
| `collection_type=overtime` | Overtime-paid rows with positive overtime amount |

### API-Only Filters

| Filter | Logic |
| --- | --- |
| `amount_min` | `pass_price + overtime_charge >= amount_min` |
| `amount_max` | `pass_price + overtime_charge <= amount_max` |

## Data Source

Main table:

```text
entry_exit_logs
```

Relationships loaded:

- `child`
- `customer`
- `parentGuardian`
- `location`
- `staff`

Web table base query includes only collected transactions:

```text
payment_status = paid OR overtime_paid = true
```

Web collected total expression:

```text
paid pass amount + paid overtime amount
```

API total expression:

```text
COALESCE(pass_price, 0) + COALESCE(overtime_charge, 0)
```

## Recommended Frontend State

For a similar page in a frontend app, keep this state:

```json
{
  "summary": {},
  "filteredTotal": 0,
  "filters": {
    "category": "all_time",
    "status": "all",
    "location_id": "",
    "date_from": "",
    "date_to": "",
    "amount_min": "",
    "amount_max": "",
    "search": "",
    "sort": "created_at",
    "direction": "desc",
    "per_page": 15,
    "page": 1
  },
  "bills": [],
  "pagination": {},
  "isLoading": false,
  "error": null
}
```

## Implementation Checklist

1. Render the five summary cards at the top.
2. Let each summary card update `category` and reload the bill list.
3. Add the filter form with search, status, payment mode if using web routes, collection type if using web routes, branch, dates, and rows per page.
4. Fetch `GET /api/v1/entry-exit/bill-dashboard` with current filters for API-based pages.
5. Render the table from `data.bills.data`.
6. Use `data.filtered_total` for the filtered total badge.
7. Use `data.bills.meta` for pagination controls.
8. Use lifecycle status to color the status badge.
9. Preserve query strings when sorting, filtering, and paginating.
10. Use the export web route when an Excel file is needed.

## Important Source Files

- `Modules/EntryExit/routes/web.php`
- `Modules/EntryExit/routes/api.php`
- `Modules/EntryExit/app/Http/Controllers/EntryExitController.php`
- `Modules/EntryExit/app/Http/Controllers/Api/EntryExitApiController.php`
- `Modules/EntryExit/app/Http/Requests/BillDashboardRequest.php`
- `Modules/EntryExit/app/Http/Requests/BillDashboardApiRequest.php`
- `Modules/EntryExit/app/Models/EntryExitLog.php`
- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard-summary.blade.php`
- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard.blade.php`
- `Modules/EntryExit/resources/views/entry-exit/partials/payment-details.blade.php`
