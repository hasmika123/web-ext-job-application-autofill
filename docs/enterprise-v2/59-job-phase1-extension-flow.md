# 59 — Phase 1 design: marketer captures with the extension, consultant applies with the extension, we track (DESIGN, revision 2)

> Owner decision 2026-10-13: **job search/discovery, public pools, connectors and matching engines move to Phase 2.** Phase 1 = (1) the **marketer** captures the *important details* of a job from the source page with our browser extension and assigns it to a consultant; (2) the **consultant** opens the source link and applies with their own extension (or applies on any job site on their own); (3) we **track** the application progress. This document supersedes the Phase-1 parts of ADR-024 (D-2…D-4, D-6, D-10, D-15 deferred or amended: see ADR-024 "Revision 2") and aligns with the **already-written** backlog stories X9.2, X9.9 and X9.12 (`07-backlog.md` lines 5085, 5358, 5400) and `32-applications.md` §2 (`pipeline_application_link`, submit-detect). Evidence labels: V = read in code/docs, A = assumed.

## 1. The flow

```mermaid
sequenceDiagram
  participant M as Marketer (extension, org workspace)
  participant API as Kiwiply API
  participant C as Consultant (web: Assigned Opportunities)
  participant X as Consultant extension (own session)
  participant S as Job site (LinkedIn, ATS, ...)
  M->>S: opens job page
  M->>API: Save for consultant... (trimmed capture + note) [POST mkt/opportunities/from-extension]
  API-->>C: Assigned opportunity (title, company, key info, link) + notification
  C->>API: views it (state VIEWED), may Interested / Decline / Ask for info
  C->>S: Open job posting (source URL, new tab)
  X->>API: assignedJobs matches this URL? -> shows "Assigned by <marketer>" chip
  X->>S: autofills the consultant's own profile; consultant reviews and submits themselves
  X->>API: submit-detect -> personal application APPLIED (+ link to the opportunity)
  API-->>M: opportunity shows APPLIED (consent-scoped); progress mirrored as the consultant updates it
```
Direct path (no marketer): the consultant opens any job site, applies with the extension, the application is tracked in their own tracker (existing behaviour, V `job-autofill/src/lib/app-tracking.js:88-111`), and is shown to the org only if the consultant shares it (§5).

## 2. Rules that never change (ADR-010, E1, CLAUDE.md)
- Kiwiply and marketers **never submit** for a consultant; the consultant reviews and clicks submit in their **own** session. No auto-submit, no CAPTCHA bypass, no attestation boxes ticked.
- A marketer session of the extension **never loads the consultant's bio, answers or resume** (X9.12: only "Save for consultant…" is offered; `no_submit` + `account_clear` tests).
- No org route can set a consultant's application status (NoSubmitSurfaceTest rule 2, X9.2). The org's view of an application is a **read-only projection** of the consultant's own record; a marketer may add notes and record client-side facts (interview, offer) as events, never the application status itself.
- Job-board jobs are **APPLY_SELF only** (BoardPolicy, `31-talent-marketing.md` §9): a captured LinkedIn/Indeed/Dice/ZipRecruiter job can never carry a marketer-recorded "submitted to client".

## 3. What the marketer captures (minimal, not the full posting)
**Sent by the extension (trimmed `JobCapture`, existing extractor `job-capture.js` V: company, role, location, jobUrl, externalJobId, atsPlatform, jobDescription, salary, salaryParsed, jobType, jobMode):**
`title`, `company`, `location`, `workMode`, `employmentType`, `payLabel` (+ parsed min/max/period when present), `jobUrl` (normalised), `externalJobId`, `atsPlatform/source`, `postedOn` (if present) — **and `jobDescription` is dropped client-side before sending** (the extension keeps its own full local copy for the marketer to read on the page; the server never receives or stores it).
**Typed by the marketer (the "custom important info"):** `keyInfo` (≤ 1000 chars: why this fits, what to emphasise, deadline, contact instructions), `consultantIds[]`, `priority`, `dueOn`, optionally 3–8 `skills` chips (picked from the page or typed).
**Stored:** one `client_requirement` (title, client = employer via find-or-create `client_account` by `name_key`, location, work_mode, employment_label, rate fields, `description_text` ← the marketer's `keyInfo` summary, status OPEN, `source=EXTENSION`), one `requirement_skill` per chip, plus new columns in §6 for URL/identity. The consultant sees the same trimmed set + the per-consultant note; **full job text is always read on the source site** (the link), which also keeps us clear of copying third-party content and of source licensing questions in Phase 1. (Legal note A: a user-initiated, per-page capture of a few facts plus a link is much lower risk than bulk collection, but it is not zero — have counsel confirm per source before enabling the marketer capture for that source; the extension can ship with a per-source allow-list `enterprise.pipeline.capture_sources`.)

## 4. Mapping onto what is built (the X9 stories speak of `job_opportunity`; the code has these tables)
| X9 design term | Built table (V) | Phase 1 change |
|---|---|---|
| `job_opportunity` (kind JOB_POSTING/CLIENT_REQUIREMENT) | `client_requirement` | + `job_url`, `url_key`, `external_job_id`, `ats_platform`, `capture_source`, `captured_by_member_id`, `version`; UNIQUE `(org_id, url_key)` and `(org_id, ats_platform, external_job_id)` where not null. "Kind" = `capture_source` (`EXTENSION` = board job ⇒ APPLY_SELF only, `MANUAL`/`CLIENT` = vendor requirement) |
| match (draft/ASSIGNED) | `requirement_match` (SUGGESTED/ASSIGNED/DISMISSED, `source`) | `source='MANUAL'`, `status='ASSIGNED'`, `+version NOT NULL DEFAULT 0` |
| authorization/consultant response | `mkt_opportunity` (+event) | add reduced lifecycle (§7), `marketer_note`, `priority`, `due_at`, `viewed_at`, `posting_opened_at`, `applied_at`, `decline_reason`, `info_request`, `version` |
| `pipeline_application_link` | **not built** | new table (§6) |
| consultant's application | personal `application` (+`application_event`) (V) | link by id; no FK across person/org |
| org tracking row | `talent_application` (+events) | + `personal_application_id`, `entry_path`, `stage_source` |

## 5. Tracking, consent and the direct path
- **Source of truth = the consultant's personal `application` record** (person-owned; `D/32` §2). The org keeps an **org projection** `talent_application` (stage, dates) created/updated by `PipelineApplicationLinker` (X9.2) only from the consultant's own status events, **only while the consultant's `data_share` scope allows it** (SUMMARY: stage + dates; FULL: + notes the consultant shares). NONE ⇒ no org row, the application is still tracked privately.
- **Link matching** (X9.2): by `url_key` (normalised URL, the rules of `ApplicationKeys` V `api/.../service/ApplicationKeys.java`), `externalJobId + atsPlatform`, or company+title within 30 days. A match to an ASSIGNED opportunity moves it to `APPLIED` in the same transaction (`opportunity.applied_at`, event, notification to the marketer).
- **Direct path:** consultant applies on any site with the extension → personal application. If the URL matches an assigned opportunity → linked as above. If not → **no org record**, unless the consultant chose "Share my applications with <Org>" (setting on the consent screen, default off) — then a `talent_application` projection is created with `entry_path=CONSULTANT_DIRECT`. This answers "we track the application progress" without leaking private job hunting to the employer.
- **Progress updates** (interview, offer, rejected) are made by the consultant in their tracker (or detected by the existing inbox tracking where enabled); the projection follows. A marketer may add `TalentApplicationEvent` notes/facts; `recordStage` by a marketer stays allowed only for **client/vendor requirements** (not board jobs) and always as an event, never changing the consultant's own record.
- **Seat-less consultants** (`consultant_profile.member_id IS NULL`, V `ent_talent.xml:73`) have no account, so they cannot open the link with the extension nor apply with it: in Phase 1 the opportunity is **informational** (marketer shares the link out-of-band, can record "consultant says applied" as a MARKETER_RECORDED event flagged as such). When the profile later gets a seat, `data_share` starts at NONE (never carry FULL over) and the consultant is prompted to choose.

## 6. Schema (additive; new changelog files; defaults make existing rows valid)
- `client_requirement` (+ columns above). `version BIGINT NOT NULL DEFAULT 0` on `requirement_match`, `mkt_opportunity`, `talent_application`, `client_requirement` (JPA `@Version @Column(nullable=false) long`, precedent `ent_employees.xml:258`; a nullable version breaks `isNew()`).
- `mkt_opportunity` (+ columns §4). `pipeline_application_link(id, org_id, opportunity_id (composite FK mkt_opportunity), consultant_id, personal_application_id BIGINT NOT NULL (no FK: person table), talent_application_id NULL (composite FK), source SUBMIT_DETECT|CONSULTANT|BOARD_SAVE, linked_at, unlinked_at NULL)`, UNIQUE `(org_id, opportunity_id)` live link.
- Tables **not** created in Phase 1: `org_job_source_occurrence`, `org_job_change_event` (only when a producer exists, Phase 2), `org_saved_job`, `marketer_assignment_event` (use `org_assignment` per D/17 when assignment management is built; Q-2 closed: no third model).
- Pre-flights: backfill `url_key` NULL for old rows (unique keys ignore NULL); duplicate-URL report before the unique key.

## 7. Reduced lifecycle (consultant-owned transitions; actors in doc 52 §2 amended)
`ASSIGNED → VIEWED → INTERESTED | DECLINED | NEEDS_INFO → APPLIED → CLOSED`.
- ASSIGNED/VIEWED/NEEDS_INFO/INTERESTED/**READY** → **DECLINED allowed from any non-CLOSED** (the consultant's "no" is sovereign; review fix).
- NEEDS_INFO → `INFO_PROVIDED` (marketer writes `marketer_note`, sets `answered_at`; the consultant's state is only changed by the consultant).
- → APPLIED: **only by the linker** (consultant's own submit) or the consultant ("I applied" button). Never by a marketer.
- → CLOSED: job closed/filled (`client_requirement.status`), marketer withdrew the assignment (reason WITHDRAWN, freezes the match; the match-level WITHDRAWN status is dropped), application reached a terminal stage, consultant inactive (`consultant_profile.status/marketing_status` ≠ ACTIVE ⇒ open opportunities CLOSED `CONSULTANT_INACTIVE`).
- Reopen from CLOSED allowed to the previous state when the job reopens (job status ON_HOLD→OPEN) or the marketer re-assigns.
- Every transition: one transaction, event row, audit row, same-target = 200 no-op, `@Version` conflict = 409.

## 8. API surface (Phase 1)
| Who | Route | Notes |
|---|---|---|
| Marketer extension | `POST /api/orgs/{orgId}/mkt/opportunities/from-extension` `{consultantIds[], jobUrl, title, company, location?, workMode?, employmentType?, payLabel?, externalJobId?, atsPlatform?, postedOn?, skills?[], keyInfo, priority?, dueOn?}` | `opportunities.manage` (ASSIGNED consultants, `MktScope`); finds-or-creates the job by `url_key`/`(ats,external id)` (second save of the same job for the same consultant ⇒ 200 `existing=true`, **not** 500: unique key + translator at the resource layer); goes through the single `OpportunityAssignmentService`; `Idempotency-Key`; body size cap 8 KB; free text via `SensitiveContent`; response `{opportunityId, jobId, existing}` |
| Marketer web | existing `mkt/opportunities`, `mkt/jobs` pages keep working over captured jobs | unchanged contracts |
| Consultant web | `GET /api/orgs/{orgId}/con/opportunities`, `GET …/{id}`, `POST …/{id}/viewed|interest|decline|request-info|applied` | `ConScope` (own profile), `opportunities.respond` (OWN); DTO = trimmed job + `marketerNote` addressed to me + `allowedActions[]`; "Open job posting" = the `jobUrl` (always shown for board jobs) |
| Consultant extension | `GET /api/profile/assigned-jobs` (workspace header, X9.9) → `[{opportunityId, matchId, jobUrl, urlKey, title, company, assignedBy, note}]` | user token, header `X-Kiwiply-Workspace` validated against ACTIVE membership (404) |
| Consultant extension | `POST /api/me/orgs/{orgId}/opportunities/{id}/link {applicationId}` / `unlink` / `save-to-board` (X9.2) | OWN; also automatic via `PipelineApplicationLinker` on the consultant's own status event |
Namespaces: `mkt` (marketer, built), `con` (consultant, new), extension routes under the existing `/api/profile/**` + `/api/me/orgs/**` as already specified in X9.2/X9.9.

## 9. Extension changes (X9.12) — real code, not part of this commit
`TrackingProvider` gains `listWorkspaces/setWorkspace/assignedJobs/saveForConsultant` (canonical DTOs; the seam stays the one backend path, CLAUDE.md). Drawer chip (Personal / Org); storage partition per workspace; marketer session offers **only** "Save for consultant…" (trimmed capture + note + consultant picker + priority/due; description dropped before the request); consultant session lists assigned jobs in the Jobs tab and, on a matching page, shows the "Assigned by …" chip and starts the normal fill with **their own** profile; submit-detect posts the existing application event and the server links it. Per-site capture quality: `job-capture.js` JSON-LD → adapter → generic chain already yields title/company/location/url/external id (V); LinkedIn/Indeed pages often lack JSON-LD — capture falls back to generic; a missing field is left empty for the marketer to type, never guessed. Version bump ritual (`wxt.config.ts` + `package.json`, `rules.js` if rules change); `no_submit` and `account_clear` tests.

## 10. Phase 2 (explicitly deferred)
Job search/discovery pages (marketer and consultant), saved jobs and searches, saved-search alerts, stream connectors and ingestion (`recordSync` producing jobs), public-pool adoption (`job_posting` copy-on-adopt), source occurrence/dedupe suggestions/merge, source licensing agreements (see the licensing checklist given to the owner), AI/rule match engine and the consultant Job Matches page, vendor/client **submission authorization** for client requirements (the Submissions page keeps today's marketer-recorded behaviour until the consultant API exists; it is a recorded P0 deviation from ADR-010, with the Fable amendments: `authorization_scope`, ORG_ATTESTED only for seat-less profiles), licensed AI overlays and `EntitlementCheckStep`.
