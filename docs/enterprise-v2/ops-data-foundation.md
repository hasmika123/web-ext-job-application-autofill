# Ops data foundation: HR, Finance and Reports (schema, entities, repositories, demo data)

> Branch `ent-ops-data` (cut from `ent-boards`). **Read this first** if you build the HR, Finance or Reports page. It gives you tables, entities,
> repositories, seeded demo data and the formula for every KPI, tile and series on the three boards (`design/enterprise-more/hr.png`,
> `finance.png`, `reports.png`). You still write the REST resource, service and web UI. Template: `talent-foundation.md`. Rules: `41-database-design.md`,
> CLAUDE.md (**no sensitive PII**, 404 not 403, admin-config-driven, `@kiwiply/ui` only), `36-hr-and-finance.md` (E2: record-only).

## 1. Record-only line (E2)

No phone, date of birth, identity-document number, SSN/tax id, bank/routing/IBAN column exists in any of these tables (the boards' phone line in the
HR drawer is **not** shown: show work email only). Documents are tracked by **type + status** only (`hr_document_requirement`); there is no file, number or
content. Money is `*_minor` + `currency` and is **recorded, never moved** (`finance_payment` is a record of a payment made elsewhere; no payment
provider, no bank data). `OpsSchemaIT.noOpsTableHasAColumnThatCouldHoldSensitivePii` scans every column name. Free text you add on write
(`hr_employee_note.body`, `finance_payment.memo`, `reject_reason`) must go through `SensitiveContent`/`@NoSensitiveText`.

## 2. Tables (changelog `20261101010000_ent_ops_data.xml`, last in `master.xml`)

Same rules as talent: `org_id NOT NULL` + FK `organization`, every secondary index starts with `org_id`, composite tenant FKs `(org_id, parent_id)` to the
parent's `uk_<t>_org_id`, varchar enum names, `DATETIME(6)` UTC, one guarded changeSet per table, empty rollbacks. Also adds
`uk_talent_placement_org_id` (the talent table lacked its `(org_id, id)` key).

| Table | Purpose / board source |
|---|---|
| `hr_employee` | One HR record per seat (`member_id`) and per consultant (`consultant_id`; a consultant who holds a seat has **one** record with both ids). Directory row of the HR board: `display_name`, `work_email`, `job_title`, `employment_type` FULL_TIME/CONTRACT, `department_group_id`, `manager_member_id`, `work_city`+`work_region` (city/region only), `start_date`, `end_date`, `employment_status` ACTIVE/ON_LEAVE/OFFBOARDING (ENDED allowed, none seeded), `onboarding_stage` NOT_STARTED/IN_PROGRESS/COMPLETED, `onboarding_started_at`/`_completed_at`, `last_activity_at` |
| `hr_employee_note` | Notes tab |
| `hr_onboarding_item` | Onboarding Checklist: title, `due_date`, `done`, `done_at`, `required`, `sort_order` (5 per employee) |
| `hr_document_requirement` | Required Documents card: `doc_type` ID_VERIFICATION / TAX_FORM / DIRECT_DEPOSIT / EMPLOYMENT_ELIGIBILITY / EMERGENCY_CONTACT / POLICY_ACK, `label`, `status` PENDING / COMPLETED / VERIFIED. Unique per employee+type |
| `hr_training` | Catalog: Annual Policy Acknowledgment, Data Security Training, Code of Conduct (`training_key` unique per org) |
| `hr_training_record` | Compliance Status card: per employee+training `due_on`, `completed_on`, `status` COMPLETED / PENDING / OVERDUE |
| `hr_offboarding_task` | Offboarding tasks of employees in OFFBOARDING (`done`, `done_at`, `created_at`) |
| `hr_lifecycle_event` | Lifecycle tab and Timeline: HIRED, ONBOARDING_STARTED/COMPLETED, LEAVE_STARTED, OFFBOARDING_STARTED, TITLE_CHANGE |
| `finance_placement_terms` | Per placement: `pay_rate_minor`, unit, currency, `account_manager_member_id`, `terms_days` (the bill rate stays on `talent_placement`) |
| `finance_invoice` | Invoice record org to client: `code` INV-yyyy-nnnn, client, placement, `period_start`, `amount_minor`, `status` ISSUED/OVERDUE/PAID, `issued_on`, `due_on`, `paid_on` |
| `finance_timesheet` | Monthly timesheet per placement: `hours`, `status` PENDING/APPROVED/REJECTED, `submitted_at`, `decided_at`, `decided_by_member_id`, `reject_reason` |
| `finance_placement_period` | **The Placement Finance row**: placement x month: rate snapshot (`bill_rate_minor`, `pay_rate_minor`), `hours`, `revenue_minor`, `payout_minor`, `margin_bps`, `invoice_status` PAID / INVOICED / OVERDUE / PENDING_INVOICE / PENDING_REVIEW, `invoice_id`, `timesheet_id` |
| `finance_payment` | Payment records: `direction` IN (received against an invoice) / OUT (consultant payout), `status` PENDING/PAID, `amount_minor`, `due_on`, `paid_on` |
| `finance_forecast_input` | Forecast tab assumptions per future month (6 rows) |
| `report_definition` | Reports Library row: `name`, `description`, `report_type` RECRUITING/CONSULTANTS/FINANCE/CLIENTS, `source_key` (built-in computation), `owner_member_id`, `schedule_frequency` NONE/WEEKLY/MONTHLY + `schedule_day` (ISO weekday 1-7, or day of month) + `schedule_time` (HH:mm UTC), `last_run_at/status/summary`, `next_run_at` |
| `report_metric` | Included Metrics bullets |
| `report_recipient` | Recipients (member ids) |
| `report_run` | History: status COMPLETED/FAILED, `trigger_kind` SCHEDULED/MANUAL, `run_by_member_id`, started/finished, charts/tables count, `summary`, `error_label` |
| `report_export` | Exports tab: metadata only (`format` PDF/CSV/XLSX, `status` READY/EXPIRED/FAILED, `expires_at` = request + 24 h, `file_name`, `size_kb`) |

Source of applications: `talent_application.source_label` already exists, so **no column was added**. The talent seeder now draws it from the board's mix
(LinkedIn 32, Company Website 24, Referral 18, Job Board 14, Recruiter 8, Other 4 percent); this is a one-line change in `TalentDemoSeeder`.

## 3. Classes

- Entities `com.dossier.api.domain.ent.ops.*` (one per table, plain fields, explicit `orgId`, statuses are Strings). Generated, do not hand-reformat.
- Repositories `com.dossier.api.repository.ent.ops.<Entity>Repository` (**every method takes `orgId` first**; `EntRepositoryContractTest` and `OpsSchemaIT` enforce it) plus
  `OpsMemberRosterRepository.findRoster(orgId)` (all seats, any status, for names/owners/recipients) and `OpsMetricsRepository` (cross-table aggregates for Reports).
  Directory/table queries `HrEmployeeRepository.search`, `FinancePlacementPeriodRepository.search`, `ReportDefinitionRepository.search` take optional filters (`null` = no filter, `q` lower-cased, empty = all) and a `Pageable`.
- Seeder `com.dossier.api.service.ent.OpsDemoSeeder` (called by `EnterpriseDemoBootstrap` after `TalentDemoSeeder`). Test `OpsSchemaIT`.

## 4. Demo data and how to turn it on

Same switches as the talent demo (`DEMO_ENABLED=true ENT_DEMO_SEED=true`, never `prod`). Built **from the talent rows**, so numbers agree across pages. Each module is
idempotent on its own (HR skipped when `hr_employee` has rows, finance when `finance_placement_period` has, reports when `report_definition` has). Dates are
relative to now, six calendar months of history, the random stream is seeded per org. Sign in as Sarah (Org Admin) or Hana (HR) / Felix (Finance).

@@COUNTS@@

Design of the story (all derived, nothing hand-set per row):
- **HR**: a record for every seat (ACTIVE/SUSPENDED/INVITED; SUSPENDED = ON_LEAVE, INVITED = NOT_STARTED with a future start) and for every consultant
  (CONTRACT 78 %, FULL_TIME 22 %; start date = the profile's created date, so the consultant growth of the talent seed shows up as "new employees"; the first 3 NOTICE consultants are OFFBOARDING with 4 tasks
  each; the first 4 UNAVAILABLE are ON_LEAVE; consultants created in the last 4 days are NOT_STARTED with a start date in the next week). Manager of a consultant = their marketer
  (`marketer_assignment`); staff report to the org admin (Sarah / Bea) unless the seat has a manager. Onboarding lasts 11-28 days, so recent hires are IN_PROGRESS.
- **Finance**: a row per placement per month of the last six (from start to end, or to month end for ACTIVE placements; the **current month holds the expected full-month hours**, not hours to date, so month-over-month deltas compare full months).
  Bill rate = `talent_placement.bill_rate_minor`; pay is 65.5-70 % of bill with margin improving slightly towards now (older months pay a larger share). Hours = weekdays x 8 x 0.93-1.0.
  Months 0-2 (current and the two before) have a **timesheet for every period** (hours equal the period's). Month 0: 45 % PENDING / 50 % APPROVED / 5 % REJECTED; month 1: 4 / 93 / 3; month 2: all APPROVED.
  Invoice status: PENDING_REVIEW when the timesheet is not approved; approved current month: PENDING_INVOICE (15 % already INVOICED); month 1: 20 % PAID, 60 % INVOICED, 20 % PENDING_INVOICE; month 2: 88 % PAID, rest INVOICED/OVERDUE (OVERDUE only when `due_on` passed);
  older months: PAID. An IN payment exists for every PAID invoice; an OUT payout exists for every approved (or timesheet-less) period, due `month end + 7 days`, PAID when due has passed (85 %), else PENDING.
- **Reports**: 12 definitions (Acme) / 5 (Beta): Application Funnel, Consultant Utilization, Revenue Summary, Client Activity, Time to Fill, Placement Margin, Interview Conversion, Marketer Workload, Timesheets and Open Payouts, Bench Availability, Onboarding and Compliance, Top Clients by Revenue.
  Weekly reports have 12 runs (the schedule's occurrences), monthly 6, unscheduled 2 manual runs; one run per fifth report FAILED and the Timesheets report's latest run FAILED; `last_run_*` mirrors the newest run, `next_run_at` = the next occurrence. Exports: the newest 4 are READY (requested 1-20 h ago), the rest EXPIRED, one FAILED.

## 5. Permissions (existing keys, no new ones)

| Page | View | Write |
|---|---|---|
| HR | `hr.view` (ORG; HR Specialist, Org Admin) | `hr.manage` (record edits, notes, documents, trainings), `lifecycle.manage` (onboarding/offboarding transitions, add employee) |
| Finance | `finance.view` (ORG; Finance Specialist, Org Admin) | `finance.manage` (timesheet approve/reject, generate/issue invoice, record payment, forecast inputs); account managers may read through `placements.view` |
| Reports | `reports.view` (scope as granted: ASSIGNED/TEAM/ORG; HR rows filter `ROW_FILTER_HR`) | `reports.export` (ORG, flagged sensitive) is used for **create / edit / schedule / run / export**: there is no `reports.manage` key and none was added (adding one touches the doc-sync tests of 05); add it additively later if authoring should be separable from exporting |

`ops.*` is the product-H timesheet gate; the Finance page uses `finance.*`. 404 (never 403) for unknown/foreign ids. Finance numbers are visible only with `finance.view`; show a LOW/OK/GOOD band to others (`org.finance.margin_bands`, doc 36 section 4).

## 6. How every KPI, tile and series is computed (now = request time, UTC; `T-30` = now minus 30 days)

Delta % = `(current - previous) / previous`, "n/a" when previous = 0.

### HR (`HrEmployeeRepository`, `HrOnboardingItemRepository`, `HrOffboardingTaskRepository`, `HrTrainingRecordRepository`)
| Tile | Formula |
|---|---|
| Total Employees | `countByOrgIdAndEmploymentStatusNot(ENDED)`; vs last month: previous = `countEmployedOn(orgId, today-30d)` |
| Onboarding In Progress | `countByOrgIdAndOnboardingStage(IN_PROGRESS)` (= `countOnboardingInProgressAt(orgId, now)`); previous = `countOnboardingInProgressAt(orgId, now-30d)` |
| Offboarding Tasks | open = `HrOffboardingTaskRepository.countByOrgIdAndDone(false)` (= `countOpenAt(now)`); previous = `countOpenAt(orgId, now-30d)` |
| Compliance Completion | `countCompletedAsOf(orgId, today) * 100 / countDueOnOrBefore(orgId, today)`; previous = same with `today-30d` (required trainings only; records not yet due are outside both) |
| Sparklines | per week/month bucket with the same "as of" functions (call them for each bucket end) |
- Directory rows: `search(orgId, departmentId, status, stage, q, pageable)`; department name = `OrgGroup` (DEPARTMENT) by `department_group_id`; manager = member name by `manager_member_id`; Last Activity = `last_activity_at`. Department filter options = the org's DEPARTMENT groups.
- Drawer: Basic Information = the record (work email, title, type, department, manager, `work_city, work_region`, start date); Onboarding Checklist = `findByOrgIdAndEmployeeIdOrderBySortOrderAsc` ("4 of 5", percent = done/total; the Pending chip = the first not-done item); Required Documents = `HrDocumentRequirementRepository.findByOrgIdAndEmployeeId`; Compliance Status = the employee's `hr_training_record` rows (Completed date = `completed_on`; "Compliant" chip = no row with status OVERDUE); Timeline = `HrLifecycleEventRepository.findByOrgIdAndEmployeeIdOrderByOccurredAtDesc`; Notes = `HrEmployeeNoteRepository`.
- Documents tab (page-level): `countByOrgIdAndStatus(PENDING)` etc.; Lifecycle tab: `findTop20ByOrgIdOrderByOccurredAtDesc`; Onboarding tab: employees with stage IN_PROGRESS / NOT_STARTED; Compliance tab: `hr_training_record` grouped by status.

### Finance (`FinancePlacementPeriodRepository`, `FinanceTimesheetRepository`, `FinancePaymentRepository`, `FinanceInvoiceRepository`)
| Tile / series | Formula |
|---|---|
| Revenue This Month | `sumRevenue(orgId, firstOfMonth)`; vs last month: previous = `sumRevenue(orgId, firstOfPreviousMonth)` (the current month is the expected full month) |
| Open Payouts | `FinancePaymentRepository.sumOpenPayouts(orgId)`; vs last month: previous = `sumOpenPayoutsAt(orgId, now-30d, today-30d)` |
| Timesheets Pending | `FinanceTimesheetRepository.countByOrgIdAndStatus(PENDING)`; vs last week: previous = `countPendingAt(orgId, now-7d)` |
| Margin Overview | `(sumRevenue - sumPayout) / sumRevenue` for the month; vs last month in points (previous month same formula) |
| Monthly Trend (revenue/payouts bars Jan..Jun) | `monthlySeries(orgId, firstOfMonth-5m, firstOfMonth)`: `[period_start, revenue, payout, hours]`; per placement: `findByOrgIdAndPlacementIdOrderByPeriodStartAsc` |
- Placement Finance table: `search(orgId, periodStart, invoiceStatus, clientId, consultantId, q, pageable)`; "1-10 of 86" = `getTotalElements()`; columns: consultant/client names via the ids, role = `talent_placement.role_title`, Bill/Pay rate = `bill_rate_minor`/`pay_rate_minor` per hour, Hours, Invoice Status chip (PAID shows as "Paid"; the board's "Invoiced" = INVOICED), Margin = `margin_bps / 100`, Period = `period_start`. The date-range filter on the board is month-based (one period).
- Drawer: Placement Details = `talent_placement` (client, role, start/end, status) + `finance_placement_terms` (pay rate, account manager); Financial Summary of the period: Projected Revenue = `revenue_minor`, Payments Received = `sumReceived(orgId, placementId, periodStart)`, Pending Payout = `sumPendingPayout(...)`, Margin = `margin_bps`; their deltas compare with the previous period row. Tabs: Timesheets = `findByOrgIdAndPlacementIdOrderByPeriodStartDesc`, Invoices = `FinanceInvoiceRepository.findByOrgIdAndPlacementIdOrderByPeriodStartDesc`, History = period rows.
- Timesheets tab: `findByOrgIdAndStatusOrderBySubmittedAtDesc(PENDING, pageable)`; Approve/Reject set `status`, `decided_at`, `decided_by_member_id` (the period's invoice status flips PENDING_REVIEW to PENDING_INVOICE on approve and an OUT payout record is created; this is service logic, the seed already does it consistently).
- Payments tab: `findByOrgIdAndDirectionOrderByCreatedAtDesc(IN|OUT, pageable)`; Forecast tab: `findByOrgIdAndMonthStartGreaterThanEqualOrderByMonthStartAsc(firstOfNextMonth)`, projected revenue for a month = `expectedPlacements * expectedHoursPerPlacement * avg bill rate of ACTIVE placements * (1 + billRateChangeBps / 10000)`, payout the same with the avg pay rate (`finance_placement_terms`) and `payRateChangeBps`.
- Generate Invoice: create a `finance_invoice` ISSUED for a period row with status PENDING_INVOICE and set the row's `invoice_status` INVOICED and `invoice_id`. Marking sent/paid is a record, nothing is sent or collected.

### Reports overview (`OpsMetricsRepository`, talent repositories, finance repositories). Window = the filter (default last 30 days) vs the equal window before it.
| Tile / chart | Formula |
|---|---|
| Applications This Month | `TalentApplicationRepository.countByOrgIdAndAppliedOnBetween(from, today)`; previous = the preceding window |
| Interview Conversion | `countApplicationsEnteringStage(orgId, INTERVIEWING, from, to) * 100 / countApplicationsCreated(orgId, from, to)` (an application that reached INTERVIEWING in the window over applications created in it); previous = preceding window |
| Active Placements | `TalentPlacementRepository.countByOrgIdAndStatus(ACTIVE)`; previous = `countActiveOn(orgId, today-30d)` |
| Monthly Revenue | `sumRevenue(orgId, firstOfMonth)`; previous = previous month |
| Applications Trend (Last 6 Months line) | `applicationsPerMonth(orgId, firstOfMonth-5m, today)`: `[year, month, count]` |
| Applications by Source (donut, total in the middle) | `applicationsBySource(orgId, from, to)`: `[label, count]`, percent = count / total |
| Placements by Department (This Year bars) | `placementsByClientIndustry(orgId, yearStart, today)` (industry reading: Technology, Healthcare, ...) **or** `placementsByConsultantDepartment(...)` (department reading: Consulting, Marketing, ...); pick one and label it. Both sum to `countByOrgIdAndStartDateBetween` |
| Revenue Trend (Last 6 Months area) | `monthlySeries(...)` revenue column |
- Reports Library: `ReportDefinitionRepository.search(orgId, type, ownerId, frequency, q, pageable)`, sort Last Run = `last_run_at`; Type chip = `report_type`; Schedule chip = `schedule_frequency` (None when NONE); schedule text "Weekly, every Monday at 9:00 AM" from `schedule_day` + `schedule_time`.
- Report detail: Details = description + `report_metric` rows; Last Run Summary = `last_run_status` / `last_run_at` / `last_run_summary`; Schedule + Recipients = `report_recipient` ids (initials circles); History = `ReportRunRepository.findByOrgIdAndDefinitionIdOrderByStartedAtDesc`; Preview = the page renders the `source_key` computation; Run Now = insert a `report_run` (MANUAL), update the definition's `last_run_*`; Export = insert a `report_export` READY, `expires_at` = now + 24 h.
- Scheduled Reports tab: `findByOrgIdAndStatusAndScheduleFrequencyNot(ACTIVE, NONE)` ordered by `next_run_at`; Exports tab: `findByOrgIdOrderByRequestedAtDesc`. Department and "Consultant type" filters: department = `hr_employee.department_group_id` / `consultant_profile.department_group_id`, type = `hr_employee.employment_type`; the foundation queries do not yet take them (extend `OpsMetricsRepository` additively).

## 7. Isolation and tests

`OpsSchemaIT` (api/src/test/.../service/ent): migration + tenant keys on all 19 tables, cross-tenant child refused (HR, finance, reports), HR counts equal seats + consultants - linked, tiles partition the directory, finance arithmetic (revenue = bill x hours, margin bps, invoice and payment links, timesheet hours equal period hours), rising revenue series with plausible margin, report tiles computable, idempotent second run, Beta (about 30 %) never mixes with Acme, no banned PII column names, every ops repository method takes `orgId` first. Add route rows to `OrgIsolationIT.COVERAGE` when you add `/api/orgs/{orgId}/...` routes.

## 8. Known limitations / decisions

- `hr_employee` is a flat directory record, not the effective-dated `employment_record` of doc 36 (history lives in `hr_lifecycle_event`); a later additive story can add effective dating. No `hr_checklist_template` / `hr_task` / policy tables: the board needs per-employee checklist rows, which exist as `hr_onboarding_item`.
- Finance is monthly (the board's period is a month); no weekly timesheets, no `ops_*` product-H tables are touched. Pay rate lives in `finance_placement_terms`, not on `talent_placement`.
- The board's literal figures (186 employees, $284,320, 24 pending, 428 applications ...) are mock; the seed produces the numbers its rows add up to (Acme: see the counts above), with the same direction of change.
- Employment type of a consultant is a demo assumption (78 % CONTRACT); the boards' "Phone" line is intentionally absent.
- Reports run/export are records only (no file is generated by the foundation); the recipient list is members only (no external email).
