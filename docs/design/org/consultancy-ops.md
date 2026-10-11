# Consultancy Ops add-on — timesheets and finances, the 23.0 outcome (stories O11.*)

> Status: design, 2026-10-11 — this document **is** the Phase 23.0 brainstorm outcome, proposed as
> the locked spec; the user confirms the four open points in `PLAN-org.md`. Locked boundaries from
> `ROADMAP.md` Phase 23: record money, never move it; no bank numbers/SSNs/tax IDs; finance visible to
> OWNER/ADMIN/FINANCE only; not tax/legal advice; everything exports; no AI; attachments 5 MB / 2 GB per org.
> Price (proposed, confirm): **$99 per org per month + $4 per active consultant per month**.

## 1. Scope decisions (23.0)

1. **In:** placements (consultant × end client × optional vendor chain × dates × bill rate × pay
   rate × pay-type *label*), weekly timesheets with approve/reject and an optional client-approved
   attachment, client invoice **records** generated from approved hours (PDF, not sent), payments
   received/made and expenses **recorded by hand**, a profit view, CSV/PDF export, reminders.
2. **Out (now and until a new brainstorm):** sending invoices by email, payroll, payments to anyone,
   bank/ACH details, tax forms (W-2/1099 generation), QuickBooks/Gusto sync, multi-currency per
   placement (one currency per org), approvals beyond one step.
3. **Roles:** `FINANCE` role added (`tenant-model.md` §4). Consultants see only their own hours and
   — only if `settings.showPayToConsultant=true` — their own pay rate and pay totals. Marketers see
   nothing financial unless also `FINANCE`. Bill rates and profit are never visible to consultants.
4. **Retention 7 years** for `ops_*` money records after the org closes (configurable upward, not
   below 7); timesheet attachments 7 years too (they support invoices). Erasing a consultant's
   account anonymises the person (`ERASED` membership) but keeps the hours/amounts under "Former
   consultant #id" — a financial record of the org, not profile data of the person (GDPR Art. 17(3)(b)).
5. **No AI**, no OCR of timesheets, no bank feeds: ~95 % margin stands; the guard treats the price
   as Stripe-only cost.
6. **Disclaimer** on every finance screen and export footer: "Records you entered. Not tax, legal or
   accounting advice." Lawyer wording to confirm with 20.5.
7. **Money as integer minor units + one org currency**; hours as minutes; rates as minor units per
   hour. No floats anywhere.

## 2. Data model (`20261011070000_ops.xml`, all tables `org_id` first, FINANCE-gated)

| table | columns |
|---|---|
| `ops_client` | id, org_id, name, contact_name, contact_email (business contact only), address_text, payment_terms_days INT (30), notes, archived_at |
| `ops_vendor` | id, org_id, name, notes (the middle layer in C2C chains; optional) |
| `ops_placement` | id, org_id, consultant_member_id, client_id, vendor_id NULL, title, start_date, end_date NULL, bill_rate_minor INT (per hour, what the client pays), pay_rate_minor INT (what the consultant gets), pay_type_label VARCHAR(10) (W2\|1099\|C2C\|OTHER — label only), hours_per_week_expected INT NULL, status (ACTIVE\|ENDED\|ON_HOLD), notes, created_at |
| `ops_timesheet` | id, org_id, placement_id, consultant_member_id, week_start DATE (org's week start, Monday default), status (DRAFT\|SUBMITTED\|APPROVED\|REJECTED), total_minutes INT, submitted_at, decided_at, decided_by_member_id, decision_comment VARCHAR(500), unique (placement_id, week_start) |
| `ops_timesheet_entry` | id, timesheet_id, day DATE, minutes INT (0–1440), note VARCHAR(200) |
| `ops_timesheet_attachment` | id, timesheet_id, s3_key, file_name, bytes (≤5 MB), content_type (pdf/png/jpg), uploaded_by_member_id, created_at |
| `ops_invoice` | id, org_id, client_id, number VARCHAR(30) (org prefix + sequence), status (DRAFT\|ISSUED\|PARTIALLY_PAID\|PAID\|VOID), issue_date, due_date, currency, subtotal_minor, tax_minor (entered, not computed), total_minor, paid_minor, pdf_key, notes, created_at |
| `ops_invoice_line` | id, invoice_id, placement_id, timesheet_id NULL, description, minutes, rate_minor, amount_minor |
| `ops_payment` | id, org_id, direction (IN\|OUT), counterparty_kind (CLIENT\|CONSULTANT\|VENDOR\|OTHER), counterparty_id NULL, invoice_id NULL, placement_id NULL, amount_minor, paid_on DATE, method_label VARCHAR(30) (free label: "ACH", "check"), reference VARCHAR(80) (a memo, never an account number — validated), notes |
| `ops_expense` | id, org_id, placement_id NULL, consultant_member_id NULL, category VARCHAR(30), amount_minor, spent_on, receipt_key NULL (≤5 MB), notes |
| `ops_storage_usage` | org_id PK, bytes BIGINT (cap 2 GB enforced on upload) |

Validation that protects the boundary: any free-text field rejects strings matching SSN
(`\b\d{3}-\d{2}-\d{4}\b`), EIN (`\b\d{2}-\d{7}\b`), IBAN, or 9+ consecutive digits with a message
"Don't store account or tax numbers here." Attachments are not scanned (we are not reading them).

## 3. State machines

Timesheet: `DRAFT → SUBMITTED → APPROVED | REJECTED(→ DRAFT with comment)`; APPROVED timesheets are
immutable; a correction = a new timesheet row for the same week with `supersedes_id` (added column) and
the invoice line points at the newest. Reminder: Monday 09:00 org-local to consultants with a
missing previous week (one push/email, respects quiet hours); Wednesday to approvers with pending.

Invoice: `DRAFT → ISSUED → PARTIALLY_PAID → PAID`; `VOID` from DRAFT/ISSUED. `paid_minor` is the sum
of `ops_payment IN` rows linked to it (derived, recomputed on write). "Issued" means the org marked it
sent — Kiwiply never sends it; the PDF is downloaded and sent by the org.

## 4. Profit view (FINANCE)
Per consultant / client / month: `billed = Σ approved minutes × bill_rate` (or issued invoice
lines), `paid_to_consultant = Σ approved minutes × pay_rate` (expected) vs `Σ ops_payment OUT`
(actual), `expenses`, `gross = billed − paid − expenses`, `margin % = gross ÷ billed`, `outstanding =
Σ issued − paid`, `unapproved_hours`. Computed on read with indexes `(org_id, placement_id,
week_start)`; orgs here are small (≤ hundreds of consultants).

## 5. API (all under `/api/orgs/{id}/ops/**`, permission `ops.*`)
```
clients, vendors, placements: CRUD (OWNER/ADMIN/FINANCE)
GET  /ops/timesheets?week&status&consultantId        (consultant: own only)
POST /ops/timesheets {placementId, weekStart, entries[]} ; PUT /{id} (DRAFT only) ; POST /{id}/submit
POST /ops/timesheets/{id}/approve | /reject {comment}  (ADMIN/FINANCE)
POST /ops/timesheets/{id}/attachments (multipart ≤5 MB; 2 GB org cap → 413 OPS_STORAGE_CAP)
POST /ops/invoices/generate {clientId, from, to} → DRAFT from approved, uninvoiced timesheets ; PATCH ; POST /{id}/issue ; /void ; GET /{id}/pdf
POST /ops/payments ; GET ?direction&from&to
POST /ops/expenses ; GET
GET  /ops/profit?by=consultant|client|month&from&to
POST /ops/export {what: timesheets|invoices|payments|expenses|profit, from, to} → CSV (audited OPS_EXPORT)
GET  /ops/settings ; PATCH {weekStart, currency, invoicePrefix, showPayToConsultant, retentionYears≥7}
```

## 6. Flows (390 px)

```
Consultant · log hours                      Finance · approvals
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ Week of Oct 6 · Acme Corp    │           │ Pending (4)                  │
│ Mon  8h  Tue  8h  Wed  8h    │           │ Aarav · Acme · 40h  [✓][✗]   │
│ Thu  8h  Fri  6h  Sat  –     │           │ Sneha · Globex · 38h [✓][✗]  │
│ Total 38h                    │           │ …                            │
│ [📎 Add client-approved sheet]│          │ Unapproved hours: 156h       │
│ [ Submit for approval ]      │           │ Outstanding invoices: $18,400│
│ (Your pay: hidden by org)    │           │ Not tax or legal advice.     │
└──────────────────────────────┘           └──────────────────────────────┘
```
Hours entry uses big +/− steppers in 15-minute steps (thumb friendly), copies last week with one tap.

## 7. Billing of the add-on
Catalog rows: `ops-addon-base` ($99/org/month, `SEAT`-kind with quantity 1) and
`ops-addon-consultant` ($4/active consultant/month). "Active consultant" = a consultant member with
≥1 `ops_placement.status=ACTIVE` during the period; `OrgSeatReconciler` sets the quantity nightly
(this is the one place quantity is derived, documented in `billing.md` §3.3). Entitlement keys:
`ops.enabled`, `ops.storage_bytes_max=2147483648`, `ops.attachment_bytes_max=5242880`.

## 8. Privacy & security
- FINANCE rows are the most sensitive org data: every read of `/ops/profit`, `/ops/payments`, invoices
  is audited (`OPS_READ_FINANCE`, daily-collapsed per actor), every export audited per file.
- Consultant pay visibility is an org setting defaulting **off**; when on, the consultant sees only
  their own pay rate/totals, never bill rates.
- Attachments served via short-lived presigned URLs (existing S3 pattern for resumes).
- No fields for SSN/EIN/bank exist; free text validated (§2); the UI never asks.
- Erasure: §1.4.

## 9. Tests
`OpsRoleMatrixTest` (consultant sees own only; marketer nothing; FINANCE all), `TimesheetStateTest`
(immutability after approval, supersedes), `InvoiceGenerateTest` (approved+uninvoiced only, totals in
minor units), `PaidDerivationTest`, `ProfitViewTest` (fixture book), `SensitiveTextValidatorTest`
(SSN/EIN/IBAN rejected), `StorageCapTest`, `OpsQuantityReconcilerTest` (active consultants count),
web: steppers at 390 px, approvals list, disclaimer present on every finance screen and PDF footer.
