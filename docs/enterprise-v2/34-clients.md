# 34 — Clients, vendors, contacts, requirements (ADR-011)

> Status: design, 2026-10-12 (Session D). Requirements §13. Build-ready for **X10.1, X10.2, X10.5,
> X10.7**. Reuses: `SensitiveContent.check` / `SensitivePatterns` (PII scanner), `OrgAuditService`,
> the Timesheets product's `ops_client` / `ops_vendor` (H0.1/H1.1 — bridged in 35 §5, not duplicated
> in intent: the pipeline owns the relationship, Timesheets owns the money side).

## 1. One client model

`client_account` — any organization the org deals with on the demand side. The **kind** says what it
is to us; **relationship edges** say how they connect; a requirement names both the issuer and the
chain it arrived through.

| column | type | notes |
|---|---|---|
| id, org_id | | |
| kind | VARCHAR(20) | END_CLIENT · VENDOR · PRIME · PARTNER · MSP |
| name (200), legal_name (200) NULL, website (300), industry (80), size_band (20), country (2), timezone (48) | | `name` UNIQUE per org (case-insensitive generated key) |
| status | VARCHAR(20) | PROSPECT · ACTIVE · INACTIVE · DO_NOT_WORK (with reason) |
| owner_member_id | FK org_member | the account manager |
| payment_terms_label (40), msa_label (80), msa_expires_on DATE | | labels/dates only; no documents in V2 (escalation D3) |
| notes | TEXT | `SensitiveContent.check` |
| ops_client_id NULL, ops_vendor_id NULL | FK | Timesheets bridge (35 §5) |
| created_at, updated_at, archived_at | | |

`client_contact(id, org_id, client_id, name (120), title (80), work_email (254), phone (40),
linkedin_url (300), role_label (40: HIRING_MANAGER|RECRUITER|VMS_ADMIN|AP|OTHER), status ACTIVE|LEFT,
notes, created_at)` — business contact data only; `work_email` domain must not be a consumer domain
list (`gmail.com`, … setting `enterprise.pipeline.consumer_email_domains`) → 422 `WORK_EMAIL_REQUIRED` (we store
business contacts, not people's private addresses). Every text field is scanned.

`client_relationship(id, org_id, from_client_id, to_client_id, kind SUBCONTRACTS_TO|SUPPLIES|MSP_FOR|PARTNERS_WITH,
terms_label (80), starts_on, ends_on, notes)` — a directed edge. Vendor chain for a requirement =
walk `via_client_id` → `SUBCONTRACTS_TO` edges up to `client_id`; cycles refused (422 `RELATIONSHIP_CYCLE`).

## 2. Client requirements (X10.2)

| column | notes |
|---|---|
| id, org_id | |
| client_id | the **end client** whose need it is |
| via_client_id NULL | the vendor/prime that sent it to us |
| title (300), description_text, skills_json, location (300), mode ON_SITE\|HYBRID\|REMOTE, employment_label (20: CONTRACT\|C2C\|W2\|FTE\|OTHER), duration_label (40), rate_band_label (40), bill_rate_max_minor NULL, currency | rates are records; `bill_rate_max_minor` visible to AM/finance only |
| positions SMALLINT DEFAULT 1, filled SMALLINT DEFAULT 0 | |
| status | OPEN · ON_HOLD · FILLED · CLOSED · LOST |
| priority, opens_at, closes_at, owner_member_id | |
| source | MANUAL · EMAIL_PASTE · IMPORT (CSV) · VENDOR_PORTAL_REF |
| external_reference (120) | the vendor's req id |
| dedupe_key | sha256(normalised client + title + location + external_reference) — collision → 409 `REQUIREMENT_EXISTS` |
| created_by_member_id, created_at, updated_at | |

State machine (in `PipelineTransitions`):

| from | to | actor | permission | guards | effects |
|---|---|---|---|---|---|
| — | OPEN | ACCOUNT_MANAGER / MARKETER | `requirements.manage` | dedupe | creates a `job_opportunity(kind=CLIENT_REQUIREMENT)` (31 §3) |
| OPEN | ON_HOLD / OPEN | AM | | | opportunity priority LOW while on hold |
| OPEN | FILLED | SYSTEM when `filled = positions` (placement ACTIVE) or AM | | | opportunity CLOSED; open submissions → "position filled" note (status unchanged — the vendor decides) |
| OPEN / ON_HOLD | CLOSED / LOST | AM | | reason | opportunity CLOSED; open matches WITHDRAWN(reason REQUIREMENT_CLOSED); consultants notified |

**Email paste intake**: the AM pastes the requirement mail text; `RequirementParser` (rules first:
title line, rate regex, location, skills by lexicon; AI `AiTask.ENRICH` only when the org has
`marketing.assisted_applications` and the user confirms, charged to the **AM**) prefills the form.
The pasted text is scanned (`SensitivePatterns.scan`) and refused on a hit (vendors sometimes paste
candidate PII — we never store it). No mailbox is read by the org (CLAUDE.md inbox rule).

**CSV import**: columns `client, via, title, location, mode, rate_band, external_reference, closes_at`;
preview + per-row dedupe result; scanned per cell.

## 3. Submissions from the client side

`candidate_submission` (31 §5) is the join between a requirement and a consultant. The requirement
page lists its submissions with status chips, the resume version presented, interviews (33) and
offers. "Record submission" is the only verb (E1).

## 4. Account Manager workspace (X10.5)

Pages: Home (requirements by status, submissions awaiting record, interviews this week, offers
pending, placements starting), Clients (list → account page: contacts, relationships graph,
requirements, placements, notes), Contacts, Requirements (board by status, intake sheet),
Submissions (across requirements), Interviews (33 org calendar at ORG scope), Offers, Placements (35).
Permissions per `05` §3 ACCOUNT_MANAGER template; consultant data appears only at the consent
projection (an AM sees a submission row's consultant name — seat data — and the approved resume
**display name**, but opens the document only with FULL or visibility ORG + feature consent, 30 §4).

## 5. Reports (X10.7)

`GET /api/orgs/{orgId}/pipeline/reports?kind=fill_rate|time_to_place|submissions_per_consultant|vendor_performance&from=&to=`
— computed from `pipeline_event`; consultant-level rows obey consent (SUMMARY ⇒ counts only) and the
analytics suppression rule (< 5 contributors → suppressed) when grouped by team/department; vendor
and client rows are org data and show fully. CSV export audited `EXPORT`.

## 6. API summary (`/api/orgs/{orgId}`)

| method | path | permission |
|---|---|---|
| GET/POST | `/clients` · GET/PATCH `/clients/{id}` · POST `/clients/{id}/archive` | `clients.view` / `clients.manage` |
| GET/POST/PATCH | `/clients/{id}/contacts[/{cid}]` | `clients.manage` |
| GET/POST/DELETE | `/clients/{id}/relationships[/{rid}]` | `clients.manage` |
| GET/POST | `/requirements` · GET/PATCH `/requirements/{id}` · POST `/requirements/{id}/{hold|reopen|fill|close}` | `requirements.manage` (`pipeline.view` for GET) |
| POST | `/requirements/parse` `{text}` · `/requirements/import` (multipart CSV) | `requirements.manage` |
| GET | `/requirements/{id}/submissions` | `pipeline.view` |
| GET | `/pipeline/reports` · `/pipeline/reports/export` | `reports.view` / `reports.export` |

All routes in the `OrgIsolationIT` registry; every mutation one audit row (`CLIENT_*`, `REQUIREMENT_*`).

## 7. Tests
`ClientRelationshipGraphTest` (chain walk, cycle refusal), `RequirementDedupeTest`,
`RequirementParserTest` (rules; PII paste refused; AI only on confirm), `ContactWorkEmailTest`,
`RequirementStateTest` (registry ↔ doc), `PipelineReportsConsentTest` (SUMMARY counts; suppression),
`OrgIsolationIT` lines, Playwright `account-manager.spec.ts` (intake sheet at 390, client page at 1440).
