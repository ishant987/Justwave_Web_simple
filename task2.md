# Walk-In Bill Dashboard, Generated Passes, Visit History, and Full API Reference

## Purpose

This document is a deeper backend reference for the walk-in module.

It focuses on:

1. `Bill Dashboard`
2. `Generated Passes`
3. `Visit History`
4. full `Walk-In Passes` API coverage

Use this when building a separate React wrapper or when reproducing the current Laravel screens in another frontend.

## Main Backend Files

These are the main source files behind the features below:

- `Modules/EntryExit/routes/web.php`
- `Modules/EntryExit/routes/api.php`
- `Modules/EntryExit/app/Http/Controllers/EntryExitController.php`
- `Modules/EntryExit/app/Http/Controllers/Api/EntryExitApiController.php`
- `Modules/EntryExit/app/Services/EntryExitService.php`
- `Modules/EntryExit/app/Models/EntryExitLog.php`
- `Modules/EntryExit/app/Http/Requests/BillDashboardRequest.php`
- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard-summary.blade.php`
- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard.blade.php`
- `Modules/EntryExit/resources/views/entry-exit/passes.blade.php`
- `Modules/EntryExit/resources/views/entry-exit/log.blade.php`

## Walk-In Web Views

## 1. Bill Dashboard Summary View

### Web route

- `GET /entry-exit/bill-dashboard`
- route name: `entry-exit.bill-dashboard.view`
- permission: `entry_exit.view_logs`

### Controller method

- `EntryExitController::billDashboardView()`

### Blade file

- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard-summary.blade.php`

### What this page shows

This is the summary dashboard page, not the full table.

It shows:

- `Pending`
- `Generated Today`
- `All Time Bills`
- `Total Amount Today`
- `Total Amount Month`
- `Collection By Payment Mode`
- `Filtered Total`

### Summary cards

Each card links into the detailed bills table page with a category filter:

- `pending`
- `generated_today`
- `all_time`
- `amount_today`
- `amount_month`

### Payment mode breakdown

This section is built using `paymentModeBreakdown()` and splits totals into:

- `cash`
- `upi`
- `card`
- `bank_transfer`
- `other`
- `razorpay`

For each mode it shows:

- total collected amount
- total transaction count
- pass collection amount and count
- overtime collection amount and count

### Filters used on summary view

This page uses:

- `summary_period`
- `date_from`
- `date_to`
- `status`
- `location_id`

Allowed `summary_period` values:

- `today`
- `monthly`
- `date_range`
- `date`

### How totals are built

Summary totals come from paid transaction rows only.

Backend uses:

- pass amount counts only when `payment_status = paid`
- overtime amount counts only when `overtime_paid = true`

The total expression is:

- paid pass amount
- plus paid overtime amount

Unpaid prepared passes do not contribute to collection totals.

## 2. Bill Dashboard Bills Table View

### Web route

- `GET /entry-exit/bill-dashboard/bills`
- route name: `entry-exit.bill-dashboard.bills`
- permission: `entry_exit.view_logs`

### Controller method

- `EntryExitController::billDashboardBillsView()`
- data builder: `EntryExitController::billDashboardTableData()`

### Blade file

- `Modules/EntryExit/resources/views/entry-exit/bill-dashboard.blade.php`

### What this page shows

This is the full bills table view.

It shows:

- summary cards again on top
- advanced filters
- sortable bill table
- filtered total
- pagination

### Bill table columns

The table columns are:

1. `Bill`
2. `Customer`
3. `Branch`
4. `Duration`
5. `Amount`
6. `Status`
7. `Generated`

### Bill row display logic

For each row:

- bill code shown as `WIB-` + first 8 chars of ID
- customer display order:
  - child name
  - else parent name
  - else customer name
  - else walk-in guest
- contact display:
  - parent phone
  - else customer phone
- branch display:
  - location name
- staff display:
  - staff name
  - else `Reception`
- duration:
  - `expected_duration_minutes`
  - else `Flexible`
- amount:
  - pass + overtime combined
- extra amount hint:
  - `Pass X + OT Y` when overtime exists

### Bill status badge logic

The status text is derived as:

- `Used / Checked out` when `actual_exit_time` exists
- `Expired` when entry not scanned and `pass_expires_at` is past
- `Claimed / Inside` when `entry_time` exists and no exit yet
- `Issued / Not scanned` when paid but entry not scanned
- `Payment Pending` otherwise

### Bill dashboard filters

From `BillDashboardRequest`, supported filters are:

- `category`
- `summary_period`
- `status`
- `payment_mode`
- `collection_type`
- `location_id`
- `date_from`
- `date_to`
- `search`
- `sort`
- `direction`
- `per_page`

Allowed `category` values:

- `all_time`
- `pending`
- `generated_today`
- `amount_today`
- `amount_month`

Allowed `status` values:

- `all`
- `pending`
- `completed`
- `active`
- `expired`

Allowed `payment_mode` values:

- `all`
- `cash`
- `upi`
- `card`
- `bank_transfer`
- `other`
- `razorpay`
- `split`

Allowed `collection_type` values:

- `all`
- `pass`
- `overtime`

Allowed `sort` values:

- `bill`
- `amount`
- `created_at`
- `duration`
- `status`
- `entry_time`
- `exit_time`

### Search behavior in bill dashboard

Search checks:

- `entry_exit_logs.id`
- `razorpay_order_id`
- `razorpay_payment_id`
- customer `name` or `phone`
- parent `name` or `phone`
- child `name`
- location `name`

### Staff branch lock behavior

If the logged-in user has a staff location, the backend forces:

- `filters['location_id'] = staff location id`

So for branch-linked staff, the branch filter is effectively locked.

## 3. Generated Passes View

### Web route

- `GET /entry-exit/passes`
- route name: `entry-exit.passes.view`
- permission: `entry_exit.view_logs`

### Controller method

- `EntryExitController::passesView()`

### Blade file

- `Modules/EntryExit/resources/views/entry-exit/passes.blade.php`

### What this page shows

This page is the generated passes list for reception/payment follow-up.

It is used for:

- reviewing created passes
- taking payment on pending passes
- reprinting already paid passes

### Filters

This page supports:

- `search`
- `status`

Allowed `status` values:

- empty = all
- `pending`
- `paid`

### Search behavior

Search checks:

- pass ID
- `razorpay_order_id`
- `razorpay_payment_id`
- customer `name` or `phone`
- parent `name` or `phone`
- child `name`

### Table columns

The table columns are:

1. `Pass`
2. `Guest`
3. `Branch`
4. `Payment`
5. `Issued`
6. `Action`

### Row behavior

For each pass:

- pass code shown as `WIP-` + first 8 chars of ID
- guest shown as child name or customer name
- branch shown from location
- payment badge:
  - `Paid`
  - `Pending`
- payment amount shown as `pass_price`
- action:
  - `Print` if paid
  - `Take Payment` if pending

### Action URLs in current Laravel view

- print:
  - `route('entry-exit.print-pass.view', ['ids' => $pass->id])`
- payment:
  - `route('entry-exit.payment.view', ['ids' => $pass->id])`

## 4. Visit History View

### Web route

- `GET /entry-exit/logs`
- route name: `entry-exit.logs.view`
- permission: `entry_exit.view_logs`

### Controller method

- `EntryExitController::entryExitLogView()`

### Blade file

- `Modules/EntryExit/resources/views/entry-exit/log.blade.php`

### What this page shows

This is the visit history / log history page.

It shows historical walk-in logs with:

- session status
- child and parent details
- pass timing
- payment state
- guardian verification state
- pass re-open / print action

### Filters

The page supports:

- `child_id`
- `booking_id`

These are exact ID filters, not a fuzzy search box.

### Sorting and pagination

Rows are ordered by:

- `COALESCE(entry_time, created_at) DESC`

Pagination:

- `25` rows per page

### Additional data loaded

The controller also loads verifier names using:

- `guardian_verified_by`

So the table can show the verifying staff member name instead of only the raw user ID.

### Visit history table columns

The table columns are:

1. `Status`
2. `Child & Parent Details`
3. `Pass Timings`
4. `Payment`
5. `Verification`
6. `Actions`

### Status column behavior

Badges shown are:

- `Checked Out`
- `Inside`
- `Pass Issued`

It also shows a short form of the log ID.

### Child & Parent Details behavior

This block shows:

- child name
- parent guardian name
- parent phone
- walk-in tag when `entry_type = walk_in`

### Pass Timings behavior

If entry is already scanned:

- `In`
- `Expected Out`
- `Out`
- overtime badge like `+ X min OT` if overtime exists

If entry is not scanned yet:

- `Issued`
- `Expected Out`
- `Expires`

### Payment column behavior

This section shows:

- `Paid` or `Pending`
- pass amount
- partial payment details include file:
  - `entryexit::entry-exit.partials.payment-details`

### Verification column behavior

Shows:

- `Guardian Verified` badge when `guardian_verification_mode` exists
- `By: staff name` if `guardian_verified_by` exists
- otherwise `Pending`

### Action column behavior

Action currently shown:

- `Pass`

This links to:

- `route('entry-exit.print-pass.view', ['ids' => $log->id])`

So in a React wrapper this can be treated as:

- `View/Print pass`

## Walk-In API Routes: Full Inventory

All API routes below are under:

- `/api/v1/entry-exit`

All are protected by:

- `auth:sanctum`

## A. Lookup APIs

### 1. Search parents/customers

- `GET /api/v1/entry-exit/parents/search`
- controller: `EntryExitApiController::searchParents`
- permission: `entry_exit.lookup` or `entry_exit.issue_pass`

Query params:

- `query`

Purpose:

- search previous customer/parent by name or phone

### 2. Lookup parent/customer by phone

- `GET /api/v1/entry-exit/parents/lookup`
- controller: `EntryExitApiController::lookupParentByPhone`
- permission: `entry_exit.lookup` or `entry_exit.issue_pass`

Query params:

- `phone`

Purpose:

- fetch one matched customer
- return customer, parent, children, active sessions

### 3. Lookup open sessions by phone

- `GET /api/v1/entry-exit/sessions/lookup`
- controller: `EntryExitApiController::lookupOpenSessions`
- permission: `entry_exit.lookup` or `entry_exit.issue_pass`

Query params:

- `phone`

Purpose:

- get active sessions before issuing a new pass

### 4. Lookup full pass history by customer or phone

- `GET /api/v1/entry-exit/passes/lookup`
- controller: `EntryExitApiController::lookupPasses`

Query params:

- `customer_id`
- or `phone`

Purpose:

- fetch full pass history with eager-loaded details:
  - customer
  - parent guardian
  - child
  - location
  - booking
  - staff

## B. Walk-In Pass Creation APIs

### 5. Issue walk-in passes

- `POST /api/v1/entry-exit/passes`
- controller: `EntryExitApiController::issuePass`
- permission: `entry_exit.issue_pass`

Request fields:

- `location_id`
- `phone`
- `customer_id`
- `customer_name`
- `child_name`
- `child_names[]`
- `child_count`
- `parent_id`
- `child_ids[]`
- `hours`
- `duration_minutes`
- `duration_price_id`
- `booking_id`

Purpose:

- create one or many pass logs
- optionally create parent/child records on the fly

Main responses:

- `201 Created`
- `409 already_inside`
- `422 pass_pricing_inactive`

## C. Pass Listing / Payment / Printing APIs

### 6. List passes

- `GET /api/v1/entry-exit/passes`
- controller: `EntryExitApiController::passes`
- permission: `entry_exit.view_logs`

Query params:

- `status`
- `search`
- `per_page`

### 7. Mark passes paid manually

- `POST /api/v1/entry-exit/passes/mark-paid`
- controller: `EntryExitApiController::markPassesPaid`
- permission: `entry_exit.issue_pass`

Request body:

- `ids[]`
- `payment_mode`

### 8. Create Razorpay order for pass payment

- `POST /api/v1/entry-exit/passes/razorpay-order`
- controller: `EntryExitApiController::createPassRazorpayOrder`
- permission: `entry_exit.issue_pass`

Request body:

- `ids[]`

Response includes:

- Razorpay checkout payload
- payment metadata

### 9. Verify Razorpay payment for passes

- `POST /api/v1/entry-exit/passes/razorpay-verify`
- controller: `EntryExitApiController::verifyPassRazorpayPayment`
- permission: `entry_exit.issue_pass`

Request body:

- `ids[]`
- `razorpay_order_id`
- `razorpay_payment_id`
- `razorpay_signature`

### 10. Record pass print

- `POST /api/v1/entry-exit/passes/record-print`
- controller: `EntryExitApiController::recordPassPrint`
- permission: `entry_exit.issue_pass`

Request body:

- `ids[]`

Purpose:

- increments `print_count`

## D. Entry / Exit APIs

### 11. Scan entry

- `POST /api/v1/entry-exit/passes/scan-entry`
- controller: `EntryExitApiController::scanEntry`
- permission: `entry_exit.commit_entry`

Request body:

- `scan_token`

Purpose:

- commit entry
- set `entry_time`
- calculate `booked_exit_time`

### 12. Scan exit

- `POST /api/v1/entry-exit/passes/scan-exit`
- controller: `EntryExitApiController::scanExit`
- permission: `entry_exit.record_exit`

Request body:

- `scan_token`

Possible responses:

- `exit_otp_required`
- `overtime_due`
- invalid/used/error states

### 13. Verify exit OTP

- `POST /api/v1/entry-exit/passes/verify-exit-otp`
- controller: `EntryExitApiController::verifyExitOtp`
- permission: `entry_exit.record_exit`

Request body:

- `scan_token`
- `otp`

Purpose:

- consume OTP
- mark guardian verification as OTP
- record exit

### 14. Manual guardian verification

- `POST /api/v1/entry-exit/guardian-verification`
- controller: `EntryExitApiController::verifyGuardian`
- permission: `entry_exit.guardian_verification`

Request body:

- `entry_exit_log_id`
- `mode`
- `verification_code`

Allowed `mode` values:

- `otp`
- `id`

## E. Overtime APIs

### 15. Lookup overtime settlements

- `GET /api/v1/entry-exit/overtime-settlements`
- controller: `EntryExitApiController::overtimeSettlements`
- permission: `entry_exit.record_exit`

Query params:

- `phone`

Purpose:

- find open sessions for a phone
- return settlement status

### 16. Settle overtime manually

- `POST /api/v1/entry-exit/overtime-settlements`
- controller: `EntryExitApiController::settleOvertime`
- permission: `entry_exit.record_exit`

Request body:

- `id`
- `payment_mode`

### 17. Mark overtime paid

- `POST /api/v1/entry-exit/passes/mark-overtime-paid`
- controller: `EntryExitApiController::markOvertimePaid`
- permission: `entry_exit.record_exit`

Request body:

- `id`
- `payment_mode`

Purpose:

- alternate overtime settle endpoint

### 18. Create Razorpay order for overtime

- `POST /api/v1/entry-exit/overtime-settlements/razorpay-order`
- controller: `EntryExitApiController::createOvertimeRazorpayOrder`
- permission: `entry_exit.record_exit`

Request body:

- `id`

### 19. Verify Razorpay overtime payment

- `POST /api/v1/entry-exit/overtime-settlements/razorpay-verify`
- controller: `EntryExitApiController::verifyOvertimeRazorpayPayment`
- permission: `entry_exit.record_exit`

Request body:

- `id`
- `razorpay_order_id`
- `razorpay_payment_id`
- `razorpay_signature`

## F. Reporting / Monitoring APIs

### 20. Live occupancy

- `GET /api/v1/entry-exit/live-occupancy`
- controller: `EntryExitApiController::liveOccupancy`
- permission: `entry_exit.view_occupancy`

Returns:

- `occupancy_count`
- `active_sessions[]`

### 21. Visit history logs

- `GET /api/v1/entry-exit/logs`
- controller: `EntryExitApiController::logs`
- permission: `entry_exit.view_logs`

Query params:

- `child_id`
- `booking_id`

### 22. Kids status

- `GET /api/v1/entry-exit/kids-status`
- controller: `EntryExitApiController::kidsStatus`
- permission: `entry_exit.view_logs`

Returns recent child check-in/check-out status rows.

### 23. Bill dashboard API

- `GET /api/v1/entry-exit/bill-dashboard`
- controller: `EntryExitApiController::billDashboard`
- permission: `entry_exit.view_logs`

Query params:

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

Returns:

- summary
- filtered total
- filters
- paginated bills

## G. Duration Pricing and Settings APIs

### 24. List duration prices

- `GET /api/v1/entry-exit/duration-prices`
- controller: `EntryExitApiController::durationPrices`

Query params:

- `price_type`

Allowed `price_type` values:

- `standard`
- `overtime`

### 25. Update exit grace period

- `PUT /api/v1/entry-exit/duration-prices/exit-grace`
- controller: `EntryExitApiController::updateExitGracePeriod`
- permission: `entry_exit.manage_duration_prices`

Request body:

- `exit_grace_minutes`

### 26. Create duration price

- `POST /api/v1/entry-exit/duration-prices`
- controller: `EntryExitApiController::storeDurationPrice`
- permission: `entry_exit.manage_duration_prices`

Request body:

- `price_type`
- `duration_minutes`
- `price`
- `is_active`
- `sort_order`

### 27. Delete duration price

- `DELETE /api/v1/entry-exit/duration-prices/{durationPrice}`
- controller: `EntryExitApiController::destroyDurationPrice`
- permission: `entry_exit.manage_duration_prices`

## Important EntryExitLog Fields for UI

The main UI model is `EntryExitLog`.

Key fields returned in APIs:

- `id`
- `location_id`
- `location_name`
- `customer_id`
- `customer_name`
- `parent_id`
- `parent_name`
- `child_id`
- `child_name`
- `booking_id`
- `entry_type`
- `pass_lifecycle_status`
- `pass_lifecycle_label`
- `entry_time`
- `booked_exit_time`
- `actual_exit_time`
- `guardian_verification_mode`
- `guardian_verified_by`
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

## Recommended React Mapping for These 3 Screens

### Bill Dashboard

Recommended wrapper tabs:

- `Summary`
- `Bills Table`

Recommended cards:

- pending
- generated today
- all time
- amount today
- amount month

Recommended filters:

- search
- status
- payment mode
- collection type
- branch
- from
- to
- rows

### Generated Passes

Recommended wrapper actions:

- `Take Payment`
- `Print Pass`
- `Search Pass`
- `Show Pending Only`

### Visit History

Recommended wrapper blocks:

- status badge
- child and parent block
- timing block
- payment block
- verification block
- print/view pass action

## Final Summary

If you are rebuilding these parts in React, the three most important backend pairs are:

- Bill dashboard web logic:
  - `billDashboardView()`
  - `billDashboardBillsView()`
- Generated passes web logic:
  - `passesView()`
- Visit history web logic:
  - `entryExitLogView()`

And the matching API side to consume in React is:

- `/api/v1/entry-exit/bill-dashboard`
- `/api/v1/entry-exit/passes`
- `/api/v1/entry-exit/logs`
- plus the supporting walk-in pass APIs listed above

If you want, the next step can be one more document with:

1. exact TypeScript interfaces for all walk-in responses
2. a React page-wise API call map
3. a component hierarchy for Bill Dashboard, Generated Passes, and Visit History
