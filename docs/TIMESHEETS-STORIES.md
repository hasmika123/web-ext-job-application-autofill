# Timesheets & Consultancy Ops — stories

Backlog for `docs/TIMESHEETS-DESIGN.md`. Ordered; each story is sized for **one Sonnet agent in one
session** (implement + tests + one commit). Commit message: `ts<epic>.<n>: <subject>` (e.g.
`ts0.1: timesheet skeleton schema`). Branch `timesheets` (off `version2`); PR into `develop` only when
the user asks. Definition of done per `CLAUDE.md` (tests green, PROGRESS.md box + Log line; the extension is
never touched by this product).

**Status source of truth: `docs/timesheets/stories.json`** (the master roadmap reads it; this file is
rendered from it by `docs/timesheets/build-stories-md.mjs` — edit the JSON, then regenerate, never the other
way round). Product area **H**, every epic **P2** (decision D10): the timesheets-first order lives in the
dependencies below, never in the priority. Org foundation stories (O1.x, O2.x, O6.x, O13.x) stay in
`docs/roadmap/areas/org.json` as cross-area deps — **the org model does not exist in the API yet**, so nothing
here can start before O1.1–O1.5, O2.2 and O6.1.

Conventions: **Owner** API (Spring) · web (Next) · ui (`packages/ui`). **Size** S ≤ ½ day · M ≈ 1 day ·
L ≈ 2 days (split before starting if it looks bigger). **Tests** name the suites a story must add or extend.
"AC" = acceptance criteria. **Benchmark** = the competitor bar the story meets or beats. Every number is a
setting key + default (DESIGN §11), never a constant.

**★ = the first five stories to build** (H0.1–H0.5). **Walking skeleton = H0.1 → H0.7**: schema → gate →
placement → one weekly sheet submitted and approved → one CSV → smoke script, end to end on a phone, with
no proof, no money and no AI.

---

## H0 — Walking skeleton: pilot gate → placement → one sheet submitted and approved → one CSV → smoke (walking skeleton)

_Pilot gate + FINANCE role, placements-lite, one weekly sheet submitted and approved, one CSV out - end to end on a phone, no proof, no money, no AI._

### ★ H0.1 Schema v0 — `ops_settings`, `ops_client`, `ops_placement`, `ops_timesheet`, `ops_timesheet_entry`, `ops_timesheet_event` (+ JPA, repositories) ⟶ walking skeleton
As the API, I want the additive timesheet tables so that every later story has a home and OrgIsolationIT has routes to discover.
> Six tables, org_id first on every one, no column that could ever hold an SSN.
- AC: Liquibase changeset `20261013010000_ts_skeleton.xml` (included from `master.xml`) creates `ops_settings`, `ops_client`, `ops_placement`, `ops_timesheet`, `ops_timesheet_entry`, `ops_timesheet_event` exactly as DESIGN §5.1, §5.2, §5.4, §5.6, §5.7, §5.9 (rates, vendors, holidays, attachments, prefs, consent arrive in later stories); every table `org_id` first; MySQL 8 utf8mb4, DATETIME(6) UTC; `ops_timesheet.live_key` is a generated STORED UNIQUE column `IF(status IN ('DRAFT','SUBMITTED','APPROVED'), CONCAT(placement_id,':',week_start), NULL)`.
- AC: JPA entities under `domain/org/ops/` (`OpsSettings`, `OpsClient`, `OpsPlacement`, `OpsTimesheet`, `OpsTimesheetEntry`, `OpsTimesheetEvent`), enums `OpsTimesheetStatus {DRAFT, SUBMITTED, APPROVED, SUPERSEDED}`, `OpsDayKind {WORK, PTO, HOLIDAY, SICK, UNPAID}`, `OpsEntrySource {MANUAL, COPIED, PREFILL, OCR}`, `OpsPlacementStatus {ACTIVE, ON_HOLD, ENDED}`, `OpsPayTypeLabel {W2, X1099, C2C, OTHER}`; repositories expose `findByIdAndOrgId` on every entity (no finder without org_id).
- AC: No column in any `ops_*` table matches the never-collected deny-list regex (`ssn|itin|ein|tax_id|routing|account_no|account_number|iban|swift|passport|visa|i94|i9|dob|birth|home_address|salary`); `pay_type_label` is an enum column, not free text.
- AC: `AccountDeletionService` and `AccountExportService` gain TODO hooks naming H7.2 (no behaviour yet) so the GDPR suites still pass.
- Tech: `api/src/main/resources/config/liquibase/changelog/20261013010000_ts_skeleton.xml`, `api/src/main/java/com/dossier/api/domain/org/ops/*`, `repository/org/ops/*`. Note: `service/ops/` already exists for platform ops (ErrorDigest) - consultancy ops lives under `org/ops/` everywhere.
- Deps: O1.1 org core schema (org_member is the consultant identity), O1.4 org_audit_event. Size M. Owner API.
- Tests: `TimesheetsSchemaIT` (Testcontainers MySQL): inserts/reads each entity; `live_key` uniqueness - a second DRAFT for the same placement+week fails, a SUPERSEDED row does not; a column-name deny-list test over the changelog (seed of H3.1's `OpsNeverCollectedTest`).

### ★ H0.2 FINANCE role + `ops.*` permissions, pilot gate (flag + opsPilot), `ops_settings` GET/PATCH ⟶ walking skeleton
As the team, I want the FINANCE role live and the module invisible until a platform admin switches a pilot org on.
> Finance stays with finance; consultants see their own hours; nobody else sees the module exists.
- AC: `OrgPermission` gains `ops.settings`, `ops.placements`, `ops.timesheets.approve`, `ops.timesheets.own`, `ops.finance` per tenant-model.md §4: OWNER/ADMIN/FINANCE hold the first three and `ops.finance`; MEMBER holds `ops.timesheets.own` only while they have ≥ 1 placement (computed, not stored); MARKETER/STAFF hold none.
- AC: Gate: every `/api/orgs/{id}/ops/**` handler is `@OrgPermissionRequired` and additionally passes `OpsGate.require(orgId)`: flag `flag.ops_timesheets` (A5.3, default off) must be on AND (`organization.settings_json.opsPilot = true` OR, once H7.1 lands, `EntitlementService.hasOrg(orgId, 'ops.enabled')`); otherwise 404 when the flag is off and 402 `PLAN_REQUIRED {feature: 'ops.enabled'}` when only the org lacks it. The platform-admin action that sets `opsPilot` is `AdminOrgResource POST /api/admin/orgs/{id}/ops-pilot` (audited HIGH).
- AC: `GET/PATCH /api/orgs/{id}/ops/settings` (`ops.settings`): fields per DESIGN §5.1; defaults come from settings `org.ops.week_start_default` (1), `org.ops.step_minutes_default` (15), `org.ops.expected_hours_tolerance_pct` (10), `org.ops.long_day_hours` (12), `org.ops.proof_required_default` (true), `org.ops.retention_min_years` (7, hard minimum 7); `retentionYears` below the minimum → 422; `weekStart` change with live DRAFT/SUBMITTED sheets → 409 `LIVE_SHEETS`; `ocrEnabled` default false (D7); `approvalRequired` default true (D9); the row is created on first read.
- AC: Feature registry entry `timesheets` (A5.7) declares the global switch, the per-org switch and the typed limits so an unregistered gate fails `FeatureRegistryTest`.
- Tech: `domain/org/OrgPermission.java` (O1.2), `service/org/ops/OpsGate.java`, `service/org/ops/OpsSettingsService.java`, `web/rest/org/ops/OpsSettingsResource.java`, `web/rest/AdminOrgResource.java` (pilot action), `service/AdminAuditService.java` (existing) for the HIGH audit row.
- Deps: H0.1; O1.2 OrgAccessService (the FINANCE value is already in the enum); A5.3 flags; A5.1 settings registry for the defaults. Size M. Owner API.
- Tests: `OpsRoleMatrixTest` skeleton (FINANCE/ADMIN/OWNER/MEMBER-with-placement/MEMBER-without/MARKETER/STAFF × every permission); `OpsGateTest` (flag off → 404, flag on + no pilot → 402, pilot → 200, entitlement path stubbed); `OpsSettingsResourceIT` (defaults from the registry, 422 below retention minimum, 409 on week-start change with live sheets).
- Benchmark: Ceipal WorkForce has a 25-user minimum; Bullhorn T&E is quote-based with enterprise setup. Ours: a flag and one admin tap puts a five-person shop on the module.

### ★ H0.3 Placements-lite API — client inline, consultant × client × start date, `/mine`, no rates ⟶ walking skeleton
As finance, I want to say who is placed where from when, in one call, so that the consultant's first sheet can appear.
> Consultant + client + date. That is the whole setup.
- AC: `POST /api/orgs/{id}/ops/placements` (`ops.placements`) accepts `{consultantMemberId, clientId | newClientName, title?, startDate, endDate?, hoursPerWeekExpected?, proofRequired?, payTypeLabel?}`; `newClientName` creates the `ops_client` row inline (unique `(org_id, name)`, 409 `CLIENT_EXISTS` on a case-insensitive clash); `hoursPerWeekExpected` defaults to setting `org.ops.expected_hours_default` (40); `proofRequired` inherits `ops_settings.proof_required_default`; the consultant must be an ACTIVE org member → else 422 `MEMBER_NOT_ACTIVE`.
- AC: `GET /ops/placements?consultantMemberId&clientId&status`, `PATCH /ops/placements/{id}` (title, dates, status, proofRequired, hoursPerWeekExpected), `GET /ops/clients`, `POST /ops/clients`, `PATCH /ops/clients/{id}`, `POST /ops/clients/{id}/archive`; `GET /ops/placements/mine` returns the caller's own placements (client name, title, dates, expected hours only).
- AC: Every String field on every request DTO is annotated `@NoSensitiveText` (interim: the shared `SensitivePatterns` from T1.1 or a local copy with the same rules until H3.1 moves it product-wide) → 422 `SENSITIVE_CONTENT` with the message 'Don't put account, tax, ID-document numbers or dates of birth here — we never collect them.'
- AC: Audit: `OPS_PLACEMENT_CREATE/UPDATE/END` and `OPS_CLIENT_*` rows via `OrgAuditService` (O1.4) with the consultant login as target; foreign org id → 404 on every verb.
- Tech: `service/org/ops/{OpsClientService,OpsPlacementService}.java`, `web/rest/org/ops/{OpsClientResource,OpsPlacementResource}.java`, `service/org/ops/dto/*`. Rates, vendors and holidays are H1.1/H1.2 - leave `vendor_id` nullable and unused here.
- Deps: H0.2; O2.2 email invites (consultants must be org members; the picker reads GET /members from O1.3/O2.2). Size M. Owner API.
- Tests: `OpsPlacementResourceIT` (create with inline client, 409 clash, 422 inactive member, 404 foreign org, `/mine` own-only); `OpsPlacementDtoTest` (reflection: no bill/pay field exists on any DTO in this story; every String field annotated); `OrgIsolationIT` (O1.5) discovers the new routes without wiring.
- Benchmark: Bullhorn T&E requires placement data to be perfect in the ATS before approval (Bullhorn KB payroll workflow). Ours: consultant + client + date; everything else optional.

### ★ H0.4 Weekly sheet core v0 — current-week DRAFT, whole-week PUT (WORK minutes), submit, approve, reject → DRAFT, own-only, audit ⟶ walking skeleton
As a consultant, I want my week to exist and be submittable; as finance, I want to approve or send it back with a comment.
> Draft → submitted → approved. Reject gives it back as a draft with the note, never a locked screen.
- AC: `GET /ops/timesheets/current` (consultant): for each ACTIVE placement returns the live sheet for the current org week, creating a DRAFT prefilled with `hours_per_week_expected ÷ 5` on weekdays (`source=PREFILL`) when none exists; `week_start` is the org week-start weekday in `organization.timezone` (422 `WEEK_START_INVALID` otherwise); `POST /ops/timesheets {placementId, weekStart}` for an explicit week → 409 `TIMESHEET_EXISTS` when a live one exists.
- AC: `PUT /ops/timesheets/{id}/entries` (DRAFT only, else 409 `NOT_DRAFT`): whole-week replace `[{day, kind: WORK, minutes, note?}]` with minutes a multiple of `ops_settings.step_minutes`, 0–1440 per day; recomputes `work_minutes`/`total_minutes`; `source=MANUAL`. Day kinds other than WORK are H2.1.
- AC: `POST .../submit` → SUBMITTED (422 `DAY_OVER_24H` when any day > 1440; 422 `EMPTY_SHEET` when total is 0); `POST .../approve` (`ops.timesheets.approve`) → APPROVED with `decided_at`/`decided_by_member_id`; own sheet → 409 `SELF_APPROVAL` unless `ops_settings.approval_required=false` (D9; then the sheet carries `self_recorded=true`); `POST .../reject {comment ≤ setting org.ops.reject_comment_max_chars (500)}` → DRAFT with `last_rejection_comment`; `GET /ops/timesheets?weekStart&status&consultantMemberId&placementId&page` (approver: all; consultant: the service forces `consultantMemberId = me`); `GET /ops/timesheets/{id}` with entries and events.
- AC: APPROVED rows are immutable: no endpoint touches their entries (PUT → 409 `NOT_DRAFT`); every mutation appends `ops_timesheet_event` (CREATED, PREFILLED, SUBMITTED, APPROVED, REJECTED) and mirrors `OPS_TS_SUBMIT/APPROVE/REJECT` into `org_audit_event` through one `OpsAuditService`; a consultant reading another consultant's sheet gets 404.
- Tech: `service/org/ops/{OpsTimesheetService,OpsWeekCalendar,OpsAuditService}.java`, `web/rest/org/ops/OpsTimesheetResource.java`, DTOs under `service/org/ops/dto/`. Withdraw, correction, locks and the flags table are H2.2/H2.3 - keep the state enum complete (SUPERSEDED exists, unused).
- Deps: H0.3. Size L. Owner API.
- Tests: `OpsTimesheetStateTest` (DRAFT→SUBMITTED→APPROVED, reject→DRAFT keeps the comment, PUT after approve 409, SELF_APPROVAL 409 vs approval_required=false); `OpsWeekCalendarTest` (week_start by org timezone and DST boundary, Monday/Sunday starts); `OpsTimesheetResourceIT` (current creates prefilled draft once, concurrent create hits live_key → one 409, consultant own-only 404, audit row per mutation).
- Benchmark: SAP Fieldglass / Beeline rejections and locked sheets need the program office (SAP KB 3756050, Beeline worker guide). Ours: reject returns an editable draft with the comment.

### ★ H0.5 Consultant week view v0 (`/timesheets`, 390 px) + approver inbox v0 (`/org/ops/timesheets`) ⟶ walking skeleton
As a consultant, I want to open the week, fix a number and submit from my phone; as finance, I want a list I can approve from.
> Open, glance, tap submit. The approver clears a list with a thumb.
- AC: `/timesheets` in the user app (route group `(app)`, so the file is `web/src/app/(app)/timesheets/page.tsx` - there is no `/app/` segment): week header with ‹ › navigation and a placement switcher only when > 1 placement; seven day rows with − / + steppers (≥ 44 px targets, step = `ops_settings.step_minutes`); total vs expected line; Submit (disabled at 0 minutes); after submit the card flips read-only with status; after a reject the comment shows at the top of the DRAFT. Reads/writes go through the web BFF (`web/src/lib/api.ts` pattern) with the ETag-free whole-week PUT.
- AC: `/org/ops/timesheets` in the org console (`web/src/app/(org)/org/ops/timesheets/page.tsx`): Pending list (consultant · client · week · total) with Approve and Reject (comment required, ≤ 500); role-gated by `ops.timesheets.approve`; the module link appears in the org nav only when the gate passes (`GET /api/orgs/{id}/ops/settings` 200).
- AC: New primitives in `@kiwiply/ui` first (`packages/ui/src/ops/`): `Stepper`, `ApprovalRow`, `WeekTotal`; no inline `<svg>`; dark mode via theme tokens.
- AC: Empty states: no placement yet ('Ask your org to add your placement'); flag off (404 → the route is not linked and renders the generic not-found).
- Tech: `web/src/app/(app)/timesheets/*`, `web/src/app/(org)/org/ops/timesheets/*`, `web/src/app/api/orgs/[id]/ops/**` BFF proxies, `packages/ui/src/ops/{Stepper,ApprovalRow,WeekTotal}.tsx`. Reuse `HeroBand`/`SectionCard`/`SidePanel` from the v3 shell for layout.
- Deps: H0.4; O1.6 web gate ((org)/layout.tsx on /api/orgs/mine with role redirects). Size L. Owner web + ui.
- Tests: vitest for Stepper (min 0, step, long-press deferred to H2.4) and ApprovalRow states; Playwright 390 px: open → change Friday → submit in ≤ 4 taps; approver approve and reject (comment required); dark mode screenshot; axe ≥ 95.
- Benchmark: JobDiva MyTime (the consultant app) sits at 2.4★ from 18 ratings. The consultant surface is the first thing we build and the thing we measure.

### H0.6 GENERIC CSV export v0 — synchronous, FINANCE and consultant self-export, audited ⟶ walking skeleton
As finance, I want approved hours out as a CSV on day one so the pilot shops never feel locked in.
> One tap, one file, no export tax.
- AC: `GET /ops/timesheets/export?from&to&consultantMemberId?&format=CSV` (`ops.timesheets.approve`) streams the GENERIC layout per DESIGN §9 (org, consultant display name + member id, client, placement title, week_start, day, kind, minutes, hours 2 dp, note, status, approved_at, approved_by, flags) as UTF-8 with BOM; rows capped at setting `org.ops.export_sync_rows_max` (default 5 000) → 413 `EXPORT_TOO_LARGE` with the hint to use the async export (H5.1).
- AC: `GET /ops/timesheets/mine/export?from&to&format=CSV` for consultants: own sheets only, no pay columns.
- AC: `OpsExportColumns` registry (one place that names the columns per layout) with a unit test asserting no column name contains the deny-list tokens (`ssn|itin|ein|tax|routing|account|iban|swift|passport|visa|i94|i9|dob|birth|address|salary`).
- AC: Audit `OPS_EXPORT` per file with layout, period, row count and sha256.
- Tech: `service/org/ops/{OpsExportColumns,OpsCsvWriter,OpsExportService}.java`, `web/rest/org/ops/OpsExportResource.java`.
- Deps: H0.4. Size S. Owner API.
- Tests: `OpsExportTest` (GENERIC columns vs fixture, BOM, 2-dp hours, cap → 413, consultant own-only, audit row with sha256); `OpsExportColumnsDenyListTest`.
- Benchmark: Harvest/Clockify export generic CSV at every tier; Conrep/Ceipal tie exports to their own invoicing. Ours: open CSV from the first week.

### H0.7 Walking-skeleton verification + handoff refresh ⟶ walking skeleton
As the team, I want proof the slice works end to end on a phone before anything is layered on it.
> Pilot on → placement → week → submit → approve → CSV. If that does not run in one script, nothing above it matters.
- AC: Script `web/scripts/ts-smoke.mjs` (dev only, next to `rb-smoke.mjs`): sign in as the demo org owner, enable the pilot via the admin action, create a placement with an inline client, sign in as the consultant, `GET /current`, PUT a week, submit, approve as owner, download the GENERIC CSV and assert the row count and the approved_by column; run against local Spring; result pasted in the PROGRESS Log.
- AC: `docs/HANDOFF-TIMESHEETS.md` START HERE updated with the exact next story (H1.1) and anything the skeleton taught (gate behaviour, route names).
- AC: The master roadmap `--list` shows H0 at 100 % and 0 dangling ids.
- Tech: `web/scripts/ts-smoke.mjs`, `docs/HANDOFF-TIMESHEETS.md`, `PROGRESS.md`.
- Deps: H0.5, H0.6. Size S. Owner web.
- Tests: The smoke script is the test; CI does not run it (needs Spring + MySQL).

---

## H1 — Placements, clients & rates

_Vendors, effective-dated bill/pay rates in minor units (FINANCE only), holidays, placement lifecycle, the placements UI and the marketer presence view._

### H1.1 Vendors + effective-dated rate history — `ops_vendor`, `ops_placement_rate`, minor units, FINANCE-only, pay-visibility switch
As finance, I want the bill and pay rate in force for any week, changed mid-placement without rewriting history, and never shown to the wrong person.
> Rates are dated rows, not a field you overwrite. Consultants never see the bill side.
- AC: Changeset `20261013020000_ts_rates_holidays.xml` adds `ops_vendor` (DESIGN §5.3) and `ops_placement_rate` (§5.5: `effective_from DATE`, `bill_rate_minor INT NULL`, `pay_rate_minor INT NULL`, unique `(placement_id, effective_from)`), plus `ops_holiday` (§5.10, used by H1.2).
- AC: `POST /ops/placements/{id}/rates {effectiveFrom, billRateMinor?, payRateMinor?}` (`ops.finance`); `OpsRateService.inForce(placementId, weekStart)` returns the latest row with `effective_from ≤ week_start`; `PATCH /ops/placements/{id}` accepts `vendorName` (creates/links an `ops_vendor` row); money is integer minor units in `ops_settings.currency` (one per org); no floats anywhere.
- AC: Visibility: `bill_rate_minor` and vendor chain are absent from every consultant and marketer DTO by construction (separate DTO classes, not a null field); `pay_rate_minor` appears on the consultant's own placement/sheet DTOs only when `ops_settings.show_pay_to_consultant=true`; `OPS_RATE_SET` audit rows record 'set' and the effective date, never the amount.
- AC: `@NoSensitiveText` on vendor/client contact fields; `ops_client.contact_email` is a business contact, documented as such in the DTO.
- Tech: `domain/org/ops/{OpsVendor,OpsPlacementRate,OpsHoliday}.java`, `service/org/ops/OpsRateService.java`, `OpsPlacementResource` additions, `service/org/ops/dto/{PlacementFinanceDTO,PlacementConsultantDTO,PlacementPresenceDTO}.java`.
- Deps: H0.7 (skeleton proven). Size M. Owner API.
- Tests: `OpsRateServiceTest` (rate in force by week incl. same-day change, none before first effective date); `OpsPayVisibilityTest` (reflection over consultant/marketer DTOs: no field named *bill*; pay field present only with the switch); `OpsPlacementResourceIT` extended (FINANCE-only on rates, 404 for MEMBER).
- Benchmark: Conrep stores bill/pay rate per placement (vendor side) with no consultant view. Ours: effective-dated, FINANCE-only, and the consultant may be shown their own pay rate by an org switch.

### H1.2 Holidays (seeded list by country, editable) + placement lifecycle — ON_HOLD / ENDED, end-date guard, trailing weeks
As finance, I want holidays to pre-set a day and a placement's end date to stop new weeks without losing trailing hours.
> Holidays suggest, never force. Ending a placement does not delete anyone's last week.
- AC: `GET/POST/DELETE /ops/holidays` (`ops.settings`); on first settings read for an org with `organization.country = 'US'` the list named by setting `org.ops.holiday_seed` (default `US_FEDERAL`, a registry of lists in code keyed by country) is seeded once (idempotent); holidays only pre-set the day kind in H2.1, never a value.
- AC: `PATCH /ops/placements/{id} {status: ON_HOLD|ENDED, endDate}`: ENDED/ON_HOLD placements drop out of `GET /current` auto-creation; moving `end_date` earlier than an existing APPROVED/SUBMITTED week → 409 `SHEETS_AFTER_END {weeks[]}`; weeks after `end_date` can be created only by an approver (`POST /ops/timesheets` with `ops.timesheets.approve`) and carry the `AFTER_END_DATE` flag (H2.2).
- AC: 'Active consultant' definition lives in one query (`OpsPlacementRepository.countActiveConsultants(orgId, from, to)`): a member with ≥ 1 placement `ACTIVE` during the period - H7.1 bills from it, H3.3/H3.4 budgets multiply by it.
- Tech: `service/org/ops/OpsHolidayService.java` + `OpsHolidayLists.java`, `OpsPlacementService` lifecycle methods, `repository/org/ops/OpsPlacementRepository.java`.
- Deps: H1.1 (table). Size S. Owner API.
- Tests: `OpsHolidaySeedTest` (seed once, country gate, delete survives re-read); `OpsPlacementLifecycleTest` (409 on earlier end date with sheets, auto-create stops, approver-only trailing week); `countActiveConsultants` fixture test.

### H1.3 Placements UI — list, 'New placement' sheet at 390 px, rates panel (FINANCE), client archive
As finance, I want to add a placement in one screen on my phone and set rates without leaving it.
> Consultant, client, start date, Save. Everything else is under 'More'.
- AC: `/org/ops/placements`: list grouped by client with status chips; `New placement` bottom sheet: consultant picker (from `GET /members`, O5.1), client name with autocomplete-or-create, start date; 'More' collapses title, end date, expected hours, proof required, pay-type label, vendor; saves in one `POST`.
- AC: Placement detail: dates/status edit, end-placement confirm showing the `SHEETS_AFTER_END` weeks when returned, rates panel visible only to FINANCE/OWNER/ADMIN (effective-dated rows, add rate form, minor units entered as decimal and converted client-side with a visible currency), `show_pay_to_consultant` explained inline.
- AC: Clients list with archive; archived clients hidden from the picker; `@kiwiply/ui` gains `RateRow` and `PlacementCard`; no inline svg; dark mode.
- Tech: `web/src/app/(org)/org/ops/placements/*`, `packages/ui/src/ops/{PlacementCard,RateRow}.tsx`, BFF routes under `web/src/app/api/orgs/[id]/ops/placements/*`.
- Deps: H1.2; O5.1 members API (the consultant picker). Size M. Owner web + ui.
- Tests: vitest for the sheet validation and minor-unit conversion (no float drift: '85.10' → 8510); Playwright 390 px: create a placement in ≤ 5 taps + typing, rates panel absent for a MEMBER session, archive hides the client; axe ≥ 95.
- Benchmark: Ceipal reviewers: 'too many tabs and fields'. Ours: three fields and a Save.

### H1.4 Marketer presence — `GET /ops/presence` (client + dates + submitted/missing per week) and the paired-consultant card
As a marketer, I want to know whether my consultant is placed and whether last week was submitted, and nothing more.
> On the bench or on a placement, submitted or missing. Hours and money are not your business, by design.
- AC: `GET /api/orgs/{id}/ops/presence?consultantMemberId` for MARKETER paired to that consultant (O10.1 pairing; FULL consent not required - status only): `{placements:[{client, startDate, endDate?}], weeks:[{weekStart, status: SUBMITTED|APPROVED|MISSING}]}` for the last setting `org.ops.presence_weeks` (default 4) weeks; the DTO class has no minutes, rates, flags, notes or attachment fields (decision D6).
- AC: Marketer workspace card 'Placement' on the consultant switcher view: client, since date, last week chip; nothing clickable into the sheet.
- AC: `OpsRoleMatrixTest` gains the MARKETER row: presence 200 for paired, 404 for unpaired, 404 on every other ops route.
- Tech: `web/rest/org/ops/OpsPresenceResource.java`, `service/org/ops/dto/PresenceDTO.java`, marketer card under `web/src/app/(org)/org/marketer/*` (O10.3 owns the folder).
- Deps: H1.2; O10.3 marketer workspace shell (where the card lives). Size S. Owner API + web.
- Tests: `OpsPresenceResourceIT`; reflection test that `PresenceDTO` has only the enumerated fields; vitest for the card.

---

## H2 — Weekly entry, phone-first

_Day kinds, prefill and copy-last-week, the full flags table, withdraw / correct / supersede / locks, the 390 px week view with 44 px steppers, submit-for by finance._

### H2.1 Day kinds (PTO / HOLIDAY / SICK / UNPAID), step minutes, day notes, copy-last-week, prefill from last approved week
As a consultant, I want PTO and holidays recorded and my next week to start from my last one.
> Copied from last week - tap to change. Most weeks you change nothing.
- AC: `PUT /ops/timesheets/{id}/entries` accepts kinds `WORK|PTO|HOLIDAY|SICK|UNPAID`; a day may hold one row per kind (unique `(timesheet_id, day, kind)`); per-kind minute totals (`work_minutes`, `pto_minutes`, ...) recomputed; only WORK is billable; `note` ≤ setting `org.ops.note_max_chars` (200) with `@NoSensitiveText`.
- AC: Prefill on auto-create: last APPROVED sheet for the placement (same minutes per weekday, kinds reset to WORK, notes cleared, `source=PREFILL`), else `expected ÷ 5`; `POST .../copy-last-week` copies minutes and kinds from the previous week's latest live sheet (`source=COPIED`); org holidays in the week pre-set `HOLIDAY` with 0 WORK minutes - overridable by the consultant.
- AC: Sheet DTO carries `prefilledFrom: LAST_WEEK|EXPECTED|NONE` and the holiday names per day so the UI can label them.
- Tech: `OpsTimesheetService` (prefill/copy), `OpsTimesheetEntry` kinds, `service/org/ops/OpsPrefillService.java`.
- Deps: H0.7; H1.2 holidays. Size M. Owner API.
- Tests: `OpsPrefillTest` (last approved → copied; none → expected ÷ 5; holiday pre-set; kinds reset); `OpsEntryValidationTest` (two kinds per day allowed, > 1440 total blocked at submit, note length, sensitive text 422).
- Benchmark: QuickBooks Time / Toggl are timers built for shifts; neither prefills a weekly placement sheet. Ours: the common case is 'glance, maybe fix Friday, submit'.

### H2.2 Flags engine — the full table, settings-keyed tolerances, acknowledgeFlags on approve, bulk approve, proof-required waiver
As finance, I want every oddity surfaced and my approval to record which ones I saw, so nothing is corrected silently and the trail holds in a dispute.
> Flags, never silent fixes. Approving with a flag means you looked, and it says so.
- AC: `OpsFlagService.compute(sheet)` on submit and on approve produces `flags_json` per DESIGN §7: `DAY_OVER_24H` (blocks, 422), `DAY_OVER_WARN` (> setting `org.ops.long_day_hours` 12 h WORK), `TOTAL_NE_EXPECTED` (outside expected ± `org.ops.expected_hours_tolerance_pct` 10), `WEEKEND_WORK`, `OVERLAP_PLACEMENTS` (same consultant, same day, WORK across placements > 1440), `PROOF_MISSING` (placement requires proof and none attached - 409 on submit until H3.2 lands the attachment path; waivable by an approver with audit `OPS_TS_PROOF_WAIVED`), `AFTER_END_DATE`, `CORRECTION`, `INVOICED_SUPERSEDE`; `OCR_MISMATCH`/`OCR_UNREAD` are added by H3.4.
- AC: `POST .../approve {acknowledgeFlags: [codes]}` must list every non-info flag present → else 422 `FLAGS_UNACKNOWLEDGED {missing[]}`; acknowledged codes are stored in `decision_flags_json`; `POST /ops/timesheets/approve-bulk {ids[]}` approves only unflagged SUBMITTED sheets and returns `{approved[], skipped[{id, reason}]}`; audit `OPS_TS_APPROVE_BULK` with counts.
- AC: Flag codes are the contract: an enum with a `blocks` and `visibleTo` property, exported to the web through the shared `@kiwiply/ui` `FlagChip` copy table.
- Tech: `service/org/ops/{OpsFlagService,OpsFlag}.java`, `OpsTimesheetService.approve/approveBulk`, `packages/ui/src/ops/flags.ts` (copy table).
- Deps: H2.1. Size M. Owner API.
- Tests: `OpsFlagsTest` table-driven over every code (tolerance edge, overlap only above 1440, weekend by org week definition, after-end-date); `OpsApproveTest` (unacknowledged 422, bulk skips flagged, waiver audited).
- Benchmark: Incumbent VMS approvals are a blind 'Approve' button. Ours: 'finance approved 42 h knowing the proof said 40' is on record with a login.

### H2.3 Withdraw, correction / supersede chain, locks, DRAFT delete, timeline in the DTO, OPS_READ_SHEET audit
As a consultant, I want to pull back a submitted week and fix an approved one without support; as finance, I want the old version kept and the invoice told.
> Approved is immutable; a fix is a new sheet with a reason that points at the old one.
- AC: `POST .../withdraw` SUBMITTED → DRAFT (consultant, own only); `DELETE /ops/timesheets/{id}` DRAFT only (consultant; audited `OPS_TS_DELETE`); `POST .../correct {reason ≤ 300}` from APPROVED creates a new SUBMITTED row with copied entries, `supersedes_id`, `correction_reason`; on approval of the new row the old flips to SUPERSEDED in the same transaction (live_key never collides); the new row may be edited via PUT entries while it is still DRAFT-equivalent (service allows PUT on a correction before its first submit).
- AC: `locked_reason = INVOICED` (set by H6.2) still allows correction; the response carries `invoiceNumber` so the UI can say 'This week is on invoice ACME-0007; finance will need to reissue it'; the `INVOICED_SUPERSEDE` flag is set and H6.2's `needs_reissue` hook is called through an interface with a no-op default until H6.2 lands.
- AC: `GET /ops/timesheets/{id}` includes `events[]` (the `ops_timesheet_event` timeline incl. who opened it) and `supersedes`/`supersededBy` ids; an approver opening another person's sheet writes `OPS_READ_SHEET` collapsed to one row per actor+target per day.
- Tech: `OpsTimesheetService` (withdraw/delete/correct), `service/org/ops/OpsInvoiceLockHook.java` (interface + no-op), `OpsAuditService.readCollapsed`.
- Deps: H2.2. Size M. Owner API.
- Tests: `OpsTimesheetStateTest` extended (withdraw, delete DRAFT only, correction chain, superseding a locked sheet keeps both readable, concurrent corrections → one 409); `OpsReadAuditTest` (collapse per day).
- Benchmark: Beeline/Fieldglass corrections after approval need a program-office ticket. Ours: a reason and a resubmit; the old version stays readable.

### H2.4 Week view, full UX — long-press numeric entry, weekend collapse, day sheet with kinds, holiday chips, flags confirm, history, PWA
As a consultant, I want the whole job in one screen that works with my thumb, so a normal week takes 30 seconds.
> Prefilled from last week, big steppers, PTO chips, one submit. Done before the elevator arrives.
- AC: Week view per DESIGN §3.1: 44 px steppers with long-press opening a numeric sheet; weekend rows collapsed to one tap; day label opens the day sheet (kind chips Work · PTO · Holiday · Sick · Unpaid, minutes, note ≤ 200); 'copied from last week - tap to change' label; holiday chip with the name; 'Copy last week' and 'PTO…' quick actions; total vs expected with the amber soft flag; Submit shows flags first ('Your total is 38 h, expected 40. Submit anyway?') - one-tap confirm except `DAY_OVER_24H`; Withdraw while SUBMITTED; pay line only when the org switch is on.
- AC: History list (§3.4): week, client, total, status chip, rejection comment on tap, superseded link; 'Export my sheets (CSV)' calls H0.6.
- AC: PWA: the route works installed (existing manifest, mob area) and offline shows the last loaded week read-only with a 'reconnect to submit' note (no offline writes).
- AC: `@kiwiply/ui`: `DayKindChips`, `FlagChip` (copy from H2.2's table), `DaySheet`; consented analytics events `ts_week_opened`, `ts_submitted {seconds_open, prefilled, flags}` through `web/src/lib/analytics.ts`.
- Tech: `web/src/app/(app)/timesheets/*` (week, day sheet, history), `packages/ui/src/ops/{DayKindChips,FlagChip,DaySheet}.tsx`, `web/src/lib/analytics.ts`.
- Deps: H2.3; H0.5 (v0 screen). Size L. Owner web + ui.
- Tests: vitest for every component state; Playwright 390 px: open → submit ≤ 6 taps on the prefilled path, long-press entry, weekend expand, PTO day, flags confirm sheet, withdraw; Lighthouse a11y ≥ 95; dark mode.
- Benchmark: Beeline admits desktop-only entry is 'inconvenient'; JobDiva MyTime is 2.4★. Ours: phone-first, measured ≤ 45 s median after week 2 (H8.3).

### H2.5 Submit-for by finance (D8, hours only, audited OPS_TS_SUBMIT_FOR) + self-recorded badge for one-person shops (D9)
As finance, I want to close the last week of someone who left mid-week, and as a one-person shop I want to use timesheets at all.
> Trailing hours are real. Submitting them for someone is hours, not money, and it says who did it.
- AC: `POST /ops/timesheets/{id}/submit-for` (`ops.timesheets.approve`): allowed only when the consultant membership is LEFT/REMOVED/ERASED or the placement is ENDED; submits the DRAFT as-is; audit `OPS_TS_SUBMIT_FOR` with the actor and target; the sheet carries `submitted_for_by_member_id` and the event timeline says 'Submitted by Priya for Aarav'; the approver still cannot self-approve it unless `approval_required=false`.
- AC: `ops_settings.approval_required=false` (D9): submit moves straight to APPROVED with `self_recorded=true`; every DTO, the approver list, the PDF pack (H5.2) and CSV exports (H0.6/H5.1) show a visible 'self-recorded' badge/column; the settings UI explains the trade-off; the honest message 'Add a second admin or finance member to approve your own hours, or turn approvals off' appears on `SELF_APPROVAL` 409.
- AC: Web: 'Submit for consultant' action on the approver's sheet view only in the allowed states; settings toggle for approvals with the explanation.
- Tech: `OpsTimesheetService.submitFor`, `OpsSettingsService`, `web/src/app/(org)/org/ops/timesheets/[id]/*`, settings page under `web/src/app/(org)/org/ops/settings/*`.
- Deps: H2.4. Size S. Owner API + web.
- Tests: `OpsSubmitForTest` (state gate, audit, badge in DTO); `OpsSelfRecordedTest` (approval_required=false path, CSV column present); Playwright for the settings toggle copy.

---

## H3 — Proof & the never-collected gate

_The product-wide @NoSensitiveText validator and build gate, client-approved proof through FileStorage, the identifier scan that refuses files before storage, optional OCR (off by default), the approver inbox with proof in view._

### H3.1 `@NoSensitiveText` + `SensitiveTextValidator` product-wide and `OpsNeverCollectedTest` (schema / DTO / export / enum deny-list gate)
As the business, I want it to be impossible - not just forbidden - for this product to collect an SSN/ITIN, bank or routing number, tax id, passport/visa/document number or date of birth.
> No field for it, no column for it, no export for it. A policy you can grep, enforced by a failing build.
- AC: `api/.../validation/{SensitiveTextValidator,NoSensitiveText}.java` built on the shared `SensitivePatterns` library (T1.1; if T1.1 has not landed, the patterns live here and T1.1 adopts them) with the rules in DESIGN §5.12: SSN/ITIN, EIN, IBAN, Luhn card, 8+ consecutive digits, keyword+number (passport/visa/I-94/I-9/licence/account/routing/tax id), keyword+date (DOB); a `document` mode (9+ digits outside date/time/total context) for scanned text; message 'Don't put account, tax, ID-document numbers or dates of birth here — we never collect them.'; 422 `SENSITIVE_CONTENT`.
- AC: `@NoSensitiveText` applied to every String field of every `org/ops` request DTO (H0.3/H1.1/H2.1 interim validators replaced); the constraint is reusable by any area.
- AC: `OpsNeverCollectedTest` in the unit suite: (a) no `ops_*` column in Liquibase or JPA matches the deny-list regex; (b) reflection: no DTO field under `org/ops` with a deny-listed name, every String field annotated; (c) `OpsExportColumns` has no deny-listed column in any layout; (d) any `AiSchema` for tasks `OPS_TS_OCR`/`OPS_TS_SCAN` is closed to the enumerated fields (asserted when H3.3/H3.4 register them; the test enumerates registered ops tasks); (e) `pay_type_label` and `method_label` are enums; plus a meta-test proving a deliberately added `ssn` column in the test profile is caught.
- AC: A doc↔code test (same pattern as `ShareMatrixTest`, O6.1) asserts the never-collected table in DESIGN §5.12 lists exactly the regex classes.
- Tech: `api/src/main/java/com/dossier/api/validation/{SensitiveTextValidator,NoSensitiveText}.java`, `api/src/test/java/com/dossier/api/org/ops/OpsNeverCollectedTest.java`, `OpsNeverCollectedDocTest.java`.
- Deps: H0.7. Relates T1.1 (SensitivePatterns owner) and E10.7 (the same rule in the extension engine). Size M. Owner API. Pure foundation: other areas (O2.5 CSV import, S2.4, U10.1) may adopt the constraint - it stays P2 here because the story is scheduled by this product; say so rather than re-prioritise.
- Relates: T1.1, E10.7, O6.5.
- Tests: `SensitiveTextValidatorTest` (every rule, document-mode tolerances for PO/invoice numbers, message snapshot); `OpsNeverCollectedTest` (a–e + meta-test); `OpsNeverCollectedDocTest`.
- Benchmark: Every incumbent (Ceipal, JobDiva, Bullhorn, Avionté) stores SSNs, I-9s and bank details as core HR data; we are the only one whose timesheets cannot take them - enforced like the consent matrix (O6.1).

### H3.2 Proof attachments through `FileStorage` — two-phase upload, caps from entitlements/settings, proxied download, DRAFT-only delete, ledger ref_type
As a consultant, I want to attach the client-approved sheet from my phone and have it stored safely; as the org, I want caps I can configure.
> The proof is the record, not an email thread. It lands only after it passed the scan.
- AC: Changeset `20261013030000_ts_attachments.xml`: `ops_timesheet_attachment` (DESIGN §5.8), `ops_storage_usage` (§5.11); the `storage_object` ledger (P5.5) gains `ref_type = OPS_ATTACHMENT` and `org_id`.
- AC: `POST /ops/timesheets/{id}/attachments` (multipart; consultant own DRAFT/SUBMITTED): bytes go to the FileStorage temp area (`.tmp/<uuid>`, plat D4) and move into place under key prefix `ops-ts` only after `OpsProofScanService.scan()` passes (H3.3; until then a no-op that accepts); sniffed pdf/png/jpg (415 `UNSUPPORTED_FILE`); size ≤ entitlement `ops.attachment_bytes_max` (default 5 MiB; 413 `FILE_TOO_LARGE`); ≤ setting `org.ops.attachments_per_sheet` (3) live per sheet (409 `ATTACHMENT_LIMIT`); org total ≤ entitlement `ops.storage_bytes_max` (default 2 GiB) from `ops_storage_usage` (413 `OPS_STORAGE_CAP`); sha256 stored; `proof_state` → ATTACHED.
- AC: `GET .../attachments/{aId}` streams with `Content-Disposition: attachment`, the org permission check and `Range` support from the seam; no presigned URLs anywhere; `DELETE .../attachments/{aId}` only while the sheet is DRAFT; events `ATTACHMENT_ADDED/REMOVED`, audit `OPS_TS_ATTACH/ATTACH_DELETE` with bytes, never content.
- AC: `PROOF_MISSING` now resolves against live attachments; `ops_storage_usage` is rebuilt nightly from the ledger (`ops.storage_rebuild` job registered with A10.2 if present, else `@Scheduled`).
- Tech: `service/org/ops/OpsAttachmentService.java` (FileStorage), `web/rest/org/ops/OpsTimesheetAttachmentResource.java`, `service/org/ops/OpsProofScanService.java` (interface, no-op impl replaced in H3.3), `domain/org/ops/{OpsTimesheetAttachment,OpsStorageUsage}.java`.
- Deps: H3.1 (the scan hook must exist before the first proof is stored - H3.3 fills it); H2.2 (PROOF_MISSING flag); P5.1 FileStorage local driver - if plat has not started, build on `ResumeStorageService` behind an adapter with the same key shape and swap when P5.1 lands (no table change). Size M. Owner API.
- Relates: P5.5.
- Tests: `OpsAttachmentIT` on the local driver (temp dir): size boundary at exactly the entitlement, 3-per-sheet, org cap 413 at exactly the cap, PNG named .pdf → 415, DRAFT-only delete, proxied download with permission check, temp file removed on refusal, usage counter rebuilt from the ledger.
- Benchmark: Ceipal reviewers complain about attachment size limits; no staffing suite we found keeps the client-approved proof inside the sheet. Ours: in-sheet, caps the admin sets.

### H3.3 Proof identifier scan + refusal before storage — PDFBox text layer locally, classify-only gateway task `OPS_TS_SCAN` for images, platform safety budget, refused-sha cache
As the business, I want a proof file that shows an SSN, a bank line or a passport number to bounce before it lands, with nothing about it kept but the kinds.
> We never held it beyond the temp write. Refusing beats redacting.
- AC: `OpsProofScanService.scan(tempRef, contentType)`: PDF with a text layer → PDFBox extraction (already a dependency of resume parsing) + `SensitiveTextValidator` in document mode, no model call; PDF without a text layer, PNG, JPG → `AiGateway` task `OPS_TS_SCAN` with a closed schema `{contains_identifier: bool, kinds: [SSN|BANK|TAX_ID|PASSPORT_VISA|DOB|OTHER_ID], days[], total_minutes, confidence, approver_name?, approved_date?}` (prompt registry id `ops/ts-scan/v1`); the raw model text is discarded; only the hours part is kept and only when the org's OCR is on (H3.4).
- AC: Budget: owner = platform safety budget capped at setting `ai.budget.ops_scan_cents_per_consultant` (default 25) × active consultants per period (H1.2's count), counted by the margin guard (B2.1) as the consultant line's worst case together with the OCR budget; when exhausted, image uploads are refused with 422 `SCAN_BUDGET_EXHAUSTED {retryAfter}` and the hint 'Try a PDF exported from the client's system' - text-layer PDFs keep working at zero cost.
- AC: Detection → 422 `PROOF_HAS_IDENTIFIER {kinds}`; temp file deleted; no ledger row, no attachment row; audit `OPS_TS_PROOF_REFUSED` with kinds only; sha256 of refused bytes cached for setting `org.ops.refused_hash_cache_days` (90) so a re-upload short-circuits; no override path exists (no endpoint, no flag).
- AC: `OpsNeverCollectedTest` (d) now asserts the `OPS_TS_SCAN` schema is closed; H6.3 receipts reuse `scan()` unchanged.
- Tech: `service/org/ops/OpsProofScanService.java` (replaces the H3.2 no-op), `service/ai/AiTask.java` (+ `OPS_TS_SCAN`), prompt registry record `ops/ts-scan/v1` (I2.1 if landed, else `resources/prompts/`), `domain/org/ops/OpsRefusedHash.java` (+ changeset).
- Deps: H3.2; I0.3 AiGateway (budget owner + task registration). Decision D11 default (a), user may override. Size M. Owner API.
- Relates: T1.1, B2.1.
- Tests: `OpsProofScanIT`: hours-only PDF accepted without a gateway call; printed-SSN text-layer PDF refused with nothing stored and a kinds-only audit row; image refused via a stub classifier; budget-exhausted image refused with the PDF alternative; refused-sha short-circuit; cache purge after N days; `OpsNeverCollectedTest` (d) green.
- Benchmark: Standalone OCR vendors (Lido, Nanonets, Affinda) extract everything on the page; we are the only tool that refuses the page when it carries an identifier.

### H3.4 Optional OCR suggestion (off by default, D7) — `OpsOcrService`, closed schema, Ops-grant budget, apply-ocr, `OCR_MISMATCH` / `OCR_UNREAD` flags
As a consultant whose org turned it on, I want the hours read from my approved sheet so that nobody re-keys my week; as finance, I want to see when the proof and the hours disagree.
> Photo of the approved sheet → hours suggested → you confirm. Never auto-applied.
- AC: OCR runs only when `ops_settings.ocr_enabled` (default false) AND entitlement `ops.ocr` (catalog default off) AND (the consultant calls `POST .../attachments/{aId}/read` OR `ops_settings.ocr_auto_read` is true); otherwise `read` → 402 `PLAN_REQUIRED {feature: 'ops.ocr'}` or 409 `OCR_DISABLED`; the gateway task is `OPS_TS_OCR` (prompt `ops/ts-ocr/v1`), budget owner = the org's Ops grant, capped at entitlement `ops.ai_budget_cents_per_consultant` (default 50) × active consultants, pooled per org; exhausted → `ocr_status=SKIPPED`, flag `OCR_UNREAD`, 429 `AI_BUDGET` on an explicit read, submit never blocked.
- AC: Response schema closed to `{days:[{date, minutes}], total_minutes, confidence, approver_name?, approved_date?}` validated before `ocr_json` is stored; `approved_date` outside the sheet's week ± setting `org.ops.ocr_approved_date_window_days` (30) is dropped; any extra field rejects the whole result (`ocr_status=FAILED`).
- AC: `POST .../apply-ocr {attachmentId}` (DRAFT only) replaces entries with `source=OCR`; `OCR_MISMATCH` when `ocr_total_minutes ≠ work_minutes`, suppressed below setting `org.ops.ocr_min_confidence` (0.6); `proof_state` → READ_MATCH / READ_MISMATCH / READ_FAILED; events `OCR_READ`/`OCR_FAILED`; audit `OPS_TS_OCR_READ` with the summary, never the text.
- Tech: `service/org/ops/OpsOcrService.java`, `AiTask.OPS_TS_OCR`, `OpsFlagService` (+ two codes), `OpsTimesheetAttachmentResource` (read / apply-ocr).
- Deps: H3.3. Size M. Owner API.
- Relates: I0.3, I0.8.
- Tests: `OpsOcrTest`: never runs when disabled (the default); gateway stub → suggestion stored; extra field → FAILED; budget exhausted → SKIPPED + flag + submit still allowed; confidence suppression; apply-ocr sets source=OCR and DRAFT-only; `OpsNeverCollectedTest` (d) covers the OCR schema.
- Benchmark: No staffing suite reads the client-approved proof inside the sheet; OCR vendors sell it separately. Ours: in-sheet, suggestion-only, budget-capped, off until the org asks.

### H3.5 Proof UX on the phone — camera capture, client-side downscale, progress and retry, refusal message, OCR Use / Keep (when on)
As a consultant, I want to photograph the signed sheet and be done, and to be told kindly when a file cannot be kept.
> Camera button, one upload, a clear 'we can't keep this one - crop to the hours page'.
- AC: Proof tile per DESIGN §3.2: `<input type=file accept="image/*,application/pdf" capture="environment">`; images downscaled client-side to ≤ setting `org.ops.image_max_edge_px` (2000, served through the evaluated config A5.9) on the long edge before upload; progress; failures keep the local file for one retry; per-sheet count and org cap errors rendered with their hints.
- AC: Refusal (422 `PROOF_HAS_IDENTIFIER`) renders the kind-specific copy ('It seems to show a Social Security or bank number. We never collect those. Crop to the hours page or export just the approved sheet, then try again.') with 'Choose another file'; `SCAN_BUDGET_EXHAUSTED` renders the PDF alternative and date.
- AC: OCR suggestion row only when the sheet DTO says OCR is on: 'Read 40.00 h, you entered 38.00' with Use (apply-ocr) / Keep mine (records the mismatch flag); low confidence renders 'couldn't read clearly - enter by hand'.
- AC: `@kiwiply/ui`: `ProofTile`, `OcrSuggestion`; analytics event `ts_proof_attached {bytes_bucket, kind, ocr}`.
- Tech: `web/src/app/(app)/timesheets/proof/*`, `packages/ui/src/ops/{ProofTile,OcrSuggestion}.tsx`, downscale helper in `web/src/lib/image-downscale.ts`.
- Deps: H3.4; H2.4 (week view). Size M. Owner web + ui.
- Tests: vitest for downscale (edge ≤ limit, EXIF orientation kept), tile states, refusal copy per kind; Playwright 390 px with a stubbed BFF: camera attribute present, refusal flow, OCR Use/Keep only when on; axe ≥ 95.
- Benchmark: Every VMS makes proof a separate email. Ours: the camera button is on the sheet.

### H3.6 Approver inbox, full — All / Flagged / No proof tabs, one-tap only on clean rows, bulk approve, sheet view with inline proof + timeline, reject with comment
As finance, I want to approve clean sheets in one tap and be made to look at flagged ones with the proof beside the hours.
> Clean rows get a thumb. Flagged rows open with the proof in view - speed without blind approval.
- AC: Inbox per DESIGN §3.3: tabs All / Flagged / No proof; unflagged rows with proof show one-tap Approve; flagged rows show Open only; 'Approve all N unflagged' calls approve-bulk and reports skipped rows; Reject requires a comment; the disclaimer line 'Records you entered. Not tax, legal or accounting advice.' sits at the bottom (Disclaimer component from H5.3 or a local line until it lands).
- AC: Sheet view: day grid with kinds and notes, proof viewer (PDF page 1 / image, proxied download), flags with acknowledge checkboxes feeding `acknowledgeFlags`, timeline (submitted by, OCR read, approved by, superseded by, who opened), 'Submit for consultant' (H2.5) and 'Waive proof' (audited) actions in their allowed states; correction chain links.
- AC: 'More → Timesheets' entry in the org bottom tab bar (O15.1); FINANCE sees Dashboard, Billing, Ops per tenant-model.md §7; analytics `ts_approved {one_tap, bulk, flags_acknowledged}`.
- Tech: `web/src/app/(org)/org/ops/timesheets/*` (inbox, `[id]` sheet), `packages/ui/src/ops/{ProofViewer,TimelineList}.tsx`, O15.1's tab bar config.
- Deps: H3.5; H2.3 (timeline, corrections); O15.1 mobile org shell (the 'More → Timesheets' bottom-tab entry). Size M. Owner web + ui.
- Tests: vitest for tab filtering and bulk count; Playwright 390 px: one-tap absent on flagged rows, bulk approves only clean, reject comment required, acknowledge checkboxes gate Approve on a flagged sheet, proof renders; axe ≥ 95; dark mode.
- Benchmark: Toggl ($24/user) and Harvest ($17.50/seat) sell approvals as a top-tier feature; Zoho approvers must sign in to a portal. Ours: approvals at every size, one tap for clean sheets.

---

## H4 — Reminders & notifications

_OPS_TS_* notification kinds, the hourly reminder job on admin-configured days with quiet hours and the daily cap, consultant opt-ins._

### H4.1 Notification kinds `OPS_TS_DUE / PENDING / REJECTED / APPROVED` registered with the org notification system; in-app events on reject and approve
As a consultant, I want to hear once when my week was sent back or approved, and nothing else.
> One ping with the reason. No nag loop.
- AC: The four kinds are registered with O13.3's kind registry (copy, deep link to the week, default channel in-app + email for REJECTED, in-app only for APPROVED); reject and approve write a `Notification` row for the consultant with the comment (≤ 500) - never to the marketer.
- AC: Email templates (Brevo-free, existing `MailService` + A7.4 registry when present): one line + the deep link; subject to the per-member daily org-email cap (setting `org.notify.email_per_member_per_day`, 1) with in-app fallback.
- AC: Nothing here sends to external parties (client managers, vendors) - there is no address field to send to (D4).
- Tech: `service/org/ops/OpsNotifier.java`, O13.3's `OrgNotificationKind` registry, `service/MailService.java` templates under `resources/templates/mail/ops-*.html`.
- Deps: H2.3; O13.3 org notification kinds + delivery (the daily cap and digest live there). Size S. Owner API.
- Tests: `OpsNotifierTest` (one row per decision, comment included, marketer never targeted, cap fallback to in-app); template snapshot.

### H4.2 `OpsReminderJob` — consultants with last week missing, approvers with pending, on admin-configured days; quiet hours, daily cap, idempotent per week
As a consultant, I want one reminder when I forget last week; as finance, one when sheets are waiting.
> Monday 9 for you, Wednesday 9 for finance, org-local, once per week ever.
- AC: Hourly job: for each org with the module on, at `ops_settings.reminder_consultant_dow/time` (defaults from setting `org.ops.reminder_consultant`, MON 09:00) org-local, consultants with an ACTIVE placement and no SUBMITTED/APPROVED sheet for the previous week → `OPS_TS_DUE`; at `reminder_approver_dow/time` (`org.ops.reminder_approver`, WED 09:00) approvers with ≥ 1 SUBMITTED → `OPS_TS_PENDING` with the count.
- AC: Quiet hours (org `settings.quietHours`, default setting `org.notify.quiet_hours_default` 21:00–08:00) delay delivery to the next allowed hour; the O13.3 daily cap applies (already-emailed members get in-app only); idempotency key `(target_member_id, kind, week_start)` in `ops_reminder_log` → one send per week per target, ever, across restarts; event `REMINDER_SENT` on the sheet when one exists.
- AC: Never: reminders to marketers, about other people's sheets, or 'escalations'; the job registers with the admin jobs registry (A10.2) as `ops.reminders` with last-run and counts.
- Tech: `service/org/ops/OpsReminderJob.java` (`@Scheduled(cron = "0 5 * * * *")`, pattern of `JobMatchScheduler`), `domain/org/ops/OpsReminderLog.java` (+ changeset `20261013040000_ts_prefs_consent.xml`, shared with H4.3/H8.1).
- Deps: H4.1; A5.1 settings (the default days/times). Size M. Owner API.
- Tests: `OpsReminderJobTest` (Monday/Wednesday selection in three timezones incl. DST week, quiet-hours delay, cap interaction, idempotency across two runs and a restart, no mail to MARKETER, ENDED placements excluded).
- Benchmark: Incumbents nag daily or escalate to managers. Ours: two quiet reminders a week, org-local, never to the marketer.

### H4.3 Consultant reminder preferences — `ops_member_pref` (Friday nudge opt-in, in-app only) + settings UI; org reminder settings UI
As a consultant, I want to choose a Friday nudge or no emails at all; as finance, I want to set the reminder days.
> Your reminders, your call. The org picks the day, you pick the channel.
- AC: `ops_member_pref` (`friday_nudge BOOLEAN`, `push_only BOOLEAN`) with `GET/PUT /api/me/ops/prefs`; the nudge fires at setting `org.ops.reminder_nudge` (FRI 16:00) org-local via the same job and idempotency; `push_only` turns every ops email into in-app only.
- AC: User app: a 'Timesheet reminders' card in `/settings` (existing settings page) with the two switches; org console: reminder day/time pickers on `/org/ops/settings` with the quiet-hours note.
- AC: Marketer and STAFF sessions never see either card.
- Tech: `domain/org/ops/OpsMemberPref.java`, `web/rest/org/ops/OpsMemberPrefResource.java`, `web/src/app/(app)/settings/*` card, `web/src/app/(org)/org/ops/settings/*`.
- Deps: H4.2. Size S. Owner API + web.
- Tests: `OpsMemberPrefTest` (nudge selection, push_only suppresses email); Playwright for both cards and their absence for MARKETER.

---

## H5 — Exports

_Async export jobs with GENERIC / PAYROLL / BY_CLIENT CSV and the PDF pack with proof pages, the column deny-list test, consultant self-export, the Disclaimer component._

### H5.1 Async export jobs — `POST /ops/export/timesheets` → 202, `ops-export` FileStorage prefix with lifecycle, GENERIC + PAYROLL layouts, audited per file
As finance, I want approved hours out in the shape my payroll person imports, without us ever sending anything anywhere.
> A payroll-shaped sheet, not a data dump.
- AC: `POST /ops/export/timesheets {from, to, consultantMemberId?, clientId?, format: CSV|PDF_PACK, layout: GENERIC|PAYROLL|BY_CLIENT, includeProof?}` → 202 `{exportId}`; `GET /ops/export/{id}` → status, then the proxied download; files under FileStorage prefix `ops-export` with a lifecycle of setting `org.ops.export_lifecycle_days` (7) swept by the storage sweep; `OPS_EXPORT` audit per file (layout, period, row count, sha256); the job pattern mirrors the account-export `privacy_request` job.
- AC: `PAYROLL` layout per DESIGN §9: one row per consultant × week with regular/pto/sick/holiday/unpaid/total hours, pay_type_label, self_recorded, approved_at/by; `pay_rate` and `pay_amount` (= WORK × pay rate in force that week; PTO/SICK/HOLIDAY amounts never computed) only when the caller holds `ops.finance`; people identified by display name + member id only.
- AC: `OpsExportColumns` registry extended; the H0.6 deny-list test covers every layout; H0.6's synchronous GENERIC export stays for small ranges.
- Tech: `service/org/ops/{OpsExportService,OpsExportJob}.java`, `domain/org/ops/OpsExport.java` (+ changeset `20261013050000_ts_exports.xml`), `web/rest/org/ops/OpsExportResource.java`.
- Deps: H2.3 (corrections in rows); H3.2 (proof Y/N column, storage prefix); H1.1 (pay rate in force). Size M. Owner API.
- Tests: `OpsExportTest` (PAYROLL columns vs fixtures incl. a mid-week rate change, FINANCE-only columns absent for others, self_recorded column, audit row per file, lifecycle sweep removes the file and keeps the audit row); `OpsExportJobIT` (202 → download).
- Benchmark: Harvest/Clockify give a generic CSV; Gusto/ADP imports want per-person-per-period rows. Ours: a payroll-shaped sheet on day one, provider presets later (H8.5).

### H5.2 `BY_CLIENT` CSV + `PDF_PACK` with approval line, proof thumbnails, optional proof pages and the disclaimer footer (Chromium sidecar)
As finance, I want a PDF pack a vendor accepts with the invoice, with the approval trail on it.
> One page per approved week, the proof thumbnail on it, who approved and what they saw.
- AC: `BY_CLIENT`: one row per client × consultant × week with WORK hours and bill rate in force (`ops.finance` only; 404-style absence otherwise).
- AC: `PDF_PACK`: one page per approved sheet - org name, consultant, client, week grid with kinds, totals, approval line (who / when / flags acknowledged / self-recorded badge), thumbnail of page 1 of each proof with 'Attachment: name (sha256 …)', footer 'Records you entered. Not tax, legal or accounting advice.'; `includeProof=true` appends the proof files as pages; rendered through the R0.6 sidecar via a shared `PdfRenderer`; superseded versions included when `includeSuperseded=true`.
- AC: Rendering template lives in `packages/ui/src/ops/pdf/TimesheetPage.tsx` using the same static-HTML rule as resume templates (no hooks, `.ts-*` classes).
- Tech: `service/org/ops/OpsPdfPackService.java`, `PdfRenderer` (extract from R0.6 if still inline), `packages/ui/src/ops/pdf/*`.
- Deps: H5.1; R0.6 the Chromium PDF sidecar from the Resume Builder (reused, not duplicated). Size M. Owner API.
- Relates: R0.6.
- Tests: `OpsExportTest` extended (BY_CLIENT columns, FINANCE gate); `OpsPdfPackIT` behind the PDF smoke flag (footer text and approval line present via text extraction, page count = sheets + proof pages); vitest snapshot of `TimesheetPage`.
- Benchmark: Conrep builds the sub-vendor invoice from approved hours but the consultant and the proof are elsewhere. Ours: the pack carries hours, proof and the approval trail together.

### H5.3 Export UI (org console) + consultant self-export + shared `Disclaimer` component
As finance, I want to pick a period, a layout and get the file; as a consultant, I want my own sheets any time.
> Never locked in: one tap gives you the file your payroll person actually wants.
- AC: `/org/ops/exports`: period picker, consultant/client filter, layout radio with one-line explanations, 'Include proof pages'; 202 → polling → download; history of the last N exports with sha256 (audit-backed).
- AC: Consultant history (H2.4) 'Export my sheets' calls the synchronous own export; copy says what is and is not in it (no pay unless the switch is on).
- AC: `@kiwiply/ui` `Disclaimer` component ('Records you entered. Not tax, legal or accounting advice.') used on the inbox, exports page, every H6 finance screen and the PDF footer; lawyer wording confirmed with the trust area (T3.x) before public launch - until then the copy constant is marked `// pending legal review`.
- Tech: `web/src/app/(org)/org/ops/exports/*`, `packages/ui/src/ops/Disclaimer.tsx`.
- Deps: H5.2; H3.6 (inbox hosts the export button). Size S. Owner web + ui.
- Tests: vitest for the Disclaimer and the layout radio copy; Playwright: export flow with a stubbed 202/ready; disclaimer present on the inbox.

---

## H6 — Money records (record only)

_Invoice records from approved hours, payments IN/OUT, expenses with receipts, the profit view and finance exports - record money, never move it; FINANCE-only, audited reads._

### H6.1 Money schema — `ops_client` additions, `ops_invoice`, `ops_invoice_line`, `ops_payment`, `ops_expense`; `ops.finance` audited reads
As the API, I want the money-record tables with no column that could ever hold a bank or tax number.
> Amounts in minor units, labels from a fixed list, memos that refuse account numbers.
- AC: Changeset `20261013060000_ts_money.xml` per DESIGN §5.14: `ops_client` gains `address_text` (business), `payment_terms_days` (default from setting `org.ops.payment_terms_days_default`, 30), `invoice_email` (business contact, for the org's own sending - we never send); `ops_invoice` (number = org prefix + sequence, status DRAFT|ISSUED|PARTIALLY_PAID|PAID|VOID, dates, currency, subtotal/tax (entered)/total/paid minor, pdf_key, needs_reissue, notes), `ops_invoice_line` (placement, timesheet, description, minutes, rate_minor in force, amount_minor, proof_note ≤ 120), `ops_payment` (direction IN|OUT, counterparty_kind CLIENT|CONSULTANT|VENDOR|OTHER, counterparty_id, invoice_id, placement_id, amount_minor, paid_on, method_label enum, reference ≤ 80 memo, notes), `ops_expense` (placement, consultant, category, amount_minor, spent_on, receipt_key, notes).
- AC: `OpsNeverCollectedTest` (a) covers the new tables; `method_label` is the enum `{ACH, WIRE, CHECK, CARD, CASH, OTHER}` - labels, never numbers; every String field annotated.
- AC: Every read under `/ops/invoices`, `/ops/payments`, `/ops/expenses`, `/ops/profit` writes `OPS_READ_FINANCE` collapsed daily per actor (reuses H2.3's collapse).
- Tech: `domain/org/ops/{OpsInvoice,OpsInvoiceLine,OpsPayment,OpsExpense}.java`, enums `OpsInvoiceStatus`, `OpsPaymentMethodLabel`, repositories; `OpsAuditService.readFinance`.
- Deps: H1.1 (rates); H2.3 (locks hook). Size M. Owner API.
- Tests: `TimesheetsMoneySchemaIT`; `OpsNeverCollectedTest` green with the new tables (and the meta-test still catches a planted `routing_number`).

### H6.2 Invoice records — generate from approved, uninvoiced sheets (rate in force), lock sheets, issue / void, `needs_reissue` on supersede, PDF with disclaimer
As finance, I want client invoices generated from approved hours as records I download and send myself.
> We never send it for you - it stays your document, and it knows when a week under it changed.
- AC: `POST /ops/invoices/generate {clientId, from, to}` (`ops.finance`) → DRAFT with one line per approved, uninvoiced sheet in the period using `OpsRateService.inForce(placement, week_start)` (422 `RATE_MISSING {placements[]}` when a bill rate is absent); generating sets `locked_reason=INVOICED` on the sheets through H2.3's hook; `PATCH /{id}` (dates, tax entered, notes, payment-instructions free text ≤ 300 with `@NoSensitiveText`), `POST /{id}/issue` ('issued' = the org marked it sent), `POST /{id}/void` (unlocks sheets when DRAFT/ISSUED and unpaid), `GET /{id}/pdf` (FileStorage `ops-invoice` prefix, proxied).
- AC: A superseded sheet on an ISSUED invoice sets `needs_reissue=true` and the DTO carries the delta; void + regenerate produces a new number with 'replaces ACME-0007'; `paid_minor` = Σ linked `ops_payment IN` rows recomputed on write (H6.3) → PARTIALLY_PAID / PAID.
- AC: Invoice PDF via `PdfRenderer`: lines, totals in minor units rendered with the org currency, `proof_note` ('approved 2026-10-10 by J. Lee' from `ocr_json` when present), disclaimer footer; no tax id, no bank line anywhere (the payment-instructions text is validated).
- AC: Web: `/org/ops/invoices` list + draft view at 390 px per DESIGN §3.6 (lines, totals, proofs attached count, Download PDF, Mark issued, Void with confirm).
- Tech: `service/org/ops/{OpsInvoiceService,OpsInvoiceNumbering}.java`, `web/rest/org/ops/OpsInvoiceResource.java`, `packages/ui/src/ops/pdf/InvoicePage.tsx`, `web/src/app/(org)/org/ops/invoices/*`.
- Deps: H6.1; H5.2 (PdfRenderer + proof note). Size L. Owner API + web.
- Tests: `InvoiceGenerateTest` (approved + uninvoiced only, rate in force per line incl. a mid-period change, locks, 422 on missing rate, sequential numbers per org); `NeedsReissueTest` (supersede → flag → void/regenerate chain); `OpsInvoicePdfIT` behind the PDF flag (footer, no deny-listed text); Playwright for the draft view.
- Benchmark: Conrep parks the sub-vendor invoice as 'Not Ready' until the sheet is approved and never tells anyone when the hours change later. Ours: generated only from approved sheets and flagged the moment one is corrected.

### H6.3 Payments IN / OUT and expenses recorded by hand, receipts through the proof scan, invoice status recompute
As finance, I want to record what came in and went out without ever typing an account number.
> Memo fields only; the validator refuses anything that looks like an account.
- AC: `POST/GET /ops/payments` (`?direction&from&to&counterpartyKind`), `POST/GET /ops/expenses` (`ops.finance`); `reference` is a memo ≤ 80 with `@NoSensitiveText`; `method_label` from the enum; a payment linked to an invoice recomputes `paid_minor` and the status; OUT payments to a consultant link to a placement for the profit view.
- AC: Expense receipts: `POST /ops/expenses/{id}/receipt` through FileStorage prefix `ops-receipt` with the same caps as proofs (entitlement `ops.attachment_bytes_max`, counts toward `ops.storage_bytes_max`) and `OpsProofScanService.scan()` unchanged - a receipt with a card or account number is refused the same way.
- AC: Web: payments and expenses lists with add sheets at 390 px; Disclaimer on both.
- Tech: `service/org/ops/{OpsPaymentService,OpsExpenseService}.java`, `web/rest/org/ops/{OpsPaymentResource,OpsExpenseResource}.java`, `web/src/app/(org)/org/ops/{payments,expenses}/*`.
- Deps: H6.2; H3.3 (receipts reuse the scan). Size M. Owner API + web.
- Tests: `OpsPaymentTest` (status recompute to PARTIALLY_PAID/PAID, memo 422 on an account number); `OpsExpenseReceiptIT` (refused receipt stores nothing); Playwright for the add sheets.

### H6.4 Profit view (by consultant / client / month) + finance CSV exports, audited
As an owner, I want billed − pay − expenses by consultant, client and month, and to export everything.
> The margin per consultant, computed from records you entered, exportable in one tap.
- AC: `GET /ops/profit?by=consultant|client|month&from&to` (`ops.finance`) per DESIGN §5.15: billed (Σ approved WORK minutes × bill rate in force, or issued lines when `basis=invoices`), pay_expected, pay_actual (Σ OUT), expenses, gross, margin %, outstanding (Σ issued − paid), unapproved_hours, unproofed_hours (approved with `PROOF_WAIVED`); computed on read with the `(org_id, placement_id, week_start)` index; `OPS_READ_FINANCE` audit.
- AC: `POST /ops/export {what: invoices|payments|expenses|profit, from, to}` → CSV through the H5.1 job with its own layouts in `OpsExportColumns` (deny-list test covers them); audited per file.
- AC: Minor units in, decimal strings out with the currency code in a column; no floats in the service.
- Tech: `service/org/ops/OpsProfitService.java`, `OpsExportColumns` (+ four layouts), `web/rest/org/ops/OpsProfitResource.java`.
- Deps: H6.3. Size M. Owner API.
- Tests: `ProfitViewTest` with a fixture book (two consultants, a rate change, a waived proof, a partial payment) asserting every figure; `OpsExportTest` extended; audit rows collapsed daily.

### H6.5 Finance UI — Ops home (pending, unapproved / unproofed hours, outstanding, needs reissue, this month), profit table, exports
As an owner, I want one screen that says what is waiting, what is owed and how the month looks.
> Pending 4, unproofed 8 h, outstanding $18,400, gross 28 %. Then the export button.
- AC: `/org/ops` home per DESIGN §3.6 tiles at 390 px (each a link into its list); profit table with the by-selector and period; Disclaimer on every finance screen; FINANCE-only routes 404 the page for other roles (the shell hides the links).
- AC: `@kiwiply/ui`: `MoneyTile` (minor units + currency formatting shared with H1.3's conversion), `ProfitRow`; dark mode; no inline svg.
- AC: Analytics: `ops_finance_viewed {tile}` consented.
- Tech: `web/src/app/(org)/org/ops/page.tsx`, `web/src/app/(org)/org/ops/profit/*`, `packages/ui/src/ops/{MoneyTile,ProfitRow}.tsx`.
- Deps: H6.4; H5.3 (Disclaimer, exports page). Size M. Owner web + ui.
- Tests: vitest for money formatting (no float drift, negative gross); Playwright 390 px: tiles link, MEMBER session gets 404, Disclaimer present; axe ≥ 95.

---

## H7 — Billing, retention, erasure & admin

_Catalog items priced later in admin, nightly derived quantity, pilot-to-comp migration, retention and erasure, the admin Ops page with settings keys and the audit completeness tests._

### H7.1 Add-on catalog items (no price in the story) + entitlements, nightly derived consultant quantity, pilot → ADMIN_COMP grant migration
As the business, I want the add-on billed by active consultants automatically, at a price admin sets later.
> Pay for who is actually placed, not for seats you don't use.
- AC: Catalog products `ops-addon-base` (per org per month, quantity 1) and `ops-addon-consultant` (per active consultant per month) seeded with **no price** (admin publishes one later; the '$99 + $4' draft in PROPOSAL-timesheets.md is a worked example for the margin guard only); entitlements `ops.enabled`, `ops.ocr` (default off, D7), `ops.ai_budget_cents_per_consultant` (50), `ops.storage_bytes_max` (2 GiB), `ops.attachment_bytes_max` (5 MiB); the margin guard (B2.2) runs at publish with the consultant line's worst case = OCR budget + scan budget + fee share, base line fee-only.
- AC: `OrgSeatReconciler` (O4.8) sets the consultant quantity nightly from `countActiveConsultants` (H1.2) - the one derived quantity it sets; invoice line descriptions name the count.
- AC: `OpsGate` (H0.2) prefers `EntitlementService.hasOrg(orgId, 'ops.enabled')` when the catalog is live; pilot orgs with `opsPilot` are migrated to an `ADMIN_COMP` grant on the base product by a one-off admin job and the `opsPilot` flag path is removed.
- Tech: catalog seed (B1.1's seed file), `service/org/OrgSeatReconciler.java` (O4.8), `service/org/ops/OpsGate.java`, admin job `ops.pilot_migrate` (A10.2).
- Deps: H1.2 (active-consultant count); B1.1 catalog; O3.2 org assignments/grants; O4.8 OrgSeatReconciler. Decision D2: priced later in admin. Size S. Owner API.
- Relates: B2.2, B1.2.
- Tests: `OpsQuantityReconcilerTest` (count by period, ENDED excluded); `OpsGateTest` extended (entitlement path, comp grant); margin-guard fixture row for the consultant line.
- Benchmark: Clockify Standard ≈ $70/mo for 10 users; Ceipal ≈ $4/user with a 25-user minimum. Ours: per *active* consultant, no minimum, price set in admin behind the 80 % floor.

### H7.2 Retention job (admin-configured, hard minimum 7 y from `week_start`) + erasure behaviour + account export `timesheets[]`
As a consultancy, I want records kept as long as the law expects and former consultants anonymised, not deleted from the books.
> Your name leaves; the org's numbers stay, under 'Former consultant #id'.
- AC: Weekly `ops.retention` job: purges sheets, entries, events, attachments and money rows older than `ops_settings.retention_years` (≥ setting `org.ops.retention_min_years`, 7) from `week_start` / record date **only** when the org is CLOSED or the placement ended more than `retention_years` ago; attachments deleted through `FileStorage.delete` + the ledger; audit `OPS_TS_RETENTION_PURGED` with counts only; dry-run mode in the admin jobs page.
- AC: Erasure (`AccountDeletionService` hook, O6.5): ops rows point at the ERASED membership ('Former consultant #id'); `actor_login` strings in events stay; notes stay (org record, GDPR Art. 17(3)(b)); proof files stay (they passed the scan, so they carry no identifier of the person beyond the name); `ops_member_pref` and `ops_consent_event` rows deleted.
- AC: Account export (`AccountExportService`) gains `timesheets[]` (own sheets, entries, flags, events, attachment list) with the proof files in the ZIP under `ops/`; the data-map catalogue (T1.1) gains the `ops_*` classes with their retention class.
- Tech: `service/org/ops/OpsRetentionJob.java`, hooks in `service/AccountDeletionService.java` and `service/AccountExportService.java`, `privacy/DataClass.java` entries (T1.1).
- Deps: H3.2 (files), H6.1 (money rows), O6.5 GDPR hooks. Decision D3 default (anchor = week_start), user may override. Size M. Owner API.
- Relates: T1.1, T1.4.
- Tests: `OpsRetentionJobTest` (anchor and guard conditions, dry run, seam + ledger deletion, audit counts); `AccountDeletionServiceIT` + `AccountExportServiceIT` extended; `DataMapTest` (T1.1) green with the new tables.

### H7.3 Admin › Ops page — pilot switch, per-org usage (storage, OCR / scan budgets), `org.ops.*` settings keys registered, feature-registry limits
As the Kiwiply admin, I want every timesheet number on one page: who is piloting, how much storage and AI budget each org uses, and the defaults for every setting.
> Every number in this product is a dial on this page, with its history.
- AC: Settings registry (A5.1) declares every `org.ops.*` key named in this backlog with type, bounds, default and sensitivity (table in DESIGN §11): week_start_default, step_minutes_default, expected_hours_default, expected_hours_tolerance_pct, long_day_hours, proof_required_default, attachments_per_sheet, note_max_chars, reject_comment_max_chars, image_max_edge_px, ocr_min_confidence, ocr_approved_date_window_days, refused_hash_cache_days, export_lifecycle_days, export_sync_rows_max, reminder_consultant, reminder_approver, reminder_nudge, presence_weeks, retention_min_years (hard minimum 7), holiday_seed, payment_terms_days_default, demo_seed_weeks, pilot_target_seconds; plus `ai.budget.ops_scan_cents_per_consultant`; `RoadmapSettingsParityTest` (A5.1) sees them.
- AC: Admin page `/admin/ops` (route under `web/src/app/(admin)/`): pilot orgs with 'Enable Ops pilot' (HIGH re-auth, audited), per-org tiles - active consultants, storage used vs cap, OCR budget spent vs cap, scan budget spent, refused uploads (kinds histogram, never files), sheets per week; links to the settings keys on A5.8.
- AC: Feature registry (A5.7) entry `timesheets` carries the typed limits (`attachment_bytes_max`, `storage_bytes_max`, `attachments_per_sheet`) so per-org overrides flow through `FeatureGate`, and the no-hardcoded-gate lint (A5.9) passes on `org/ops`.
- Tech: settings registry declarations (A5.1 `SettingDefinition`s), `web/rest/AdminOpsResource.java`, `web/src/app/(admin)/ops/*`, A5.7 `FeatureDefinition` for `timesheets`.
- Deps: H3.4 (budgets exist); A5.8 Admin › Settings home (the page this hangs off). Size M. Owner API + web.
- Relates: A5.1, A5.7, A5.9.
- Tests: `RoadmapSettingsParityTest` green; `AdminOpsResourceIT` (tiles, HIGH re-auth on the pilot action, audit row); Playwright for the page.

### H7.4 Audit completeness — every `OPS_*` action constant, the audit-table doc↔code test, audit viewer rows for FINANCE, consultant-visible timeline parity
As the org, I want the paper trail complete and provable; as a consultant, I want to see every action on my sheets.
> If it changed, it is in the log with a login. If someone looked, you can see that too.
- AC: `OpsAuditAction` enum lists every action in DESIGN §8 (`OPS_PLACEMENT_*`, `OPS_RATE_SET`, `OPS_TS_*`, `OPS_READ_SHEET`, `OPS_READ_FINANCE`, `OPS_EXPORT`, `OPS_SETTINGS`, `OPS_TS_RETENTION_PURGED`, `OPS_TS_PROOF_REFUSED`, `OPS_TS_PROOF_WAIVED`, `OPS_TS_SUBMIT_FOR`); a doc↔code test asserts the §8 table and the enum match; a reflection test asserts every mutating service method under `org/ops` calls `OpsAuditService` (pattern: `@WebMvcTest` over resources + an `OpsAuditedTest` over the services).
- AC: O13.4's viewer filters by the `OPS_` prefix for FINANCE (`audit.view` billing/ops rows); rate rows never show amounts in details.
- AC: Consultant timeline parity: every `OPS_TS_*` audit action on a sheet has a matching `ops_timesheet_event` kind visible to the consultant, asserted by test.
- Tech: `service/org/ops/OpsAuditAction.java`, `api/src/test/java/com/dossier/api/org/ops/{OpsAuditDocTest,OpsAuditedTest,OpsTimelineParityTest}.java`.
- Deps: H6.3 (last of the mutating paths); O13.4 audit log viewer. Size S. Owner API.
- Tests: The three tests above; `OrgAuditViewerIT` (O13.4) extended with an OPS_ filter case.

---

## H8 — Pilot, onboarding & growth

_Consultant first-run screen, demo consultancy, pilot metrics, zero-setup org onboarding, and the growth items decided after the pilot (crop helper, provider export presets, OCR auto-read)._ H8.5 is a bucket of post-pilot items; each is written in full when scheduled, like R7.

### H8.1 Consultant first-run information screen — versioned text `consent/ops-timesheets/v1`, `ops_consent_event`, shown once per membership
As a consultant, I want to be told plainly what my org sees before I log my first week.
> 'Mehta will see your hours and files. Not your job search.' One screen, once.
- AC: Screen per DESIGN §3.5 at 390 px: what the org sees (hours, kinds, notes, files, submitted-at), what it does not (job search, resumes, applications, inbox), pay visibility is the org's switch, export any time, retention (the org's configured years); text versioned `consent/ops-timesheets/v1` in the same registry as O6.2's consent texts; Continue stores an `ops_consent_event` row (login, version, ip/UA hashes) in `20261013040000_ts_prefs_consent.xml`; shown once per membership and again when the version changes.
- AC: It is information (GDPR Art. 13), not a gate the consultant can decline and still be paid: the copy does not pretend otherwise; `data_share` scope does not gate timesheets (a NONE consultant still submits hours) - asserted by test.
- AC: Timesheet endpoints never read `application`, `resume`, `inbox_*` or `field_cache` - a static test over `org/ops` imports.
- Tech: `domain/org/ops/OpsConsentEvent.java`, `web/rest/org/ops/OpsConsentResource.java`, `web/src/app/(app)/timesheets/welcome/*`, consent text under O6.2's registry.
- Deps: H2.4; O6.2 consent screen pattern (versioned text + event rows). Size S. Owner API + web.
- Relates: O6.2, O14.5.
- Tests: `OpsConsentTest` (once per membership, re-shown on version bump, NONE scope still submits); `OpsNoJobSearchImportsTest`; Playwright for the screen.

### H8.2 Demo consultancy seed — 5 consultants, 3 clients, N weeks of sheets (flagged, corrected, with proofs), labelled DemoBadge
As the business, I want the sales demo and the screenshots to be real data, re-seedable.
> A real-looking shop with a flagged week and a corrected one, in one command.
- AC: `DemoAccountService` seeds `demo-consultancy` (O1.8's demo org) with 5 consultants, 3 clients, placements and setting `org.ops.demo_seed_weeks` (6) weeks of sheets per placement including 2 flagged, 1 corrected (superseded chain), 1 rejected-then-resubmitted, hours-only proof fixtures that pass the scan; idempotent; every record labelled through the existing `DemoBadge`/demo guard.
- AC: Demo data contains no real names, no identifiers and no real company names (fixture list in `resources/demo/ops/`).
- AC: `ts-smoke.mjs` (H0.7) gains a `--demo` mode that runs against the seeded org.
- Tech: `service/DemoAccountService.java` (+ `OpsDemoSeed`), `resources/demo/ops/*`, `web/scripts/ts-smoke.mjs`.
- Deps: H3.6 (every state renders); O1.8 demo org seed. Size S. Owner API.
- Relates: O1.8.
- Tests: `OpsDemoSeedTest` (idempotent, counts, every status present, proofs pass the scan); `DemoGuardTest` extended.

### H8.3 Pilot metrics — `metric_daily` keys (median seconds to submit, proof rate, approved-in-48h, one-tap rate, reminder conversion) + admin tiles
As the business, I want real numbers on how fast the week gets logged before we decide defaults like OCR auto-read.
> Ship to five real shops, measure seconds-to-submit, then decide.
- AC: `MetricRollupJob` keys `ts.median_seconds_to_submit`, `ts.proof_rate`, `ts.approved_48h_rate`, `ts.one_tap_rate`, `ts.reminder_conversion` per org per day from `ts_*` events and sheet timestamps; k-anonymity threshold from the org analytics area (O7.x) applies to per-org views; the target line is setting `org.ops.pilot_target_seconds` (45).
- AC: Admin › Ops (H7.3) gains the five tiles with 7/30-day sparklines; the org's own `/org/ops` home shows proof rate and approved-in-48h only (no per-person speed).
- AC: The pilot review checklist in DESIGN §14 lists which defaults each metric decides (OCR auto-read, reminder days, tolerance).
- Tech: `service/MetricRollupJob` keys (O7.x owns the job), `web/src/app/(admin)/ops/*` tiles, `web/src/lib/analytics.ts` events already emitted.
- Deps: H4.2 (reminder events); H7.3 (admin page); U18.1 event pipeline (the consented events from H2.4/H3.5/H3.6 flow through it). Size S. Owner API + web.
- Relates: U18.1, O7.1.
- Tests: Rollup from fixture events (medians, rates, 48 h boundary, suppression below k); tile rendering.
- Benchmark: Every incumbent sells on features; none publishes consultant-side speed. We set the bar at a measured ≤ 45 s median weekly entry.

### H8.4 Zero-setup onboarding — 'Turn on timesheets' checklist card, first-placement wizard, consultant invite copy, `/organizations` row
As a new consultancy owner, I want to be live in the time it takes to type five names.
> Add five people, add five placements, the first weeks appear by themselves.
- AC: O2.7's activation checklist gains 'Set up timesheets' (visible when the gate passes): steps 'Add a placement' → 'Invite the consultant' (reuses O2.2 invite with a timesheet-specific line) → 'First sheet submitted' (auto-ticks); the first-placement wizard is H1.3's sheet opened in a guided state.
- AC: Org dashboard empty state names the module when the add-on is on and no placement exists; the consultant's `/timesheets` shows the first-run screen (H8.1) then the prefilled week.
- AC: `/organizations` marketing page (O14.x) gains an honest row for Timesheets & Consultancy Ops ('records, never moves money; never collects SSNs, bank or tax IDs; priced per active consultant') once the catalog price exists - until then 'pilot' copy; claims go through the honest-claims register (M0.1).
- Tech: `web/src/app/(org)/org/page.tsx` checklist (O2.7), `web/src/app/(org)/org/ops/placements/new/*` guided state, `web/src/app/(marketing)/organizations/*` row.
- Deps: H1.3; H8.1; O2.7 activation checklist. Size M. Owner web.
- Relates: O2.7, O14.1, M0.1.
- Tests: Playwright: checklist appears only with the gate, steps tick, first sheet auto-tick after the smoke path; honest-claims register test (M0.1) includes the new claims.

### H8.5 Post-pilot growth bucket — client-side crop/redact helper (D12), provider export presets (Gusto / ADP / QuickBooks column maps, D5), OCR auto-read default decision, semi-monthly export grouping, external-approver link (D4, only if pilots demand it)
As the business, I want the items the pilot will ask for listed but not built until the numbers say so.
> Written when the pilot shops ask for it, not before.
- AC: Each item becomes an `H8.n` story with its own AC when scheduled; none ships a constant; the external-approver link (D4) stays rejected unless a pilot consultancy has no client-side system at all - and even then the link approves only, never signs in.
- Deps: H8.3 (the metrics decide which of these is built). Size M is an estimate for the bucket; each item is written as its own story when scheduled, like R7.

---

## Story count
| Epic | Stories | Points (S1 M2 L3) |
|---|---|---|
| H0 Walking skeleton | 7 | 14 |
| H1 Placements, clients & rates | 4 | 6 |
| H2 Weekly entry, phone-first | 5 | 10 |
| H3 Proof & the never-collected gate | 6 | 12 |
| H4 Reminders & notifications | 3 | 4 |
| H5 Exports | 3 | 5 |
| H6 Money records (record only) | 5 | 11 |
| H7 Billing, retention, erasure & admin | 4 | 6 |
| H8 Pilot, onboarding & growth | 5 | 7 |
| **Total** | **42** | **75** |

Old → new ids: the fourteen stories this backlog replaces (org area, Consultancy Ops epic) map to these ids in DESIGN §13.
