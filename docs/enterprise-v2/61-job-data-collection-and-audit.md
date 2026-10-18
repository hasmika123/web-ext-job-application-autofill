# 61 — Job data: how we collect it, store it, and prove it (AUDIT & LINEAGE DESIGN, proposal)

> Purpose (owner request 2026-10-13): if a source licensor, a customer security review or a privacy regulator audits us, we must be able to answer **"what job data do you hold, where did it come from, who put it there, under what terms, who can see it, how long do you keep it, and how do you remove it"** from records, not from memory. This design adds provenance and an append-only ledger on top of Phase 1 (`60-job-phase1-contract.md`) at almost no cost, and defines the evidence an admin can export. Not legal advice: confirm the terms side with counsel.

## 1. What we collect and store (data inventory, Phase 1)
| Data | Where (table.column) | Source / how collected | Who sees it | Retention |
|---|---|---|---|---|
| Job facts: title, employer name, location, work mode, employment type, pay label/min/max, posted date | `client_requirement` (+ `client_account.name`, `requirement_skill`) | **Marketer, with our browser extension, by an explicit click on a job page they are viewing**, trimmed on the client before sending; or typed by hand | Org members with `matches.run`/`opportunities.*`; the assigned consultant (own jobs only) | Life of the org record; purge rules §5 |
| Source link and identity: `job_url`, `url_key(_hash)`, `external_job_id`, `ats_platform` | `client_requirement` | same | same | same |
| Marketer's note for the consultant (`keyInfo`) | `mkt_opportunity.marketer_note`, `client_requirement.description_text` (summary only) | typed by the marketer | marketer, assigned consultant | same |
| **Not collected in minimal mode:** the full job description, company contacts, recruiter names/emails, applicant counts | — | the extension drops `jobDescription` before sending; the server never fetches the URL | — | — |
| Assignment, response, applied state | `requirement_match`, `mkt_opportunity` (+ events) | marketer assigns; consultant responds; consultant's own submit links it | marketer, consultant; admin via audit | with the org record |
| Application link and consent-filtered progress | `pipeline_application_link`, `talent_application` (+ events) | consultant's own tracker, projected only within their `data_share` scope | per consent | with the org record |
Never stored: SSN, bank, tax id, passport, date of birth, or any attachment; sensitive-text scanner (`SensitiveContent`) runs on every free-text write.

## 2. Provenance on every job (answers "where did it come from, who put it there")
On `client_requirement` (additive; names for the Phase 1 changelog):
`capture_source` (EXTENSION | MANUAL | CLIENT | CONSULTANT | LICENSED_FEED) · `captured_by_member_id` · `captured_at DATETIME(6)` · `capture_method VARCHAR(20)` (USER_CLICK | MANUAL_ENTRY | IMPORT | FEED) · `extension_version VARCHAR(20) NULL` · `capture_payload_hash CHAR(64) NULL` (SHA-256 of the exact trimmed JSON the extension sent: proves what was received without keeping extra content) · `detail_level` (MINIMAL | FULL, doc 60 §10) · `detail_level_changed_at`, `detail_level_changed_by` · `source_terms_id BIGINT NULL` (link to the terms registry, §4, Phase 2).

## 3. Append-only ledger `job_data_event` (answers "what happened to this data and when")
`id, org_id, requirement_id (composite FK), event_type, actor_member_id NULL, actor_kind (MEMBER | SYSTEM | EXTENSION | FEED), occurred_at DATETIME(6), detail_level_before, detail_level_after, fields VARCHAR(300) NULL (names of fields set/changed/purged — never values), source_ref VARCHAR(200) NULL (job_url or feed id), terms_ref VARCHAR(80) NULL, request_id VARCHAR(64) NULL, note VARCHAR(200) NULL`.
`event_type`: CAPTURED · EDITED · ENRICHED_FULL · DOWNGRADED · FULL_PURGED · ASSIGNED · UNASSIGNED · EXPORTED · TAKEDOWN_RECEIVED · TAKEDOWN_APPLIED · DELETED · CAP_CHANGED (org display cap changed). Rules: no UPDATE/DELETE (repository exposes `save` and reads only; a repository test, like `DataShareEventRepositoryNoDeleteTest`, fails if a delete appears); retained with the org (never shorter than the org's audit retention); written in the **same transaction** as the change it describes. It complements `org_audit_event` (who did what in the org) with data lineage per job. Existing per-stage tables (`mkt_opportunity_event`, `talent_application_event`, `data_share_event`) are the lineage of assignment/application/consent and stay as they are.

## 4. Source terms registry (Phase 2, designed now; needed before any licensed feed)
`job_source_terms(id, org_id NULL (platform-wide) or org, source_label, licensor, agreement_ref, license_kind (OPEN | PARTNER | LICENSED_FEED | USER_CAPTURE), copy_allowed BOOL, max_retention_days INT NULL, attribution_required BOOL, apply_link_required BOOL, ai_use_allowed BOOL, redistribution_allowed BOOL, takedown_sla_hours INT NULL, valid_from, valid_to, document_hash, created_by, created_at)`. Every job points to its terms row; the **capture allow-list** (`enterprise.pipeline.capture_sources`) is data derived from rows whose `license_kind` permits user capture; a job from a source without a current terms row cannot be enriched to FULL. This is exactly what an auditor asks for: the agreement on file per source and proof we honour it.

## 5. Retention, removal and takedown (answers "how do you delete it")
- **Policy:** minimal-mode data lives with the org record; `FULL` data lives no longer than `max_retention_days` of its terms row (scheduled purge job per org through `TenantScoped`, writes `FULL_PURGED`, sets level back to MINIMAL, keeps the job, matches and assignments).
- **Takedown:** an admin (or the licensor via an admin) records a takedown for a source or a job → ledger `TAKEDOWN_RECEIVED`; the job's full text is purged within `takedown_sla_hours` (`TAKEDOWN_APPLIED`), links to the source remain.
- **Org offboarding / GDPR:** org deletion removes job rows and ledger with the org (existing offboarding rules); a consultant's erasure removes their opportunity/application rows per `DataShareService.eraseFor` (extend it to the new tables; backlog item) while the anonymous job facts remain.
- **Licence loss:** `detail_cap` forced to MINIMAL and a one-time purge job as above; no code deploy.

## 6. Access and disclosure (answers "who can see it")
Marketers: only consultants they are assigned to (`MktScope`); consultants: only their own opportunities (`ConScope`, forbidden-field DTO test); admins: org-wide. The **display cap** (doc 60 §10) is enforced by `JobDetailMapper`; every job export or report is logged `EXPORTED` (actor, filter, row count, fields — not values). Cross-tenant isolation is the existing shared-schema discipline (`orgId` first, `EntRepositoryContractTest`, `OrgIsolationIT` rows).

## 7. Evidence an admin/auditor can pull (no engineering needed)
- `GET /api/orgs/{orgId}/audit/job-data?jobId=&source=&from=&to=` (permission `audit.view`, ORG; 404 otherwise): per job, the provenance columns plus the ledger, paged.
- `GET …/audit/job-data/summary`: counts by `capture_source`, `capture_method`, `detail_level`, sources with/without a terms row, FULL records past retention (must be 0), takedowns open, last purge run.
- `GET …/audit/job-data/export` (CSV, audited `EXPORTED`): the same data, no job text beyond the effective level.
- A one-page **data map** (this document §1) kept in `docs/enterprise-v2/` and referenced from the privacy notice; the extension's published permissions and data-use statement must match it (the extension sends only the whitelisted fields of doc 60 §4; payload hash proves it).

## 8. Controls that make the claims true (and tests that keep them true)
1. Trim-before-send in the extension + server whitelist with unknown-field rejection (test: a request containing `jobDescription` is refused 400).
2. No server fetch of `jobUrl` in Phase 1 (test: no HTTP client in the from-extension path).
3. `JobDetailMapper` leak test over every DTO, export, search index, log line and AI prompt builder.
4. Ledger append-only repository test; ledger row written in the same transaction (test: failing change writes no event; successful change writes exactly one).
5. `FULL` row without a terms row, or past retention, fails the summary check and a scheduled alert.
6. Quarterly review item: terms rows vs agreements on file; capture allow-list vs terms.

## 9. Phase placement
**Phase 1 (this release, small):** provenance columns (§2), `job_data_event` table + writes in `from-extension`, assignment and edit paths, the append-only test, `GET …/audit/job-data` (per-job lineage) for admins, the data inventory (§1). **Phase 1b:** summary + CSV export, takedown recording. **Phase 2 (with licences/feeds):** `job_source_terms`, retention purge job, enrichment/downgrade events, allow-list from terms, DSAR/erasure extensions.

## 10. Honest gaps today (verified)
The present code has none of §2–§4: `client_requirement.source` is never read (`mkt_job_meta.source_label` is free text), no ledger exists, no terms registry, no retention job; the consumer-side job ingest (`JobIngestService`) has its own retention (48 h window, 7-day delete) and no licence records. Until the Phase 1 items ship we cannot answer an audit from records.
