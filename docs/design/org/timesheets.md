# Timesheets — the first slice of Consultancy Ops (Phase 23, stories O11.1–O11.4, O11.10–O11.13)

> Status: **LOCKED 2026-10-11 — D1 org add-on only · D2 priced later in admin (no number in this spec) ·
> D7 OCR optional, off by default · D10 O11 stays P2 (order in deps only); D3–D6, D8, D9, D11, D12 =
> recommended defaults, user may override** (task 23.0; answers in `docs/roadmap/PROPOSAL-timesheets.md`).
> Parent spec: `consultancy-ops.md` (placements, invoices, payments, profit). Applied to the roadmap as
> O11.1–O11.4, O11.8–O11.14. **Every number in this document is a default, not a constant** (user decision
> 2026-10-11, "everything is admin-configured"): caps are catalog entitlements (`ops.attachment_bytes_max`
> 5 MB, `ops.storage_bytes_max` 2 GB, `ops.ai_budget_cents_per_consultant` 50, `ops.ocr` off), budgets,
> thresholds, reminder times and retention minimum are settings (`org.ops.*`, `ai.budget.ops_scan_cents_per_consultant`
> 25) — the stories name each key; the prose below keeps the defaults for readability.
> Locked inputs: `CLAUDE.md` → Consultancy Ops add-on (record money, never move it; no bank numbers,
> SSNs or tax IDs; finance visible to OWNER/ADMIN/FINANCE only; Marketer never submits, never signs in as
> a consultant; consultant consents); `ROADMAP.md` Phase 23 boundaries and caps (5 MB per attachment,
> 2 GB per org); `tenant-model.md` (roles, 404 semantics, audit); `consent-data-sharing.md`;
> `docs/design/plat/file-storage-seam.md` (all bytes through `FileStorage`, local driver first, **no
> presigned URLs**); `docs/design/ai/ai-gateway-metering-budgets.md` (every model call through the gateway
> with a budget owner); `docs/design/pay/fee-model-and-margin-guard.md` (≥ 80 % worst case).

## 0. The job to be done (what we learned, checked 2026-10-11)

A consultant on a placement sits in a chain: **end client → vendor / prime (often 1–2 layers) → the
consultancy that employs or contracts the consultant**. Every week:

1. The consultant enters hours in the **client's** system (SAP Fieldglass, Beeline, the prime's portal, or
   a paper/PDF sheet the manager signs). The client manager approves there. Rejections, locked sheets and
   "waiting on another approver" are the daily friction in those tools
   ([Beeline worker guide](https://www.kellytelecom.com/wp-content/uploads/2022/07/Crown-Castle-Worker-QRG_20190522_v1-1.pdf),
   [SAP Fieldglass KB 3756050](https://userapps.support.sap.com/sap/support/knowledge/en/3756050)).
2. The consultancy needs **the same hours again**, plus the **client-approved proof** (a PDF/screenshot of
   the approved VMS timesheet or the signed sheet), because that proof is what lets it invoice the vendor
   and defend the invoice. Vendor platforms build the sub-vendor invoice from "timesheet approved hours"
   and park it as *Not Ready* until the sheet is approved
   ([Conrep AP invoice workflow](https://conrep.notion.site/AP-Invoice-Workflow-e0d8d6d3648944c380fe433514c0b671)).
3. Today that second copy travels by email, WhatsApp or a shared spreadsheet; someone in the
   consultancy re-keys it. The vendor pays net 30–60; the consultancy pays the consultant from that (or,
   for W-2/H-1B, on schedule regardless — contracts commonly say the agency pays "regardless of whether
   [it] has received payment from the Client", [sample clause](https://lawinsider.com/clause/timesheets/_3)).

So the product is **not** a timer. It is the fastest honest way to produce the consultancy's copy of the
week — hours + proof — from a phone, and to let one finance person confirm it in a tap, so invoicing (23.x)
and the consultant's own pay record start from the same approved number. Everything below optimises
for: *30 seconds a week for the consultant, one tap for the approver, zero setup for a five-consultant
shop, and a paper trail that survives a dispute.*

The consultant's job-search data (board, resumes, inbox) is **not** involved anywhere in this module.

## 1. Decisions (proposed as locked)

1. **Weekly sheets, per placement, Monday-start by default** (`ops_settings.week_start`, org-wide).
   A consultant with two concurrent placements has two sheets a week; the week view switches between
   them. Semi-monthly/monthly client periods are an *export* grouping, never a different entry unit.
2. **Minutes, not decimal hours, in storage;** the UI shows hours with 15-minute steps (`ops_settings.
   step_minutes` ∈ {15, 30, 60}). Day kinds: `WORK`, `PTO`, `HOLIDAY`, `SICK`, `UNPAID`. Only `WORK`
   minutes are billable; `PTO/SICK/HOLIDAY` minutes are recorded for the pay record (whether they are paid
   is the org's business and a label, see `consultancy-ops.md` §1.3).
3. **Proof is first-class, not an afterthought.** A sheet may carry up to setting `org.ops.attachments_per_sheet`
   (default 3) attachments (PDF/PNG/JPG, each up to entitlement `ops.attachment_bytes_max` (default 5 MB),
   entitlement `ops.storage_bytes_max` (default 2 GB) per org — all admin-configured). The approver sees the proof beside the entered hours. Proof is *optional*
   per placement (`ops_placement.proof_required` — a placement billed from the client's own VMS export
   may not need it; an H-1B/C2C placement usually does).
4. **Mismatch flags, never silent corrections.** The server computes flags on submit and on approve:
   entered total ≠ OCR'd total of the proof (when OCR is on), total ≠ `hours_per_week_expected` (±10 %
   by default), > 12 h on a day, any day > 24 h (hard reject), weekend `WORK` minutes, overlap with
   another placement's `WORK` on the same day beyond 24 h total. Flags are shown to both sides; the
   approver can approve with a flag (audited with the flag names). Nothing auto-edits hours.
5. **OCR of the proof is an optional, budgeted AI feature — off by default (decision D7, user, 2026-10-11)**
   (entitlement `ops.ocr`, default off; org toggle `ops_settings.ocr_enabled`, default false; auto-read
   `ocr_auto_read`, default false). It only *pre-fills a draft* or *produces the mismatch flag*; the consultant
   always confirms. Charged to the org's Ops AI budget through the existing AI gateway (budget owner =
   the Ops add-on grant), capped at entitlement `ops.ai_budget_cents_per_consultant` (**default 50 ¢ per
   active consultant per period**, a catalog value admin changes), pooled per org; when the
   pool is spent, upload still works and OCR shows "will read later" (never blocks submit). Attachments are
   otherwise never *transcribed* by us — OCR runs *only* when the org turned it on and the consultant
   tapped "Read hours from this file" or the org enabled auto-read. Separate from OCR, **every upload is
   scanned for identifiers before storage and refused if it carries one** (§5.13); that scan is
   mandatory, platform-paid, and classifies without transcribing.
5a. **Never collected** (product-wide user rule): no SSN/ITIN, bank account or routing numbers, tax ids,
   passport/visa/I-9/I-94/document numbers, dates of birth or consultant home addresses — no field exists
   for them anywhere in this module, free text refuses them, exports have no such columns, OCR schemas
   cannot carry them, and proof files containing them are refused. Table in §5.12; build-time gate
   `OpsNeverCollectedTest` (§14, story O11.14).
6. **Approval is one step, by `OWNER`/`ADMIN`/`FINANCE`** (`ops.timesheets.approve`). No approval chains,
   no client-side approvers, no external links: the client already approved in *their* system; our
   approval is the consultancy's acknowledgement. (Decision D4 in the proposal asks the user to confirm.)
7. **Approved sheets are immutable; corrections supersede.** A correction creates a new sheet for the
   same week with `supersedes_id`, status `SUBMITTED`, a required reason, and needs approval again. The old
   row becomes `SUPERSEDED`. If the old row is already on an invoice line, the invoice (23.x) gets a
   `needs_reissue` flag — the correction is never blocked, the money side is told.
8. **Reminders are few and quiet:** at the org-local times in `ops_settings` — defaults from settings
   `org.ops.reminder_consultant` (Monday 09:00) to consultants with last week missing (`DRAFT` or absent)
   and `org.ops.reminder_approver` (Wednesday 09:00) to approvers with pending sheets — both subject to org
   quiet hours (default from setting `org.notify.quiet_hours_default`, 21:00–08:00) and the per-member daily
   org-email cap (O13.3, setting `org.notify.email_per_member_per_day`, default 1). A consultant may opt into
   an end-of-week "log this week" nudge (setting `org.ops.reminder_nudge`, default Friday 16:00). No daily nagging, no escalation emails to the consultant's
   marketer.
9. **The marketer sees presence, not hours.** For paired consultants a MARKETER sees "on placement at
   {client} since {date}" and "week of Oct 6: submitted ✓ / missing" — never minutes, rates, proof or notes.
   This is bench-vs-placed awareness, which is their job; hours and money are not. (Decision D6.)
10. **Lawful basis is the contract, shown plainly.** Timesheets are operational records the consultant
    enters *for* the org under their engagement; they are not covered by the `data_share` scope
    (`NONE/SUMMARY/FULL` governs job-search data). A first-run screen (§8) states exactly what the org
    sees and that pay visibility is the org's switch; the consultant can export their own sheets any time.
11. **Retention: from the sheet's `week_start`, org-configurable upward only, never below setting
    `org.ops.retention_min_years` (default 7, hard minimum 7)** (D3 default, user may override the
    anchor); proof files follow the sheet. Erasure anonymises the person and keeps the sheet under "Former consultant #id".
12. **Zero-setup path:** an ACTIVE consultancy org with the add-on can create a placement in one screen
    (consultant + client name + start date; rates optional until 23.x finance) and the consultant's first
    sheet appears for the current week automatically. No templates, no cost codes, no projects.

## 2. Personas and what each one sees

| | Consultant (phone) | FINANCE / ADMIN / OWNER (approver) | MARKETER (paired) | Platform admin |
|---|---|---|---|---|
| Own sheets, entries, notes, proof | ✓ create/edit/submit | ✓ read all in org | ✗ | audited reason only |
| Other consultants' sheets | ✗ (404) | ✓ | ✗ | — |
| Placement: client name, dates | ✓ own | ✓ | ✓ paired (name + dates) | — |
| Bill rate, vendor chain, margins | ✗ never | ✓ | ✗ | — |
| Pay rate, pay totals | own, **only if** `show_pay_to_consultant` | ✓ | ✗ | — |
| Approve / reject / bulk | ✗ | ✓ | ✗ | — |
| Week status (submitted / missing) | own | ✓ | ✓ paired, status only | — |
| Mismatch flags | own | ✓ | ✗ | — |
| Export | own sheets CSV/PDF | org CSV/PDF packs (audited) | ✗ | — |
| Reminders settings | own opt-ins | org defaults | ✗ | — |

STAFF and MEMBER roles get nothing in this module; a consultant is an org `MEMBER` with ≥ 1 placement.

## 3. The weekly-entry UX (390 px)

### 3.1 Week view — the whole job in one screen

```
┌──────────────────────────────┐
│ ‹ Oct 6 – Oct 12  ›   Acme ▾ │  placement switcher only when > 1
│ Draft · due Mon             │
│ ┌──────────────────────────┐ │
│ │ Mon 6   [ − ]  8.00  [ + ]│ │  44 px steppers, 15-min steps
│ │ Tue 7   [ − ]  8.00  [ + ]│ │  long-press = type a number
│ │ Wed 8   [ − ]  8.00  [ + ]│ │
│ │ Thu 9   [ − ]  8.00  [ + ]│ │
│ │ Fri 10  [ − ]  6.00  [ + ]│ │
│ │ Sat 11      –        [ + ]│ │  weekend collapsed to one tap
│ │ Sun 12      –        [ + ]│ │
│ └──────────────────────────┘ │
│ Total 38.00 h  (expected 40) │  soft flag, amber, not blocking
│ [ Copy last week ]  [ PTO… ] │
│ 📎 Client-approved sheet     │
│   [ Add photo / PDF ]        │
│ ✎ Note (optional)            │
│                              │
│ [ Submit for approval ]      │  disabled until ≥ 1 minute entered
│ Your pay: hidden by Mehta    │  only when the org hides pay
└──────────────────────────────┘
```

- Landing on the page with no draft creates one for the current week **pre-filled from last week's
  approved sheet** (same minutes per weekday, kinds reset to WORK, notes cleared) — so the common case is
  "glance, maybe fix Friday, submit". First-ever week pre-fills `hours_per_week_expected ÷ 5` on
  weekdays. The pre-fill is visibly labelled "copied from last week — tap to change".
- Tapping a day's label opens the day sheet: kind chips `Work · PTO · Holiday · Sick · Unpaid`, minutes,
  note (≤ 200 chars). Org holidays (`ops_holiday`) pre-set the kind to `HOLIDAY` with 0 work minutes and a
  chip "Holiday — Columbus Day"; the consultant can override (they may have worked).
- `Copy last week` copies minutes and kinds from the previous week's latest sheet for this placement.
- `Submit` on a sheet with flags shows them first ("Your total is 38 h, expected 40. Submit anyway?") — a
  one-tap confirm, never a block except the > 24 h/day rule.
- After submit the screen flips to a read-only card with status, flags, and "Withdraw" (allowed while
  `SUBMITTED`; returns to `DRAFT`).

### 3.2 Proof upload — the step every other tool makes a chore

```
┌──────────────────────────────┐
│ Client-approved sheet        │
│ ┌──────────────────────────┐ │
│ │  📷 Take photo            │ │
│ │  🖼  Choose from photos    │ │
│ │  📄 Choose file (PDF)     │ │
│ └──────────────────────────┘ │
│ acme-ts-wk41.pdf · 312 KB ✓  │
│ ○ Reading hours… (OCR on)    │
│ ✓ Read 38.00 h · matches     │  or ⚠ "Read 40.00 h, you entered 38.00"
│   [ Use 40.00 ] [ Keep mine ]│  consultant chooses; never auto-applied
└──────────────────────────────┘
```

- `<input type=file accept="image/*,application/pdf" capture="environment">` so the camera opens
  directly on a phone. Images are downscaled client-side to ≤ 2,000 px on the long edge before upload
  (keeps most photos < 1 MB without touching the 5 MB rule).
- The upload goes through the API to `FileStorage` (local driver), never to a bucket URL. Downloads are
  proxied with `Content-Disposition: attachment` and the permission check on every request.
- If the org has OCR on, the result is a **suggestion row** with per-day numbers when the proof is a
  weekly grid, or a total only when it is not. "Use" copies the numbers into the draft (entry `source=OCR`
  for the audit); "Keep mine" records the mismatch flag.
- Every upload is scanned for identifiers **before** it is stored (§5.13); a refused file shows:

```
│ ⛔ We can't keep this file       │
│ It seems to show a Social        │
│ Security or bank number. We      │
│ never collect those. Crop to the │
│ hours page or export just the    │
│ approved sheet, then try again.  │
│ [ Choose another file ]          │
```

### 3.3 Approver inbox — one tap, with the proof in view

```
┌──────────────────────────────┐
│ Timesheets · Pending (4)     │
│ [All] [Flagged 1] [No proof] │
│ ┌──────────────────────────┐ │
│ │ Aarav M · Acme · Oct 6   │ │
│ │ 38.00 h  📎 ✓  matches   │ │
│ │ [ Approve ]      [ … ]   │ │  … = reject with comment / open
│ ├──────────────────────────┤ │
│ │ Sneha K · Globex · Oct 6 │ │
│ │ 40.00 h  📎 ✓  ⚠ 42.00   │ │  OCR mismatch: proof says 42
│ │ [ Open ]                 │ │  flagged rows have no one-tap
│ ├──────────────────────────┤ │
│ │ Ravi P · Acme · Oct 6    │ │
│ │ 40.00 h  📎 —  (optional)│ │
│ │ [ Approve ]      [ … ]   │ │
│ └──────────────────────────┘ │
│ [ Approve all 2 unflagged ]  │
│ Records you entered. Not tax,│
│ legal or accounting advice.  │
└──────────────────────────────┘
```

- Unflagged, proof-present sheets get a one-tap `Approve`; flagged sheets must be opened (the proof
  renders inline next to the day grid) so the approver sees why. Bulk approve is for unflagged only.
- Reject requires a comment (≤ 500 chars) and sends the sheet back to `DRAFT`; the consultant gets one
  notification with the comment.
- Open sheet view shows: day grid, kinds, notes, proof viewer (PDF page 1 / image), flags, timeline
  (submitted by, OCR read, approved by, superseded by).

### 3.4 Consultant history

```
│ Oct 6   Acme   38.00 h  Approved ✓    │
│ Sep 29  Acme   40.00 h  Approved ✓    │
│ Sep 22  Acme   40.00 h  Rejected ✗ → │  tap: "Fri was 6 h, not 8 — Priya"
│ Sep 15  Acme   40.00 h  Superseded ↻  │
│ [ Export my sheets (CSV) ]            │
```

## 4. State machine

```
            create (auto or explicit)
                   │
                   ▼
   ┌──────────── DRAFT ◄──────────────────────┐
   │               │ submit                   │ reject (comment)       withdraw
   │               ▼                          │ ◄──────────────────────────┐
   │           SUBMITTED ─────────────────────┘                            │
   │               │ approve (one-tap / bulk / open)                       │
   │               ▼                                                       │
   │           APPROVED  ──── correction (new row, reason) ──► SUBMITTED' ─┘
   │               │                                             │ approve
   │               ▼                                             ▼
   │          SUPERSEDED ◄────────────────────────────────── APPROVED'
   │
   └── delete (DRAFT only, by the consultant; audited)
```

Rules:
- `DRAFT` is editable by the consultant only. `SUBMITTED` is read-only for everyone except `withdraw`
  (consultant) and `approve`/`reject` (approver). `APPROVED` is immutable: no endpoint updates its entries.
- One **live** sheet per `(placement_id, week_start)` — generated column `live_key` =
  `IF(status IN ('DRAFT','SUBMITTED','APPROVED'), CONCAT(placement_id,':',week_start), NULL)` UNIQUE.
  A correction is only possible from `APPROVED`; the service inserts the new row and flips the old one to
  `SUPERSEDED` in one transaction (so the unique key never collides).
- **Locks:** a sheet is `locked_reason = INVOICED` once an `ops_invoice_line` (23.x) references it. Locked
  sheets can still be superseded (§1.7), but the UI says "This week is on invoice ACME-0007; finance will
  need to reissue it" before the consultant confirms.
- **Week closes** are not a state: a placement's `end_date` stops auto-creation of new weeks; sheets after
  `end_date` can be created manually by finance only (trailing hours happen).
- Approver cannot approve their own sheet (an ADMIN who is also a consultant): 409 `SELF_APPROVAL`.

## 5. Data model (additive Liquibase, `20261011070000_ops_timesheets.xml`; every table `org_id` first; MySQL 8, utf8mb4, DATETIME(6) UTC)

Supersedes the timesheet rows of `consultancy-ops.md` §2 (that file now points here).

### 5.1 `ops_settings` (one row per org, created on add-on activation)
| column | type | notes |
|---|---|---|
| org_id | BIGINT PK FK organization | |
| week_start | TINYINT NOT NULL DEFAULT 1 | 1 = Monday … 7 = Sunday (ISO) |
| step_minutes | SMALLINT NOT NULL DEFAULT 15 | 15 / 30 / 60 |
| expected_tolerance_pct | TINYINT NOT NULL DEFAULT 10 | for the "≠ expected" flag |
| day_warn_minutes | SMALLINT NOT NULL DEFAULT 720 | > 12 h/day flag |
| proof_required_default | BOOLEAN NOT NULL DEFAULT true | new placements inherit |
| ocr_enabled | BOOLEAN NOT NULL DEFAULT false | requires entitlement `ops.ocr` |
| ocr_auto_read | BOOLEAN NOT NULL DEFAULT false | read every upload vs on tap |
| show_pay_to_consultant | BOOLEAN NOT NULL DEFAULT false | moved here from `organization.settings_json` |
| reminder_consultant_dow / _time | TINYINT / TIME | default Mon 09:00 |
| reminder_approver_dow / _time | TINYINT / TIME | default Wed 09:00 |
| currency | CHAR(3) NOT NULL DEFAULT 'USD' | one per org (23.x money) |
| retention_years | TINYINT NOT NULL DEFAULT 7 | validated ≥ 7 |
| created_at / updated_at | | |

### 5.2 `ops_client`
`id, org_id, name VARCHAR(120), contact_name VARCHAR(80) NULL, contact_email VARCHAR(254) NULL (business
contact only), notes VARCHAR(500) NULL, archived_at NULL, created_at`. Unique `(org_id, name)`.
(`address_text`, `payment_terms_days` arrive with invoices in 23.x — not needed for timesheets.)

### 5.3 `ops_vendor` — unchanged from `consultancy-ops.md` (optional middle layer; v0 UI shows it as a
free-text "via" field on the placement, stored as a vendor row).

### 5.4 `ops_placement`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | FK | |
| consultant_member_id | FK org_member NOT NULL | must be `ACTIVE` at creation; stays after `LEFT/REMOVED/ERASED` (history) |
| client_id | FK ops_client NOT NULL | |
| vendor_id | FK ops_vendor NULL | |
| title | VARCHAR(120) NULL | "Senior Java Developer" |
| start_date / end_date | DATE / DATE NULL | |
| hours_per_week_expected | SMALLINT NULL | default 40 in the UI, nullable |
| proof_required | BOOLEAN NOT NULL | inherits `ops_settings.proof_required_default` |
| pay_type_label | VARCHAR(10) NULL | `W2` `1099` `C2C` `OTHER` — a label |
| status | VARCHAR(20) NOT NULL | `ACTIVE` `ON_HOLD` `ENDED` |
| notes | VARCHAR(500) NULL | sensitive-text validated |
| created_by_member_id, created_at, updated_at | | |

Indexes: `(org_id, consultant_member_id, status)`, `(org_id, client_id)`.

### 5.5 `ops_placement_rate` (rates change mid-placement; invoices must use the rate in force that week)
`id, org_id, placement_id FK, effective_from DATE, bill_rate_minor INT NULL (per hour; NULL until finance
fills it), pay_rate_minor INT NULL, created_by_member_id, created_at`. Unique `(placement_id,
effective_from)`. v0 may leave both NULL (timesheets work without money). Visible to consultants: never
(`bill_rate_minor`); `pay_rate_minor` only via the pay switch.

### 5.6 `ops_timesheet`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | FK | |
| placement_id | FK ops_placement NOT NULL | |
| consultant_member_id | FK org_member NOT NULL | denormalised for the own-only query |
| week_start | DATE NOT NULL | always the org's week-start weekday (validated) |
| status | VARCHAR(20) NOT NULL | `DRAFT` `SUBMITTED` `APPROVED` `SUPERSEDED` (`REJECTED` is an event, the row returns to `DRAFT` with `last_rejection_comment` set) |
| work_minutes / pto_minutes / sick_minutes / holiday_minutes / unpaid_minutes | INT NOT NULL DEFAULT 0 | derived on every entry write; `total_minutes` = sum |
| flags_json | JSON NULL | `[{"code":"TOTAL_NE_EXPECTED","detail":{"total":2280,"expected":2400}}, …]` recomputed on submit/approve |
| proof_state | VARCHAR(12) NOT NULL | `NONE` `ATTACHED` `READ_MATCH` `READ_MISMATCH` `READ_FAILED` |
| ocr_total_minutes | INT NULL | from the latest successful read |
| submitted_at, decided_at, decided_by_member_id | | |
| decision_flags_json | JSON NULL | the flags present when approved (audit) |
| last_rejection_comment | VARCHAR(500) NULL | shown on the DRAFT after a reject |
| supersedes_id | FK ops_timesheet NULL | correction chain |
| correction_reason | VARCHAR(300) NULL | required when `supersedes_id` set |
| locked_reason | VARCHAR(20) NULL | `INVOICED` (23.x) |
| live_key | generated STORED, UNIQUE | §4 |
| created_at, updated_at | | |

Indexes: `(org_id, status, week_start)`, `(org_id, consultant_member_id, week_start)`,
`(org_id, placement_id, week_start)`.

### 5.7 `ops_timesheet_entry`
`id, timesheet_id FK, day DATE NOT NULL, kind VARCHAR(10) NOT NULL (WORK|PTO|HOLIDAY|SICK|UNPAID),
minutes SMALLINT NOT NULL CHECK 0–1440, note VARCHAR(200) NULL (sensitive-text validated), source
VARCHAR(10) NOT NULL DEFAULT 'MANUAL' (MANUAL|COPIED|PREFILL|OCR)`. Unique `(timesheet_id, day, kind)`.
A day may hold two rows (4 h WORK + 4 h PTO).

### 5.8 `ops_timesheet_attachment`
`id, org_id, timesheet_id FK, storage_key VARCHAR(512) (FileStorage key, prefix `ops-ts`), file_name
VARCHAR(200), bytes INT (≤ 5 242 880), content_type VARCHAR(40) (application/pdf|image/png|image/jpeg),
sha256 CHAR(64), uploaded_by_member_id, ocr_status VARCHAR(12) NULL (QUEUED|DONE|FAILED|SKIPPED),
ocr_json JSON NULL ({days:[{date,minutes}], total_minutes, confidence, approver_name?, approved_date?}),
ocr_request_id CHAR(26) NULL (ai_call id), created_at, deleted_at NULL`. ≤ 3 live per sheet.
The `storage_object` ledger (plat D9) gains `ref_type = OPS_ATTACHMENT` and an `org_id` column so the
org quota and the org-close purge can use the ledger instead of a parallel counter; `ops_storage_usage`
(bytes per org) stays as the fast counter, rebuilt nightly from the ledger.

### 5.9 `ops_timesheet_event` (append-only timeline shown to the consultant and approver)
`id, org_id, timesheet_id, kind VARCHAR(24) (CREATED|PREFILLED|SUBMITTED|WITHDRAWN|APPROVED|REJECTED|
SUPERSEDED|ATTACHMENT_ADDED|ATTACHMENT_REMOVED|OCR_READ|OCR_FAILED|REMINDER_SENT|EXPORTED), actor_login
VARCHAR(50) NULL (NULL = system), detail VARCHAR(500) NULL, created_at`. Mirrors into `org_audit_event`
with `OPS_TS_*` actions for the mutating kinds (one write path, `OpsAuditService`).

### 5.10 `ops_holiday`
`id, org_id, day DATE, name VARCHAR(60), created_by_member_id`. Unique `(org_id, day)`. Seeded with the
US federal list on add-on activation when `organization.country = 'US'` (editable; delete what doesn't
apply). Holidays only pre-set the day kind — they never force a value.

### 5.11 `ops_storage_usage` — `org_id PK, bytes BIGINT, updated_at`; the 2 GB cap check reads this.

### 5.12 Never collected (product-wide rule, restated by the user 2026-10-11: "we don't take any of those")

No field in this module — table, DTO, form, export column, OCR schema — asks for, accepts or derives
any of the following. This is **not collect**, stronger than "not store": there is no place to type it,
and a value that arrives anyway is refused, not saved.

| class | examples | where it could sneak in | what we do |
|---|---|---|---|
| Government identifiers | SSN, ITIN, EIN, state tax ids, VAT ids *of people* | notes, client/vendor contact fields, OCR output, proof files | no column; `SensitiveTextValidator` on every String field (422 `SENSITIVE_TEXT`); OCR schema closed; proof scan refuses the file (§5.13) |
| Bank details | account numbers, routing/ABA numbers, IBAN/SWIFT, card numbers | `reference` memo on payments (23.x), notes, proof files | same; the payment `reference` is a memo ≤ 80 chars with the validator; `method_label` is a label from a fixed list |
| Immigration / identity documents | passport number, visa number, I-94, I-9 details, driver's licence, national id, work-permit numbers | placement notes ("H-1B until…"), proof files, `pay_type_label` | `pay_type_label` is an enum (W2/1099/C2C/OTHER) with no free text; validator keyword+digit rule; proof scan |
| Date of birth / age | DOB, "born", age | notes, client contact, OCR | no column; validator keyword+date rule; OCR schema has no date field except `approved_date` (must be within the sheet's week ± 30 days or it is dropped) |
| Home address of a person | consultant home address | client/vendor records, notes | `ops_client.address_text` is the **client business** address (23.x); consultants have no address field here at all |
| Salary history, compensation outside this placement | prior pay | notes | validator cannot catch prose; the UI copy says "notes are about this week's hours"; approver sees notes, so social control; not a schema field |

What **is** collected: consultant display name (from `org_member`), client/vendor **business** name and
one business contact (name, email), placement title/dates/expected hours, rates in minor units
(FINANCE), day kinds/minutes/notes, proof files that pass the scan, approver name/date read from the
proof, logins in audit rows.

`SensitiveTextValidator` (shared with 23.x and, per the user, product-wide — proposed home
`api/.../validation/SensitiveTextValidator.java`, applied by a `@NoSensitiveText` constraint on every
String field of every `ops` DTO, enforced by a reflection test, §14): SSN/ITIN `\b\d{3}-\d{2}-\d{4}\b`,
EIN `\b\d{2}-\d{7}\b`, IBAN `\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b`, card numbers (Luhn-valid 13–19 digits),
**8+ consecutive digits** (routing numbers are 9, account numbers 8–17, I-94 is 11), keyword + number
rule — `(ssn|itin|ein|tax id|routing|account (no|number|#)|iban|swift|passport|visa|i-94|i-9|licen[cs]e
no|national id|permit)` within 24 characters of ≥ 5 digits or an alphanumeric id `[A-Z]{1,2}\d{6,9}` —
and keyword + date rule `(dob|date of birth|born|birthday)` within 24 characters of a date. Message:
"Don't put account, tax, ID-document numbers or dates of birth here — we never collect them." The
validator is deliberately over-inclusive on these fields; none of them legitimately needs a long number.

### 5.13 Proof files: detection and refusal before storage

A client-approved sheet is the one place a consultant could hand us a document with an SSN, a bank
line or a passport number printed on it (some vendor timesheet templates print the worker's employee
id or last-4; some H-1B workers attach the wrong PDF). We refuse such files **before** they are stored:

1. **Upload is two-phase at the seam.** The multipart body is written to the `FileStorage` temp area
   (`.tmp/<uuid>`, plat D4) and **not** moved into place until the scan passes. A refused file is
   deleted from temp immediately and never gets a ledger row or an attachment row.
2. **Scan path by type:**
   - **PDF with a text layer** → text extracted locally (PDFBox, already used by resume parsing) and run
     through `SensitiveTextValidator` in *document mode* (same patterns; the "8+ digits" rule is relaxed
     to "9+ digits not inside a date/time/total context" to tolerate invoice and PO numbers; the
     keyword rules stay strict). No model call.
   - **PDF without a text layer, PNG, JPG** → the page/image goes through the AI gateway task
     `OPS_TS_SCAN` with a **closed boolean+hours schema**: `{contains_identifier: bool, kinds: [SSN|BANK|
     TAX_ID|PASSPORT_VISA|DOB|OTHER_ID], days[], total_minutes, confidence, approver_name?, approved_date?}`.
     The prompt asks the model to *classify*, never to transcribe identifiers; the schema has no field
     that could hold one; the raw model text is discarded, only the validated JSON is kept — and only the
     hours part, only when the org's OCR is on. The scan is **mandatory and platform-paid** (budget owner
     = a platform safety budget capped at 25 ¢ per active consultant per period, counted by the margin
     guard; separate from the org's optional OCR budget so a shop that never turned OCR on is still
     protected). If the safety budget is exhausted, image uploads are refused with "Try a PDF exported
     from the client's system, or after {date}" — a PDF with a text layer still works at zero cost.
3. **Refusal is specific and kind:** 422 `PROOF_HAS_IDENTIFIER {kinds}` → the sheet shows "This file
   seems to contain a {Social Security number / bank number / ID-document number / date of birth}. We
   don't collect those. Please crop or export only the hours page and try again." Nothing about the
   file is logged except the kinds and the sha256 of the refused bytes (so the same file is refused
   instantly next time without rescanning); an `OPS_TS_PROOF_REFUSED` audit row carries the kinds only.
4. **No redaction by us in v0.** Redacting means we handled the identifier; refusing means we never
   held it beyond the temp write. Client-side crop/redact tools are an optional later story (D12).
5. **Retention / erasure of accepted proofs:** 7 years from `week_start` (§1.11), deleted through the
   seam and the ledger; on account erasure the file stays as the org's record (it passed the scan, so by
   construction it carries no identifier of the person beyond their name). The sha256 deny-cache of
   refused files is purged after 90 days.
6. **False positives** (a PO number that looks like an account number) are the accepted cost; the
   message tells the consultant what to crop, and the approver can ask for a cleaner export. We never add
   an "upload anyway" override.

The proof *file* that passes is stored as uploaded (we do not alter documents the consultant chose to
send — that is their and the org's record).

## 6. API (all under `/api/orgs/{orgId}/ops/...`; `@OrgPermissionRequired`; 404 for anything outside the caller's org)

```
--- settings (OWNER/ADMIN/FINANCE: ops.settings) ---
GET    /ops/settings
PATCH  /ops/settings                      {weekStart, stepMinutes, expectedTolerancePct, proofRequiredDefault,
                                            ocrEnabled, ocrAutoRead, showPayToConsultant, reminders{...}, retentionYears ≥ 7}
GET    /ops/holidays  POST  DELETE /{id}

--- clients, placements (OWNER/ADMIN/FINANCE: ops.placements) ---
GET    /ops/clients  POST  PATCH /{id}  POST /{id}/archive
GET    /ops/placements?consultantMemberId&clientId&status
POST   /ops/placements                    {consultantMemberId, clientId | newClientName, vendorName?, title?, startDate, endDate?,
                                            hoursPerWeekExpected?, proofRequired?, payTypeLabel?, rate?: {billRateMinor?, payRateMinor?}}
PATCH  /ops/placements/{id}               (dates, title, status, proofRequired, hoursPerWeekExpected)
POST   /ops/placements/{id}/rates         {effectiveFrom, billRateMinor?, payRateMinor?}   (FINANCE)
GET    /ops/placements/mine               consultant: own placements (no bill rate; pay rate only if the switch is on)

--- timesheets ---
GET    /ops/timesheets?weekStart&status&consultantMemberId&placementId&flagged&page     approver: all; consultant: own only (the service forces consultantMemberId = me)
GET    /ops/timesheets/current            consultant: current week per active placement, creating DRAFTs (prefilled) as needed
GET    /ops/timesheets/{id}               full sheet: entries, attachments (metadata), flags, events, pay line if visible
POST   /ops/timesheets                    {placementId, weekStart} → DRAFT (409 TIMESHEET_EXISTS if a live one exists)
PUT    /ops/timesheets/{id}/entries       DRAFT only; whole-week replace [{day, kind, minutes, note?}] → recomputed totals + flags
POST   /ops/timesheets/{id}/copy-last-week
POST   /ops/timesheets/{id}/submit        → SUBMITTED; returns flags; 422 DAY_OVER_24H blocks; 409 PROOF_REQUIRED if placement requires and none attached
POST   /ops/timesheets/{id}/withdraw      SUBMITTED → DRAFT (consultant)
POST   /ops/timesheets/{id}/approve       {acknowledgeFlags?: [codes]}   (approver; 409 SELF_APPROVAL; 422 FLAGS_UNACKNOWLEDGED)
POST   /ops/timesheets/approve-bulk       {ids[]} → approves only unflagged SUBMITTED; returns {approved[], skipped[{id, reason}]}
POST   /ops/timesheets/{id}/reject        {comment ≤ 500}  → DRAFT
POST   /ops/timesheets/{id}/correct       {reason} → new SUBMITTED' row with copied entries (editable before submit via PUT entries on the new id), old → SUPERSEDED on approval of the new one
DELETE /ops/timesheets/{id}               DRAFT only, consultant

--- attachments (multipart; ≤ 5 MB; pdf/png/jpg sniffed by FileStorage) ---
POST   /ops/timesheets/{id}/attachments   → 201 {id, fileName, bytes, ocrStatus}   413 FILE_TOO_LARGE · 413 OPS_STORAGE_CAP · 415 UNSUPPORTED_FILE · 409 ATTACHMENT_LIMIT (3)
GET    /ops/timesheets/{id}/attachments/{aId}          streams with Content-Disposition: attachment (proxied, permission-checked)
DELETE /ops/timesheets/{id}/attachments/{aId}          DRAFT only
POST   /ops/timesheets/{id}/attachments/{aId}/read     OCR on demand (ocrEnabled) → 202 {ocrStatus} then poll GET sheet; 402 PLAN_REQUIRED{ops.ocr}; 429 AI_BUDGET (sheet still submittable)
POST   /ops/timesheets/{id}/apply-ocr     {attachmentId} → entries replaced from ocr_json (source=OCR), DRAFT only

--- marketer (MARKETER, paired + consented FULL not required: status only) ---
GET    /ops/presence?consultantMemberId   → {placements:[{client, startDate}], weeks:[{weekStart, status: SUBMITTED|APPROVED|MISSING}]}

--- export (record only) ---
POST   /ops/export/timesheets             {from, to, consultantMemberId?, clientId?, format: CSV|PDF_PACK, layout: GENERIC|PAYROLL|BY_CLIENT}
                                           → 202 {exportId}; GET /ops/export/{id} → download when ready; audited OPS_EXPORT per file
GET    /ops/timesheets/mine/export?from&to&format=CSV   consultant's own sheets (synchronous, small)
```

Errors already in the codebase's style: 404 outside org; 409 for state conflicts (`TIMESHEET_EXISTS`,
`NOT_DRAFT`, `NOT_SUBMITTED`, `SELF_APPROVAL`, `ATTACHMENT_LIMIT`, `PROOF_REQUIRED`); 422 for validation
(`DAY_OVER_24H`, `WEEK_START_INVALID`, `SENSITIVE_TEXT`, `FLAGS_UNACKNOWLEDGED`); 402 `PLAN_REQUIRED
{feature: "ops.enabled" | "ops.ocr"}`; 413/415/507 from the storage seam.

Entitlement gate: `OrgAccessService.require(orgId, ops.*)` **and** `EntitlementService.hasOrg(orgId,
"ops.enabled")` (org-level feature, from the add-on grant). Until Phase 18/O3 exist, v0 reads a
platform-admin-set `organization.settings_json.opsPilot=true` behind `dossier.ops.enabled` (§13).

## 7. Flags (computed server-side, codes are the contract)

| code | when | blocks? | who sees |
|---|---|---|---|
| `DAY_OVER_24H` | any day's minutes across kinds > 1440 | **yes** (422) | consultant |
| `DAY_OVER_WARN` | a day's WORK > `day_warn_minutes` | no | both |
| `TOTAL_NE_EXPECTED` | WORK total outside expected ± tolerance | no | both |
| `WEEKEND_WORK` | WORK minutes on Sat/Sun (org week definition) | no | both |
| `OVERLAP_PLACEMENTS` | same consultant, same day, WORK across placements > 1440 | no | both |
| `PROOF_MISSING` | placement requires proof, none attached | **submit blocked** (409) unless approver overrides on the sheet (audited `PROOF_WAIVED`) | both |
| `OCR_MISMATCH` | `ocr_total_minutes` ≠ WORK total | no | both |
| `OCR_UNREAD` | OCR on, upload present, not read (budget/failed) | no | approver |
| `AFTER_END_DATE` | week after placement `end_date` | no (finance-created) | approver |
| `CORRECTION` | `supersedes_id` set | no | approver |
| `INVOICED_SUPERSEDE` | correcting a locked sheet | no (invoice flagged `needs_reissue`) | approver |

Approving with flags requires `acknowledgeFlags` to list every non-info flag present → stored in
`decision_flags_json`. This is what makes the audit defensible: "finance approved 42 h knowing the proof
said 40" is on record, with the person's login.

## 8. Privacy, consent and what the consultant agrees to

First-run screen (once per org membership, text versioned `consent/ops-timesheets/v1`, stored as a
`data_share_event`-style row `ops_consent_event` — login string, version, ip/UA hashes):

```
┌──────────────────────────────┐
│ Timesheets for Mehta Staffing│
│                              │
│ Mehta will see:              │
│  • hours and day types you   │
│    enter, your notes         │
│  • files you attach (your    │
│    client-approved sheets)   │
│  • when you submitted        │
│ Mehta will not see here:     │
│  • your job search, resumes, │
│    applications or inbox     │
│ Your pay rate: shown to you  │
│   only if Mehta turns it on. │
│ You can export your sheets   │
│ any time; they are kept for  │
│ 7 years as Mehta's records.  │
│ [ Continue ]                 │
└──────────────────────────────┘
```

- Lawful basis: performance of the engagement contract (GDPR Art. 6(1)(b)) for hours/proof; the org is
  the controller of its timesheet records, Kiwiply the processor (org terms, O14.5 / 21.5). The screen is
  information (Art. 13), not a consent gate the consultant could decline and still be paid — we do not
  pretend otherwise. Declining = not using the module; the org then has no sheets from that person.
- `data_share` scope **does not** gate timesheets; a consultant sharing `NONE` about their job search still
  submits hours. Timesheet endpoints never read `application`, `resume`, `inbox_*` or `field_cache`.
- Proof files may contain third-party names (client approver). We store only files that passed the
  identifier scan (§5.13), never index or OCR beyond the closed schema in §5.12, and never show them to
  marketers.
- Nothing in this module asks for an SSN/ITIN, bank or routing number, tax id, passport/visa/I-9/I-94
  number, date of birth or home address — the "Never collected" table (§5.12) and `OpsNeverCollectedTest`
  make that a build failure, not a policy. Approver name/date from OCR is kept only as part of
  `ocr_json` to support "this proof was approved on 10/10 by J. Lee" on the invoice line (23.x).
- Account export (`AccountExportService`, O6.5) adds `timesheets[]` (own sheets, entries, flags, attachment
  list — the files themselves are included in the ZIP as `ops/…`).
- Erasure: `consultant_member_id` points at an `ERASED` membership; sheets, entries, attachments and
  events stay (financial record, Art. 17(3)(b)); `actor_login` in events stays as a string; notes are
  **not** scrubbed (they are the org's record, entered for the org) — stated on the first-run screen? No:
  stated in the org terms; the screen keeps to what they see. Open point D7 in the proposal.
- Retention job: `ops.retention` weekly; deletes sheets whose `week_start < today − retention_years` **and**
  whose org is `CLOSED` or whose placement ended > retention_years ago; attachments deleted through
  `FileStorage.delete` + ledger; a row per deleted sheet in `org_audit_event` (`OPS_TS_RETENTION_PURGED`,
  count only).

## 9. Reminders and quiet hours

- `OpsReminderJob` runs hourly; for each org with the add-on: at `reminder_consultant_dow/time` org-local,
  consultants with an active placement and no `SUBMITTED/APPROVED` sheet for the previous week →
  `Notification(kind=OPS_TS_DUE)` + email (template: one line, deep link to the week). At
  `reminder_approver_dow/time`: approvers with ≥ 1 `SUBMITTED` → `OPS_TS_PENDING` with the count.
- Quiet hours (org `settings.quietHours`, default 21:00–08:00) delay delivery to the next allowed hour;
  the O13.3 daily cap applies (a consultant already emailed by the org today gets the in-app notification
  only). Idempotency key `(target_member_id, kind, week_start)` → one send per week per target, ever.
- Consultant opt-ins (`ops_member_pref`: `friday_nudge BOOLEAN`, `push_only BOOLEAN`): Friday 16:00 "Log
  this week" nudge; or no emails at all (in-app only).
- Never: reminders to marketers, reminders about other people's sheets, "escalations".

## 10. Audit and the paper trail

| action (`org_audit_event.action`) | target | details |
|---|---|---|
| `OPS_PLACEMENT_CREATE/UPDATE/END`, `OPS_RATE_SET` | consultant login | fields changed (rates as "set", never the amount in details) |
| `OPS_TS_SUBMIT`, `OPS_TS_WITHDRAW`, `OPS_TS_DELETE` | consultant login (self) | sheet id, week, total minutes |
| `OPS_TS_APPROVE`, `OPS_TS_APPROVE_BULK`, `OPS_TS_REJECT` | consultant login | sheet id, flags acknowledged, comment length |
| `OPS_TS_CORRECT` | consultant login | old id → new id, reason |
| `OPS_TS_ATTACH`, `OPS_TS_ATTACH_DELETE`, `OPS_TS_OCR_READ`, `OPS_TS_PROOF_WAIVED` | consultant login | attachment id, bytes, ocr result summary |
| `OPS_READ_SHEET` (approver opening another person's sheet) | consultant login | daily-collapsed per actor+target |
| `OPS_EXPORT` | — | format, period, row count, file sha256 |
| `OPS_SETTINGS` | — | changed keys |
| `OPS_TS_RETENTION_PURGED` | — | count |

Consultants see their own timeline (`ops_timesheet_event`) including "Priya opened this sheet" — the
same transparency rule as the marketer's "what Rahul did" (`marketer-workspace.md` §6).

## 11. Export (record only — we never send anything anywhere)

| layout | columns / content | for |
|---|---|---|
| `GENERIC` CSV | org, consultant (display name + member id), client, placement title, week_start, day, kind, minutes, hours (decimal, 2 dp), note, sheet status, approved_at, approved_by, proof (Y/N), flags | spreadsheets, audits |
| `PAYROLL` CSV | one row per consultant × week: regular_hours, pto_hours, sick_hours, holiday_hours, unpaid_hours, total_hours, pay_type_label, pay_rate (FINANCE export only; omitted otherwise), pay_amount (= WORK × pay rate in force that week; PTO/SICK/HOLIDAY amounts **not** computed — the org decides), approved_at, approved_by | hand-off to Gusto/ADP/QuickBooks by import; column names are configurable in a later story if a provider's template demands it |
| `BY_CLIENT` CSV | one row per client × consultant × week with WORK hours and bill rate in force (FINANCE only) | vendor invoicing (feeds 23.x invoice generation) |
| `PDF_PACK` | one page per approved sheet: org name, consultant, client, week grid, totals, approval line (who/when, flags acknowledged), thumbnail of page 1 of each proof + "Attachment: acme-ts-wk41.pdf (sha256 …)", footer "Records you entered. Not tax, legal or accounting advice." Proof files appended as pages when `includeProof=true` | sending to a vendor with the invoice; disputes |

**Export column deny-list:** no layout has — and the `OpsExportColumns` registry test (§14) asserts no
layout ever gains — a column named or containing `ssn`, `itin`, `ein`, `tax`, `routing`, `account`,
`iban`, `swift`, `passport`, `visa`, `i94`, `i9`, `dob`, `birth`, `address` (consultant), `salary`. The
payroll hand-off identifies a person by **display name + Kiwiply member id** only; the org's payroll
provider maps that to its own employee record on their side — we never carry their identifier for them.

Rendering: the PDF reuses the resume-builder Chromium sidecar (R0.6) as `consultancy-ops.md` planned; CSV
is streamed. Exports are built asynchronously (202) with the same `privacy_request`-style job pattern
as account export, stored under `FileStorage` prefix `ops-export`, 7-day lifecycle, audited per file.

## 12. Failure modes

| failure | behaviour |
|---|---|
| Consultant has two placements, enters 8 h in each on the same day | `OVERLAP_PLACEMENTS` flag only when > 24 h total; two 8-h entries are legitimate (double-shift contractors exist) |
| Proof upload fails mid-way on a bad mobile connection | API never records a partial attachment (store is atomic at the seam); UI keeps the local file and retries once; sheet stays DRAFT |
| Org at the 2 GB cap | 413 `OPS_STORAGE_CAP` with "Ask your admin to clear old proofs or export+archive"; sheet can still be submitted if proof is not required; admin page shows usage bar at 80 % |
| Proof file contains an SSN / bank line / passport number | refused before storage (§5.13), specific message, kinds-only audit; no override exists |
| Proof scan false positive (PO number read as an account number) | same refusal; the consultant crops; approver can request a cleaner export; the refused-sha cache avoids rescans |
| Platform safety-scan budget exhausted for the org | image uploads refused with the PDF-with-text alternative and the date; text-layer PDFs keep working (local scan, no model) |
| OCR misreads (handwriting, rotated photo) | result shown as a suggestion with `confidence`; low confidence (< 0.6) is shown as "couldn't read clearly — enter by hand"; never auto-applied; the mismatch flag is suppressed when confidence < 0.6 |
| OCR budget exhausted mid-month | upload works, `ocr_status=SKIPPED`, `OCR_UNREAD` flag for the approver; org admin sees "OCR paused until {period end}" |
| Approver approves then client disputes hours | correction flow (§4); the superseded sheet, its proof and the decision flags stay readable; PDF pack of both versions exportable |
| Consultant leaves the org mid-week | DRAFT stays; finance may submit+approve it on their behalf **with** audit `OPS_TS_SUBMIT_FOR` (the only "for" action in the module; hours only, never money) — open point D8 |
| Member erased | §8 |
| Placement end date moved earlier than approved sheets | 409 `SHEETS_AFTER_END` listing the weeks; finance decides |
| Week-start setting changed with live sheets | 409 unless no DRAFT/SUBMITTED sheets exist; approved history keeps its original `week_start` |
| Timezone/DST at week boundary | `week_start` is a DATE in the org timezone; reminders compute in `organization.timezone`; no instants in the sheet itself |
| Reminder job restarts | idempotency key per (member, kind, week) — never double-sends |
| ADMIN is also a consultant | own sheet → 409 `SELF_APPROVAL`; another approver must act; a one-person shop sees the honest message "Add a second admin or finance member to approve your own hours" (or disable approvals: `ops_settings.approval_required=false` — proposed D9) |

## 13. Rollout

1. Flag `dossier.ops.enabled=false` in prod until O11.3 is green; `/api/orgs/*/ops/**` → 404 while off.
2. **Pilot gate (v0):** platform admin sets `organization.settings_json.opsPilot=true` from the admin
   console (audited) for 2–3 consultancies; the add-on is **free during the pilot** (no Stripe item);
   the catalog rows (O11.8) replace the flag when Phase 18 / O3.2 land, and the pilot orgs are migrated to
   a comped `ADMIN_COMP` grant on the Ops product.
3. Demo org `demo-consultancy` seeded with 5 consultants, 3 clients, 6 weeks of sheets (2 flagged, 1
   corrected) so the sales demo and the screenshots are real.
4. Mobile first: the consultant surface ships inside the existing user web app (`/app/timesheets`), PWA
   installable, before any org-console polish. The approver inbox ships in the org console (`/org/ops/
   timesheets`) with the bottom-tab "More → Timesheets" entry (O15.1).
5. Success metrics for the pilot (product_event, consented analytics): median seconds from opening the
   week to submit (target ≤ 45 s after week 2), % of sheets with proof attached, % approved within 48 h,
   % one-tap approvals, reminder → submit conversion. These decide whether OCR auto-read defaults on.

## 14. Tests

- `OpsTimesheetStateTest`: every transition in §4 incl. withdraw, reject→draft, correction chain, locked
  supersede, live_key uniqueness under concurrent create, self-approval 409.
- `OpsFlagsTest`: table-driven over §7; > 24 h blocks; tolerance edge; overlap only above 1440; OCR
  mismatch suppressed below confidence 0.6.
- `OpsRoleMatrixTest`: consultant own-only (foreign sheet → 404), MARKETER presence-only (no minutes in
  the DTO — reflection test like `ShareMatrixTest`), FINANCE/ADMIN/OWNER full, STAFF/MEMBER-without-
  placement → 404, platform admin → 404.
- `OpsPayVisibilityTest`: pay rate/pay line absent from every consultant DTO unless the switch is on;
  bill rate absent always.
- `OpsAttachmentIT` (local driver, temp dir): 5 MB boundary, 3-per-sheet limit, org cap 413 at exactly
  2 GB, sniffing (PNG named .pdf → 415), delete only in DRAFT, download proxied with permission check,
  erasure keeps files, retention purge deletes via the seam and the ledger.
- `OpsOcrTest`: gateway stub returns schema JSON → suggestion stored; non-schema fields rejected; budget
  exhausted → SKIPPED + flag; apply-ocr sets `source=OCR`; never runs when `ocr_enabled=false`.
- `OpsReminderJobTest`: Monday/Wednesday selection, quiet-hours delay, daily cap interaction, idempotency
  across restarts, Friday opt-in, no mail to marketers.
- `OpsExportTest`: every layout's columns against §11 fixtures; FINANCE-only columns absent for others;
  PDF pack footer and approval line present; audit row per file with sha256.
- `SensitiveTextValidatorTest` extended to every ops free-text field and the OCR schema: SSN/ITIN, EIN,
  IBAN, Luhn card, routing (9 digits), account (8–17 digits), keyword+number (passport/visa/I-94/licence),
  keyword+date (DOB); document mode tolerates invoice/PO numbers in context; message text snapshot.
- **`OpsNeverCollectedTest` (the deny-list gate, story O11.14):** (a) Liquibase/JPA: no column in any
  `ops_*` table whose name matches `(ssn|itin|ein|tax_id|routing|account_no|account_number|iban|swift|
  passport|visa|i94|i9|dob|birth|home_address|salary)`; (b) reflection over every `ops` request/response
  DTO: no field with such a name, and every `String` field carries `@NoSensitiveText`; (c) every
  `OpsExportColumns` layout passes the column deny-list; (d) the `OPS_TS_OCR`/`OPS_TS_SCAN` response
  schemas contain only the enumerated fields and reject extras; (e) `pay_type_label` and `method_label`
  are enums, not free text. Runs in the unit suite so a new column fails the build.
- `OpsProofScanIT`: fixture PDFs/images (hours-only sheet → accepted; sheet with a printed SSN → 422
  `PROOF_HAS_IDENTIFIER{SSN}`, nothing in `FileStorage`, no ledger row, no attachment row, audit row with
  kinds only; text-layer PDF scanned without a gateway call; image refused when the safety budget is
  exhausted; refused sha256 short-circuits on re-upload; cache purged after 90 days).
- `OrgIsolationIT` (O1.5) discovers the new routes automatically — no new wiring.
- Web (vitest + Playwright 390 px): steppers ≥ 44 px, long-press numeric entry, copy-last-week, day sheet
  kinds, camera input attribute, OCR suggestion "Use/Keep", submit-with-flags confirm, approver one-tap
  only on unflagged rows, bulk approve count, rejection comment required, dark mode, a11y ≥ 95.

## 15. Competitive — how we beat what consultancies use today (checked 2026-10-11)

| tool | what it is / price | what consultants and approvers hit | our move |
|---|---|---|---|
| **Ceipal WorkForce** | staffing HRMS/timesheets; ~$4/user/mo with a 25-user minimum, or tiers ≈ $73–140/mo ([Capterra](https://www.capterra.com/p/144016/CEIPAL-Workforce/alternatives/), [Fitgap](https://us.fitgap.com/products/030570/ceipal-workforce)); G2 4.2 from 29 reviews ([G2](https://www.g2.com/products/ceipal-workforce/reviews)) | "limit on attachment size", "no edit on expenses", "too many tabs and fields", slow at times ([Capterra reviews](https://www.capterra.com/p/144016/CEIPAL-Workforce/reviews?page=3)); one reviewer likes that timesheet attachments carry onto invoices | **no minimum seats**: a 5-consultant shop pays $99 + $20; one screen, 44 px steppers, proof is part of the sheet, and proof + approval flags travel to the invoice line (23.x) |
| **JobDiva + MyTime app** | ATS with timesheets; custom pricing, third-party estimates ~$90–125/user/mo (unverified, [Spendbase](https://test.spendbase.co/?p=42364)); MyTime iOS app **2.4★ from 18 ratings** ([App Store](https://apps.apple.com/app/id823857384)) | the consultant-facing app is the weakest part of the suite | the consultant surface is the *first* thing we build and the thing we measure (≤ 45 s median); PWA, no app-store gate |
| **Bullhorn Time & Expense** | pay/bill for staffing; listed from $1.50/user, quote-based; 4.1 from 7 reviews, value-for-money 3.8 ([Capterra](https://www.capterra.com/p/40568/Peoplenet-Time/)); payroll workflow requires placement data to be perfect before approval ([Bullhorn KB](https://kb.bullhorn.com/bhone/Content/BH1/Topics/payrollWorkflowBestPractices.htm)) | enterprise setup; web time entry portal; needs Bullhorn ATS | zero-setup placements (consultant + client + date), rates optional until finance needs them |
| **SAP Fieldglass / Beeline (client VMS)** | the *client's* system; the consultant has no choice; rejections and locked sheets need the program office; approver routing issues ([Beeline guide](https://www.kellytelecom.com/wp-content/uploads/2022/07/Crown-Castle-Worker-QRG_20190522_v1-1.pdf), [SAP KB](https://userapps.support.sap.com/sap/support/knowledge/en/3756050)); Beeline itself admits desktop-only entry is "inconvenient" ([Beeline mobile](https://www.beeline.com/resources/beeline-mobile-apps)) | double entry: the consultant must repeat the week for the consultancy | we are the *second copy done right*: photo/PDF of the approved VMS sheet → OCR pre-fill → confirm → done; the proof is the record |
| **Avionté (BOLD)** | staffing platform; 3.9 from 74 reviews, admin side "complex" ([SoftwareFinder](https://softwarefinder.com/hr/avionte/reviews)) | legacy + web split; long multi-step procedures | one module, one state machine, one screen per persona |
| **QuickBooks Time** | $20 base + $10/user (Premium), $40 + $12 (Elite) ([Intuit pricing](https://quickbooks.intuit.com/time-tracking/pricing/)) | built for shifts/GPS clock-ins, not weekly placement sheets; no proof concept | weekly sheet + proof + mismatch, priced per *active* consultant |
| **Harvest** | $11/seat (Teams); **approvals only on Enterprise $17.50/seat** ([Harvest pricing](https://www.getharvest.com/pricing)) | freelancer invoicing tool; approvals are an enterprise upsell | approvals included at every size |
| **Toggl Track** | approvals only on Premium **$24/user monthly** ([Toggl pricing](https://toggl.com/track/pricing/)) | timers, not placements; no proof | same |
| **Clockify** | cheapest: approvals from Standard $6.99/user monthly; free capped at 5 users ([Clockify pricing](https://clockify.me/pricing)) | generic; occasional "stuck" tracking; invoicing customisation limited ([G2](https://www.g2.com/products/clockify/reviews?page=8)) | for 10 consultants Clockify Standard ≈ $70/mo vs our $139 — we cost more and must earn it with proof, OCR, flags, bill/pay/profit (23.x) and the consultant already living in Kiwiply |
| **Zoho People / Zoho Invoice** | HR timesheets + a "client approval" feature in Invoice ([Zoho docs](https://www.zoho.com/invoice/help/client-approval/create-client-approval.html)); approvers must log in to the portal to approve ([Zoho community](https://help.zoho.com/portal/en/community/topic/obtaining-timesheet-approval-from-a-client-witho9ut-logging-into-portal?page=1)) | split across products; client approval doesn't cover Projects sheets | one-tap approve in the inbox; the *client* approved elsewhere — we don't ask them to log in |
| **Conrep / bench-sales CRMs** | vendor-side; sub-vendor invoices from approved hours ([Conrep](https://conrep.notion.site/AP-Invoice-Workflow-e0d8d6d3648944c380fe433514c0b671)), bill/pay rate per placement ([Conrep](https://www.conrep.com/bill_payrate/)) | the consultant has no login and no view | the consultant sees their own sheets, timeline, who opened them, and can export — the honest version |
| **Timesheet-OCR vendors** (Lido, Nanonets, Affinda…) | standalone extraction to Excel ([Lido roundup](https://lido.app/blog/best-timesheet-ocr-software), [Affinda](https://www.affinda.com/tools/how-to-convert-timesheet-to-excel)); no staffing suite ships it natively in what we found | separate tool, separate export | OCR inside the sheet, bounded by budget, always a suggestion |

Note on sources: Reddit threads (r/h1b, r/cscareerquestions) were not retrievable through the search tool
on 2026-10-11; consultant-side pain points above come from vendor guides, app-store ratings and review
sites. The pilot interviews (§13.5) should replace this with first-hand quotes.

**The five moves, in order of weight:**
1. **30-second weekly entry on a phone** — prefilled from last week, 44 px steppers, one submit.
2. **Proof as part of the sheet + OCR pre-fill + mismatch flag** — nobody re-keys; disputes have a record.
3. **Approver one-tap / bulk for clean sheets, forced look for flagged ones** — speed without blind approval.
4. **Zero-setup, no minimums** — a 5-consultant shop is live in the time it takes to type five names.
5. **Honest to the consultant** — own history, timeline of who looked, export any time, pay shown when the
   org allows, never bill rates. No competitor gives the consultant anything.

## 16. Billing of this slice (see `consultancy-ops.md` §7 and the proposal's decision D2)

**Decision D2 (user, 2026-10-11): pricing is not set in the roadmap — it is set later from the admin
catalog.** Catalog items, shape only: `ops-addon-base` (per org per month) + `ops-addon-consultant` (per
*active* consultant per month; active = ≥ 1 `ops_placement.status=ACTIVE` in the period). Entitlements with
their catalog defaults: `ops.enabled=true`, `ops.ocr` (**default off**, D7), `ops.ai_budget_cents_per_consultant`
(default 50, pooled: `n × active`), `ops.storage_bytes_max` (default 2 GB), `ops.attachment_bytes_max` (default
5 MB). The margin guard runs at publish time against whatever price admin enters: the consultant line's worst
case is the OCR budget **plus the identifier-scan budget** (setting `ai.budget.ops_scan_cents_per_consultant`,
default 25 ¢, §5.13) + its share of fees; the base line is fee-only. The "$99 + $4" figures in the proposal are
a worked example showing the guard clears the floor at those values, not a locked price. Pilot orgs run free
behind an admin switch (`flag.ops_timesheets` + `opsPilot`, O11.13), later an ADMIN_COMP grant (O11.8). These
two are the only model calls in the module and both are hard-capped per period.
