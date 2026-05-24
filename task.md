# Entry Exit Bill Dashboard API Flow

This note explains what is called by the `entry-exit/bill-dashboard` area and how the bill data is built.

## Page Routes

The bill dashboard is a Laravel server-rendered web page, not a JavaScript SPA page. The Blade views mostly use normal links and GET forms.

| Purpose | Method | Route / URL | Route name | Controller |
| --- | --- | --- | --- | --- |
| Summary dashboard | GET | `/entry-exit/bill-dashboard` | `entry-exit.bill-dashboard.view` | `EntryExitController::billDashboardView` |
| Bill table | GET | `/entry-exit/bill-dashboard/bills` | `entry-exit.bill-dashboard.bills` | `EntryExitController::billDashboardBillsView` |
| Excel export | GET | `/entry-exit/bill-dashboard/bills/export` | `entry-exit.bill-dashboard.bills.export` | `EntryExitController::billDashboardBillsExport` |
| JSON API version | GET | `/api/v1/entry-exit/bill-dashboard` | `entryexit.bill-dashboard.index` | `EntryExitApiController::billDashboard` |

All web routes are behind `auth`, `verified`, and `iam:entry_exit.view_logs`.

The API route is behind `auth:sanctum` and `iam:entry_exit.view_logs`.

## What The Web Page Calls

### `/entry-exit/bill-dashboard`

This is the first dashboard view. It loads:

- Top summary cards: pending, generated today, all-time bills, amount today, amount this month.
- Payment mode breakdown: Cash, UPI, Card, Bank Transfer, Other, Razorpay.
- Location list for filters.
- Filtered collection total for the selected summary period.

The page renders `Modules/EntryExit/resources/views/entry-exit/bill-dashboard-summary.blade.php`.

The summary period form submits back to the same route:

```text
GET /entry-exit/bill-dashboard?summary_period=today
GET /entry-exit/bill-dashboard?summary_period=monthly
GET /entry-exit/bill-dashboard?summary_period=date&date_from=2026-05-24
GET /entry-exit/bill-dashboard?summary_period=date_range&date_from=2026-05-01&date_to=2026-05-24
```

The summary cards link to the bill table route with a `category` query string.

### `/entry-exit/bill-dashboard/bills`

This is the table page. It loads:

- The same top category cards.
- Search, status, payment mode, collection type, branch, date, rows-per-page filters.
- Paginated bill rows.
- Filtered total for the current table query.

The page renders `Modules/EntryExit/resources/views/entry-exit/bill-dashboard.blade.php`.

The filter form submits:

```text
GET /entry-exit/bill-dashboard/bills?category=all_time&status=all&payment_mode=all&collection_type=all&search=&sort=created_at&direction=desc&per_page=15
```

Sorting links submit the same route with `sort` and `direction`.

Pagination is Laravel pagination with the current query string preserved.

### `/entry-exit/bill-dashboard/bills/export`

The Export Excel button calls this route with the current query string:

```text
GET /entry-exit/bill-dashboard/bills/export?...current_filters
```

It runs the same bill filter logic as the table, but returns an `.xlsx` stream.

Export columns include bill ID, customer, phone, branch, staff, duration, status, generated time, entry time, exit time, pass collection, overtime collection, total collection, payment modes, and Razorpay IDs.

## JSON API Endpoint

The API endpoint is:

```text
GET /api/v1/entry-exit/bill-dashboard
Authorization: Bearer <sanctum-token>
```

Supported query parameters are validated by `BillDashboardApiRequest`:

| Parameter | Values / Type | Default |
| --- | --- | --- |
| `category` | `all_time`, `pending`, `generated_today`, `amount_today`, `amount_month` | `all_time` |
| `status` | `all`, `pending`, `completed`, `active`, `expired` | `all` |
| `location_id` | existing `locations.id` | empty |
| `date_from` | date | empty |
| `date_to` | date, after/equal `date_from` | empty |
| `amount_min` | number >= 0 | empty |
| `amount_max` | number >= 0 and >= `amount_min` | empty |
| `search` | string, max 100 | empty |
| `sort` | `bill`, `amount`, `created_at`, `duration`, `status`, `entry_time`, `exit_time` | `created_at` |
| `direction` | `asc`, `desc` | `desc` |
| `per_page` | integer 10-50 | `15` |

Example:

```text
GET /api/v1/entry-exit/bill-dashboard?status=completed&search=Rahul&amount_min=300&amount_max=1000&sort=amount&direction=desc
```

Response shape:

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
    "filters": {},
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

Each API bill row is transformed by `EntryExitApiController::transformEntryExitLog` and includes IDs, names, lifecycle status, entry/exit times, pass amount, overtime amount, payment status/mode, Razorpay IDs, print count, and timestamps.

## Where The Data Comes From

The main source table is:

```text
entry_exit_logs
```

The dashboard eager-loads these relationships:

- `child`
- `customer`
- `parentGuardian`
- `location`
- `staff`

The web table starts from `EntryExitController::billDashboardTransactionQuery()`, which only includes logs where:

```text
payment_status = paid OR overtime_paid = true
```

That means the web dashboard is focused on collected bill transactions.

The API endpoint starts from `EntryExitApiController::filteredBillQuery()`, which loads `EntryExitLog` records and then applies filters. Its amount expression is:

```text
COALESCE(pass_price, 0) + COALESCE(overtime_charge, 0)
```

The web dashboard uses collected amounts:

```text
paid pass amount + paid overtime amount
```

For overtime, the web side prefers `overtime_amount_paid` when present, otherwise `overtime_charge`.

## Filter Logic

Category filters:

- `pending`: `actual_exit_time IS NULL`
- `generated_today` / `amount_today`: `created_at` is today
- `amount_month`: `created_at` is within the current month
- `all_time`: no category date/status restriction

Status filters:

- `pending`: `actual_exit_time IS NULL`
- `completed`: `actual_exit_time IS NOT NULL`
- `active`: `entry_time IS NOT NULL` and `actual_exit_time IS NULL`
- `expired`: `entry_time IS NULL`, `pass_expires_at IS NOT NULL`, and `pass_expires_at` is in the past

Other filters:

- `location_id`: filters by branch.
- `date_from` / `date_to`: filters by `created_at` date.
- `payment_mode` web only: matches pass payment mode, overtime payment mode, or split payment JSON.
- `collection_type` web only:
  - `pass`: paid pass rows with `pass_price > 0`
  - `overtime`: overtime-paid rows with a positive overtime amount
- `amount_min` / `amount_max` API only: filters by API total amount expression.
- `search`: matches bill ID, customer name/phone, parent name/phone, child name, and branch name. The web table also searches Razorpay order/payment IDs.

## Displayed Field Mapping

| UI field | Source |
| --- | --- |
| Bill short code | `entry_exit_logs.id`, displayed as `WIB-` plus first 8 uppercase chars |
| Customer name | `child.name`, else `parentGuardian.name`, else `customer.name`, else `Walk-in Guest` |
| Phone | `parentGuardian.phone`, else `customer.phone` |
| Branch | `location.name` |
| Staff | `staff.name`, else `Reception` |
| Duration | `expected_duration_minutes` |
| Generated date/time | `created_at` |
| Claimed/entry time | `entry_time` |
| Used/exit time | `actual_exit_time` |
| Pass amount | `EntryExitLog::collectedPassAmount()` |
| Overtime amount | `EntryExitLog::collectedOvertimeAmount()` |
| Total amount | `EntryExitLog::collectedBillTotal()` |
| Payment details | `payment_mode`, `payment_splits`, `razorpay_payment_id`, `overtime_payment_mode`, `overtime_razorpay_payment_id` |

## Important Files

- `Modules/EntryExit/routes/web.php`
- `Modules/EntryExit/routes/api.php`
- `Modules/EntryExit/app/Http/Controllers/EntryExitController.php`
- `Modules/EntryExit/app/Http/Controllers/Api/EntryExitApiController.php`
- `Modules/EntryExit/app/Http/Requests/BillDashboardRequest.php`
- `Modules/EntryExit/app/Http/Requests/BillDashboardApiRequest.php`
- `Modules/EntryExit/app/Models/EntryExitLog.php`
- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard-summary.blade.php`
- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard.blade.php`
