# Walk-In Module React Wrapper Handoff

## Purpose

This document explains the existing walk-in module implemented in `Modules/EntryExit` so a separate React wrapper project can reuse the backend with a much simpler UI for non-technical operators.

The current backend already supports the full walk-in lifecycle:

1. Customer/parent lookup
2. Pass creation
3. Pass payment
4. QR entry scan
5. Overtime settlement
6. QR exit scan
7. Exit OTP verification
8. Occupancy and billing views

## Recommended Wrapper Goal

Build the React project as a thin frontend over the existing Laravel APIs. Do not re-implement business logic in React. Keep the UI task-based:

1. `New Walk-In`
2. `Collect Payment`
3. `Scan Entry`
4. `Settle Overtime`
5. `Scan Exit`
6. `Live Occupancy`
7. `Passes / Bills`

For non-technical users, each screen should have one primary action, large buttons, minimal filters, and plain labels like:

- `Find Customer`
- `Create Pass`
- `Take Payment`
- `Print Pass`
- `Scan to Enter`
- `Scan to Exit`
- `Verify OTP`

## Base Domain and API Prefix

The domain is environment-dependent.

- Laravel app base URL comes from `APP_URL`
- Default local fallback in code: `http://localhost`
- OpenAPI stub server in generated docs is only a placeholder: `http://my-default-host.com`

For the new wrapper, treat these as the real patterns:

- App domain: `https://your-domain.com`
- API base: `https://your-domain.com/api/v1`
- Walk-in API base: `https://your-domain.com/api/v1/entry-exit`
- Auth API base: `https://your-domain.com/api/v1/auth`
- Core location API base: `https://your-domain.com/api/v1/core`

## Authentication

The mobile/wrapper flow should use Sanctum bearer tokens.

### Login

- `POST /api/v1/auth/login`

Payload:

```json
{
  "email": "staff@example.com",
  "password": "password",
  "device_name": "walkin-react-wrapper"
}
```

Success response:

```json
{
  "message": "Authenticated successfully.",
  "token_type": "Bearer",
  "access_token": "1|exampletokenvalue",
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "staff@example.com",
    "roles": ["admin"],
    "permissions": ["entry_exit.issue_pass"]
  }
}
```

Use header on all protected calls:

```http
Authorization: Bearer <access_token>
Accept: application/json
Content-Type: application/json
```

### Session helpers

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

## Permissions You Need

The wrapper user must have backend permissions. Main ones:

- `entry_exit.lookup`
- `entry_exit.issue_pass`
- `entry_exit.commit_entry`
- `entry_exit.record_exit`
- `entry_exit.guardian_verification`
- `entry_exit.view_occupancy`
- `entry_exit.view_logs`
- `entry_exit.manage_duration_prices`
- `entry_exit.manage_settings`

Minimum practical staff setup for a full wrapper:

- reception user: `lookup`, `issue_pass`, `view_logs`
- gate entry user: `commit_entry`
- gate exit user: `record_exit`
- manager/admin: add `view_occupancy`, `manage_duration_prices`, `manage_settings`

## Required Supporting API

The walk-in creation API requires `location_id`.

### Locations

- `GET /api/v1/core/locations`

Use this if your wrapper needs branch selection. If each operator is branch-locked in practice, load once at login and keep a default selected branch.

## Main Walk-In API Map

Base prefix for all endpoints below:

`/api/v1/entry-exit`

### 1. Customer / Parent Lookup

- `GET /parents/search?query=...`
- `GET /parents/lookup?phone=...`
- `GET /sessions/lookup?phone=...`
- `GET /passes/lookup?customer_id=...`
- `GET /passes/lookup?phone=...`

Use cases:

- search previous customer/parent by name or phone
- prefill walk-in form
- check active/open sessions before creating a new pass
- show full history for a customer

### 2. Pass Creation and Payment

- `POST /passes`
- `GET /passes`
- `POST /passes/mark-paid`
- `POST /passes/razorpay-order`
- `POST /passes/razorpay-verify`
- `POST /passes/record-print`

### 3. Entry / Exit Operations

- `POST /passes/scan-entry`
- `POST /passes/scan-exit`
- `POST /passes/verify-exit-otp`
- `POST /guardian-verification`

### 4. Overtime Operations

- `GET /overtime-settlements?phone=...`
- `POST /overtime-settlements`
- `POST /overtime-settlements/razorpay-order`
- `POST /overtime-settlements/razorpay-verify`
- `POST /passes/mark-overtime-paid`

### 5. Monitoring and Reports

- `GET /live-occupancy`
- `GET /logs`
- `GET /kids-status`
- `GET /bill-dashboard`

### 6. Duration Pricing and Rules

- `GET /duration-prices`
- `POST /duration-prices`
- `DELETE /duration-prices/{id}`
- `PUT /duration-prices/exit-grace`

## Core Data Shapes the Wrapper Should Understand

### EntryExitLog

This is the main walk-in pass/session record.

Important fields returned by many APIs:

- `id`
- `location_id`
- `location_name`
- `customer_id`
- `customer_name`
- `parent_id`
- `parent_name`
- `child_id`
- `child_name`
- `entry_type`
- `entry_time`
- `booked_exit_time`
- `actual_exit_time`
- `expected_duration_minutes`
- `pass_price`
- `bill_base_amount`
- `bill_overtime_amount`
- `bill_total_amount`
- `payment_status`
- `payment_mode`
- `paid_at`
- `issued_at`
- `print_count`
- `overtime_minutes`
- `overtime_charge`
- `overtime_paid`
- `overtime_payment_mode`
- `overtime_paid_at`
- `overtime_amount_paid`
- `pass_expires_at`
- `pass_lifecycle_status`
- `pass_lifecycle_label`

### Pass lifecycle statuses

- `payment_pending`
- `issued_not_scanned`
- `claimed_inside`
- `used_checked_out`
- `expired`

### Payment modes

- `cash`
- `upi`
- `card`
- `bank_transfer`
- `other`
- `razorpay`

## Frontend Flow You Should Implement

## Screen 1: New Walk-In

Recommended user flow:

1. Search by phone
2. If customer exists, prefill parent/child details
3. Show active sessions if any
4. Select existing child or create new child
5. Select branch
6. Select duration or duration price
7. Create pass
8. If payment required, move directly to payment step

### Lookup existing customer

#### `GET /parents/lookup?phone=9001112222`

Typical success shape:

```json
{
  "status": "ok",
  "data": {
    "record_type": "parent",
    "customer": {
      "id": "customer-uuid",
      "name": "Search Parent",
      "phone": "9001112222"
    },
    "parent": {
      "id": "parent-uuid",
      "name": "Search Parent",
      "phone": "9001112222"
    },
    "children": [
      {
        "id": "child-uuid",
        "name": "Kid 1",
        "age": 5
      }
    ],
    "active_sessions": []
  }
}
```

### Create pass

#### `POST /passes`

This endpoint supports:

- direct customer walk-in
- parent + existing child
- parent + new child creation during pass issuance
- multiple child passes in one request
- duration by hours/minutes
- duration by standard duration price row

#### Simple existing parent + child example

```json
{
  "location_id": "location-uuid",
  "parent_id": "parent-uuid",
  "phone": "9001112222",
  "child_ids": ["child-uuid"],
  "hours": 2
}
```

#### Existing customer without parent example

```json
{
  "location_id": "location-uuid",
  "phone": "9001114444",
  "customer_id": "customer-uuid",
  "hours": 2
}
```

#### Existing customer, create 3 children on the fly

```json
{
  "location_id": "location-uuid",
  "phone": "9001114444",
  "customer_id": "customer-uuid",
  "child_count": 3,
  "child_names": ["API Child One", "", "API Child Three"],
  "hours": 2
}
```

#### Duration-price based example

```json
{
  "location_id": "location-uuid",
  "phone": "9001112222",
  "parent_id": "parent-uuid",
  "child_ids": ["child-1-uuid"],
  "child_names": ["New Child"],
  "child_count": 1,
  "duration_price_id": "duration-price-uuid"
}
```

#### Validation notes

- `location_id` is required
- provide one of:
  - `parent_id`
  - `customer_id`
  - `customer_name`
- for duration provide one of:
  - `hours`
  - `duration_minutes`
  - `duration_price_id`
- if using `parent_id`, at least one child must exist or be created

#### Success result

- `201 Created`
- returns `data[]` of passes
- returns `payment.required`

If `payment.required = true`, take user to payment immediately.

#### Important error states

- `409 already_inside`
- `422 pass_pricing_inactive`
- `500 unable to generate`

## Screen 2: Collect Payment

Use this after pass generation if returned passes are unpaid.

### List/search passes

- `GET /passes?status=pending&search=...`

### Manual payment

- `POST /passes/mark-paid`

```json
{
  "ids": ["log-uuid-1", "log-uuid-2"],
  "payment_mode": "upi"
}
```

Success:

- payment becomes `paid`
- passes become printable

### Razorpay payment

#### Create order

- `POST /passes/razorpay-order`

```json
{
  "ids": ["log-uuid-1", "log-uuid-2"]
}
```

Response includes:

- `data.key`
- `data.amount`
- `data.currency`
- `data.order_id`
- `payment.razorpay_order_id`

#### Verify payment

- `POST /passes/razorpay-verify`

```json
{
  "ids": ["log-uuid-1", "log-uuid-2"],
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx"
}
```

### Record print

- `POST /passes/record-print`

```json
{
  "ids": ["log-uuid-1", "log-uuid-2"]
}
```

Use this after successful print so the backend maintains `print_count`.

## Screen 3: Scan Entry

### Commit entry

- `POST /passes/scan-entry`

```json
{
  "scan_token": "entry-exit-log-uuid"
}
```

Success:

- marks `entry_time`
- calculates `booked_exit_time` from scan time if `expected_duration_minutes` exists

Handle these errors in UI:

- invalid QR
- payment pending
- already inside
- pass already used
- pass expired

## Screen 4: Settle Overtime

This should be a separate simple screen for operators.

### Find open sessions by phone

- `GET /overtime-settlements?phone=9001112222`

Each settlement item can return:

- `settlement_status = due`
- `settlement_status = settled`
- `settlement_status = not_due`

Also:

- `can_settle`
- `can_scan_exit`
- `overtime_minutes`
- `chargeable_minutes`
- `overtime_charge`
- `grace_minutes`

### Manual overtime settlement

- `POST /overtime-settlements`

```json
{
  "id": "log-uuid",
  "payment_mode": "cash"
}
```

Alternative endpoint with same effect:

- `POST /passes/mark-overtime-paid`

### Razorpay overtime settlement

#### Create order

- `POST /overtime-settlements/razorpay-order`

```json
{
  "id": "log-uuid"
}
```

#### Verify

- `POST /overtime-settlements/razorpay-verify`

```json
{
  "id": "log-uuid",
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx"
}
```

## Screen 5: Scan Exit

### Start exit scan

- `POST /passes/scan-exit`

```json
{
  "scan_token": "entry-exit-log-uuid"
}
```

Possible outcomes:

### Outcome A: OTP required

```json
{
  "status": "exit_otp_required",
  "message": "Exit OTP sent to registered guardian phone number.",
  "data": {
    "id": "log-uuid",
    "otp_expires_at": "2026-05-20T12:00:00.000000Z",
    "otp_phone": "******2222",
    "can_verify_exit": true,
    "verify_url": "https://your-domain.com/api/v1/entry-exit/passes/verify-exit-otp"
  }
}
```

### Outcome B: overtime due

```json
{
  "status": "overtime_due",
  "message": "Overtime payment is due before exit can be recorded.",
  "data": {
    "id": "log-uuid",
    "overtime_minutes": 6,
    "chargeable_minutes": 10,
    "overtime_charge": 25,
    "grace_minutes": 10
  }
}
```

If overtime is due, redirect operator to the overtime payment step.

### Verify exit OTP

- `POST /passes/verify-exit-otp`

```json
{
  "scan_token": "entry-exit-log-uuid",
  "otp": "123456"
}
```

Success:

- records `actual_exit_time`
- returns final overtime values
- stores `guardian_verification_mode = otp`

## Screen 6: Manual Guardian Verification

Use only if your process wants a staff-driven verification flow.

- `POST /guardian-verification`

```json
{
  "entry_exit_log_id": "log-uuid",
  "mode": "otp"
}
```

Allowed modes:

- `otp`
- `id`

This can also close the session if exit is still open.

## Screen 7: Live Occupancy

- `GET /live-occupancy`

Use this for a TV/dashboard or a simple operator screen.

Response contains:

- `occupancy_count`
- `active_sessions[]`

## Screen 8: Bills / Passes / History

### Pass list

- `GET /passes?status=pending|paid&search=...&per_page=20`

### Bill dashboard

- `GET /bill-dashboard`

Supported query params:

- `category`
- `status`
- `location_id`
- `date_from`
- `date_to`
- `amount_min`
- `amount_max`
- `search`
- `sort`
- `direction`
- `per_page`

Important status filters:

- `all`
- `pending`
- `completed`
- `active`
- `expired`

### Logs

- `GET /logs`
- optional `child_id`
- optional `booking_id`

### Kids status

- `GET /kids-status`

Good for a very simple “inside / outside” screen.

## Pricing and Rules

### List duration prices

- `GET /duration-prices`
- `GET /duration-prices?price_type=standard`
- `GET /duration-prices?price_type=overtime`

Each row returns:

- `id`
- `price_type`
- `duration_minutes`
- `duration_label`
- `price`
- `is_active`
- `sort_order`

### Create duration price

- `POST /duration-prices`

```json
{
  "price_type": "overtime",
  "duration_minutes": 30,
  "price": 75,
  "is_active": true,
  "sort_order": 1
}
```

### Delete duration price

- `DELETE /duration-prices/{id}`

### Update exit grace minutes

- `PUT /duration-prices/exit-grace`

```json
{
  "exit_grace_minutes": 15
}
```

## Rules the Frontend Must Respect

### 1. Never create business logic locally

Use backend responses as source of truth for:

- overtime due
- pass expiry
- active session conflicts
- payment state
- lifecycle state

### 2. Expect one QR token per log

The scan token is the `EntryExitLog.id`.

### 3. One customer can produce multiple pass logs

Especially when multiple children are selected.

### 4. Overtime can be settled before gate exit

The backend supports settling overtime first, then doing exit OTP later.

### 5. Settled overtime should not be recalculated later

The service preserves the settled overtime amount even if gate exit happens later.

## Recommended React App Structure

Suggested routes:

- `/login`
- `/walkin/new`
- `/walkin/payment`
- `/walkin/scan-entry`
- `/walkin/overtime`
- `/walkin/scan-exit`
- `/walkin/occupancy`
- `/walkin/passes`
- `/walkin/bills`

Suggested shared services:

- `authApi.ts`
- `entryExitApi.ts`
- `locationApi.ts`
- `types/entryExit.ts`

Suggested state approach:

- React Query for server state
- route-driven screens
- local component state only for temporary form fields

## Recommended “Very Simple UI” Patterns

- Use a phone-number-first workflow
- Auto-open the next screen after success
- Hide advanced filters by default
- Use one large primary CTA per page
- Show backend message text directly after actions
- Use green for success, amber for due/pending, red for blocked
- Print automatically after payment if your branch process wants it
- Show masked guardian phone during OTP flow

## Important Error Cases to Handle Cleanly

- invalid QR
- customer not found
- already inside
- prices inactive
- payment pending
- pass expired
- overtime due
- wrong OTP
- forbidden permission
- Razorpay signature failure

## Fastest MVP Integration Order

1. Login
2. Load locations
3. Parent/customer lookup
4. Create pass
5. Mark pass paid
6. Record print
7. Scan entry
8. Scan exit
9. Verify OTP
10. Add overtime settlement screen
11. Add occupancy and bills

## Source of Truth in This Repo

Main implementation files:

- `Modules/EntryExit/routes/api.php`
- `Modules/EntryExit/app/Http/Controllers/Api/EntryExitApiController.php`
- `Modules/EntryExit/app/Services/EntryExitService.php`
- `Modules/EntryExit/app/Models/EntryExitLog.php`
- `Modules/EntryExit/app/Http/Requests/*`
- `tests/Feature/EntryExitApiTest.php`
- `storage/api-docs/api-docs.json`

## Final Integration Summary

If you build the new React wrapper against the existing backend, the minimum backend domains you need are:

- `https://your-domain.com/api/v1/auth/*`
- `https://your-domain.com/api/v1/core/locations*`
- `https://your-domain.com/api/v1/entry-exit/*`

If you want, the next step can be a second doc that converts this into:

1. a React page map
2. a TypeScript API client contract
3. exact request/response interfaces for each endpoint
