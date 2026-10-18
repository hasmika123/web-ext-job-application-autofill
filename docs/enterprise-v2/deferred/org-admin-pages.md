# Org-admin placeholder pages — HR, Finance, Reports, Integrations, Executive — build-ready design

> Status: design, 2026-10-17 (Fable, branch `ent-deferred-design`). Stories `HR-*`, `FIN-*`, `REP-*`, `INT-*`, `EXE-*` in `stories.md`.
> Placeholders today (`web/src/lib/ent/shell.ts` `ADMIN_NOT_BUILT` = subscription, licenses, billing, usage, **hr, finance,
> domains, integrations**; `/w/exec` home and `/w/exec/reports` fall through to `ComingSoon`; `/w/admin/reports` is real
> but only the 30/90-day overview). Role audit D9.
> Builds on the two **built, seeded, tested data foundations** that the design docs predate:
> `ops-data-foundation.md` (`20261101010000_ent_ops_data.xml`: `hr_*`, `finance_*`, `report_*`) and
> `billing-data-foundation.md`. Where doc 36 names other tables (`employment_record`, `hr_task`, `hr_checklist_template`,
> `ops_*`), **the foundation wins** (decision DD-4 in `08-decisions-for-user.md`): it exists, is seeded for acme/beta, has
> `OpsSchemaIT` and `EntRepositoryContractTest` on it, and its KPI formulas are already written. Doc 36's *rules* (E2, verbs,
> scanner, retention) stay in force unchanged.

## 0. Common rules for all five areas

- **E2 record-only (locked).** No identity document, DOB, SSN/ITIN, bank/routing/IBAN, tax-ID field or upload anywhere.
  `OpsSchemaIT.noOpsTableHasAColumnThatCouldHoldSensitivePii` already scans the ops tables; every new column goes through it.
  Every String DTO field under `web/rest/ent/hr/**`, `/finance/**`, `/reports/**`, `/integrations/**` carries
  `@NoSensitiveText` (H3.1 — if the annotation is absent in `api`, story HR-01 adds it as `service/privacy/NoSensitiveText`
  + `SensitiveTextValidator`, a thin wrapper over `SensitiveContent.check(path, key, value)`), and
  `SensitiveTextCoverageTest` (reflection over the four packages) is the CI property. JSON bodies → `SensitiveContent.check(path, node)`.
- **Never move money.** Finance verbs are `record`, `issue` (= mark sent), `void`, `approve`/`reject` (a timesheet), `export`.
  `FinanceVerbsTest` (ArchUnit-style scan of `web/rest/ent/finance/**` handler names and `@PostMapping` paths against the
  allow-list) is the CI gate. No payment provider is touched by anything in this doc.
- **Permissions** (existing keys, `EntPermissions`): `hr.view`, `hr.manage`, `lifecycle.manage`, `finance.view`,
  `finance.manage`, `reports.view`, `reports.export`, `integrations.manage`, `dashboard.view_org`. Checks are
  `@OrgPermissionRequired` for membership + `AuthorizationService.require(AuthzRequest…)` for the V2 key and scope in the
  service (the `OrgReportsService` / `MktScope` pattern). 404 on every refusal.
- **Modules:** HR and Finance pages need `TenantModule.HR_FINANCE` (`flag.enterprise.hr_finance`); Integrations needs
  `INTEGRATIONS`; Executive home needs nothing beyond the permission (reports family `exec` needs `ANALYTICS` only for the
  k-anonymous per-team rows, §5). The flags are **deferred keys** today (registered nowhere → off): stories HR-01, INT-01
  move `FLAG_HR_FINANCE`, `FLAG_INTEGRATIONS`, `FLAG_ANALYTICS` from the deferred list `d` to the live list `k` in
  `EnterpriseSettingKeys` (default **off**; platform admin turns them on per org via `POST /api/admin/orgs/{id}/modules`).
- **Settings:** every new knob is a `Key` in `EnterpriseSettingKeys` (group `org.hr.*`, `org.finance.*`, `org.reports.*`,
  `org.integrations.*`), read through an `OpsSettings` class on the `MarketingSettings` pattern (org override from
  `org_setting`, then global, then default). Org-side editing arrives with X2.9's `OrgSettingsResource` (not in scope here).
- **Web:** one folder per area under `web/src/components/ent/{hr,finance,reports,integrations,exec}/`, BFF
  `web/src/app/api/orgs/[orgId]/{hr,finance,reports,integrations}/[[...path]]/route.ts` + `web/src/lib/ent/<area>-bff.ts`
  (`ROUTES` allow-list, forwards `Idempotency-Key` and `If-Match`), typed fetchers in `web/src/lib/ent/<area>.ts` returning
  `{kind: "OK"|"DENIED"|"FAILED"}`, mocks `web/scripts/mock-<area>.mjs`, `@kiwiply/ui` + enterprise kit only
  (`DataTable`, `FilterBar`, `KpiTile`, `StatePill`, `SideSheet`, `BottomSheet`, `ReasonSheet`, `ConfirmTypedSheet`,
  `HistoryDrawer`, `MoneyText`, `EmptyState`, `ErrorState`, charts), tenant tokens only, one bee per viewport
  (`EnterpriseMascot` + `ClaimsMascot`). Autosave via `lib/autosave.ts` `useAutosave`, undo via `lib/undo-toast.ts`.
  Each admin page is a real sibling folder `w/[workspace]/<key>/page.tsx` (so the `shell.test.ts` folder check passes once
  the key leaves `ADMIN_NOT_BUILT`), gated like the existing siblings (`getTenantSession` → `can(me, key)` → `NotYourRole`).
- **Tests per area:** unit for services/formulas, `*ResourceIT` extending `MemberItSupport` (orgs A and B — Beta rows never
  appear in Acme answers), `OrgIsolationIT.COVERAGE` rows for every route, `DataMapIT` rows for new tables, vitest per page
  and per lib, QA story file `qa/stories/<area>.md`.

## 1. HR (`/w/admin/hr` + the HR workspace `/w/hr/*`)

### 1.1 Data (built: `hr_employee`, `hr_employee_note`, `hr_onboarding_item`, `hr_document_requirement`, `hr_training`, `hr_training_record`, `hr_offboarding_task`, `hr_lifecycle_event`)
Additive changes (`20261124040000_ent_hr_finance_pages.xml`):
- `hr_employee.status_reason VARCHAR(40) NULL`, `hr_employee.updated_by_member_id BIGINT NULL` (change audit: "last modified by").
- `hr_onboarding_item.assignee_member_id BIGINT NULL`, `hr_onboarding_item.done_by_member_id BIGINT NULL`.
- `hr_training_record.recorded_by_member_id BIGINT NULL`.
- `hr_lifecycle_event.actor_member_id BIGINT NULL`, `hr_lifecycle_event.note VARCHAR(300) NULL`.
- New `hr_checklist_template(id, org_id, kind ONBOARDING|OFFBOARDING, title VARCHAR(120), required BOOLEAN, due_days_after_start SMALLINT NULL, sort_order SMALLINT, active BOOLEAN)` — the org's default checklist; seeded per org type on first HR read (CONSULTANCY: "Sign the code of conduct", "Set availability", "Approve your primary resume", "Connect the extension", "Meet your marketer"). **No upload item kind exists** (E2).
- `hr_document_requirement.doc_type` keeps its values but the UI label for ID_VERIFICATION / TAX_FORM / DIRECT_DEPOSIT / EMPLOYMENT_ELIGIBILITY reads "Tracked elsewhere — Kiwiply stores only the status" (decision DD-5): it is a **status**, never a number, file or date of a document. `HrNeverCollectedTest` asserts the table has no column beyond `doc_type, label, status, updated_at` family.

### 1.2 Employee lifecycle (state machine on `hr_employee.status`, registered in `PipelineTransitions` as entity `HR_EMPLOYEE`)
`NOT_STARTED → IN_PROGRESS (onboarding) → ACTIVE → ON_LEAVE ⇄ ACTIVE → OFFBOARDING → ENDED` (values already seeded).

| from → to | actor | permission | guard / effect |
|---|---|---|---|
| NOT_STARTED → IN_PROGRESS | HR, or SYSTEM on invite accepted when `org.hr.auto_onboard` (true) | `lifecycle.manage` | instantiates `hr_onboarding_item` rows from the ONBOARDING templates; `hr_lifecycle_event ONBOARDING_STARTED` |
| IN_PROGRESS → ACTIVE | HR | `lifecycle.manage` | every `required` item done, else 409 `CHECKLIST_INCOMPLETE {open:[…]}`; event `ONBOARDING_COMPLETED` |
| ACTIVE → ON_LEAVE / back | HR | `lifecycle.manage` | `status_reason`; if the member is a marketer with open assignments, the Marketing Manager's Escalations gets a `MANUAL`-kind row "Omar is on leave — 12 consultants need cover" (reuses `EscalationService.raise`, `marketing-manager.md` §4.2) |
| ACTIVE/ON_LEAVE → OFFBOARDING | HR | `lifecycle.manage` | instantiates OFFBOARDING tasks; nudges the admin about licences (notice, nothing automatic — C2) |
| OFFBOARDING → ENDED | HR | `lifecycle.manage` | all required offboarding tasks done; `end_date`; the seat follows the existing member lifecycle (X4.4 offboarding) **after** HR confirms; `marketer_assignment` rows of a marketer are handed over through `AssignmentLifecycleService.record(..., reason "Offboarded", via "HR")` |

### 1.3 API (`/api/orgs/{orgId}/hr`, `OrgHrResource`, `HrService`)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/hr/summary` | `hr.view` | the admin page tiles: headcount by status/type, onboarding in progress, overdue items, compliance %, offboarding (formulas from `ops-data-foundation.md` §5) |
| GET | `/hr/employees?q&status&type&department&manager&page&size` | `hr.view` | `HrEmployeeRepository.search`; `X-Total-Count`; work email only |
| GET | `/hr/employees/{id}` | `hr.view` | record + onboarding items + documents (status) + trainings + notes + lifecycle timeline |
| PATCH | `/hr/employees/{id}` | `hr.manage` | `title, employmentType, departmentGroupId, managerMemberId, workCity, workRegion, startDate` — autosave fields, `If-Match` on `updated_at`; writes `TITLE_CHANGE` lifecycle event; `updated_by_member_id` |
| POST | `/hr/employees/{id}/{start-onboarding\|activate\|leave\|return\|offboard\|end}` | `lifecycle.manage` | `{reason?}`; §1.2 |
| POST | `/hr/employees/{id}/notes` · DELETE `/notes/{noteId}` | `hr.manage` | body scanned |
| POST | `/hr/employees/{id}/onboarding/{itemId}/{done\|undo}` | `hr.manage` (or the assignee for `done`) | sets `done, done_at, done_by_member_id` |
| PATCH | `/hr/employees/{id}/documents/{docId}` | `hr.manage` | `{status: PENDING\|COMPLETED\|VERIFIED}` only |
| POST | `/hr/employees/{id}/trainings/{trainingId}/{complete\|reset}` | `hr.manage` | `completed_on` = today |
| GET/POST/PATCH/DELETE | `/hr/checklist-templates[/{id}]` | `hr.manage` | §1.1; `active=false` instead of delete when instantiated |
| GET/POST/PATCH | `/hr/trainings[/{id}]` | `hr.manage` | the catalog (key, title, due rule) |
| GET | `/hr/compliance?training&status&page` | `hr.view` | records by training/employee, overdue first |
| GET | `/hr/offboarding` | `hr.view` | employees in OFFBOARDING with task progress |
| GET | `/hr/lifecycle?employee&kind&page` | `hr.view` | events feed |
| GET | `/hr/reports?kind=headcount\|onboarding_time\|compliance\|turnover&range=` · `/hr/reports/export` | `reports.view` / `reports.export` | CSV with `OrgReportsService.csv` formula guard; audited `EXPORT`; redact pass |
| GET | `/api/orgs/{orgId}/me-workspace/hr/tasks` · POST `…/tasks/{itemId}/done` | member (own) | the consultant/employee side of onboarding items assigned to SELF |

Every write: `Idempotency-Key`, one `org_audit_event` (`HR_EMPLOYEE_UPDATE`, `HR_LIFECYCLE`, `HR_CHECKLIST`, `HR_TRAINING`; risk LOW, `HR_LIFECYCLE` end = MEDIUM), `OrgIsolationIT` row.
Job: `HrReminderJob` (daily 07:00 org-local, ShedLock) → in-app `SYSTEM` notice to assignees of overdue onboarding items and to HR for overdue trainings; one grouped notice per person per day.

### 1.4 UI
- `/w/admin/hr` (`HrAdminPage`): admin summary — 6 KPI tiles, "Onboarding in progress" list (progress bars), "Compliance due" list, "Offboarding" list, a link row into the HR workspace pages the member can open (`me.workspaces` has `hr`? deep links : read-only). Children in the sidebar (`ADMIN_CHILDREN.hr`: Onboarding, Documents, Compliance) route to `/w/admin/hr/onboarding|documents|compliance` = the same components as the HR workspace pages below.
- HR workspace pages (replace `ComingSoon` for `onboarding, documents, compliance, lifecycle, offboarding, reports`; `employees` is already the shared page; `candidates`/`talent-pools` stay "on the way" — X11.8 is out of scope): `OnboardingBoardPage` (columns Not started · In progress · Done this week; card = employee, progress bar, due chips; card → `EmployeeSheet` with the checklist, one-tap done with Undo), `DocumentsPage` (nav label **"Policies & documents"**, D7: top = the org's published policies from `/policies` (62), below = per-employee document **status** grid; empty state "Kiwiply keeps no identity documents. Only the status of what you track elsewhere lives here."), `CompliancePage` (training catalog + matrix employee × training with status pills; mark complete; `BarChart` completion by department), `LifecyclePage` (`TimelineFeed` of `hr_lifecycle_event`, filter by employee/kind), `OffboardingPage` (list + task progress + "Confirm end" → `ConfirmTypedSheet` with the person's name → `/end`), `ReportsPage` (shared, `family="hr"`).
- Employee sheet fields autosave (`useAutosave`, `SaveStatusChip`); lifecycle buttons open `ReasonSheet`; every state change shows an Undo toast where the reverse transition is allowed (leave ⇄ return), otherwise a plain confirmation.

### 1.5 Settings
`org.hr.auto_onboard` (BOOL, true) · `org.hr.onboarding_due_days` (INT 1–90, 14) · `org.hr.training_reminder_days` (INT, 7) · `org.hr.offboarding_requires_all_tasks` (BOOL, true).

### 1.6 Tests
`HrLifecycleTest` (registry ↔ doc table, CHECKLIST_INCOMPLETE, templates instantiated once), `HrServiceTest`, `HrNeverCollectedTest` (schema + DTO deny-list from 36 §1), `SensitiveTextCoverageTest`, `OrgHrResourceIT` (A/B tenants; Hana (HR) sees acme only; Felix (Finance) 404 on `/hr/*`), `OrgIsolationIT` rows, `DataMapIT` row for `hr_checklist_template`, vitest `HrAdminPage.test.tsx`, `OnboardingBoardPage.test.tsx`, `CompliancePage.test.tsx`, `hr.test.ts`; QA `qa/stories/hr.md` (HRS-01…).

## 2. Finance (`/w/admin/finance` + the Finance workspace `/w/finance/*`)

### 2.1 Data (built: `finance_placement_terms`, `finance_invoice`, `finance_timesheet`, `finance_placement_period`, `finance_payment`, `finance_forecast_input`; billing mirrors from the billing foundation)
Additive: `finance_invoice.issued_by_member_id, voided_at, void_reason VARCHAR(200), updated_by_member_id` ·
`finance_payment.recorded_by_member_id, memo VARCHAR(200)` (if absent) · `finance_timesheet.note VARCHAR(300)` ·
new `finance_event(id, org_id, subject_type INVOICE|PAYMENT|TIMESHEET|TERMS, subject_id, kind, actor_member_id, actor_kind PERSON|SYSTEM, changes JSON, occurred_at)` — the change audit for money records (same `{f, from, to}` shape as `talent_application_event.changes`, built with `service/tracker/Changes`).
Invoice status machine: `DRAFT → ISSUED → PAID | VOID`, `ISSUED → OVERDUE` (SYSTEM, when `due_on < today`), `OVERDUE → PAID`. "Paid" is **recorded** (a payment IN against the invoice), never collected.

### 2.2 API (`/api/orgs/{orgId}/finance`, `OrgFinanceResource`, `FinanceService`)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/finance/summary` | `finance.view` | tiles: revenue / payout / margin this month (from `finance_placement_period`), invoices outstanding + overdue, payments recorded (IN/OUT) this month, timesheets pending; 6-month series |
| GET | `/finance/placements?month&client&status&page` | `finance.view` | the Placement Finance rows (`FinancePlacementPeriodRepository.search`) with rate snapshot, hours, revenue, payout, margin (numbers for `finance.view`; **bands** LOW/OK/GOOD via `org.finance.margin_bands` for anyone else — D6) |
| GET/PATCH | `/finance/placements/{placementId}/terms` | `finance.view` / `finance.manage` | `payRateMinor, unit, currency, accountManagerMemberId, termsDays`; `finance_event` TERMS |
| GET | `/finance/invoices?status&client&page` · `/invoices/{id}` | `finance.view` | record + lines (periods) + payments against it |
| POST | `/finance/invoices` | `finance.manage` | `{clientId, placementId?, periodStart, amountMinor, currency, dueOn, description}` → DRAFT; `code` INV-yyyy-nnnn allocated |
| POST | `/finance/invoices/{id}/{issue\|void}` | `finance.manage` | issue = mark sent (`issued_on`, `issued_by`); void needs `{reason}` (ReasonSheet) |
| GET | `/finance/payments?direction&status&page` | `finance.view` | |
| POST | `/finance/payments` | `finance.manage` | `{direction IN\|OUT, amountMinor, currency, dueOn?, paidOn?, invoiceId?, placementId?, methodLabel, memo}` → "Record a payment you received/made elsewhere"; IN against an invoice updates its status when the sum of PAID payments ≥ amount |
| PATCH | `/finance/payments/{id}` | `finance.manage` | `status PENDING→PAID`, `paidOn`, `memo` |
| GET | `/finance/timesheets?status&placement&month&page` | `finance.view` | the monthly records |
| POST | `/finance/timesheets/{id}/{approve\|reject}` | `finance.manage` | reject needs `{reason}`; approval writes the period's `hours` and recomputes revenue/payout/margin |
| GET/PUT | `/finance/forecast` | `finance.view` / `finance.manage` | the 6 forecast inputs (autosave rows) |
| GET | `/finance/reports?kind=margin\|invoices_outstanding\|payments\|utilization&range=` · `/export` | `reports.view` / `reports.export` | CSV, audited, redacted |

Audit actions `FIN_INVOICE_CREATE/ISSUE/VOID` (MEDIUM), `FIN_PAYMENT_RECORD` (MEDIUM), `FIN_TIMESHEET_DECIDE`, `FIN_TERMS_UPDATE`. `FinanceOverdueJob` (daily) flips ISSUED → OVERDUE and raises a `SYSTEM` notice to `finance.manage` holders (grouped).
**Not in scope:** product H embedding (`/w/finance/timesheets` week view, `ops.*`), Kiwiply→org invoices (those are `org_invoice`, `org-billing-pages.md`). The Finance workspace nav items `timesheets` and `approvals` point at the monthly `finance_timesheet` pages above (decision DD-6); `subscriptions`, `billing`, `invoices` are the billing pages rendered read-only.

### 2.3 UI
- `/w/admin/finance` (`FinanceAdminPage`): tiles (`AnimatedNumber`, `MoneyText`), revenue vs payout `BarChart` (6 months), outstanding invoices list, payments this month, pending timesheets, disclaimer line "Records you entered. Not tax, legal or accounting advice. Kiwiply never moves money." Children (`ADMIN_CHILDREN.finance`: Invoices, Payments, Timesheets) → `/w/admin/finance/invoices|payments|timesheets` = the workspace pages.
- Finance workspace pages: `FinanceHomePage` (= admin page), `PlacementFinancePage` (table month × placement, margin band/number, `MonthPicker`, row sheet with terms autosave), `InvoicesPage` (tabs Draft · Issued · Overdue · Paid · Void; `New invoice` SideSheet; row → sheet with lines, payments, `Issue`/`Void`; `HistoryDrawer` over `finance_event`), `PaymentsPage` (tabs Received · Made; `Record payment` sheet; empty "Record payments you received or made elsewhere. Kiwiply never moves money."), `TimesheetsPage` (monthly rows, Approve one-tap with Undo (`org.finance.timesheet_undo_minutes`, 10), Reject with reason), `ReportsPage` family `finance`. Money inputs are **never autosaved** (28 §0): invoice/payment creation is an explicit "Record" button in the sheet; everything else autosaves.

### 2.4 Settings
`org.finance.margin_bands` (JSON `{low: 1000, ok: 2500}` bps, existing name from 36) · `org.finance.marketer_sees_rates` (BOOL, false — D6) · `org.finance.timesheet_undo_minutes` (INT, 10) · `org.finance.invoice_due_days` (INT, 30) · `org.finance.currency` (ENUM, USD — C4).

### 2.5 Tests
`FinanceInvoiceStateTest`, `FinanceServiceTest` (payment sums, margin bands, period recompute), `FinanceVerbsTest`, `FinanceNeverCollectedTest`, `OrgFinanceResourceIT` (A/B; Felix sees acme; Hana 404), `OrgIsolationIT` rows, `DataMapIT` row for `finance_event`, vitest `FinanceAdminPage`, `InvoicesPage`, `PaymentsPage`, `TimesheetsPage`, `finance.test.ts` (money formatting via `formatMinor`), QA `qa/stories/finance.md` (FNS-01…).

## 3. Reports (`/w/admin/reports` library + families for MGMT / HR / FINANCE / EXEC)

### 3.1 Data (built: `report_definition`, `report_metric`, `report_recipient`, `report_run`, `report_export`; nothing reads them)
Additive: `report_definition.family VARCHAR(20) NOT NULL DEFAULT 'ADMIN'` (ADMIN | MGMT | HR | FINANCE | EXEC), `report_definition.params_json JSON NULL` (range, filters), `report_definition.updated_by_member_id`; `report_export.file_key VARCHAR(255) NULL` (FileStorage key, `ops-export` 24 h lifecycle), `report_export.row_count INT NULL`.
`source_key` is the **built-in computation** (`ReportSources` registry, one Spring bean per key implementing `ReportSource { String key(); String family(); String reportType(); ReportResult compute(ReportContext ctx) }`): `pipeline_overview` (= today's `OrgReportsService.overview`), `team_pipeline` (MGMT, `TeamScope`), `marketer_performance`, `consultant_roster`, `interviews`, `placements`, `hr_headcount`, `hr_onboarding_time`, `hr_compliance`, `finance_margin`, `finance_invoices_outstanding`, `finance_payments`, `licenses_cost` (billing foundation), `usage_by_feature`, `exec_overview` (k-anonymous aggregates). A `ReportResult` is `{tiles[], tables[{name, columns[], rows[][]}], series[]}` and renders generically.

### 3.2 API (`/api/orgs/{orgId}/reports`, extends `OrgReportsResource`)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/reports/overview?range=` | `reports.view` | unchanged |
| GET | `/reports/library?family&type&q&page` | `reports.view` | the definitions the caller's scope allows (family ↔ workspace: ADMIN needs ORG scope; MGMT needs `reports.view` ≥ TEAM; HR needs `hr.view`; FINANCE `finance.view`; EXEC `dashboard.view_org`) |
| GET | `/reports/library/sources?family` | `reports.view` | the built-in sources with their metrics |
| POST/PATCH/DELETE | `/reports/library[/{id}]` | `reports.export` (= "manage" — no new key; decision DD-7) | `{name, description, sourceKey, family, params, metrics[], recipients[], schedule{frequency NONE\|WEEKLY\|MONTHLY, day, time}}`; autosave fields; `status ACTIVE\|PAUSED` |
| POST | `/reports/library/{id}/run` | `reports.view` | synchronous ≤ 10 s: computes, writes `report_run` (MANUAL), returns the `ReportResult`; 429 after `org.reports.runs_per_hour` (20) |
| GET | `/reports/library/{id}/runs?page` · `/runs/{runId}` | `reports.view` | history + stored result summary (`summary`, counts) |
| POST | `/reports/library/{id}/export {format: CSV}` | `reports.export` | computes, writes the CSV to FileStorage (`ops-export/{org}/{id}/…`), `report_export` READY with `expires_at` = +24 h; ≤ 5 000 rows synchronous, else 202 + job (40 §4); audited `EXPORT`; redaction pass on free-text columns; formula guard |
| GET | `/reports/exports?page` · `/exports/{id}/download` | `reports.export` | signed download of a READY export; EXPIRED → 410 |
| GET | `/reports/{family}/overview?range=&scope=` | per family | the family dashboards: `mgmt` (`TeamScope`), `hr`, `finance`, `exec` — one endpoint per family so the pages stay one component |

`ReportScheduleJob` (hourly, ShedLock): definitions whose `next_run_at` ≤ now → run (SCHEDULED), store summary, in-app `SYSTEM` notice to recipients ("Weekly pipeline report is ready" → link), compute `next_run_at`. **No e-mail attachments** (the notice links to the page; exports are generated on demand). PDF/XLSX formats stay listed as "soon" in the UI (CSV only in v1; `report_export.format` accepts CSV).

### 3.3 UI
`ReportsPage` grows tabs **Overview · Library · Exports** (`family` prop decides which sources appear; `scope` prop for MGMT): Library = `DataTable` (name, type, owner, schedule, last run status/summary, next run) + `NewReportSheet` (source picker with metric checklist, recipients `PersonSearch`, schedule), row → `ReportSheet` with Run now (result renders tiles + tables inline, `TableSkeleton` while computing), history list, Export CSV; Exports = list with status pills and Download / expired. `/w/marketing-mgmt/reports`, `/w/hr/reports`, `/w/finance/reports`, `/w/exec/reports` render the same component with their family. Empty state: "No saved reports yet. Start from a built-in one." → opens the sheet on the sources list.

### 3.4 Settings
`org.reports.runs_per_hour` (20) · `org.reports.export_rows_sync_max` (5000) · `enterprise.reports.export_ttl_hours` (24) · `org.analytics.k_min` (5, EXEC family).

### 3.5 Tests
`ReportSourcesRegistryTest` (every `source_key` seeded by `OpsDemoSeeder` has a bean; every bean names a family), `ReportResultCsvTest` (formula guard, redaction), `ReportScheduleJobTest` (next_run_at math for WEEKLY day/time and MONTHLY; ShedLock), `OrgReportsLibraryIT` (A/B; family gates: Omar (marketer) cannot open ADMIN definitions; a Beta definition id is 404 on acme), `OrgIsolationIT` rows, vitest `ReportsPage.test.tsx` (+Library, Exports tabs), `reports.test.ts`.

## 4. Integrations (`/w/admin/integrations`) — v1 scope

**Decision DD-8:** v1 = **outbound webhooks** (40 §9.2, 41 §10) + **CSV import/export** of consultants and client requirements + nothing else. No third-party OAuth, no Google API, no inbound API keys, no "sync" buttons (the `org-v2/integrations` sample page is not reused). Consistent with CLAUDE.md (no OAuth/Google for inbox; never scraping) and with 21 §3's INTEGRATION keys, which stay consultant-side (extension, own Gmail).

### 4.1 Data (`20261124030000_ent_integrations.xml`)
- `org_webhook(id, org_id, name VARCHAR(80), url VARCHAR(500), secret_enc VARBINARY(512) (SecretBox; shown once), events_json JSON (allow-listed event keys), status ACTIVE|PAUSED|FAILED|DELETED, failure_count INT, last_delivery_at, last_status INT NULL, created_by_member_id, created_at, updated_at, version INT)`; UQ `(org_id, url)` while not DELETED (generated `active_key`).
- `org_webhook_delivery(id, org_id, webhook_id (composite FK, CASCADE), event_id CHAR(36), event_type VARCHAR(40), payload_json JSON, attempt SMALLINT, status PENDING|DELIVERED|FAILED|DEAD, response_status INT NULL, response_ms INT NULL, error VARCHAR(200) NULL, next_attempt_at, delivered_at, created_at)`; IX `(org_id, status, next_attempt_at)`, `(org_id, webhook_id, created_at)`; purge after `enterprise.webhooks.delivery_retention_days` (30, E13).
- `org_import_job(id, org_id, kind CONSULTANTS|REQUIREMENTS, status UPLOADED|VALIDATED|APPLIED|FAILED|CANCELLED, file_key, file_name, row_count, ok_count, error_count, errors_json JSON (first 200 errors: row, column, code), requested_by_member_id, created_at, applied_at)`.

### 4.2 Webhooks
- Event catalogue (`WebhookEvents`, allow-listed by `enterprise.webhooks.events`): `member.joined`, `member.left`, `license.changed`, `usage.threshold`, `match.assigned`, `match.accepted`, `submission.recorded`, `interview.confirmed`, `offer.extended`, `offer.accepted`, `placement.started`, `placement.ended`, `approval.decided`, `escalation.raised`, `hostname.activated`. Producers publish a Spring `OrgDomainEvent(orgId, type, subjectType, subjectId, data)` from the existing services (one line at each call site, after commit via `@TransactionalEventListener`); `WebhookDispatcher` fans out to matching `org_webhook` rows by inserting `org_webhook_delivery` rows.
- Payload = consent projection (no resume text, no rates, no e-mail addresses unless the event is `member.*`; `SensitiveContent.redact` on `data` before store): `{id, type, createdAt, orgId, data}`. Headers `X-Kiwiply-Event-Id`, `X-Kiwiply-Signature: t=<unix>,v1=<hex hmac-sha256(secret, t + "." + body)>`.
- `WebhookDeliveryJob` (every 30 s, ShedLock, batch 50): SSRF guard before each send — URL https only, hostname resolved at send time, **every** resolved address must be public (no loopback/private/link-local/CGNAT/metadata/IPv6 ULA), the connection pins that IP (`InetAddress`-bound HttpClient), redirects disabled, 5 s connect + 10 s read, body ≤ 64 KB; 2xx → DELIVERED; else retry at 1 m, 5 m, 30 m, 2 h, 12 h; after 5 → DEAD and `failure_count++`; 10 consecutive DEAD → webhook FAILED + `SYSTEM` notice to `integrations.manage` holders. Manual **Redeliver** creates a fresh delivery row.
- API (`/api/orgs/{orgId}/integrations`, `OrgIntegrationsResource`): `GET /webhooks`, `POST /webhooks` (`{name, url, events[]}` → returns `secret` once; 422 `URL_NOT_ALLOWED {reason}`), `PATCH /webhooks/{id}` (name, events, status PAUSED/ACTIVE; `If-Match`), `POST /webhooks/{id}/rotate-secret`, `POST /webhooks/{id}/test` (sends `ping` synchronously, returns status/ms), `DELETE /webhooks/{id}` (soft, `ConfirmTypedSheet`), `GET /webhooks/{id}/deliveries?status&page`, `POST /webhooks/{id}/deliveries/{did}/redeliver`, `GET /events` (catalogue with sample payloads). Permission `integrations.manage` (dangerous → HIGH audit `INTEGRATION_WEBHOOK_*`); module `integrations`. Rate: 20 webhooks per org (`org.integrations.webhooks_max`).

### 4.3 CSV import / export
- Export: `GET /integrations/export/{consultants|requirements|members}.csv` (`integrations.manage` **and** the area's view key; audited `EXPORT`; redaction pass; formula guard; ≤ 5 000 rows sync else 202 + `org_import_job`-style download record reuse (`report_export` with `definition_id NULL`)). Columns are the public DTO fields only (work email, title, skills, status; never contact phone unless `org.integrations.export_contact_fields`, default false).
- Import (two-phase, nothing is written until "Apply"): `POST /integrations/import/{consultants|requirements}` multipart CSV ≤ 2 MB / 2 000 rows → `org_import_job UPLOADED` → synchronous validation: header mapping (template downloadable from `GET /integrations/import/{kind}/template.csv`), per-cell `SensitivePatterns.scanField(header, value)` (a hit **fails the row** with `SENSITIVE_CONTENT`, the value is never stored), duplicates against existing rows (by work email / external ref) → `VALIDATED` with `errors_json` and a preview (`GET /import/{jobId}`: first 50 rows with `action CREATE|UPDATE|SKIP`); `POST /import/{jobId}/apply` (`Idempotency-Key`) → writes through the **existing** services (`ConsultantWriteService.create/update`, `JobWriteService`/requirements), one audit row per created record + one `INTEGRATION_IMPORT` summary (HIGH); `POST /import/{jobId}/cancel`. Files are deleted after apply/cancel/24 h.

### 4.4 UI (`IntegrationsPage`, tabs **Webhooks · Import & export**)
Webhooks: `DataTable` (name, URL host, events chips, status pill, last delivery, failures) + `NewWebhookSheet` (name, URL, event checklist grouped by area; on save a one-time **secret reveal** card with Copy and "I've stored it"); row → `WebhookSheet` with Test, Pause/Resume (Undo), Rotate secret (ConfirmTyped), deliveries list (status, attempt, response, Redeliver), event sample viewer. Import & export: export cards per kind (Download CSV); import stepper (`Stepper`: Upload → Review → Apply) with the preview table, error rows highlighted and the sensitive-content rows explained ("Row 12: a value looked like a government ID; we don't accept it"); Apply → progress → summary with Undo-less "Done" (imports are not undoable; the summary links to the audit log). Empty state: "Connect your own systems. Kiwiply sends events to a URL you own and never pulls data from anyone."

### 4.5 Settings
`enterprise.webhooks.events` (JSON allow-list, all) · `org.integrations.webhooks_max` (20) · `enterprise.webhooks.delivery_retention_days` (30) · `enterprise.webhooks.timeout_ms` (10000) · `org.integrations.export_contact_fields` (false) · `org.integrations.import_rows_max` (2000).

### 4.6 Tests
`WebhookUrlGuardTest` (every private range, DNS rebinding: second resolution differs → refused, redirects), `WebhookSignatureTest` (known vector), `WebhookDeliveryJobTest` (retry ladder, DEAD, FAILED after 10), `WebhookDispatcherTest` (event → matching webhooks only, redaction applied), `CsvImportValidatorTest` (header mapping, sensitive cell fails the row, duplicate detection, 2 000-row cap), `OrgIntegrationsResourceIT` (A/B: a Beta webhook id is 404 on acme; deliveries never cross), `OrgIsolationIT` rows, `DataMapIT` rows, `NoSubmitSurfaceTest` unchanged, vitest `IntegrationsPage.test.tsx`, `integrations.test.ts`; QA `qa/stories/integrations.md`.

## 5. Executive (`/w/exec`, `EXECUTIVE_VIEWER`)

**Decision DD-9:** the Executive home is the **org dashboard projected to counts** — the existing `OrgDashboardService` widget registry with an `EXEC` projection, not a second dashboard. Reports = the shared `ReportsPage` with family `exec`.

### 5.1 API
- `GET /api/orgs/{orgId}/dashboard?view=exec` (`dashboard.view_org`): `OrgDashboardService.get(me, View.EXEC)` runs the same providers and then applies `ExecProjection`: stat tiles keep numbers; per-person widgets (`activity.recent`, `invites.pending`, checklist, quick actions) are **omitted**; list widgets become counts; any per-team or per-marketer breakdown drops groups with fewer than `org.analytics.k_min` (5) members (k-anonymity, 31 §13 / X12.1). New exec-only providers: `exec.pipeline_funnel` (30/90-day funnel counts from `OrgReportsRepository`), `exec.placements_trend` (12 months), `exec.finance_totals` (`finance.summary` reuse; `billing.view` totals only), `exec.headcount` (by status, no names). A member who holds admin permissions but opens `/w/exec` gets the same projection (the view is the workspace's, not the role's).
- `GET /reports/exec/overview?range=` (§3.2) and the EXEC family of the library.

### 5.2 UI
`ExecHomePage` (`web/src/components/ent/exec/`): welcome band, 8 KPI tiles (consultants, employees, open opportunities, submissions 30 d, interviews 30 d, placements active, revenue this month (totals), licences), `FunnelChart`, `LineChart` placements trend, `DonutChart` pipeline, `BarChart` headcount by department (k-anonymous), a "Reports" link row. No actions, no drill-down to a person. Empty org → encourage pose "Numbers appear as your teams work."; a suppressed group reads "fewer than 5 — hidden" tooltip. `/w/exec/reports` → `ReportsPage family="exec"`.
Registry: `execPageFor(me, slug)` in `components/ent/exec/registry.tsx` wired in the catch-all like the manager workspace (`workspace === "exec"`).

### 5.3 Tests
`ExecProjectionTest` (widget omission list, count conversion, k-anonymity floor), `OrgDashboardExecIT` (Eve (Executive Viewer) sees counts, never a name; Beta 404), vitest `ExecHomePage.test.tsx`, `registry.test.tsx`; QA `qa/stories/exec.md`.
