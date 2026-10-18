# 36 — HR and Finance, record-only (ADR-011; E2 answered 2026-10-12)

> Status: design, 2026-10-12 (Session D). **E2 answered 2026-10-12:** HR = lifecycle records,
> checklists, policy acknowledgements, compliance tasks, **no identity documents**; Finance = rates,
> timesheets, invoice records; **never moves money; no bank, tax-ID, SSN or DOB fields; a PII scanner
> runs on every path.** Build-ready for **X11.1–X11.7**. Reuses: `SensitivePatterns.scan/scanField/redact`
> (classes SSN_ITIN, ROUTING, IBAN, ACCOUNT_NUMBER, TAX_ID, PASSPORT, VISA_DOC, DOB; TS twin in
> `packages/ui/src/sensitive-patterns.ts`), `SensitiveContent.check(path, key, value)` → 422 `SENSITIVE_CONTENT`,
> Timesheets H (`ops_timesheet` approval machine, `ops_invoice` DRAFT→ISSUED→PARTIALLY_PAID→PAID|VOID,
> `ops_payment` IN|OUT records, `ops_expense`, H3.1 `@NoSensitiveText` + `SensitiveTextValidator`,
> H3.3 PDF text-layer scan, H7.2 7-year retention, `OpsNeverCollectedTest`), `org_member`
> (`employment_status` column from X1.2), `org_group` departments/teams, `FileStorage` two-phase upload (H3.2).

## 1. The line we do not cross (both modules)

| never | enforced by |
|---|---|
| identity documents (passport, visa, I-9, EAD, driver's licence, national ID), DOB, SSN/ITIN, bank/routing/IBAN, tax IDs | no column, no DTO field, no upload kind — `HrFinanceNeverCollectedTest` (schema + DTO name deny-list: `ssn, itin, dob, birth, passport, visa, i9, i_9, ead, licen, bank, routing, iban, account_no, tax_id, ein, tin, vat`) |
| free text carrying any of the above | `@NoSensitiveText` on every String DTO field in `web/rest/org/hr/**` and `/finance/**`; `SensitiveContent.check` in services for JSON blobs |
| files carrying any of the above | the **only** uploads are org-authored policy documents (HR) and the H3 proof/receipt paths (Finance, product H). Each is scanned by text layer (`PdfTextScanner`, H3.3) and refused on a hit (`SENSITIVE_CONTENT`), hash recorded in `ops_refused_hash` so a retry is refused instantly |
| moving money | no payment provider, no bank file export, no "pay" verb. `FinanceVerbsTest` enumerates the allowed verbs (`record`, `issue` (= mark sent), `void`, `export`) |
| a Kiwiply mailbox for HR/Finance | notifications are in-app/email to **members** only; invoices are "issued" (marked sent) by the org through its own means |

Retention: HR lifecycle records follow membership retention (anonymised on erasure like
`org_member`); policy acknowledgements are kept as proof (login-keyed strings, like
`data_share_event`); finance mirrors follow H's 7-year rule (D3/H7.2).

## 2. HR — data model (X11.1, X11.2)

### `employment_record`
`id, org_id, member_id, title (80), department_group_id NULL, team_group_id NULL, manager_member_id NULL,
employment_type (20: EMPLOYEE|CONTRACTOR|C2C|INTERN|OTHER), work_location_label (120), start_date,
end_date NULL, status ONBOARDING|ACTIVE|LEAVE|OFFBOARDING|ENDED, status_reason (40), notes (@NoSensitiveText),
updated_by_member_id, created_at, updated_at, effective_from, superseded_by_id NULL` — **effective-dated**:
a change creates a new row and sets `superseded_by_id` on the old (history is a query; nothing
rewritten). `org_member.employment_status` mirrors the current row's status (dual-write, X11.1).

State machine (registered in `PipelineTransitions` under entity `EMPLOYMENT`):

| from | to | actor | permission | effects |
|---|---|---|---|---|
| — | ONBOARDING | HR (`lifecycle.manage`) / SYSTEM on invite accepted when `org.hr.auto_onboard = true` | | checklist instantiated from the ONBOARDING template (§2 `hr_checklist_template`) |
| ONBOARDING | ACTIVE | HR | `lifecycle.manage` | requires all **required** onboarding tasks done (409 `CHECKLIST_INCOMPLETE {open}`) |
| ACTIVE | LEAVE / ACTIVE | HR | | `org_assignment` rows for a marketer on leave → the manager is nudged to delegate (17 §1) |
| ACTIVE / LEAVE | OFFBOARDING | HR | `lifecycle.manage` | OFFBOARDING checklist; licenses: the admin is nudged (Session C's remove-at-period-end), nothing automatic |
| OFFBOARDING | ENDED | HR | `lifecycle.manage` | `end_date`; `org_member` → LEFT/REMOVED via the existing member lifecycle (X4.4) **after** HR confirms; `org_resume` links end (30 §3); assignments end (17) |

### `hr_checklist_template` / `hr_checklist_item_template`
`hr_checklist_template(id, org_id, kind ONBOARDING|OFFBOARDING|COMPLIANCE|CUSTOM, name (80), active, created_by)`;
`hr_checklist_item_template(id, template_id, title (120), description (300), required BOOLEAN, due_days_after_start SMALLINT NULL, assignee_rule SELF|MANAGER|HR|IT_LABEL, policy_id NULL (acknowledge this policy), sort_order)`.
Seeded defaults per org type (CONSULTANCY: "Sign policy: Code of conduct", "Set availability",
"Approve your primary resume", "Connect the extension"…). Item titles pass `@NoSensitiveText`;
templates **cannot** contain upload steps (there is no upload item kind).

### `hr_task`
`id, org_id, member_id, template_item_id NULL, checklist_kind, title (120), description (300), required,
assignee_member_id NULL, due_at, status OPEN|DONE|WAIVED|OVERDUE, done_at, done_by_member_id, waived_reason (120),
policy_id NULL, created_at`. Index `(org_id, member_id, status)`, `(org_id, assignee_member_id, status, due_at)`.
`HrTaskReminderJob` daily → `ORG_HR` to the assignee (grouped) and to HR for overdue.

### `org_policy` / `policy_ack`
`org_policy(id, org_id, key (40), title (120), version (10), file_key NULL (FileStorage, PDF only, ≤ 5 MiB,
text-layer scanned on upload), body_markdown NULL (≤ 20 000 chars, scanned), status DRAFT|PUBLISHED|RETIRED,
requires_ack BOOLEAN, published_at, published_by_member_id)`; new version = new row with the same `key`.
`policy_ack(id, org_id, policy_id, member_login (50), acknowledged_at, ip_hash, user_agent_hash, policy_version)` —
login-keyed, append-only, kept after erasure (proof of acknowledgement, like `data_share_event`).
Acknowledging = `POST /api/me/orgs/{orgId}/policies/{id}/ack` after the member scrolled the document
(client sends `viewedMs`; no e-signature product — a signed PDF is **not** generated).

Compliance tasks = `hr_task` rows with `checklist_kind = COMPLIANCE` from a COMPLIANCE template
(e.g. "Annual security training acknowledged", "Background-check vendor status recorded: PASSED/FAILED/N-A"
as a **label** typed by HR — never a document).

## 3. HR workspace (X11.3)

Pages (template HR_SPECIALIST): Home (onboarding in progress, overdue tasks, policies pending ack,
offboarding), Employees (X4.3 list with the HR columns), Onboarding (per member checklist board),
Documents (= **Policies** only; the nav label reads "Policies" — the requirement's "Documents" page is
narrowed by E2 and the empty state says why: "Kiwiply keeps no identity documents. Policies you
publish live here."), Compliance (tasks by template/member, due dates), Lifecycle (employment_record
history timeline), Offboarding, Reports (headcount by department/type, time-to-onboard, ack rates —
k-anonymity not required: HR sees members by right of role, but consultant *career* data stays
consent-gated and is not on HR pages).

Talent Acquisition (template TALENT_ACQUISITION, **story X11.8**) reuses Employees/Onboarding with `candidates.manage`:
`talent_pool(id, org_id, name, skills_json)` + `talent_pool_member(pool_id, member_id | invite_id)` —
candidates are **invited members** (status INVITED) or existing members; no external CV storage in V2
(a candidate CV is the person's resume once they join; escalation D5).

## 4. Finance — records over product H (X11.4, X11.5)

Finance in Enterprise V2 is a **workspace**, not a new money model. The data is:

| page | source | notes |
|---|---|---|
| Consultant Subscriptions | Session C's `consultant_license` / `license_feature` (read) | `licenses.view` |
| Billing, Invoices (Kiwiply → org) | Session C's `org_invoice` mirror, Stripe portal link | `billing.view/manage` |
| Placements (rates) | `placement` snapshot + `ops_placement_rate` history | `finance.view` → `bill_rate`; `pay_rate` |
| Timesheets, Approvals | product H pages embedded at `/w/finance/timesheets` (+ approver inbox) on the tenant host; `/org/ops/timesheets` stays the legacy kiwiply.com console path (09 row 1) | `ops.timesheets.approve` |
| Invoices (org → client) | `ops_invoice` + lines (H6.2): generate from approved sheets, **issue = mark sent**, void, needs-reissue | `ops.finance` |
| Payments | `ops_payment` IN/OUT **records** (H6.3): amount, date, method label, memo (scanned) — "Record a payment you received/made elsewhere" | `ops.finance` |
| Expenses | `ops_expense` (H6.3) | |
| Profit | H6.4 view by consultant/client/month | |
| Reports | H5 exports + X11.6 | |

Permission mapping (05 §3.1 FINANCE_SPECIALIST holds `finance.view/manage` + `ops.*`): `finance.view` ⇒
`ops.finance` read, `finance.manage` ⇒ `ops.finance` + `ops.placements` write. One template, both
key families, so H's `OpsGate` stays untouched. Setting keys used by this doc register in
`EnterpriseSettingKeys.Hr` (`org.finance.margin_bands`, …; 09 row 7).

Placement financial records (X11.5): `placement.bill_rate_minor/pay_rate_minor/currency/rate_basis`
(35 §2) + per-placement margin = `(bill − pay) / bill` shown as a **label band** to marketers
(LOW/OK/GOOD from `org.finance.margin_bands`) and as numbers to finance. Finance may edit the
snapshot only through a new accepted offer (rates are what the consultant agreed to) or through H's
rate history (post-start changes).

No `payment_record`/`invoice_record` tables are created: ADR-011's names map to H6's `ops_payment` /
`ops_invoice` (this doc supersedes the naming in ADR-011 §Decision bullet 3 without changing the decision).

## 5. The PII scanner on every path (X11.7)

| path | mechanism |
|---|---|
| every String field of every DTO under `web/rest/org/{hr,finance,pipeline,talent}/**` | `@NoSensitiveText` (H3.1; if H3.1 is not built yet, X11.7 builds it — shared, product-wide) |
| JSON blobs (`feedback_json`, `skills_json`, `readiness_json` inputs, `notes`) | `SensitiveContent.check(path, node)` before save |
| policy PDFs, H proofs/receipts | `PdfTextScanner` (PDFBox text layer) → `SensitivePatterns.scan`; images: the existing client-side `sensitive-patterns.ts` on OCR text when OCR is on (H3.4), otherwise accepted only as *proof* under H's rules — HR has **no** image upload |
| CSV imports (requirements, HR bulk) | per-cell `scanField(header, value)` |
| AI prompts | `AiInputs.forModel` → `SensitivePatterns.redact` (existing) |
| exports | redaction pass on free-text columns (`redact`) before the file is written; audited `EXPORT` |
| web forms | `packages/ui` `SensitiveTextField` (TS twin) warns before submit; the server is the gate |

`HrFinanceNeverCollectedTest` (schema deny-list over Liquibase + DTO reflection) and
`SensitiveTextCoverageTest` (every String DTO field in the listed packages carries the annotation)
run in CI.

## 6. Reports and exports (X11.6)

`GET /api/orgs/{orgId}/{hr|finance}/reports?kind=…` and `/export` (CSV, audited `EXPORT`, redaction
pass). HR kinds: headcount, onboarding_time, ack_rate, compliance_open. Finance kinds: licenses_cost,
placements_margin (bands for non-finance viewers), invoices_outstanding, payments_recorded.
Retention of export files: `ops-export` lifecycle (H5.1, 24 h).

## 7. API summary

| method | path | permission |
|---|---|---|
| GET/POST | `/api/orgs/{orgId}/hr/employment` · POST `/hr/employment/{memberId}/{onboard|activate|leave|return|offboard|end}` | `hr.view` / `lifecycle.manage` |
| GET/POST/PATCH | `/hr/checklists[/{id}]` (templates) | `hr.manage` |
| GET/POST | `/hr/tasks?member=&assignee=&status=` · POST `/hr/tasks/{id}/{done|waive|reopen}` | `hr.view` / `hr.manage` (assignee may `done` their own) |
| GET/POST/PATCH | `/hr/policies[/{id}]` · POST `/policies/{id}/{publish|retire}` · POST `/policies/{id}/file` (PDF) | `hr.manage` |
| GET | `/hr/policies/{id}/acks` | `hr.view` |
| GET/POST | `/api/me/orgs/{orgId}/policies` · `/policies/{id}/ack` · GET `/api/me/orgs/{orgId}/hr/tasks` · POST `/tasks/{id}/done` | member |
| GET | `/finance/overview` · `/finance/placements` · `/finance/placements/{id}/rates` | `finance.view` |
| (H) | `/ops/**` unchanged | `ops.*` |
| GET | `/hr/reports` · `/finance/reports` · `/export` | `reports.view` / `reports.export` |

## 8. Tests
`EmploymentRecordStateTest` (registry ↔ doc; effective-dated supersede), `ChecklistInstantiationTest`,
`PolicyAckTest` (login-keyed, survives erasure, version pinned), `HrFinanceNeverCollectedTest`,
`SensitiveTextCoverageTest`, `PdfTextScannerRefusalTest`, `FinanceVerbsTest`, `FinancePermissionMappingTest`
(`finance.*` ⇒ `ops.*`), `OpsPlacementBridge` finance read-through, `OrgIsolationIT` lines, Playwright
`hr.spec.ts` (onboarding board at 1440, ack flow at 390) and `finance.spec.ts` (overview; timesheet entry
embedded at 390 — H2.4's screen).
