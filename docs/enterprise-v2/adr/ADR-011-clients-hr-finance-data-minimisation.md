# ADR-011 — Clients, vendors, HR and Finance: one client model with relationship edges; record-only, no identity documents

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §11
- **Reversibility:** see Consequences

## Context
CLAUDE.md: never collect sensitive PII; Consultancy Ops records money and never moves it; the Timesheets product (area H) already owns timesheets, placement rates and invoice records. Requirements §13 (clients/vendors) and §6/§25 (HR, Finance).

## Decision
- client_account (org_id, kind END_CLIENT|VENDOR|PRIME|PARTNER, name, website, status, owner_member_id, notes) + client_contact (org_id, client_id, name, work_email, phone, title, status) + client_relationship (org_id, from_client_id, to_client_id, kind SUBCONTRACTS_TO|SUPPLIES|MSP, terms_label). client_requirement (org_id, client_id, via_client_id NULL, title, skills_json, location, mode, rate_band_label, status, opens_at, closes_at, owner_member_id).
- HR module = employee lifecycle records only: employment_record (member_id, title, department_group_id, team_group_id, manager_member_id, employment_type, start_date, end_date, status), hr_task (compliance checklist items: kind, due_at, done_at, done_by) and policy_ack (policy name/version, acknowledged_at). No document numbers, no uploads of identity documents, no DOB; document storage is limited to org-authored policy PDFs the person acknowledges.
- Finance module = records: placement_rate (bill/pay rate labels and amounts in minor units, currency), invoice_record, payment_record (status, external_reference, recorded_by) — reused from the Timesheets design where it already exists (H6). Kiwiply never initiates a payment, never stores bank details, never collects tax IDs.
- Every free-text field in these modules passes SensitivePatterns; uploads are scanned by the existing client/server scanners and refused on a hit.

## Consequences
HR "documents/compliance" is narrower than the requirement text; escalation E2 records this. Finance pages show records and reports; "Payments" means payment status, not execution.

## Security note
No new PII classes; retention follows the Timesheets rule (7 years for money records, memberships anonymised on erasure).
