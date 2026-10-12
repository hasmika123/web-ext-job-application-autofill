# PROPOSAL — Consultancy Ops 23.0: timesheets first (patch list for `docs/roadmap/areas/org.json`)

Written 2026-10-11 for task 23.0. Designs: `docs/design/org/timesheets.md` (new) and
`docs/design/org/consultancy-ops.md` (updated, PROPOSED). **This file does not edit `org.json`** — the
coordinator applies §3 after the user signs off on §1.

## 1. Decisions for the user (recommended default in bold)

| # | decision | options | recommended default | why |
|---|---|---|---|---|
| D1 | Who gets timesheets | (a) org add-on only; (b) also individual Pro/Autopilot contractors tracking their own hours | **(a) org add-on only for v0**; revisit (b) after the pilot | the value is the consultancy's copy + approval + proof; a solo contractor already has the client's VMS. (b) would need a personal-scope variant of every table and export and competes with Clockify's free tier |
| D2 | Pricing | (a) **$99/org + $4 per active consultant** as locked-draft; (b) a cheaper "Timesheets" entry item (e.g. $49/org incl. 10 consultants) that upgrades to full Ops; (c) $0 base, $9/consultant | **(a)**, with the pilot free | (a) clears the floor trivially and keeps one catalog shape; (b) is a later catalog row, not code — add it only if pilot shops balk at $119 for five people. At 10 consultants we are ~2× Clockify Standard ($70) and ~⅓ of JobDiva/Bullhorn-class tools; the gap is paid for by proof, OCR, flags and the consultant living in Kiwiply already |
| D3 | Retention | 7 y from `week_start` (org may lengthen) vs 7 y after org close | **7 y from `week_start`**, purge only when the org is CLOSED or the placement ended > 7 y ago | matches the US financial-record norm and is simpler to explain; never shorter |
| D4 | External approvers (client/vendor managers) ever get a link or login? | yes (magic-link approve) / **no** | **No.** The client already approves in its own VMS; our approval is the consultancy's acknowledgement. A link would make us a party to the client relationship and a phishing surface | locked "never signs in as a consultant" spirit + privacy; revisit only if pilots show consultancies with *no* client-side system |
| D5 | Payroll / invoicing export formats | generic CSV only; **generic + `PAYROLL` + `BY_CLIENT` CSV + `PDF_PACK`**; provider-specific templates (Gusto/ADP/QuickBooks) | **the four layouts**; provider templates later as column-mapping presets, not stories now | record-only hand-off without pretending to integrate |
| D6 | What a paired MARKETER sees | nothing / **presence only** (client + submitted/missing) / hours | **presence only** | bench-vs-placed awareness is their job; hours and money are not |
| D7 | OCR of the client-approved proof | off entirely / **optional org toggle, suggestion-only, 50 ¢ per active consultant per period pooled** / always on | **optional, off by default, on-tap read; auto-read only after the pilot shows accuracy** | kills the re-keying pain while keeping "we don't read your attachments" true unless the org asks |
| D8 | Finance submitting a sheet *for* a consultant who left mid-week | never / **allowed, audited `OPS_TS_SUBMIT_FOR`, hours only** | **allowed** | trailing hours are real; it is hours, not money, and it is audited to the person |
| D9 | One-person shops (OWNER is the only consultant) | require a second admin / **`ops_settings.approval_required=false` with a visible "self-recorded" badge on every sheet and export** | **the switch** | otherwise the smallest shops cannot use it at all |
| D11 | Identifier scan of proof uploads (never-collected rule) | (a) **mandatory scan before storage, refuse on detection, platform-paid 25 ¢/active consultant/period cap**; (b) scan only when the org's OCR is on; (c) consultant attestation checkbox instead of a scan | **(a)** | the rule is "we don't take any of those"; (b) leaves OCR-off shops unprotected, (c) is a promise, not a control. Text-layer PDFs cost nothing (local scan); only images call the model, classify-only, closed schema |
| D12 | Client-side crop/redact helper before upload | now / **later story** | **later** (after the pilot shows the refusal rate) | refusing is enough to keep the rule; a crop tool is convenience |
| D10 | Priority of O11 and placement in the build order | keep P2 / **P1, timesheets slice right after the org walking skeleton** | **P1**, timesheets v0 before O7/O8/O9/O10/O12 | user pulled it forward; it has no Phase 18/19 dependencies, unlike O10 |

## 2. Minimum path to timesheets

### 2.1 What is truly required (and what is not)

| foundation | required for timesheets v0? | why |
|---|---|---|
| O1.1 org core schema | **yes** | `org_member` is the consultant's identity in the org |
| O1.2 OrgAccessService + matrix (incl. `FINANCE`) | **yes** | every ops endpoint gates on it; FINANCE is in the enum already |
| O1.4 org_audit_event | **yes** | the paper trail is the product |
| O1.3 org endpoints (create, mine, patch) | **yes** | an org must exist and have an OWNER |
| O2.2 email invites + join accept | **yes** | consultants must join (invite-only; no CSV/QR needed for 5–50 people) |
| O6.1 data_share tables + O6.2 consent screen | **yes, but thin** | the join flow ends at the consent screen; timesheets themselves are not scope-gated. Keep both stories, no extra work |
| O1.5 OrgIsolationIT | **yes** (gate) | discovers the new routes automatically |
| O1.6 web gate | **yes** | the approver inbox lives in `/org`; the consultant surface lives in the user app |
| O13.3 notification kinds + daily cap | **yes** for reminders (O11.4) | can land in parallel; O11.3 ships without reminders if it slips |
| O3.1 / O3.2 catalog + assignments, O4.x billing, Phase 18 | **no for v0** | the pilot is free; gate = `organization.settings_json.opsPilot` set by the platform admin (`dossier.ops.enabled` flag); swapped to the `ops.enabled` entitlement when O3.2 lands (O11.8) |
| O5.1 Team page | **no** | placements-lite picks a consultant from `GET /members` (API from O1.3/O2.2); the sample team page can stay sample for the pilot |
| O10.x Marketer | **no** | presence endpoint ships; the marketer UI consumes it later |
| P5.1 FileStorage local driver (plat) | **yes** for proof upload | the seam is also required by the resume builder; if it slips, O11.10 uses `ResumeStorageService` behind an adapter with the same key shape |
| O6.5 GDPR hooks | **no for v0, yes before public launch** | erasure/export of timesheets is in O11.9 |

### 2.2 Recommended order (v0 = free pilot with 2–3 consultancies)

| # | story | size | pts | lane |
|---|---|---|---|---|
| 1 | O1.1 Org core schema | M | 2 | API-model |
| 2 | O1.2 OrgAccessService + matrix | M | 2 | API-model |
| 3 | O1.4 org_audit_event | S | 1 | API-model |
| 4 | O1.3 Org endpoints | M | 2 | API-model |
| 5 | O6.1 data_share tables + ShareMatrixTest | M | 2 | API-model |
| 6 | O2.2 Email invites + join accept | M | 2 | API-model |
| 7 | O1.5 OrgIsolationIT (gate) | M | 2 | API-model |
| 8 | O11.1 Ops settings + FINANCE wiring + pilot gate (edited) | S | 1 | API-ops |
| 9 | O11.2 Clients + placements-lite + rate history (edited; rates optional) | M | 2 | API-ops + web |
| 10 | O11.3 Timesheets core: week API, state machine, flags, approve/reject/correct | L | 3 | API-ops |
| 11 | O11.10 Proof attachments via FileStorage + OCR suggestion + mismatch (new) | M | 2 | API-ops |
| 12 | O11.11 Consultant week view (user app, 390 px) + approver inbox (org console) (new) | L | 3 | web |
| 13 | O1.6 Web gate + O6.2 consent screen | M + M | 4 | web |
| 14 | O13.3 Notification kinds + daily cap | M | 2 | API-notif |
| 15 | O11.4 Reminders + quiet hours (edited) | S | 1 | API-notif |
| 16 | O11.12 Timesheet exports CSV/PDF pack (new) | M | 2 | API-ops |
| 17 | O11.13 Pilot gate, demo seed, first-run screen, pilot metrics (new) | S | 1 | API-ops + web |
| 18 | O11.14 Never-collected gate: `@NoSensitiveText`, `OpsNeverCollectedTest`, proof scan IT (new; lands with 10–11, before any pilot upload) | S | 1 | API-ops |
| | **total** | | **35 pts** (S=1 M=2 L=3 per the roadmap README) | |

Three lanes in parallel (API-model → API-ops; web; notifications) with strict file ownership; the
critical path is 1→7 then 10→11→12→17. Rough size: the API-model lane is the existing walking-skeleton
work (steps 1–7, 13 pts), the timesheets-specific work is 21 pts. With Sonnet agents at roughly a
story-point a day per lane, **v0 is ≈ 3 calendar weeks after the org model starts**, and ≈ 2 weeks if
O1.x has already landed by then. Billing (O11.8), retention/erasure (O11.9), rates UI, invoices (O11.5),
payments (O11.6) and profit (O11.7) follow as v1 and need O3/O4/Phase 18.

### 2.3 What v0 deliberately leaves out
Stripe billing of the add-on, invoice generation, payments/expenses, profit, bill rates in any UI (the
column exists, finance fills it in v1), CSV member import, QR join, marketer presence UI, provider-specific
export templates, OCR auto-read default.

## 3. Patch list against `docs/roadmap/areas/org.json`

Apply in order. Schema = the area schema (`id, epic, title, status, size, owners, deps, story, genz, ac,
tests, tech, evidence, design, critical`, optional `benchmark`, `relates`, `supersedes`).

### 3.1 Epic O11
```json
{ "id": "O11", "name": "Consultancy Ops add-on — timesheets first", "goal": "Timesheets with client-approved proof, flags and one-tap approval first; then placements rates, invoice records, payments and profit — record money, never move it; FINANCE role.", "priority": "P1" }
```
Priority **P2 → P1**. Ordering note for `PLAN-org.md` §2: O11 (timesheets slice O11.1–O11.4, O11.10–O11.13)
moves ahead of **O7, O8, O9, O10, O12, O13 (except O13.3), O14, O15**; it sits right after the walking
skeleton (O1.1–O1.5, O6.1, O2.2) and alongside O1.6/O6.2/O13.3. The money slice (O11.5–O11.8) keeps its
place after O3/O4.

### 3.2 Edits to existing stories

**O11.1** — replace `title`, `deps`, `ac`, `tests`, `tech`:
```json
"title": "23.0 spec sign-off (consultancy-ops.md + timesheets.md) + FINANCE wiring + ops_settings + pilot gate",
"deps": ["O1.2", "O1.4"],
"ac": [
  "User confirms decisions D1–D10 in docs/roadmap/PROPOSAL-timesheets.md; both design docs flip from PROPOSED to locked.",
  "FINANCE role permissions ops.settings, ops.placements, ops.timesheets.approve, ops.finance per tenant-model.md §4; OWNER/ADMIN inherit; MEMBER gets ops.timesheets.own only when they hold ≥1 placement.",
  "ops_settings table + GET/PATCH /api/orgs/{id}/ops/settings per timesheets.md §5.1/§6 (retentionYears ≥ 7 validated, weekStart change refused with live sheets).",
  "Gate: dossier.ops.enabled flag + organization.settings_json.opsPilot (platform-admin set, audited) in v0; EntitlementService ops.enabled replaces it in O11.8 — both paths return 402 PLAN_REQUIRED {feature: 'ops.enabled'}."
],
"tests": ["OpsRoleMatrixTest skeleton (FINANCE/ADMIN/OWNER/MEMBER-with-placement/MARKETER/STAFF); gate test for flag + pilot + entitlement paths; settings validation."],
"tech": "OrgRole/OrgPermission additions, domain/org/ops/OpsSettings, web/rest/org/ops/OpsSettingsResource."
```

**O11.2** — replace `title`, `ac`, `tests`, `tech`, add `benchmark`:
```json
"title": "Clients + placements-lite + rate history (consultant × client × dates; rates optional, effective-dated, minor units; pay-type label only)",
"ac": [
  "Tables ops_client, ops_vendor, ops_placement, ops_placement_rate, ops_holiday per timesheets.md §5.2–5.5, §5.10; US federal holidays seeded when org.country = US.",
  "POST /ops/placements accepts newClientName inline (zero-setup); rates optional and absent from every consultant/marketer DTO (bill) or gated by show_pay_to_consultant (pay).",
  "GET /ops/placements/mine for consultants; GET /ops/presence for MARKETER (client + dates only).",
  "SensitiveTextValidator on every free-text field (SSN/EIN/IBAN/9+ digits → 422 SENSITIVE_TEXT).",
  "Web: one-screen 'New placement' sheet at 390 px (consultant picker from /members, client name, start date; everything else collapsed under 'More')."
],
"tests": ["Validator; role visibility reflection test (no bill rate field in consultant DTOs); rate-in-force lookup by week; holiday seed."],
"tech": "domain/org/ops/{OpsClient,OpsVendor,OpsPlacement,OpsPlacementRate,OpsHoliday}; OpsPlacementResource; web org-v2/ops/placements.",
"benchmark": "Bullhorn T&E requires placement data to be perfect in the ATS before approval (Bullhorn KB payroll workflow); Ceipal has a 25-user minimum. Ours: consultant + client + date, no minimum."
```

**O11.3** — replace `title`, `deps`, `ac`, `tests`, `tech`, add `benchmark`:
```json
"title": "Timesheets core — weekly sheet API, day kinds, prefill/copy-last-week, flags, submit/withdraw/approve/reject/correct, supersede + locks",
"deps": ["O11.2"],
"ac": [
  "Tables ops_timesheet, ops_timesheet_entry, ops_timesheet_event per timesheets.md §5.6–5.9 incl. live_key uniqueness and SUPERSEDED chain.",
  "State machine per §4: DRAFT→SUBMITTED→APPROVED→SUPERSEDED; reject → DRAFT with comment; withdraw; correction creates a new SUBMITTED row with reason; APPROVED rows immutable (no endpoint updates entries); locked_reason=INVOICED still supersedable and flags the invoice.",
  "GET /ops/timesheets/current creates prefilled DRAFTs (last approved week, else expected ÷ 5); copy-last-week; whole-week PUT entries with day kinds WORK/PTO/HOLIDAY/SICK/UNPAID and 15/30/60-minute steps.",
  "Flags per §7 computed on submit and approve; DAY_OVER_24H blocks; PROOF_REQUIRED blocks submit unless waived (audited); approve requires acknowledgeFlags for every non-info flag; approve-bulk skips flagged; SELF_APPROVAL 409.",
  "Consultant own-only enforced in the service (foreign sheet → 404); every mutation writes ops_timesheet_event + org_audit_event OPS_TS_*."
],
"tests": ["OpsTimesheetStateTest (all transitions, concurrency on live_key); OpsFlagsTest table-driven; OpsRoleMatrixTest own-only/marketer-none; audit row per mutation; OrgIsolationIT picks up routes."],
"tech": "domain/org/ops/{OpsTimesheet,OpsTimesheetEntry,OpsTimesheetEvent}; service/org/ops/{OpsTimesheetService,OpsFlagService}; web/rest/org/ops/OpsTimesheetResource.",
"benchmark": "JobDiva MyTime (consultant app) sits at 2.4★/18 ratings; Beeline/Fieldglass rejections and locked sheets need a program office. Ours: reject returns an editable draft with the comment; corrections never need support."
```

**O11.4** — replace `ac`, `tests`:
```json
"ac": [
  "OpsReminderJob hourly: Monday 09:00 org-local to consultants with last week missing, Wednesday 09:00 to approvers with pending, both configurable in ops_settings.",
  "Honors org quiet hours (default 21:00–08:00) and the O13.3 one-org-email-per-member-per-day cap (falls back to in-app); idempotency key (member, kind, week_start) → one send per week ever.",
  "Consultant opt-ins in ops_member_pref: Friday 16:00 nudge; in-app only. Never emails marketers; no escalations.",
  "Notification kinds OPS_TS_DUE, OPS_TS_PENDING, OPS_TS_REJECTED, OPS_TS_APPROVED registered with O13.3."
],
"tests": ["Job selection; quiet-hours delay; cap interaction; idempotency across restarts; opt-in; no mail to MARKETER."]
```

**O11.5** — append to `ac`: `"Invoice lines use ops_placement_rate in force for the sheet's week; generating locks the sheets (locked_reason=INVOICED); a superseded sheet sets needs_reissue and the UI shows the delta; proof_note from ocr_json when present."` Add to `tests`: `"NeedsReissueTest; rate-in-force per line."`

**O11.8** — replace `ac`:
```json
"ac": [
  "Catalog rows ops-addon-base ($99/org/month) and ops-addon-consultant ($4/active consultant/month) with entitlements ops.enabled, ops.ocr, ops.ai_budget_cents_per_consultant=50, ops.storage_bytes_max=2147483648, ops.attachment_bytes_max=5242880; margin guard passes (base fee-only; consultant line 50¢ AI worst case).",
  "OrgSeatReconciler sets the consultant quantity nightly from active placements; invoice line descriptions name the count.",
  "Pilot orgs (opsPilot flag) migrated to an ADMIN_COMP grant on the Ops product; the flag path is removed."
]
```

**O11.9** — replace `ac`:
```json
"ac": [
  "Retention: ops.retention weekly job purges sheets/attachments/money rows older than retention_years (≥7) from week_start / record date only when the org is CLOSED or the placement ended > retention_years ago; attachments deleted through FileStorage + storage_object ledger; OPS_TS_RETENTION_PURGED audit with counts.",
  "Erasure (AccountDeletionService hook): ops rows kept under the ERASED membership ('Former consultant #id'); actor_login strings kept; notes kept (org record); account export gains timesheets[] with files.",
  "Shared Disclaimer component in @kiwiply/ui used on every finance screen, export footer and PDF pack."
]
```
and `deps`: `["O11.3", "O6.5"]` (was `O11.2`).

### 3.3 New stories (full objects)

```json
{
  "id": "O11.10",
  "epic": "O11",
  "title": "Client-approved proof — attachments via FileStorage (≤5 MB, 3 per sheet, 2 GB/org) + optional OCR suggestion + OCR mismatch flag",
  "status": "not_started",
  "size": "M",
  "owners": ["API"],
  "deps": ["O11.3", "P5.1"],
  "relates": ["I0.3"],
  "story": "As a consultant, I want to attach the client-approved sheet from my phone and have the hours read for me so that nobody re-keys my week; as finance, I want to see when the proof and the entered hours disagree.",
  "genz": "Photo of the approved sheet → hours suggested → you confirm. The proof is the record, not an email thread.",
  "ac": [
    "POST /ops/timesheets/{id}/attachments (multipart) stores through FileStorage key prefix ops-ts, sniffed pdf/png/jpg, ≤5 MB (413 FILE_TOO_LARGE), ≤3 live per sheet (409 ATTACHMENT_LIMIT), org cap 2 GB from ops_storage_usage (413 OPS_STORAGE_CAP); storage_object ledger gains ref_type OPS_ATTACHMENT + org_id.",
    "Two-phase upload: bytes stay in the FileStorage temp area until the identifier scan (O11.14, timesheets.md §5.13) passes; text-layer PDFs scanned locally with PDFBox, images/scanned PDFs via AI gateway task OPS_TS_SCAN (classify-only closed schema, platform safety budget 25¢ × active consultants); detection → 422 PROOF_HAS_IDENTIFIER {kinds}, temp deleted, no ledger/attachment row, audit OPS_TS_PROOF_REFUSED with kinds only, refused sha256 cached 90 days; no override.",
    "Downloads proxied with Content-Disposition: attachment and the org permission check; no presigned URLs; delete only in DRAFT.",
    "OCR: when ops_settings.ocr_enabled and entitlement ops.ocr, POST .../read (or auto-read) sends the file through the AI gateway with budget owner = Ops grant (50¢ × active consultants pooled); closed response schema {days[], total_minutes, confidence, approver_name?, approved_date?} validated before storing ocr_json; any other field rejected.",
    "Result is a suggestion: apply-ocr replaces entries with source=OCR in DRAFT only; OCR_MISMATCH flag when total differs (suppressed below confidence 0.6); budget exhausted → ocr_status SKIPPED + OCR_UNREAD flag, submit never blocked.",
    "proof_state on the sheet (NONE/ATTACHED/READ_MATCH/READ_MISMATCH/READ_FAILED) drives the approver inbox chips."
  ],
  "tests": [
    "OpsAttachmentIT on the local driver: size/limit/cap boundaries, sniffing, DRAFT-only delete, proxied download permission, erasure keeps files.",
    "OpsOcrTest: gateway stub, schema rejection, budget exhausted path, confidence suppression, never runs when disabled."
  ],
  "tech": "service/org/ops/OpsAttachmentService (FileStorage), OpsOcrService (AiGateway task OPS_TS_OCR, prompt registry id ops/ts-ocr/v1), OpsTimesheetAttachmentResource.",
  "evidence": [],
  "design": "docs/design/org/timesheets.md",
  "critical": true,
  "benchmark": "Ceipal reviewers complain about attachment size limits; standalone OCR vendors (Lido, Nanonets, Affinda) sell timesheet extraction as a separate tool; no staffing suite we found reads the client-approved proof inside the sheet. Ours: in-sheet, suggestion-only, budget-capped."
}
```

```json
{
  "id": "O11.11",
  "epic": "O11",
  "title": "Consultant week view (user app, 390 px, PWA) + approver inbox with one-tap/bulk approve (org console)",
  "status": "not_started",
  "size": "L",
  "owners": ["web", "ui"],
  "deps": ["O11.3", "O11.10", "O1.6"],
  "story": "As a consultant, I want to log my week in 30 seconds on my phone with the proof attached; as finance, I want to approve clean sheets in one tap and be made to look at flagged ones.",
  "genz": "Prefilled from last week, big steppers, camera button, submit. Approvals are a list you clear with your thumb.",
  "ac": [
    "/app/timesheets: week view per timesheets.md §3.1 (prefilled draft, 44 px steppers, long-press numeric entry, weekend collapsed, day sheet with kinds, copy last week, holidays chip, note, total vs expected, submit-with-flags confirm, withdraw); history list with status and rejection comment; pay line only when the org switch is on; 'Export my sheets'.",
    "Proof upload per §3.2: file input with capture=environment, client-side downscale to ≤2000 px, progress, OCR suggestion with Use/Keep; failures keep the local file for retry.",
    "/org/ops/timesheets: approver inbox per §3.3 (tabs All/Flagged/No proof; one-tap Approve only on unflagged rows; flagged rows open the sheet with inline proof viewer; bulk approve unflagged; reject requires comment); 'More → Timesheets' bottom-tab entry (O15.1).",
    "Shared primitives (Stepper, DayKindChips, ProofTile, FlagChip, ApprovalRow, Disclaimer) added to @kiwiply/ui first; no inline svg.",
    "Analytics events (consented): ts_week_opened, ts_submitted {seconds_open, prefilled, proof, flags}, ts_approved {one_tap, bulk}."
  ],
  "tests": [
    "vitest for every component state; Playwright 390 px: open→submit ≤ 6 taps on the prefilled path, steppers ≥ 44 px, camera attribute, one-tap absent on flagged rows, bulk count, rejection comment required; dark mode; Lighthouse a11y ≥ 95."
  ],
  "tech": "web/src/app/(app)/app/timesheets/*, web/src/app/(org)/org/ops/timesheets/*, packages/ui/src/ops/*.",
  "evidence": [],
  "design": "docs/design/org/timesheets.md",
  "critical": true,
  "benchmark": "Toggl/Harvest put approvals on $24/$17.50 per-user tiers; JobDiva MyTime is 2.4★; Zoho approvers must sign in to the portal to approve. Ours: approvals at every size, one tap for clean sheets, phone-first."
}
```

```json
{
  "id": "O11.12",
  "epic": "O11",
  "title": "Timesheet exports — GENERIC / PAYROLL / BY_CLIENT CSV + PDF pack with proof pages (record only, audited)",
  "status": "not_started",
  "size": "M",
  "owners": ["API"],
  "deps": ["O11.3", "O11.10"],
  "story": "As finance, I want approved hours out as CSV for payroll and as a PDF pack with proofs for the vendor, without us ever sending anything.",
  "genz": "Never locked in: one tap gives you the file your payroll person actually wants.",
  "ac": [
    "POST /ops/export/timesheets {from, to, consultantMemberId?, clientId?, format, layout} → 202 job; GET /ops/export/{id} download; files under FileStorage prefix ops-export with 7-day lifecycle; OPS_EXPORT audit per file with sha256 and row count.",
    "Layouts per timesheets.md §11: GENERIC (per entry), PAYROLL (per consultant×week; pay columns only for FINANCE), BY_CLIENT (bill rate in force; FINANCE only), PDF_PACK (one page per approved sheet, approval line with acknowledged flags, proof thumbnails, optional proof pages, disclaimer footer) rendered via the R0.6 Chromium sidecar.",
    "GET /ops/timesheets/mine/export?format=CSV for consultants (own sheets, no pay unless switch on, synchronous).",
    "Hours as decimal with 2 dp in CSV; minutes in a second column; UTF-8 with BOM for Excel."
  ],
  "tests": [
    "OpsExportTest: every layout's columns vs fixtures; FINANCE-only columns absent for others; PDF footer + approval line; audit row per file; consultant export own-only."
  ],
  "tech": "service/org/ops/OpsExportService (+ PdfRenderer from resume builder), OpsExportResource.",
  "evidence": [],
  "design": "docs/design/org/timesheets.md",
  "critical": false,
  "benchmark": "Conrep/Ceipal tie exports to their own invoicing; Harvest/Clockify export generic CSV. Ours: a payroll-shaped sheet and a proof pack a vendor accepts, with the approval trail on it."
}
```

```json
{
  "id": "O11.13",
  "epic": "O11",
  "title": "Pilot gate + demo consultancy seed + consultant first-run screen + pilot metrics",
  "status": "not_started",
  "size": "S",
  "owners": ["API", "web"],
  "deps": ["O11.11", "O11.4"],
  "story": "As the business, I want two or three consultancies on timesheets for free before billing exists, with real numbers on how fast the week gets logged.",
  "genz": "Ship it to five real shops, measure seconds-to-submit, then decide the defaults.",
  "ac": [
    "dossier.ops.enabled flag; platform-admin action 'Enable Ops pilot' sets organization.settings_json.opsPilot=true (audited, HIGH); /api/orgs/*/ops/** → 404 when the flag is off.",
    "Consultant first-run information screen per timesheets.md §8 with versioned text consent/ops-timesheets/v1 stored in ops_consent_event (login, version, ip/UA hashes); shown once per membership.",
    "Demo org demo-consultancy seeded (5 consultants, 3 clients, 6 weeks of sheets incl. 2 flagged + 1 corrected + proofs) labelled by DemoBadge.",
    "Pilot metrics (metric_daily): ts.median_seconds_to_submit, ts.proof_rate, ts.approved_48h_rate, ts.one_tap_rate, ts.reminder_conversion; shown on the admin ops page."
  ],
  "tests": [
    "Flag/pilot gate; first-run shown once; seed idempotent; metric rollup from fixture events."
  ],
  "tech": "application.yml flag; AdminOrgResource pilot action; DemoAccountService seed; web first-run sheet; MetricRollupJob keys.",
  "evidence": [],
  "design": "docs/design/org/timesheets.md",
  "critical": false,
  "benchmark": "Every incumbent sells on features; none publishes consultant-side speed. We set the bar at a measured ≤ 45 s median weekly entry."
}
```

```json
{
  "id": "O11.14",
  "epic": "O11",
  "title": "Never-collected gate — @NoSensitiveText validator product-wide, OpsNeverCollectedTest (schema/DTO/export/OCR deny-list), proof identifier scan + refusal IT",
  "status": "not_started",
  "size": "S",
  "owners": ["API"],
  "deps": ["O11.2"],
  "relates": ["T1", "O6.5"],
  "story": "As the business, I want it to be impossible — not just forbidden — for timesheets, placements, client/vendor records, exports or proof files to collect an SSN/ITIN, bank or routing number, tax id, passport/visa/document number or date of birth.",
  "genz": "No field for it, no column for it, no export for it, and a file that shows one bounces before it lands. A policy you can grep.",
  "ac": [
    "SensitiveTextValidator moved to api/.../validation (shared product-wide) with the rules in timesheets.md §5.12: SSN/ITIN, EIN, IBAN, Luhn card, 8+ consecutive digits, keyword+number (passport/visa/I-94/I-9/licence/account/routing/tax id), keyword+date (DOB); document mode for scanned text; @NoSensitiveText constraint applied to every String field of every ops DTO; message 'Don't put account, tax, ID-document numbers or dates of birth here — we never collect them.'",
    "OpsNeverCollectedTest: (a) no ops_* column matching the deny-list regex in Liquibase/JPA; (b) reflection: no DTO field with a deny-listed name, every String field annotated; (c) OpsExportColumns registry has no deny-listed column in any layout; (d) OPS_TS_OCR / OPS_TS_SCAN response schemas are closed to the enumerated fields; (e) pay_type_label and method_label are enums. Fails the unit suite on violation.",
    "Proof scan per timesheets.md §5.13 implemented in OpsProofScanService: PDFBox text-layer scan (no model), gateway classify-only scan for images with the platform safety budget (25¢ × active consultants per period, counted by the margin guard), two-phase temp write, 422 PROOF_HAS_IDENTIFIER{kinds}, refused-sha256 cache (90 d), audit kinds only, no override path.",
    "Receipts (O11.6) and invoice PDFs reuse the same scan on upload.",
    "Docs: 'Never collected' table in timesheets.md §5.12 and consultancy-ops.md §2.1 kept in sync with the deny-list regex by a doc↔code test (same pattern as ShareMatrixTest)."
  ],
  "tests": [
    "SensitiveTextValidatorTest (every rule, document mode tolerances, message snapshot); OpsNeverCollectedTest (a–e, plus a meta-test that a deliberately added 'ssn' column in the test profile is caught); OpsProofScanIT (accepted hours-only fixtures; printed-SSN PDF refused with nothing stored; image refused via stub classifier; budget-exhausted image refused with PDF alternative; sha cache short-circuit and purge)."
  ],
  "tech": "api/.../validation/{SensitiveTextValidator,NoSensitiveText}; service/org/ops/OpsProofScanService (AiGateway task OPS_TS_SCAN, prompt registry ops/ts-scan/v1); test/.../org/ops/OpsNeverCollectedTest.",
  "evidence": [],
  "design": "docs/design/org/timesheets.md",
  "critical": true,
  "benchmark": "Every incumbent (Ceipal, JobDiva, Bullhorn, Avionté) stores SSNs, I-9s and bank details as core HR data; we are the only one whose timesheets cannot take them. Enforced by a failing build, like the consent matrix (O6.1)."
}
```

### 3.4 Dependency and ordering changes elsewhere
- `O11.10.deps` → `["O11.3", "O11.14", "P5.1"]` (the scan must exist before the first proof is stored).
- `O11.9.deps` → `["O11.3", "O11.10", "O6.5"]`.
- `O11.8.deps` stays `["O11.2", "O4.8"]` (billing follows O4); add `relates: ["B1.1"]` if the pay area's
  catalog seed story id is confirmed as `B1.1`.
- `O13.3`: no change, but it is now on the timesheets critical path — note in `PLAN-org.md` that it is
  pulled forward with O2/O4 **and** O11.4.
- `P5.1` (plat, FileStorage local driver) becomes a cross-area dependency of `O11.10`; if the plat lane
  has not started, O11.10 builds on `ResumeStorageService` behind an adapter with the same key shape and
  swaps when P5.1 lands (no table change).
- `PLAN-org.md` §2 table row for O11: priority P1, "timesheets first; `timesheets.md` + `consultancy-ops.md`
  are the proposed 23.0 outcome". §3 walking skeleton: append steps 8–17 of §2.2 above as the
  "timesheets v0" block. §6 open questions: replace item 3 with a pointer to §1 of this proposal.
- `ROADMAP.md` Phase 23: the task list "23.1–23.n are written after 23.0; expected order timesheets →
  placements + rates → invoices + payments → profit" is confirmed with the concrete story ids above; the
  OCR sentence in "Pricing" ("No AI cost") becomes "AI cost capped at 50 ¢ per active consultant (optional
  OCR)". Not edited here — the coordinator applies after sign-off.

## 4. Size summary
New stories: O11.10 (M), O11.11 (L), O11.12 (M), O11.13 (S), O11.14 (S) = 9 pts. Edited stories keep
their sizes (O11.1 S, O11.2 M, O11.3 L, O11.4 S). Timesheets v0 total incl. foundations: **35 pts** (§2.2).
