# Consultancy Ops add-on — timesheets and finances, the 23.0 outcome (stories O11.*)

> Status: **LOCKED 2026-10-11 — D1 (org add-on only), D2 (priced later in admin), D7 (OCR optional,
> off by default) and D10 (O11 stays P2) decided by the user; D3–D6, D8, D9, D11, D12 = recommended
> defaults, user may override** (task 23.0; answers recorded in `docs/roadmap/PROPOSAL-timesheets.md`).
> **Timesheets are the first slice and have their own in-depth design: `timesheets.md`** (UX, state
> machine, tables, API, OCR, flags, reminders, export, tests, competitive). This file keeps the add-on-wide
> decisions and the money side (placements/rates, invoices, payments, expenses, profit) that follows
> timesheets.
> Locked boundaries from `ROADMAP.md` Phase 23 and `CLAUDE.md`: record money, never move it; no bank
> numbers/SSNs/tax IDs; finance visible to OWNER/ADMIN/FINANCE only; not tax/legal advice; everything
> exports; Marketer never submits or signs in as a consultant. **Everything else is admin-configured**
> (user decision 2026-10-11): attachment size / count / org storage, OCR on-off and its budget, the scan
> budget, retention minimum, reminder times, flag tolerances and the prices are catalog values or
> settings with the defaults named below — never code constants.
> Price: **set later from the admin catalog** (items `ops-addon-base` per org per month +
> `ops-addon-consultant` per active consultant per month; no number is locked here — the "$99 + $4" draft
> in the proposal is a worked example for the margin guard). Pilot orgs run free behind an admin switch.

## 0. Changelog vs the first draft (2026-10-11, same day)

| # | changed | was | now | why |
|---|---|---|---|---|
| C1 | Build order | placements → timesheets → invoices → profit, all P2 | **timesheets first** (O11.1, O11.2-lite, O11.3, O11.14, O11.10–O11.13, O11.4), then rates/invoices/payments/profit; O11 **stays P2** (decision D10) — the order is expressed as story deps, not priority | user: "time sheets will be next step"; D10 answered 2026-10-11 |
| C2 | OCR | "No AI, no OCR of timesheets" | **optional, budgeted OCR of the client-approved proof, off by default** (decision D7: entitlement `ops.ocr` default off, `ops_settings.ocr_enabled` default false; budget entitlement `ops.ai_budget_cents_per_consultant`, default 50 ¢ per active consultant per period, pooled; suggestion only, never auto-applied) | the double-entry pain is the #1 thing to beat (`timesheets.md` §0, §15) |
| C15 | Numbers | caps, budgets, prices and times written as constants | **every number is a setting, entitlement or catalog value with a default** (user decision 2026-10-11: everything is admin-configured); pricing not set in the roadmap (D2) | `CLAUDE.md` Expansion rule; `runtime-settings-feature-flags.md` §9 |
| C3 | Attachments | "served via short-lived presigned URLs (existing S3 pattern)" | **through the `FileStorage` seam, local driver first, proxied downloads, no presigned URLs** | `docs/design/plat/file-storage-seam.md` D1/§5 (Option A locked) |
| C4 | Timesheet tables | `ops_timesheet`, `ops_timesheet_entry`, `ops_timesheet_attachment` here | moved to `timesheets.md` §5 with day kinds, flags, proof state, events, holidays, `ops_settings`, `ops_placement_rate` | depth |
| C5 | Settings | `showPayToConsultant` etc. in `organization.settings_json` | dedicated `ops_settings` row | typed, FINANCE-gated, many fields |
| C6 | Rates | `bill_rate_minor`/`pay_rate_minor` columns on `ops_placement` | `ops_placement_rate` with `effective_from`, both nullable in v0 | mid-placement rate changes; timesheets must work before finance fills money |
| C7 | Timesheet states | `DRAFT → SUBMITTED → APPROVED \| REJECTED` + `supersedes_id` | `DRAFT → SUBMITTED → APPROVED → SUPERSEDED`; reject returns to DRAFT with the comment; `locked_reason=INVOICED`; corrections of invoiced sheets flag the invoice `needs_reissue` | corrections after invoicing are real; blocking them hides errors |
| C8 | Marketer | "sees nothing financial" | sees **presence only** for paired consultants (placement client + submitted/missing), never minutes/rates/proof | bench-vs-placed is their job; hours are not (decision D6) |
| C9 | Consent | not addressed | first-run information screen, versioned text, `ops_consent_event`; `data_share` scope does not gate timesheets | `timesheets.md` §8 |
| C10 | Reminders | Mon consultants / Wed approvers | same, plus quiet hours, O13.3 daily cap, idempotency per week, consultant Friday opt-in, never to marketers | etiquette rules already locked for orgs |
| C11 | Export | CSV/PDF "export everything" | layouts `GENERIC`, `PAYROLL`, `BY_CLIENT`, `PDF_PACK` with proof pages; consultant self-export | payroll/invoicing hand-off is the point (decision D5) |
| C12 | Retention | 7 years after the org closes | 7 years from `week_start` / money record date, org can only lengthen; purge only when org CLOSED or placement ended > 7 y | simpler and defensible |
| C14 | PII boundary | "no bank numbers/SSNs/tax IDs" stored; attachments "not scanned" | **never collected** — extended to ITIN, routing/account numbers, passport/visa/I-9/I-94/document numbers, DOB, consultant home address; no field anywhere; every free-text field validated; export column deny-list; proof uploads scanned for identifiers **before storage and refused**; `OpsNeverCollectedTest` build gate (O11.14) | user rule restated 2026-10-11: "we don't take any of those" — product-wide, not only Ops |
| C13 | Pilot path | add-on gated by catalog entitlement (Phase 18) | v0 gate `organization.settings_json.opsPilot` set by platform admin, free pilot, migrated to a comped grant when O3.2 lands | Phase 18 must not block timesheets |

## 1. Scope decisions (23.0)

1. **In, in this order:** (a) **timesheets** — placements-lite, weekly sheets with proof upload, flags,
   one-tap approval, reminders, exports, optional OCR (`timesheets.md`); (b) **rates** per placement with
   effective dates (bill, pay, pay-type label); (c) **client invoice records** generated from approved
   hours (PDF, never sent by us); (d) **payments** received/made and **expenses**, recorded by hand;
   (e) **profit view** and finance exports.
2. **Out (now and until a new brainstorm):** sending invoices by email, payroll, payments to anyone,
   bank/ACH details, tax forms (W-2/1099), QuickBooks/Gusto sync (exports are shaped so a later sync is a
   mapping, not a redesign), multi-currency per placement (one currency per org), approval chains, client
   or vendor logins/links (decision D4), auto-apply of OCR results.
3. **Roles:** `FINANCE` role added (`tenant-model.md` §4). Consultants see only their own hours, proof,
   flags and timeline, and — only if `ops_settings.show_pay_to_consultant=true` — their own pay rate and
   pay totals. Marketers see presence only. Bill rates, vendor chains, margins and profit are never
   visible to consultants or marketers.
4. **Retention 7 years** (C12). Erasing a consultant anonymises the person (`ERASED` membership) and keeps
   hours/amounts under "Former consultant #id" (GDPR Art. 17(3)(b)).
5. **AI:** only the OCR of proof files — **optional and off by default** (D7) — bounded by entitlement
   `ops.ai_budget_cents_per_consultant` (default 50) pooled per org, through the AI gateway with the Ops
   grant as budget owner; plus the mandatory, platform-paid identifier scan (setting
   `ai.budget.ops_scan_cents_per_consultant`, default 25). No AI anywhere in money records.
6. **Disclaimer** on every finance screen and export footer: "Records you entered. Not tax, legal or
   accounting advice." Lawyer wording confirmed with 20.5.
7. **Money as integer minor units + one org currency**; hours as minutes; rates as minor units per hour.
   No floats anywhere. Pay amounts for PTO/SICK/HOLIDAY minutes are **not** computed by us (the org's
   policy); only WORK minutes × rate.
8. **Zero-setup:** no projects, cost codes, templates or approval rules. A placement is consultant +
   client + start date; everything else is optional.

## 2. Data model

Timesheet-slice tables (`ops_settings`, `ops_client`, `ops_vendor`, `ops_placement`, `ops_placement_rate`,
`ops_timesheet`, `ops_timesheet_entry`, `ops_timesheet_attachment`, `ops_timesheet_event`, `ops_holiday`,
`ops_storage_usage`, `ops_consent_event`, `ops_member_pref`): **`timesheets.md` §5**, changelog
`20261011070000_ops_timesheets.xml`.

Money-slice tables (`20261011080000_ops_money.xml`, all `org_id` first, FINANCE-gated):

| table | columns |
|---|---|
| `ops_client` additions | `address_text VARCHAR(300)`, `payment_terms_days INT DEFAULT 30`, `invoice_email VARCHAR(254)` (business contact; for the org's own sending, we never send) |
| `ops_invoice` | id, org_id, client_id, number VARCHAR(30) (org prefix + sequence), status (DRAFT\|ISSUED\|PARTIALLY_PAID\|PAID\|VOID), issue_date, due_date, currency, subtotal_minor, tax_minor (entered, not computed), total_minor, paid_minor (derived), pdf_key (FileStorage), needs_reissue BOOLEAN DEFAULT false (set when a referenced timesheet is superseded), notes, created_at |
| `ops_invoice_line` | id, invoice_id, placement_id, timesheet_id NULL, description, minutes, rate_minor (the `ops_placement_rate` in force for `week_start`), amount_minor, proof_note VARCHAR(120) NULL ("approved 2026-10-10 by J. Lee", from `ocr_json` when present) |
| `ops_payment` | id, org_id, direction (IN\|OUT), counterparty_kind (CLIENT\|CONSULTANT\|VENDOR\|OTHER), counterparty_id NULL, invoice_id NULL, placement_id NULL, amount_minor, paid_on DATE, method_label VARCHAR(30) ("ACH", "check" — a label), reference VARCHAR(80) (memo; sensitive-text validated), notes |
| `ops_expense` | id, org_id, placement_id NULL, consultant_member_id NULL, category VARCHAR(30), amount_minor, spent_on, receipt_key NULL (FileStorage, ≤ 5 MB, counts toward the 2 GB), notes |

### 2.1 Never collected (product-wide rule; the add-on's hard boundary)

| class | examples | rule across placements, consultants, approvers, clients/vendors, attachments, exports, OCR |
|---|---|---|
| Government identifiers | SSN, ITIN, EIN, personal tax ids | no column anywhere; `@NoSensitiveText` on every String field (422 `SENSITIVE_TEXT`); OCR/scan schemas cannot carry them |
| Bank details | account, routing/ABA, IBAN/SWIFT, card numbers | no column; `ops_payment.reference` is a validated memo, `method_label` an enum |
| Immigration / identity documents | passport, visa, I-94, I-9, driver's licence, national id, permits | no column; `pay_type_label` is an enum (W2/1099/C2C/OTHER); keyword+number rule in the validator |
| Date of birth / age | DOB, born | no column; keyword+date rule |
| Consultant home address | | no field; `ops_client.address_text` is the client's **business** address |
| Proof files / receipts carrying any of the above | printed SSN, bank line on a vendor template | scanned **before storage** (text layer locally; images via a closed classify-only model schema, platform-paid) and **refused** with a specific message; sha256 of refused bytes cached 90 days; no override — `timesheets.md` §5.13 |
| Exports | payroll / invoicing CSV, PDF packs | column deny-list enforced by test; people identified by display name + member id only |

Client and vendor records hold **business name, one business contact (name, email), business address,
payment terms, rates** — nothing about a person's identity. Enforced at build time by
`OpsNeverCollectedTest` (schema column deny-list, DTO reflection, export registry, OCR/scan schemas,
enum-only labels) — story O11.14. Validator detail: `timesheets.md` §5.12.

## 3. State machines

Timesheet: `timesheets.md` §4 (`DRAFT → SUBMITTED → APPROVED → SUPERSEDED`; reject → DRAFT with comment;
withdraw; corrections supersede; `locked_reason=INVOICED`).

Invoice: `DRAFT → ISSUED → PARTIALLY_PAID → PAID`; `VOID` from DRAFT/ISSUED. `paid_minor` = Σ linked
`ops_payment IN` rows (recomputed on write). "Issued" means the org marked it sent — Kiwiply never sends;
the PDF is downloaded and sent by the org. A superseded timesheet on an ISSUED invoice sets
`needs_reissue=true` and shows the delta; finance voids and regenerates (the new invoice carries
"replaces ACME-0007").

Reminders: `timesheets.md` §9.

## 4. Profit view (FINANCE)
Per consultant / client / month: `billed = Σ approved WORK minutes × bill rate in force` (or issued
invoice lines), `pay_expected = Σ approved WORK minutes × pay rate in force`, `pay_actual = Σ ops_payment
OUT`, `expenses`, `gross = billed − pay_expected − expenses`, `margin % = gross ÷ billed`, `outstanding =
Σ issued − paid`, `unapproved_hours`, `unproofed_hours` (approved with `PROOF_WAIVED`). Computed on read
with the `(org_id, placement_id, week_start)` index; orgs are small (≤ hundreds of consultants).

## 5. API

Timesheet slice: `timesheets.md` §6 (`/api/orgs/{id}/ops/settings|holidays|clients|placements|timesheets|
export/timesheets|presence`).

Money slice (all under `/api/orgs/{id}/ops/**`, `@OrgPermissionRequired(ops.finance)`):
```
POST /ops/invoices/generate {clientId, from, to} → DRAFT from approved, uninvoiced sheets (locks them) ; PATCH ; POST /{id}/issue ; /void ; GET /{id}/pdf
POST /ops/payments ; GET ?direction&from&to&counterpartyKind
POST /ops/expenses ; GET ; receipts via FileStorage (same limits as proofs)
GET  /ops/profit?by=consultant|client|month&from&to
POST /ops/export {what: invoices|payments|expenses|profit, from, to} → CSV (audited OPS_EXPORT)
```

## 6. Flows (390 px)

Consultant week view, proof upload, approver inbox and history: `timesheets.md` §3. Finance screens:

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

## 7. Billing of the add-on
**Decision D2 (user, 2026-10-11): priced later from the admin catalog — no price is locked here.** Catalog
items, shape only: `ops-addon-base` (per org per month, `SEAT` kind with quantity 1) and
`ops-addon-consultant` (per active consultant per month). "Active consultant" = a consultant member with
≥ 1 `ops_placement.status=ACTIVE` during the period; `OrgSeatReconciler` sets the quantity nightly
(the one place quantity is derived, `billing.md` §3.3). Entitlement keys and catalog defaults: `ops.enabled`,
`ops.ocr` (default off, D7), `ops.ai_budget_cents_per_consultant` (default 50), `ops.storage_bytes_max`
(default 2 GB), `ops.attachment_bytes_max` (default 5 MB). Margin: the guard runs at publish against the
price admin enters — base line fee-only; consultant line worst case = OCR budget + scan budget + fee share
(`fee-model-and-margin-guard.md`); the proposal's "$99 + $4" is a worked example that clears the floor, not a
value. Pilot orgs: free via the admin switch (`flag.ops_timesheets` + `opsPilot`), later a comped grant (C13).

## 8. Privacy & security
- FINANCE rows are the most sensitive org data: every read of `/ops/profit`, `/ops/payments`, invoices is
  audited (`OPS_READ_FINANCE`, daily-collapsed per actor), every export audited per file.
- Consultant pay visibility is an org setting defaulting **off**; when on, the consultant sees only their
  own pay rate/totals, never bill rates.
- Attachments, receipts, invoice PDFs and export files live behind `FileStorage` (local driver, proxied,
  `Content-Disposition: attachment`, sniffed at the seam); no presigned URLs.
- Never collected (§2.1): no fields for SSN/ITIN, EIN/tax ids, bank/routing numbers, passport/visa/
  document numbers, DOB or home address exist; free text validated; proof files and receipts refused
  before storage when they carry one; exports have no such columns; the UI never asks.
- Consultant first-run information screen and erasure: `timesheets.md` §8.
- External parties (client managers, vendors) never get a login or a link (D4).

## 9. Tests
Timesheet slice: `timesheets.md` §14. Money slice: `InvoiceGenerateTest` (approved+uninvoiced only,
rate in force per week, totals in minor units, locks sheets), `NeedsReissueTest` (supersede →
flag → void/regenerate), `PaidDerivationTest`, `ProfitViewTest` (fixture book incl. unproofed hours),
`SensitiveTextValidatorTest` (SSN/EIN/IBAN rejected on every field), `OpsQuantityReconcilerTest`
(active consultants count), `OpsFinanceAuditTest` (reads collapsed daily, exports per file), web:
finance home and invoice draft at 390 px, disclaimer present on every finance screen and PDF footer.
