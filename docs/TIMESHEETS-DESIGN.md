# Timesheets & Consultancy Ops — design

Product area **H** (hours; T is Trust). Branch `timesheets` (off `version2`) when building. Written
2026-10-11 by promoting the org area's Consultancy Ops epic (`docs/roadmap/areas/org.json`)
into a product area like the Resume Builder (old → new ids: §13). Companion files: `docs/TIMESHEETS-STORIES.md` (the backlog),
`docs/timesheets/stories.json` (the status source of truth the master roadmap reads),
`docs/TIMESHEETS-DECISIONS.md` (what is decided, what the user may veto), `docs/HANDOFF-TIMESHEETS.md`
(START HERE). ROADMAP context: this is **Phase 23 Consultancy Ops add-on** (23.0 brainstorm → locked
spec), sold only as an **Organization add-on** (decision D1), **priced later in admin** (D2), **P2** (D10).

This file absorbs `docs/design/org/timesheets.md` (the first slice) and `docs/design/org/consultancy-ops.md`
(the add-on-wide decisions and the money side). Both are now pointers here: they are one product, built
in one order, by one team, so the money records (§5.14, H6) live in the same design rather than a second
org document. Everything below is a decision unless it is in §18 (open questions). Every number is a
default behind a setting, entitlement, flag or catalog value (§11), never a constant.

> Locked inputs: `CLAUDE.md` → Consultancy Ops add-on (**record money, never move it**; no bank numbers,
> SSNs or tax IDs; finance visible to OWNER/ADMIN/FINANCE only; Marketer never submits, never signs in as a
> consultant; consultant consents); the product-wide **never collected** rule (2026-10-11); **everything is
> admin-configured** (2026-10-11); `ROADMAP.md` Phase 23 boundaries; `docs/design/org/tenant-model.md` (roles,
> 404 semantics, audit); `docs/design/org/consent-data-sharing.md`; `docs/design/plat/file-storage-seam.md`
> (all bytes through `FileStorage`, local driver first, no presigned URLs); `docs/design/ai/ai-gateway-metering-budgets.md`
> (every model call through the gateway with a budget owner); `docs/design/pay/fee-model-and-margin-guard.md`
> (≥ 80 % worst case); `docs/design/admin/runtime-settings-feature-flags.md` (settings registry, flags,
> feature registry).

---

## 0. Executive summary

1. **The product is the consultancy's copy of the week, done right — not a timer.** A placed consultant
   already enters hours in the *client's* VMS (Fieldglass, Beeline, a prime's portal) or on a signed sheet.
   The consultancy needs the same hours again plus the **client-approved proof** to invoice the vendor and
   to pay the consultant. Today that second copy travels by email/WhatsApp and someone re-keys it. We make
   it **30 seconds a week on a phone for the consultant, one tap for the approver, zero setup for a
   five-person shop, and a paper trail that survives a dispute.**
2. **Weekly sheets per placement**, Monday-start by default, minutes in storage, 15-minute steps in the UI,
   day kinds `WORK · PTO · HOLIDAY · SICK · UNPAID`. Prefilled from last week's approved sheet so the common
   case is "glance, fix Friday, submit".
3. **Proof is part of the sheet.** Photo/PDF of the approved client sheet attached from the phone, stored
   through the `FileStorage` seam, shown beside the hours in the approver inbox. **Every upload is scanned
   for identifiers before storage and refused if it carries one** (§5.13). Optional, budgeted **OCR is off
   by default** (D7) and only ever *suggests*.
4. **Flags, never silent corrections.** The server computes a fixed table of flags (§7) on submit and on
   approve; approving with a flag records which flags the approver saw. Approved sheets are immutable;
   corrections supersede with a reason; invoiced sheets can still be corrected and the invoice is told.
5. **One-step approval by OWNER / ADMIN / FINANCE.** No chains, no client-side approvers, no external links
   (D4): the client approved in *their* system; ours is the consultancy's acknowledgement.
6. **Never collected** (§5.12): no SSN/ITIN, EIN/tax ids, bank/routing numbers, passport/visa/I-9/I-94/
   document numbers, dates of birth or consultant home addresses — no column, no DTO field, no export
   column, no OCR schema field, and proof files that show one are refused. Enforced by a failing build
   (`OpsNeverCollectedTest`, H3.1), like the consent matrix.
7. **Money is recorded, never moved** (H6): rates (effective-dated, minor units, FINANCE-only), invoice
   records generated from approved hours (PDF the org downloads and sends itself), payments IN/OUT and
   expenses typed by hand with memo fields that refuse account numbers, a profit view. No Stripe, no ACH, no
   payroll, no tax forms.
8. **The marketer sees presence, not hours** (D6); the consultant sees their own history, who opened their
   sheet, and can export any time; pay rate is shown to the consultant only by an org switch; bill rates
   are never visible to consultants or marketers.
9. **Org add-on only** (D1), gated in v0 by a flag + a platform-admin pilot switch (free), later by the
   catalog entitlement `ops.enabled` with items `ops-addon-base` + `ops-addon-consultant` **priced later in
   admin** (D2) behind the 80 % margin floor. **Every epic stays P2** (D10); the timesheets-first order is in
   the dependencies.
10. **Built as a walking skeleton first** (H0: gate → placement → one sheet submitted and approved → one
    CSV → smoke script), then placements & rates (H1), the phone-first week (H2), proof + the never-collected
    gate (H3), reminders (H4), exports (H5), money records (H6), billing/retention/admin (H7), pilot &
    growth (H8). It depends on the **org model, which does not exist in the API yet** (O1.x/O2.x/O6.x/O13.x
    stay in `org.json` as cross-area deps).

---

## 1. The job to be done, goals, principles

### 1.1 What we learned (checked 2026-10-11)

A consultant on a placement sits in a chain: **end client → vendor / prime (often 1–2 layers) → the
consultancy that employs or contracts the consultant**. Every week:

1. The consultant enters hours in the **client's** system and the client manager approves there.
   Rejections, locked sheets and "waiting on another approver" are the daily friction in those tools
   ([Beeline worker guide](https://www.kellytelecom.com/wp-content/uploads/2022/07/Crown-Castle-Worker-QRG_20190522_v1-1.pdf),
   [SAP Fieldglass KB 3756050](https://userapps.support.sap.com/sap/support/knowledge/en/3756050)).
2. The consultancy needs **the same hours again**, plus the **client-approved proof**, because that proof
   is what lets it invoice the vendor and defend the invoice. Vendor platforms build the sub-vendor invoice
   from approved hours and park it as *Not Ready* until the sheet is approved
   ([Conrep AP invoice workflow](https://conrep.notion.site/AP-Invoice-Workflow-e0d8d6d3648944c380fe433514c0b671)).
3. The vendor pays net 30–60; the consultancy pays the consultant from that (or, for W-2/H-1B, on schedule
   regardless — contracts commonly say the agency pays "regardless of whether [it] has received payment
   from the Client", [sample clause](https://lawinsider.com/clause/timesheets/_3)).

The consultant's job-search data (board, resumes, inbox) is **not** involved anywhere in this product.

### 1.2 Goals
- Consultant: open → submit in **≤ 45 s median** after week 2 (measured, H8.3), ≤ 6 taps on the prefilled path.
- Approver: **one tap** for a clean sheet, a forced look at a flagged one, bulk for the rest.
- Org: live in the time it takes to type five names; no projects, cost codes, templates or approval rules.
- Finance: hours → invoice record → payment record → profit, all from the same approved number.
- Business: a pilot with 2–3 consultancies before any billing exists; numbers decide the defaults.

### 1.3 Principles (every story is checked against these)
1. **Record, never move.** No money leaves or enters through us. No bank details anywhere.
2. **Never collected** beats "never stored" — there is no field to type it into.
3. **Suggest, never auto-apply.** OCR, prefill and holidays propose; the person confirms.
4. **Immutable once approved; corrections supersede** with a reason and a visible chain.
5. **Everything exports** (CSV, PDF) — never locked in; the payroll person gets a payroll-shaped file.
6. **Honest to the consultant**: own history, who looked, what the org sees, pay rate when the org allows.
7. **Every number is a dial** (§11) with a default, bounds and an audit trail.
8. **Phone first** at 390 px, PWA-installable; the org console is second.
9. **Reuse the platform**: `FileStorage`, `AiGateway` budgets, `OrgAccessService`, `org_audit_event`,
   the settings registry, the catalog, the Chromium PDF sidecar from the Resume Builder.

---

## 2. Personas and what each one sees

| | Consultant (phone) | FINANCE / ADMIN / OWNER (approver) | MARKETER (paired) | Platform admin |
|---|---|---|---|---|
| Own sheets, entries, notes, proof | ✓ create/edit/submit | ✓ read all in org | ✗ | audited reason only |
| Other consultants' sheets | ✗ (404) | ✓ | ✗ | — |
| Placement: client name, dates | ✓ own | ✓ | ✓ paired (name + dates) | — |
| Bill rate, vendor chain, margins, profit | ✗ never | ✓ | ✗ | — |
| Pay rate, pay totals | own, **only if** `show_pay_to_consultant` | ✓ | ✗ | — |
| Approve / reject / bulk / waive proof | ✗ | ✓ | ✗ | — |
| Week status (submitted / missing) | own | ✓ | ✓ paired, status only | — |
| Flags | own | ✓ | ✗ | — |
| Export | own sheets CSV | org CSV / PDF packs / finance CSV (audited) | ✗ | — |
| Invoices, payments, expenses | ✗ | ✓ (`ops.finance`) | ✗ | — |
| Reminder settings | own opt-ins | org defaults | ✗ | — |
| Pilot switch, budgets, usage | ✗ | ✗ | ✗ | ✓ (HIGH, audited) |

STAFF and MEMBER-without-a-placement get nothing in this product; a consultant is an org `MEMBER` with
≥ 1 placement. Permission keys (`tenant-model.md` §4): `ops.settings`, `ops.placements`,
`ops.timesheets.approve`, `ops.timesheets.own` (computed from placements), `ops.finance`.

---

## 3. Flows and wireframes (390 px)

### 3.1 Week view — the whole job in one screen (H0.5 v0, H2.4 full)

```
┌──────────────────────────────┐
│ ‹ Oct 6 – Oct 12  ›   Acme ▾ │  placement switcher only when > 1
│ Draft · due Mon              │
│ ┌──────────────────────────┐ │
│ │ Mon 6   [ − ]  8.00  [ + ]│ │  44 px steppers, step = ops_settings.step_minutes
│ │ Tue 7   [ − ]  8.00  [ + ]│ │  long-press = type a number
│ │ Wed 8   [ − ]  8.00  [ + ]│ │
│ │ Thu 9   [ − ]  8.00  [ + ]│ │
│ │ Fri 10  [ − ]  6.00  [ + ]│ │
│ │ Sat 11      –        [ + ]│ │  weekend collapsed to one tap
│ │ Sun 12      –        [ + ]│ │
│ └──────────────────────────┘ │
│ copied from last week — tap to change │
│ Total 38.00 h  (expected 40) │  soft flag, amber, not blocking
│ [ Copy last week ]  [ PTO… ] │
│ 📎 Client-approved sheet     │
│   [ Add photo / PDF ]        │
│ ✎ Note (optional)            │
│ [ Submit for approval ]      │  disabled at 0 minutes
│ Your pay: hidden by Mehta    │  only when the org hides pay
└──────────────────────────────┘
```

- Landing with no draft creates one for the current week **prefilled from last week's approved sheet**
  (same minutes per weekday, kinds reset to WORK, notes cleared). First-ever week prefills
  `hours_per_week_expected ÷ 5` on weekdays. The prefill is labelled.
- Tapping a day label opens the day sheet: kind chips `Work · PTO · Holiday · Sick · Unpaid`, minutes,
  note (≤ `org.ops.note_max_chars`). Org holidays pre-set `HOLIDAY` with 0 work minutes and a chip
  "Holiday — Columbus Day"; the consultant can override.
- `Submit` on a sheet with flags shows them first ("Your total is 38 h, expected 40. Submit anyway?") —
  one-tap confirm, never a block except `DAY_OVER_24H`.
- After submit the screen flips to a read-only card with status, flags and "Withdraw".

### 3.2 Proof upload — the step every other tool makes a chore (H3.2–H3.5)

```
┌──────────────────────────────┐
│ Client-approved sheet        │
│ ┌──────────────────────────┐ │
│ │  📷 Take photo            │ │
│ │  🖼  Choose from photos    │ │
│ │  📄 Choose file (PDF)     │ │
│ └──────────────────────────┘ │
│ acme-ts-wk41.pdf · 312 KB ✓  │
│ ○ Reading hours… (OCR on)    │  only when the org turned OCR on
│ ✓ Read 38.00 h · matches     │  or ⚠ "Read 40.00 h, you entered 38.00"
│   [ Use 40.00 ] [ Keep mine ]│  consultant chooses; never auto-applied
└──────────────────────────────┘
```

- `<input type=file accept="image/*,application/pdf" capture="environment">`; images downscaled client-side
  to ≤ `org.ops.image_max_edge_px` on the long edge.
- The upload goes through the API to `FileStorage`, never to a bucket URL; downloads are proxied.
- A refused file (§5.13) shows:

```
│ ⛔ We can't keep this file       │
│ It seems to show a Social        │
│ Security or bank number. We      │
│ never collect those. Crop to the │
│ hours page or export just the    │
│ approved sheet, then try again.  │
│ [ Choose another file ]          │
```

### 3.3 Approver inbox — one tap, with the proof in view (H0.5 v0, H3.6 full)

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

Open sheet view: day grid, kinds, notes, proof viewer (PDF page 1 / image), flags with acknowledge boxes,
timeline (submitted by, OCR read, approved by, superseded by, who opened), Submit-for / Waive-proof in
their allowed states.

### 3.4 Consultant history (H2.4)

```
│ Oct 6   Acme   38.00 h  Approved ✓    │
│ Sep 29  Acme   40.00 h  Approved ✓    │
│ Sep 22  Acme   40.00 h  Rejected ✗ → │  tap: "Fri was 6 h, not 8 — Priya"
│ Sep 15  Acme   40.00 h  Superseded ↻  │
│ [ Export my sheets (CSV) ]            │
```

### 3.5 First-run information screen (H8.1; once per membership, text `consent/ops-timesheets/v1`)

```
┌──────────────────────────────┐
│ Timesheets for Mehta Staffing│
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
│ {retention} years as Mehta's │
│ records.                     │
│ [ Continue ]                 │
└──────────────────────────────┘
```

### 3.6 Finance home and invoice draft (H6.5, H6.2)

```
Finance · Ops home                          Invoice · draft
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ Pending sheets  4  ▸         │           │ ACME-0008 · Acme Corp · DRAFT│
│ Unapproved hours 156 h       │           │ Oct 1 – Oct 31              │
│ Unproofed hours   8 h  ⚠     │           │ Aarav M · 160.0 h × $85 … $13,600│
│ Outstanding    $18,400 (3)   │           │ Sneha K · 152.0 h × $90 … $13,680│
│ Needs reissue  ACME-0007 ⚠   │           │ Subtotal          $27,280   │
│ This month                   │           │ Tax (entered)     $0        │
│  billed  $41,200             │           │ Total             $27,280   │
│  pay     $29,600             │           │ 2 proofs attached · 0 flags │
│  gross   $11,600 · 28 %      │           │ [ Download PDF ] [ Mark issued ]│
│ [Export ▾]                   │           │ Records you entered. Not tax,│
│ Records you entered. Not tax,│           │ legal or accounting advice. │
│ legal or accounting advice.  │           └──────────────────────────────┘
└──────────────────────────────┘
```

### 3.7 New placement sheet (H1.3)
Consultant picker (from `/members`) · client name (autocomplete or create) · start date · **Save**;
"More" collapses title, end date, expected hours, proof required, pay-type label, vendor. Rates are a
separate FINANCE-only panel on the placement detail.

---

## 4. State machines

### 4.1 Timesheet

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

- `DRAFT` is editable by the consultant only. `SUBMITTED` is read-only except `withdraw` (consultant)
  and `approve`/`reject` (approver). `APPROVED` is immutable: no endpoint updates its entries.
- One **live** sheet per `(placement_id, week_start)` — generated column `live_key` =
  `IF(status IN ('DRAFT','SUBMITTED','APPROVED'), CONCAT(placement_id,':',week_start), NULL)` UNIQUE.
  A correction inserts the new row and flips the old one to `SUPERSEDED` in one transaction.
- **Locks:** `locked_reason = INVOICED` once an `ops_invoice_line` references the sheet. Locked sheets can
  still be superseded; the UI says "This week is on invoice ACME-0007; finance will need to reissue it".
- **Week closes** are not a state: a placement's `end_date` stops auto-creation; later weeks are
  approver-created and flagged `AFTER_END_DATE`.
- Self-approval → 409 `SELF_APPROVAL`, unless `ops_settings.approval_required=false` (D9) — then submit
  goes straight to APPROVED with a visible `self_recorded` badge everywhere.
- Finance may submit a leaver's trailing DRAFT (`submit-for`, D8) — hours only, audited to the person.

### 4.2 Invoice (H6.2)

`DRAFT → ISSUED → PARTIALLY_PAID → PAID`; `VOID` from DRAFT/ISSUED. `paid_minor` = Σ linked `ops_payment IN`
rows (recomputed on write). "Issued" means the org marked it sent — Kiwiply never sends. A superseded
timesheet on an ISSUED invoice sets `needs_reissue=true` and shows the delta; finance voids and regenerates
(the new invoice carries "replaces ACME-0007").

---

## 5. Data model (additive Liquibase; every table `org_id` first; MySQL 8, utf8mb4, DATETIME(6) UTC)

Changesets by story: `20261013010000_ts_skeleton.xml` (H0.1: §5.1, 5.2, 5.4, 5.6, 5.7, 5.9) ·
`20261013020000_ts_rates_holidays.xml` (H1.1: §5.3, 5.5, 5.10) · `20261013030000_ts_attachments.xml` (H3.2:
§5.8, 5.11) · `20261013040000_ts_prefs_consent.xml` (H4.2/H4.3/H8.1: reminder log, member prefs, consent
events) · `20261013050000_ts_exports.xml` (H5.1) · `20261013060000_ts_money.xml` (H6.1: §5.14). Entities under
`api/src/main/java/com/dossier/api/domain/org/ops/` (note: `service/ops/` already exists for *platform* ops
— ErrorDigest — so consultancy ops lives under `org/ops/` everywhere).

### 5.1 `ops_settings` (one row per org, created on first read)
| column | type | notes |
|---|---|---|
| org_id | BIGINT PK FK organization | |
| week_start | TINYINT NOT NULL | default from setting `org.ops.week_start_default` (1 = Monday … 7) |
| step_minutes | SMALLINT NOT NULL | 15 / 30 / 60; default `org.ops.step_minutes_default` |
| expected_tolerance_pct | TINYINT NOT NULL | default `org.ops.expected_hours_tolerance_pct` |
| day_warn_minutes | SMALLINT NOT NULL | default `org.ops.long_day_hours` × 60 |
| proof_required_default | BOOLEAN NOT NULL | default `org.ops.proof_required_default` |
| approval_required | BOOLEAN NOT NULL DEFAULT true | D9 one-person shops |
| ocr_enabled | BOOLEAN NOT NULL DEFAULT false | requires entitlement `ops.ocr` (D7) |
| ocr_auto_read | BOOLEAN NOT NULL DEFAULT false | read every upload vs on tap |
| show_pay_to_consultant | BOOLEAN NOT NULL DEFAULT false | |
| reminder_consultant_dow / _time | TINYINT / TIME | default `org.ops.reminder_consultant` |
| reminder_approver_dow / _time | TINYINT / TIME | default `org.ops.reminder_approver` |
| currency | CHAR(3) NOT NULL DEFAULT 'USD' | one per org |
| retention_years | TINYINT NOT NULL | ≥ `org.ops.retention_min_years` (hard minimum 7) |
| created_at / updated_at | | |

### 5.2 `ops_client`
`id, org_id, name VARCHAR(120), contact_name VARCHAR(80) NULL, contact_email VARCHAR(254) NULL (business
contact only), notes VARCHAR(500) NULL, archived_at NULL, created_at`. Unique `(org_id, name)`.
H6.1 adds `address_text` (business), `payment_terms_days`, `invoice_email`.

### 5.3 `ops_vendor` (optional middle layer; the UI shows it as a free-text "via" field on the placement)
`id, org_id, name VARCHAR(120), contact_name NULL, contact_email NULL, notes NULL, created_at`. Unique `(org_id, name)`.

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
| hours_per_week_expected | SMALLINT NULL | default `org.ops.expected_hours_default` in the UI |
| proof_required | BOOLEAN NOT NULL | inherits `ops_settings.proof_required_default` |
| pay_type_label | VARCHAR(10) NULL | enum `W2 · 1099 · C2C · OTHER` — a label, never free text |
| status | VARCHAR(20) NOT NULL | `ACTIVE · ON_HOLD · ENDED` |
| notes | VARCHAR(500) NULL | `@NoSensitiveText` |
| created_by_member_id, created_at, updated_at | | |

Indexes: `(org_id, consultant_member_id, status)`, `(org_id, client_id)`. "Active consultant" (for budgets and
billing) = a member with ≥ 1 placement `ACTIVE` during the period, computed in one repository query (H1.2).

### 5.5 `ops_placement_rate` (rates change mid-placement; invoices use the rate in force that week)
`id, org_id, placement_id FK, effective_from DATE, bill_rate_minor INT NULL, pay_rate_minor INT NULL,
created_by_member_id, created_at`. Unique `(placement_id, effective_from)`. Both NULL in v0 — timesheets work
without money. `bill_rate_minor` never reaches a consultant or marketer DTO (separate DTO classes);
`pay_rate_minor` only via the pay switch.

### 5.6 `ops_timesheet`
| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | FK | |
| placement_id | FK ops_placement NOT NULL | |
| consultant_member_id | FK org_member NOT NULL | denormalised for the own-only query |
| week_start | DATE NOT NULL | the org's week-start weekday (validated) |
| status | VARCHAR(20) NOT NULL | `DRAFT · SUBMITTED · APPROVED · SUPERSEDED` (`REJECTED` is an event; the row returns to `DRAFT` with `last_rejection_comment`) |
| work_minutes / pto_minutes / sick_minutes / holiday_minutes / unpaid_minutes | INT NOT NULL DEFAULT 0 | derived on every entry write; `total_minutes` = sum |
| flags_json | JSON NULL | `[{"code":"TOTAL_NE_EXPECTED","detail":{"total":2280,"expected":2400}}, …]` |
| proof_state | VARCHAR(12) NOT NULL | `NONE · ATTACHED · READ_MATCH · READ_MISMATCH · READ_FAILED` |
| ocr_total_minutes | INT NULL | latest successful read |
| submitted_at, decided_at, decided_by_member_id | | |
| submitted_for_by_member_id | FK NULL | D8 submit-for |
| self_recorded | BOOLEAN NOT NULL DEFAULT false | D9 |
| decision_flags_json | JSON NULL | flags acknowledged at approval |
| last_rejection_comment | VARCHAR(500) NULL | |
| supersedes_id | FK ops_timesheet NULL | correction chain |
| correction_reason | VARCHAR(300) NULL | required when `supersedes_id` set |
| locked_reason | VARCHAR(20) NULL | `INVOICED` |
| live_key | generated STORED, UNIQUE | §4.1 |
| created_at, updated_at | | |

Indexes: `(org_id, status, week_start)`, `(org_id, consultant_member_id, week_start)`, `(org_id, placement_id, week_start)`.

### 5.7 `ops_timesheet_entry`
`id, timesheet_id FK, day DATE NOT NULL, kind VARCHAR(10) NOT NULL (WORK|PTO|HOLIDAY|SICK|UNPAID), minutes
SMALLINT NOT NULL CHECK 0–1440, note VARCHAR(200) NULL (@NoSensitiveText), source VARCHAR(10) NOT NULL
DEFAULT 'MANUAL' (MANUAL|COPIED|PREFILL|OCR)`. Unique `(timesheet_id, day, kind)`.

### 5.8 `ops_timesheet_attachment` (H3.2)
`id, org_id, timesheet_id FK, storage_key VARCHAR(512) (FileStorage key, prefix ops-ts), file_name
VARCHAR(200), bytes INT, content_type VARCHAR(40) (application/pdf|image/png|image/jpeg), sha256 CHAR(64),
uploaded_by_member_id, ocr_status VARCHAR(12) NULL (QUEUED|DONE|FAILED|SKIPPED), ocr_json JSON NULL
({days:[{date,minutes}], total_minutes, confidence, approver_name?, approved_date?}), ocr_request_id CHAR(26)
NULL, created_at, deleted_at NULL`. The `storage_object` ledger (plat D9) gains `ref_type = OPS_ATTACHMENT`
and `org_id`. `ops_refused_hash (org_id, sha256, kinds_json, created_at)` is the refusal cache (§5.13).

### 5.9 `ops_timesheet_event` (append-only timeline shown to the consultant and the approver)
`id, org_id, timesheet_id, kind VARCHAR(24) (CREATED|PREFILLED|SUBMITTED|SUBMITTED_FOR|WITHDRAWN|APPROVED|
REJECTED|SUPERSEDED|ATTACHMENT_ADDED|ATTACHMENT_REMOVED|OCR_READ|OCR_FAILED|PROOF_WAIVED|REMINDER_SENT|
EXPORTED|OPENED), actor_login VARCHAR(50) NULL (NULL = system), detail VARCHAR(500) NULL, created_at`.
Mirrors into `org_audit_event` with `OPS_TS_*` actions through one `OpsAuditService`.

### 5.10 `ops_holiday`
`id, org_id, day DATE, name VARCHAR(60), created_by_member_id`. Unique `(org_id, day)`. Seeded once from the
list named by setting `org.ops.holiday_seed` when `organization.country` matches. Holidays pre-set the day
kind — they never force a value.

### 5.11 `ops_storage_usage` — `org_id PK, bytes BIGINT, updated_at`; the org-cap check reads this; rebuilt
nightly from the ledger.

### 5.12 Never collected (product-wide rule: "we don't take any of those")

No field in this product — table, DTO, form, export column, OCR/scan schema — asks for, accepts or derives
any of the following. This is **not collect**, stronger than "not store".

| class | examples | where it could sneak in | what we do |
|---|---|---|---|
| Government identifiers | SSN, ITIN, EIN, state tax ids, VAT ids *of people* | notes, contact fields, OCR output, proof files | no column; `@NoSensitiveText` on every String field (422 `SENSITIVE_CONTENT`); OCR/scan schemas closed; proof scan refuses the file |
| Bank details | account, routing/ABA, IBAN/SWIFT, card numbers | payment `reference` memo, notes, proof files, receipts | same; `reference` is a memo ≤ 80 with the validator; `method_label` is an enum |
| Immigration / identity documents | passport, visa, I-94, I-9, driver's licence, national id, permits | placement notes, proof files, `pay_type_label` | `pay_type_label` is an enum; keyword+number rule; proof scan |
| Date of birth / age | DOB, "born", age | notes, contact fields, OCR | no column; keyword+date rule; OCR has no date field except `approved_date` (dropped outside the week ± `org.ops.ocr_approved_date_window_days`) |
| Home address of a person | consultant home address | client/vendor records, notes | `ops_client.address_text` is the **client business** address; consultants have no address field here |
| Salary history, compensation outside this placement | prior pay | notes | validator cannot catch prose; UI copy says "notes are about this week's hours"; approver sees notes |

What **is** collected: consultant display name (from `org_member`), client/vendor **business** name and
one business contact, placement title/dates/expected hours, rates in minor units (FINANCE), day kinds /
minutes / notes, proof files that passed the scan, approver name/date read from the proof, logins in audit.

`SensitiveTextValidator` (`api/.../validation/`, product-wide, H3.1; built on the shared `SensitivePatterns`
of T1.1): SSN/ITIN `\b\d{3}-\d{2}-\d{4}\b`, EIN `\b\d{2}-\d{7}\b`, IBAN `\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b`,
Luhn-valid 13–19 digit card numbers, **8+ consecutive digits** (routing 9, account 8–17, I-94 11),
keyword + number — `(ssn|itin|ein|tax id|routing|account (no|number|#)|iban|swift|passport|visa|i-94|i-9|
licen[cs]e no|national id|permit)` within 24 characters of ≥ 5 digits or `[A-Z]{1,2}\d{6,9}` — and keyword +
date `(dob|date of birth|born|birthday)` within 24 characters of a date. *Document mode* (scanned text)
relaxes "8+ digits" to "9+ digits outside a date/time/total context" to tolerate PO and invoice numbers.
Message: "Don't put account, tax, ID-document numbers or dates of birth here — we never collect them."
Deliberately over-inclusive; none of these fields legitimately needs a long number.

**Build gate `OpsNeverCollectedTest` (H3.1):** (a) no `ops_*` column in Liquibase/JPA matches
`(ssn|itin|ein|tax_id|routing|account_no|account_number|iban|swift|passport|visa|i94|i9|dob|birth|home_address|salary)`;
(b) reflection: no DTO field under `org/ops` with such a name, every String field annotated; (c) every
`OpsExportColumns` layout passes the deny-list; (d) the `OPS_TS_OCR`/`OPS_TS_SCAN` schemas contain only the
enumerated fields; (e) `pay_type_label` and `method_label` are enums. Plus a meta-test that a planted
`ssn` column is caught, and a doc↔code test that this table lists exactly the regex classes.

### 5.13 Proof files: detection and refusal before storage (H3.3)

1. **Upload is two-phase at the seam.** The multipart body is written to the `FileStorage` temp area
   (`.tmp/<uuid>`, plat D4) and **not** moved into place until the scan passes. A refused file is deleted
   from temp immediately and never gets a ledger row or an attachment row.
2. **Scan path by type:** PDF with a text layer → PDFBox extraction (already a dependency of resume
   parsing) + `SensitiveTextValidator` in document mode, **no model call**. PDF without a text layer, PNG,
   JPG → `AiGateway` task `OPS_TS_SCAN` with a **closed classify-only schema** `{contains_identifier: bool,
   kinds: [SSN|BANK|TAX_ID|PASSPORT_VISA|DOB|OTHER_ID], days[], total_minutes, confidence, approver_name?,
   approved_date?}`; the raw model text is discarded; the hours part is kept only when the org's OCR is on.
   Budget owner = a **platform safety budget** capped at setting `ai.budget.ops_scan_cents_per_consultant`
   (default 25) × active consultants per period, counted by the margin guard — separate from the org's
   optional OCR budget so a shop that never turned OCR on is still protected. Exhausted → image uploads are
   refused with "Try a PDF exported from the client's system, or after {date}"; text-layer PDFs keep working.
3. **Refusal is specific and kind:** 422 `PROOF_HAS_IDENTIFIER {kinds}` → the copy in §3.2. Nothing about
   the file is kept except the kinds and the sha256 of the refused bytes (cached `org.ops.refused_hash_cache_days`
   so the same file is refused instantly); audit `OPS_TS_PROOF_REFUSED` carries kinds only.
4. **No redaction by us.** Refusing means we never held the identifier beyond the temp write. A client-side
   crop/redact helper is a post-pilot item (D12, H8.5).
5. **Accepted proofs** are stored as uploaded (we do not alter documents the consultant chose to send), kept
   with the sheet for the retention period, and stay on erasure (they carry no identifier of the person
   beyond the name, by construction). Receipts (H6.3) reuse the same scan.
6. **False positives** (a PO number that reads as an account number) are the accepted cost; there is no
   "upload anyway" override, by design.

### 5.14 Money slice (H6.1; `20261013060000_ts_money.xml`; FINANCE-gated)

| table | columns |
|---|---|
| `ops_client` additions | `address_text VARCHAR(300)` (business), `payment_terms_days INT` (default `org.ops.payment_terms_days_default`), `invoice_email VARCHAR(254)` (business contact, for the org's own sending — we never send) |
| `ops_invoice` | id, org_id, client_id, number VARCHAR(30) (org prefix + sequence), status (DRAFT\|ISSUED\|PARTIALLY_PAID\|PAID\|VOID), issue_date, due_date, currency, subtotal_minor, tax_minor (entered, not computed), total_minor, paid_minor (derived), pdf_key (FileStorage `ops-invoice`), payment_instructions VARCHAR(300) (@NoSensitiveText), needs_reissue BOOLEAN DEFAULT false, replaces_invoice_id NULL, notes, created_at |
| `ops_invoice_line` | id, invoice_id, placement_id, timesheet_id NULL, description, minutes, rate_minor (the rate in force for `week_start`), amount_minor, proof_note VARCHAR(120) NULL ("approved 2026-10-10 by J. Lee", from `ocr_json` when present) |
| `ops_payment` | id, org_id, direction (IN\|OUT), counterparty_kind (CLIENT\|CONSULTANT\|VENDOR\|OTHER), counterparty_id NULL, invoice_id NULL, placement_id NULL, amount_minor, paid_on DATE, method_label enum (ACH\|WIRE\|CHECK\|CARD\|CASH\|OTHER), reference VARCHAR(80) (memo; @NoSensitiveText), notes |
| `ops_expense` | id, org_id, placement_id NULL, consultant_member_id NULL, category VARCHAR(30), amount_minor, spent_on, receipt_key NULL (FileStorage `ops-receipt`, same caps as proofs, scanned), notes |

Money as integer minor units + one org currency; hours as minutes; rates as minor units per hour. No floats
anywhere. Pay amounts for PTO/SICK/HOLIDAY minutes are **not** computed by us (the org's policy).

### 5.15 Profit view (H6.4; computed on read)
Per consultant / client / month: `billed = Σ approved WORK minutes × bill rate in force` (or issued invoice
lines when `basis=invoices`), `pay_expected = Σ approved WORK minutes × pay rate in force`, `pay_actual =
Σ ops_payment OUT`, `expenses`, `gross = billed − pay_expected − expenses`, `margin % = gross ÷ billed`,
`outstanding = Σ issued − paid`, `unapproved_hours`, `unproofed_hours` (approved with `PROOF_WAIVED`). Orgs
are small (≤ hundreds of consultants); the `(org_id, placement_id, week_start)` index carries it.

---

## 6. API & BFF

All under `/api/orgs/{orgId}/ops/...`; every handler `@OrgPermissionRequired` **and** behind `OpsGate`
(flag `flag.ops_timesheets` + `opsPilot` in v0, entitlement `ops.enabled` from H7.1); 404 for anything
outside the caller's org (never "forbidden"). The web app proxies through its BFF (`web/src/app/api/orgs/[id]/ops/**`,
pattern of `web/src/lib/api.ts`); no browser call reaches the API directly.

```
--- settings (OWNER/ADMIN/FINANCE: ops.settings) — H0.2, H1.2
GET    /ops/settings
PATCH  /ops/settings                      {weekStart, stepMinutes, expectedTolerancePct, proofRequiredDefault, approvalRequired,
                                            ocrEnabled, ocrAutoRead, showPayToConsultant, reminders{...}, retentionYears ≥ min}
GET    /ops/holidays  POST  DELETE /{id}

--- clients, placements (ops.placements) — H0.3, H1.1, H1.2
GET    /ops/clients  POST  PATCH /{id}  POST /{id}/archive
GET    /ops/placements?consultantMemberId&clientId&status
POST   /ops/placements                    {consultantMemberId, clientId | newClientName, vendorName?, title?, startDate, endDate?,
                                            hoursPerWeekExpected?, proofRequired?, payTypeLabel?}
PATCH  /ops/placements/{id}               (dates, title, status, proofRequired, hoursPerWeekExpected, vendorName)
POST   /ops/placements/{id}/rates         {effectiveFrom, billRateMinor?, payRateMinor?}   (ops.finance)
GET    /ops/placements/mine               consultant: own placements (no bill rate; pay rate only if the switch is on)

--- timesheets — H0.4, H2.1–H2.5
GET    /ops/timesheets?weekStart&status&consultantMemberId&placementId&flagged&page   approver: all; consultant: own (forced)
GET    /ops/timesheets/current            consultant: current week per ACTIVE placement, creating prefilled DRAFTs
GET    /ops/timesheets/{id}               entries, attachments (metadata), flags, events, pay line if visible, supersedes chain
POST   /ops/timesheets                    {placementId, weekStart} → DRAFT (409 TIMESHEET_EXISTS)
PUT    /ops/timesheets/{id}/entries       DRAFT only; whole-week replace [{day, kind, minutes, note?}] → totals + flags
POST   /ops/timesheets/{id}/copy-last-week
POST   /ops/timesheets/{id}/submit        → SUBMITTED; 422 DAY_OVER_24H / EMPTY_SHEET; 409 PROOF_REQUIRED
POST   /ops/timesheets/{id}/submit-for    approver, leaver / ended placement only (D8)
POST   /ops/timesheets/{id}/withdraw      SUBMITTED → DRAFT (consultant)
POST   /ops/timesheets/{id}/approve       {acknowledgeFlags?: [codes]}   409 SELF_APPROVAL; 422 FLAGS_UNACKNOWLEDGED
POST   /ops/timesheets/approve-bulk       {ids[]} → {approved[], skipped[{id, reason}]}  (unflagged only)
POST   /ops/timesheets/{id}/reject        {comment ≤ max}  → DRAFT
POST   /ops/timesheets/{id}/waive-proof   approver; audited OPS_TS_PROOF_WAIVED
POST   /ops/timesheets/{id}/correct       {reason} → new SUBMITTED' row with copied entries; old → SUPERSEDED on approval
DELETE /ops/timesheets/{id}               DRAFT only, consultant

--- attachments (multipart; caps from entitlements/settings; sniffed at the seam) — H3.2–H3.4
POST   /ops/timesheets/{id}/attachments   → 201 {id, fileName, bytes, ocrStatus}
                                           413 FILE_TOO_LARGE · 413 OPS_STORAGE_CAP · 415 UNSUPPORTED_FILE · 409 ATTACHMENT_LIMIT
                                           422 PROOF_HAS_IDENTIFIER {kinds} · 422 SCAN_BUDGET_EXHAUSTED {retryAfter}
GET    /ops/timesheets/{id}/attachments/{aId}          proxied stream, Content-Disposition: attachment, Range
DELETE /ops/timesheets/{id}/attachments/{aId}          DRAFT only
POST   /ops/timesheets/{id}/attachments/{aId}/read     OCR on demand → 202; 402 PLAN_REQUIRED{ops.ocr}; 409 OCR_DISABLED; 429 AI_BUDGET
POST   /ops/timesheets/{id}/apply-ocr     {attachmentId} → entries replaced (source=OCR), DRAFT only

--- marketer (paired MARKETER; status only) — H1.4
GET    /ops/presence?consultantMemberId   → {placements:[{client, startDate, endDate?}], weeks:[{weekStart, status}]}

--- exports (record only) — H0.6, H5.1, H5.2, H6.4
GET    /ops/timesheets/export?from&to&consultantMemberId&format=CSV        synchronous GENERIC (row cap)
GET    /ops/timesheets/mine/export?from&to&format=CSV                      consultant's own sheets
POST   /ops/export/timesheets             {from, to, consultantMemberId?, clientId?, format: CSV|PDF_PACK, layout, includeProof?} → 202 {exportId}
POST   /ops/export                        {what: invoices|payments|expenses|profit, from, to} → 202
GET    /ops/export/{id}                   status → proxied download; audited OPS_EXPORT per file

--- money (ops.finance; every read audited OPS_READ_FINANCE) — H6.2–H6.4
POST   /ops/invoices/generate {clientId, from, to}   PATCH /{id}   POST /{id}/issue   POST /{id}/void   GET /{id}/pdf
POST   /ops/payments   GET ?direction&from&to&counterpartyKind
POST   /ops/expenses   GET   POST /{id}/receipt
GET    /ops/profit?by=consultant|client|month&from&to&basis

--- me — H4.3, H8.1
GET/PUT /api/me/ops/prefs                 {fridayNudge, pushOnly}
POST    /api/me/ops/consent               {version}
```

Errors in the codebase's style: 404 outside org; 409 state conflicts (`TIMESHEET_EXISTS`, `NOT_DRAFT`,
`NOT_SUBMITTED`, `SELF_APPROVAL`, `ATTACHMENT_LIMIT`, `PROOF_REQUIRED`, `LIVE_SHEETS`, `SHEETS_AFTER_END`,
`CLIENT_EXISTS`, `OCR_DISABLED`); 422 validation (`DAY_OVER_24H`, `EMPTY_SHEET`, `WEEK_START_INVALID`,
`SENSITIVE_CONTENT`, `FLAGS_UNACKNOWLEDGED`, `PROOF_HAS_IDENTIFIER`, `SCAN_BUDGET_EXHAUSTED`, `RATE_MISSING`,
`MEMBER_NOT_ACTIVE`); 402 `PLAN_REQUIRED {feature}`; 413/415/507 from the storage seam; 429 `AI_BUDGET`.

Routes on the web: consultant surface at **`/timesheets`** in the user app (route group `(app)` — the file is
`web/src/app/(app)/timesheets/page.tsx`; there is no `/app/` URL segment), approver and finance surfaces under
**`/org/ops/*`** (`web/src/app/(org)/org/ops/`), admin at `/admin/ops`.

---

## 7. Flags (computed server-side; codes are the contract — H2.2, H3.4)

| code | when | blocks? | who sees |
|---|---|---|---|
| `DAY_OVER_24H` | any day's minutes across kinds > 1440 | **yes** (422) | consultant |
| `DAY_OVER_WARN` | a day's WORK > `day_warn_minutes` | no | both |
| `TOTAL_NE_EXPECTED` | WORK total outside expected ± `expected_tolerance_pct` | no | both |
| `WEEKEND_WORK` | WORK minutes on Sat/Sun (org week definition) | no | both |
| `OVERLAP_PLACEMENTS` | same consultant, same day, WORK across placements > 1440 | no | both |
| `PROOF_MISSING` | placement requires proof, none attached | **submit blocked** (409) unless waived (audited) | both |
| `OCR_MISMATCH` | `ocr_total_minutes` ≠ WORK total (suppressed below `org.ops.ocr_min_confidence`) | no | both |
| `OCR_UNREAD` | OCR on, upload present, not read (budget/failed) | no | approver |
| `AFTER_END_DATE` | week after placement `end_date` | no (approver-created) | approver |
| `CORRECTION` | `supersedes_id` set | no | approver |
| `INVOICED_SUPERSEDE` | correcting a locked sheet | no (invoice flagged `needs_reissue`) | approver |
| `SELF_RECORDED` | `approval_required=false` (D9) | no | both + every export |

Approving with flags requires `acknowledgeFlags` to list every non-info flag present → stored in
`decision_flags_json`. "Finance approved 42 h knowing the proof said 40" is on record, with a login.

---

## 8. Audit and the paper trail (H7.4 proves completeness)

| action (`org_audit_event.action`) | target | details |
|---|---|---|
| `OPS_PLACEMENT_CREATE/UPDATE/END`, `OPS_CLIENT_*`, `OPS_RATE_SET` | consultant login | fields changed (rates as "set" + effective date, never the amount) |
| `OPS_TS_SUBMIT`, `OPS_TS_SUBMIT_FOR`, `OPS_TS_WITHDRAW`, `OPS_TS_DELETE` | consultant login | sheet id, week, total minutes |
| `OPS_TS_APPROVE`, `OPS_TS_APPROVE_BULK`, `OPS_TS_REJECT` | consultant login | sheet id, flags acknowledged, comment length |
| `OPS_TS_CORRECT` | consultant login | old id → new id, reason |
| `OPS_TS_ATTACH`, `OPS_TS_ATTACH_DELETE`, `OPS_TS_OCR_READ`, `OPS_TS_PROOF_WAIVED`, `OPS_TS_PROOF_REFUSED` | consultant login | attachment id, bytes, ocr summary / refusal kinds only |
| `OPS_READ_SHEET` (approver opening another person's sheet) | consultant login | daily-collapsed per actor+target |
| `OPS_READ_FINANCE` (profit, payments, invoices) | — | daily-collapsed per actor |
| `OPS_EXPORT` | — | layout, period, row count, file sha256 |
| `OPS_SETTINGS` | — | changed keys |
| `OPS_TS_RETENTION_PURGED` | — | counts only |
| `OPS_INVOICE_*`, `OPS_PAYMENT_*`, `OPS_EXPENSE_*` | — | ids and status, never amounts in details |

Consultants see their own timeline (`ops_timesheet_event`) including "Priya opened this sheet" — the same
transparency rule as the marketer's "what Rahul did" (`marketer-workspace.md` §6).

---

## 9. Exports (record only — we never send anything anywhere; H0.6, H5.x, H6.4)

| layout | content | for |
|---|---|---|
| `GENERIC` CSV | org, consultant (display name + member id), client, placement title, week_start, day, kind, minutes, hours (2 dp), note, status, self_recorded, approved_at, approved_by, proof (Y/N), flags | spreadsheets, audits; the only layout in H0 |
| `PAYROLL` CSV | one row per consultant × week: regular/pto/sick/holiday/unpaid/total hours, pay_type_label, self_recorded, pay_rate + pay_amount (= WORK × pay rate in force; FINANCE export only), approved_at/by | Gusto/ADP/QuickBooks import; provider column presets are H8.5 |
| `BY_CLIENT` CSV | one row per client × consultant × week with WORK hours and bill rate in force (FINANCE only) | vendor invoicing |
| `PDF_PACK` | one page per approved sheet: org, consultant, client, week grid, totals, approval line (who/when/flags acknowledged/self-recorded), proof thumbnails + "Attachment: name (sha256 …)", disclaimer footer; proof files appended when `includeProof` | vendor packs, disputes |
| finance CSVs | invoices, payments, expenses, profit (H6.4) | books |

**Column deny-list:** no layout has — and `OpsExportColumnsDenyListTest` asserts no layout ever gains — a
column containing `ssn`, `itin`, `ein`, `tax`, `routing`, `account`, `iban`, `swift`, `passport`, `visa`,
`i94`, `i9`, `dob`, `birth`, `address` (consultant), `salary`. People are identified by display name +
member id only; the payroll provider maps that on their side.

Rendering: PDFs reuse the Resume Builder's Chromium sidecar (R0.6) through a shared `PdfRenderer`; CSV
streams; async exports (202) follow the account-export job pattern, stored under FileStorage `ops-export`
with lifecycle `org.ops.export_lifecycle_days`, audited per file; UTF-8 with BOM for Excel.

---

## 10. Reminders and quiet hours (H4)

- `OpsReminderJob` hourly: at `reminder_consultant_dow/time` org-local (default `org.ops.reminder_consultant`
  MON 09:00) consultants with an ACTIVE placement and no SUBMITTED/APPROVED sheet for the previous week →
  `OPS_TS_DUE`; at `reminder_approver_dow/time` (`org.ops.reminder_approver` WED 09:00) approvers with ≥ 1
  SUBMITTED → `OPS_TS_PENDING` with the count.
- Quiet hours (`org.notify.quiet_hours_default` 21:00–08:00) delay to the next allowed hour; the O13.3 daily
  org-email cap applies (in-app fallback); idempotency key `(target_member_id, kind, week_start)` → one send
  per week per target, ever.
- Consultant opt-ins (`ops_member_pref`): Friday nudge (`org.ops.reminder_nudge` FRI 16:00); `push_only`.
- Never: reminders to marketers, about other people's sheets, "escalations", or to external parties.

---

## 11. Admin-configured: every number is a dial (H0.2 declares the first keys, H7.3 the full set)

Registry = A5.1 settings (typed, bounded, audited), A5.3 flags, A5.7 feature registry (`timesheets`), B1.1
catalog entitlements. Stories cite the key; the prose above keeps the default for readability.

| key | kind | default | bounds / notes |
|---|---|---|---|
| `flag.ops_timesheets` | flag (A5.3) | off | the v0 module switch; `/api/orgs/*/ops/**` → 404 while off |
| `organization.settings_json.opsPilot` | per-org admin switch | false | v0 pilot gate, HIGH-audited; migrated to an `ADMIN_COMP` grant by H7.1 |
| `ops.enabled` | entitlement | via grant | from `ops-addon-base`; replaces the pilot switch |
| `ops.ocr` | entitlement | **off** (D7) | OCR possible only when on *and* `ops_settings.ocr_enabled` |
| `ops.ai_budget_cents_per_consultant` | entitlement | 50 | OCR pool per period = n × active consultants |
| `ops.storage_bytes_max` | entitlement | 2 GiB | per org, proofs + receipts |
| `ops.attachment_bytes_max` | entitlement | 5 MiB | per file |
| `ai.budget.ops_scan_cents_per_consultant` | setting | 25 | platform safety budget for the identifier scan; counted by the margin guard |
| `org.ops.week_start_default` | setting | 1 (Mon) | 1–7 |
| `org.ops.step_minutes_default` | setting | 15 | 15 / 30 / 60 |
| `org.ops.expected_hours_default` | setting | 40 | 1–80 |
| `org.ops.expected_hours_tolerance_pct` | setting | 10 | 0–50 |
| `org.ops.long_day_hours` | setting | 12 | 8–24 |
| `org.ops.proof_required_default` | setting | true | |
| `org.ops.attachments_per_sheet` | setting | 3 | 1–10 |
| `org.ops.note_max_chars` | setting | 200 | 50–500 |
| `org.ops.reject_comment_max_chars` | setting | 500 | 50–1000 |
| `org.ops.image_max_edge_px` | setting (served via A5.9 config) | 2000 | 1000–4000 |
| `org.ops.ocr_min_confidence` | setting | 0.6 | 0–1 |
| `org.ops.ocr_approved_date_window_days` | setting | 30 | 0–90 |
| `org.ops.refused_hash_cache_days` | setting | 90 | 7–365 |
| `org.ops.export_lifecycle_days` | setting | 7 | 1–30 |
| `org.ops.export_sync_rows_max` | setting | 5 000 | 500–50 000 |
| `org.ops.reminder_consultant` | setting | MON 09:00 | dow + time |
| `org.ops.reminder_approver` | setting | WED 09:00 | dow + time |
| `org.ops.reminder_nudge` | setting | FRI 16:00 | dow + time |
| `org.notify.quiet_hours_default` | setting (O13) | 21:00–08:00 | |
| `org.notify.email_per_member_per_day` | setting (O13.3) | 1 | |
| `org.ops.presence_weeks` | setting | 4 | 1–12 |
| `org.ops.retention_min_years` | setting | 7 | **hard minimum 7**; orgs may only lengthen (D3) |
| `org.ops.holiday_seed` | setting | US_FEDERAL | a registry of lists keyed by country |
| `org.ops.payment_terms_days_default` | setting | 30 | 0–120 |
| `org.ops.demo_seed_weeks` | setting | 6 | 1–12 |
| `org.ops.pilot_target_seconds` | setting | 45 | the measured bar (H8.3) |
| `ops-addon-base`, `ops-addon-consultant` | catalog items | **no price** (D2) | admin publishes behind the 80 % floor; "$99 + $4" in the proposal is a worked example only |

Namespace note: platform-ops settings already use `ops.*` (`ops.maintenance`, `ops.error_digest.*`);
this product's **settings** are `org.ops.*` and its **entitlements** are `ops.*` (a different registry). H7.3
registers them; `RoadmapSettingsParityTest` (A5.1) keeps this table and the registry in sync.

---

## 12. Privacy, consent, retention, erasure (H7.2, H8.1)

- **Lawful basis is the engagement contract** (GDPR Art. 6(1)(b)) for hours/proof; the org is the
  controller of its timesheet records, Kiwiply the processor (org terms, O14.5). The first-run screen
  (§3.5) is information (Art. 13), not a consent gate the consultant could decline and still be paid; we
  do not pretend otherwise. `data_share` scope **does not** gate timesheets; timesheet endpoints never read
  `application`, `resume`, `inbox_*` or `field_cache` (static test).
- **Retention:** `ops.retention` weekly; purge sheets, entries, events, attachments and money rows older
  than `ops_settings.retention_years` (≥ `org.ops.retention_min_years`, 7) from `week_start` / record date
  **only** when the org is CLOSED or the placement ended more than `retention_years` ago; attachments
  deleted through the seam + ledger; audit counts only. (D3 default: anchor = `week_start`.)
- **Erasure:** `consultant_member_id` points at an `ERASED` membership ("Former consultant #id"); sheets,
  entries, attachments and events stay (Art. 17(3)(b)); `actor_login` strings stay; notes stay (org record);
  prefs and consent events are deleted.
- **Account export** gains `timesheets[]` with proof files under `ops/`; the data map (T1.1) gains the
  `ops_*` classes and retention class.
- Proof files may contain third-party names (client approver). We store only files that passed the scan,
  never index them, and never show them to marketers.
- External parties (client managers, vendors) never get a login or a link (D4).

---

## 13. Old ids → new ids (the O11 → H mapping; the only place the old ids appear)

The Consultancy Ops epic and its fourteen stories were removed from `docs/roadmap/areas/org.json` on
2026-10-11 and re-planned here. References in other areas (`org.json` O4.8/O10.12, `trust.json` T1.1,
RECONCILIATION, PROPOSAL, PLAN/AUDIT-org, competitive docs) were re-pointed.

| old (org.json) | now | note |
|---|---|---|
| O11 (epic) | product area **H**, epics H0–H8 | all P2 (D10) |
| O11.1 spec sign-off + FINANCE wiring + ops_settings + pilot gate | **H0.2** | the sign-off itself is `H-design` (done) |
| O11.2 clients + placements-lite + rate history | **H0.3** (placements-lite) · **H1.1** (vendors, rates) · **H1.2** (holidays, lifecycle) · **H1.3** (UI) · **H1.4** (marketer presence) | |
| O11.3 timesheets core | **H0.4** (v0 core) · **H2.1** (day kinds, prefill) · **H2.2** (flags) · **H2.3** (withdraw/correct/locks) | |
| O11.4 reminders | **H4.1** (kinds) · **H4.2** (job) · **H4.3** (prefs) | |
| O11.5 invoice records | **H6.2** (+ schema in **H6.1**) | |
| O11.6 payments / expenses | **H6.3** (+ **H6.1**) | |
| O11.7 profit view + exports | **H6.4** · **H6.5** (UI) | |
| O11.8 add-on billing | **H7.1** | |
| O11.9 retention + erasure + disclaimer | **H7.2** · Disclaimer component → **H5.3** | |
| O11.10 proof attachments + OCR | **H3.2** (attachments) · **H3.4** (OCR) · **H3.5** (UX) | |
| O11.11 consultant week view + approver inbox | **H0.5** (v0) · **H2.4** (week view) · **H3.6** (inbox) · analytics → **H8.3** | |
| O11.12 exports | **H0.6** (GENERIC v0) · **H5.1** · **H5.2** · **H5.3** | |
| O11.13 pilot gate + demo seed + first-run + metrics | pilot gate → **H0.2** · **H8.1** (first-run) · **H8.2** (demo) · **H8.3** (metrics) | |
| O11.14 never-collected gate | **H3.1** (validator + build gate) · **H3.3** (proof scan) · doc↔code tests → **H7.4** | |

---

## 14. Rollout and the pilot

1. `flag.ops_timesheets` off in prod until H0.7 is green; `/api/orgs/*/ops/**` → 404 while off.
2. **Pilot gate (v0):** platform admin sets `opsPilot` for 2–3 consultancies from `/admin/ops` (HIGH,
   audited); the add-on is **free during the pilot** (no Stripe item); H7.1 replaces the switch with the
   catalog entitlement and migrates pilot orgs to an `ADMIN_COMP` grant.
3. Demo org `demo-consultancy` (H8.2) so the sales demo and screenshots are real.
4. Phone first: the consultant surface ships inside the user web app (`/timesheets`), PWA-installable,
   before any org-console polish; the approver inbox ships in the org console with the "More → Timesheets"
   bottom-tab entry (O15.1).
5. **Pilot review checklist (H8.3 decides these defaults):** `ts.median_seconds_to_submit` vs
   `org.ops.pilot_target_seconds` → whether to simplify the day sheet further; `ts.proof_rate` → whether
   `proof_required_default` stays true; `ts.approved_48h_rate` + `ts.one_tap_rate` → reminder days and
   tolerance; OCR accuracy on read-on-tap → whether `ocr_auto_read` may default on for orgs with OCR;
   refusal rate → whether the crop helper (D12) is built; pilot interviews replace the second-hand
   competitive quotes in §17.

---

## 15. Tests (named by story; the suites an implementer must add)

- `TimesheetsSchemaIT`, `TimesheetsMoneySchemaIT` — every entity inserts/reads; `live_key` uniqueness.
- `OpsRoleMatrixTest` — every role × every permission; MARKETER presence-only; consultant own-only (404);
  STAFF/MEMBER-without-placement 404; platform admin 404.
- `OpsGateTest` — flag off 404; pilot 200; no pilot 402; entitlement path; comp grant.
- `OpsTimesheetStateTest` — every transition in §4.1 incl. withdraw, reject→draft, correction chain, locked
  supersede, concurrent create, self-approval vs `approval_required=false`.
- `OpsWeekCalendarTest` — week_start by org timezone, DST, Monday/Sunday starts.
- `OpsPrefillTest`, `OpsEntryValidationTest`, `OpsFlagsTest` (table-driven over §7), `OpsApproveTest`.
- `OpsPayVisibilityTest` — bill rate absent from every consultant/marketer DTO by class; pay only with the switch.
- `OpsAttachmentIT` (local driver) — caps at exact boundaries, sniffing, DRAFT-only delete, proxied download,
  temp cleanup on refusal, usage rebuilt from the ledger.
- `OpsProofScanIT` — accepted hours-only fixtures; printed-SSN PDF refused with nothing stored; image refused
  via stub classifier; budget-exhausted image refused with the PDF alternative; refused-sha short-circuit; purge.
- `OpsOcrTest` — never runs when disabled (default); schema rejection; budget exhausted → SKIPPED + flag;
  apply-ocr DRAFT-only.
- `SensitiveTextValidatorTest`, **`OpsNeverCollectedTest`** (a–e + meta-test), `OpsNeverCollectedDocTest`,
  `OpsExportColumnsDenyListTest`, `OpsNoJobSearchImportsTest`.
- `OpsReminderJobTest`, `OpsNotifierTest`, `OpsMemberPrefTest`.
- `OpsExportTest` (every layout vs fixtures; FINANCE-only columns absent for others), `OpsExportJobIT`,
  `OpsPdfPackIT` (behind the PDF flag).
- `InvoiceGenerateTest`, `NeedsReissueTest`, `OpsPaymentTest`, `OpsExpenseReceiptIT`, `ProfitViewTest`.
- `OpsQuantityReconcilerTest`, `OpsRetentionJobTest`, `AccountDeletionServiceIT`/`AccountExportServiceIT`
  extended, `DataMapTest` (T1.1) green.
- `OpsAuditDocTest`, `OpsAuditedTest`, `OpsTimelineParityTest`; `OpsConsentTest`; `OpsDemoSeedTest`.
- `OrgIsolationIT` (O1.5) discovers every new route automatically — no wiring.
- Web: vitest for every `packages/ui/src/ops/*` component state; Playwright 390 px (open→submit ≤ 6 taps,
  steppers ≥ 44 px, camera attribute, refusal flow, one-tap absent on flagged rows, bulk count, rejection
  comment required, exports), dark mode, Lighthouse a11y ≥ 95; `web/scripts/ts-smoke.mjs` end to end.

---

## 16. Risks

| risk | mitigation |
|---|---|
| The org model (O1.x) has not started — nothing here can run | H0.1/H0.2 are the first ops stories and depend on O1.1/O1.2/O1.4/O2.2 only; the proposal's §2.2 order (org walking skeleton → H0) stands; do not start H before O1.5 is green |
| Scan false positives block legitimate proofs | document-mode tolerances; the refusal copy says what to crop; the approver can waive proof (audited); crop helper after the pilot (D12) |
| OCR accuracy on photos | suggestion-only, confidence-gated mismatch flag, off by default; pilot decides auto-read |
| Storage on the shared box fills (proofs are user data now) | `FileStorage` local driver with min-free guard (P5.2), org caps, nightly usage rebuild, backups cover `/srv/uploads` (plat) |
| A consultant uploads the wrong PDF (passport, I-9) | the scan refuses before storage; nothing but kinds is logged |
| One-person shops cannot approve their own hours | D9 `approval_required=false` with the self-recorded badge on every surface and export |
| Corrections after invoicing hide errors | never blocked; the invoice is flagged `needs_reissue`, both versions stay readable |
| Budget keys collide with platform `ops.*` settings | entitlements are `ops.*`, settings are `org.ops.*` (§11 note); H7.3 registers both |
| Legal wording of the disclaimer | marked `pending legal review` until the trust area confirms (T3.x) |
| Clockify is cheaper for 10 generic users | we sell proof + flags + the consultant already living in Kiwiply; the price is set in admin after the pilot, never in code |

---

## 17. Competitive — how we beat what consultancies use today (checked 2026-10-11)

| tool | what it is / price | what consultants and approvers hit | our move |
|---|---|---|---|
| **Ceipal WorkForce** | staffing HRMS/timesheets; ~$4/user/mo with a 25-user minimum, or tiers ≈ $73–140/mo ([Capterra](https://www.capterra.com/p/144016/CEIPAL-Workforce/alternatives/), [Fitgap](https://us.fitgap.com/products/030570/ceipal-workforce)); G2 4.2 / 29 reviews | "limit on attachment size", "too many tabs and fields", slow at times ([Capterra reviews](https://www.capterra.com/p/144016/CEIPAL-Workforce/reviews?page=3)) | **no minimum seats**; one screen, 44 px steppers; proof is part of the sheet and travels to the invoice line (H6.2) |
| **JobDiva + MyTime app** | ATS with timesheets; custom pricing; MyTime iOS **2.4★ from 18 ratings** ([App Store](https://apps.apple.com/app/id823857384)) | the consultant-facing app is the weakest part of the suite | the consultant surface is the *first* thing we build and the thing we measure (≤ 45 s median); PWA, no app-store gate |
| **Bullhorn Time & Expense** | pay/bill for staffing; quote-based; 4.1 / 7 reviews ([Capterra](https://www.capterra.com/p/40568/Peoplenet-Time/)); payroll workflow needs perfect placement data first ([Bullhorn KB](https://kb.bullhorn.com/bhone/Content/BH1/Topics/payrollWorkflowBestPractices.htm)) | enterprise setup; needs Bullhorn ATS | zero-setup placements (consultant + client + date), rates optional until finance needs them |
| **SAP Fieldglass / Beeline (client VMS)** | the *client's* system; rejections and locked sheets need the program office ([Beeline guide](https://www.kellytelecom.com/wp-content/uploads/2022/07/Crown-Castle-Worker-QRG_20190522_v1-1.pdf), [SAP KB](https://userapps.support.sap.com/sap/support/knowledge/en/3756050)); Beeline admits desktop-only entry is "inconvenient" ([Beeline mobile](https://www.beeline.com/resources/beeline-mobile-apps)) | double entry: the consultant repeats the week for the consultancy | we are the *second copy done right*: photo/PDF of the approved VMS sheet → (optional) OCR → confirm → done |
| **Avionté (BOLD)** | staffing platform; 3.9 / 74 reviews, admin "complex" ([SoftwareFinder](https://softwarefinder.com/hr/avionte/reviews)) | legacy + web split; long procedures | one module, one state machine, one screen per persona |
| **QuickBooks Time** | $20 base + $10/user (Premium) ([Intuit](https://quickbooks.intuit.com/time-tracking/pricing/)) | built for shifts/GPS clock-ins; no proof concept | weekly sheet + proof + mismatch, priced per *active* consultant |
| **Harvest** | $11/seat; **approvals only on Enterprise $17.50/seat** ([Harvest](https://www.getharvest.com/pricing)) | approvals are an enterprise upsell | approvals included at every size |
| **Toggl Track** | approvals only on Premium **$24/user** ([Toggl](https://toggl.com/track/pricing/)) | timers, not placements; no proof | same |
| **Clockify** | approvals from Standard $6.99/user; free capped at 5 users ([Clockify](https://clockify.me/pricing)) | generic; invoicing customisation limited | for 10 consultants Clockify Standard ≈ $70/mo; we cost more and must earn it with proof, OCR, flags, bill/pay/profit and the consultant already living in Kiwiply |
| **Zoho People / Invoice** | "client approval" feature; approvers must log in to the portal ([Zoho](https://help.zoho.com/portal/en/community/topic/obtaining-timesheet-approval-from-a-client-witho9ut-logging-into-portal?page=1)) | split across products | one-tap approve in the inbox; the *client* approved elsewhere — we never ask them to log in |
| **Conrep / bench-sales CRMs** | vendor-side; sub-vendor invoices from approved hours ([Conrep](https://conrep.notion.site/AP-Invoice-Workflow-e0d8d6d3648944c380fe433514c0b671)) | the consultant has no login and no view | the consultant sees their own sheets, timeline, who opened them, and can export — the honest version |
| **Timesheet-OCR vendors** (Lido, Nanonets, Affinda) | standalone extraction to Excel ([Lido](https://lido.app/blog/best-timesheet-ocr-software)) | separate tool, separate export | OCR inside the sheet, budget-bounded, always a suggestion — and the only tool that *refuses* a page carrying an identifier |

Reddit threads (r/h1b, r/cscareerquestions) were not retrievable on 2026-10-11; consultant-side pain points
above come from vendor guides, app-store ratings and review sites. Pilot interviews (§14.5) replace them.

**The five moves, in order of weight:**
1. **30-second weekly entry on a phone** — prefilled, 44 px steppers, one submit.
2. **Proof as part of the sheet + mismatch flag (+ optional OCR)** — nobody re-keys; disputes have a record.
3. **Approver one-tap / bulk for clean sheets, forced look for flagged ones** — speed without blind approval.
4. **Zero-setup, no minimums, never collects identifiers** — a 5-consultant shop is live in minutes and
   cannot be handed an SSN.
5. **Honest to the consultant** — own history, who looked, export any time, pay shown when the org allows.

---

## 18. Open questions for the user (only these; defaults apply until answered — see TIMESHEETS-DECISIONS.md)

1. **Retention anchor (D3):** 7 years from `week_start` (default) vs 7 years after the org closes.
2. **Marketer presence (D6):** presence only (default) vs nothing at all.
3. **Submit-for (D8):** allowed for leavers/ended placements with audit (default) vs never.
4. **One-person shops (D9):** `approval_required=false` + self-recorded badge (default) vs require a second admin.
5. **Proof scan (D11):** mandatory platform-paid scan with refusal (default) vs scan only when OCR is on vs attestation checkbox.
6. **Entitlement key namespace:** keep `ops.*` for entitlements beside the platform's `ops.*` settings (default, two registries) or rename to `timesheets.*` before H7.1 seeds the catalog.
7. **Disclaimer wording** — needs the trust area's lawyer pass before public launch (not before the pilot).

---

## 19. Non-goals (now and until a new brainstorm)
Sending invoices by email, payroll, payments to anyone, bank/ACH details, tax forms (W-2/1099),
QuickBooks/Gusto sync (exports are shaped so a later sync is a mapping, not a redesign), multi-currency per
placement, approval chains, client or vendor logins/links (D4), auto-apply of OCR results, timers/GPS
clock-ins, projects/cost codes, a personal-scope variant for solo contractors (D1), AI anywhere in money records.
