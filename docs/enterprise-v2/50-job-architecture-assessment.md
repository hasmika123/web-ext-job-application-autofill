# 50 — Job architecture: current-state assessment and traceability (DISCOVER)

> Status: **proposal for review, 2026-10-13.** Nothing in `api/`, `web/`, schemas or configuration was changed to produce this. Evidence labels:
> **V** = verified by reading the file/grep in this repo at `ent-talent-marketer` (HEAD `c118b926`); **A** = assumed/inferred, not run.
> Paths: `A/` = `api/src/main/java/com/dossier/api/`, `LQ/` = `api/src/main/resources/config/liquibase/changelog/`, `W/` = `web/src/`, `D/` = `docs/enterprise-v2/`.
> Companion documents: ADR-024 (decision), 51 domain model, 52 state transitions, 53 API contracts, 54 frontend, 55 security + entitlements, 56 migration, 57 test plan, 58 backlog.

## 1. The one-paragraph answer

The proposed assumption ("three pages, one underlying Job, different relationship records") is **right inside a tenant and wrong across tenants.** Inside an organization the shared job already exists: `client_requirement` (+ `requirement_skill`, `mkt_job_meta`) backs the marketer's Job Discovery, Job Matches (`requirement_match`) and Opportunities (`requirement_match` ASSIGNED + `mkt_opportunity`) pages (V). What does **not** exist is (a) any consultant-facing page, API or scope, (b) any way for a job to enter an org from a source (no connector writes `client_requirement`), (c) provenance/dedupe/visibility on that job, (d) a real match engine, and (e) any link between the pipeline stages (match → assignment → approval → submission → application). A *global* canonical Job with an `org_id` bolted on would break five verified isolation invariants (§4); the recommended design keeps `client_requirement` org-owned, lets an org *adopt* public postings from the existing global `job_posting`, and adds the missing relationship links. See ADR-024.

## 2. What exists today (verified)

### 2.1 Two unrelated job models

| | Enterprise (org-owned) | Consumer (user / global) |
|---|---|---|
| Job table | `client_requirement` (`LQ/20261019010000_ent_talent.xml:179-213`, `A/domain/ent/talent/ClientRequirement.java`) — `org_id NOT NULL`, composite FKs to `client_account`/`client_contact`/`org_member`, UNIQUE `(org_id,id)` (V) | `job_posting` (`LQ/20260922070000_job_sources.xml:55-101`, `A/domain/JobPosting.java`) — **no `org_id`**, global, public ATS data (V) |
| Source | `source` varchar default MANUAL (never read by any `mkt/*` service, V); `mkt_job_meta.source_label` free text (V) | `job_source(ats, board_token)` + `job_posting(source_id, external_id, dedup_key, first_seen_at, url, apply_url)` (V) |
| Connector | **none** — only demo seeders write `client_requirement` (V); `MktStreamsService.recordSync` writes a log row and an integer, creates no job (`:351-387`, V) | `JobIngestService` nightly 02:00, Greenhouse/Lever/Ashby only, 48 h freshness filter, deletes after 7 days (`JobIngestScheduler.java:24`, `HttpJobBoardClient.java:52-76`, V) |
| Dedupe | **none** | `dedup_key` (hash company\|title\|location) first-wins, no occurrence table, index not unique (V) |
| Search | in-memory over all org jobs (`MktJobsService.java:336-344,145-152`, V) | MySQL FULLTEXT + keyset-ish SQL (`JobPostingSearchRepository.java`, V) |
| Match | `requirement_match(score,reason,source,status)`; rows only from seeders or manual assign (V) | `job_match` via AI call per user (`JobMatchService.java:404`, V), per-user |
| Application | `talent_application` (unique `(org,requirement,consultant)`), only seeders create rows (V) | `application` (+`application_event`), extension-created (`job-autofill/src/lib/app-tracking.js:88-111`, V) |
| Saved job | none (only `mkt_saved_search`/`mkt_saved_view`) | `application.status = SAVED` (V) |

### 2.2 Marketing pages built on `client_requirement` (V)
`mkt/jobs` (Discovery), `mkt/matches`, `mkt/opportunities`, `mkt/streams`, `mkt/submissions`, `mkt/applications`, `mkt/interviews`, `mkt/followups`, `mkt/tasks`, `mkt/activity`, `mkt/performance`, `mkt/home` — all behind `MktScope` (`A/service/ent/mkt/MktScope.java:55-70`): flag + module + permission, then ORG scope = all consultants, otherwise `marketer_assignment` (marketer or backup) only.

### 2.3 Consultant side
No consultant page, API, BFF or scope exists (V). `workspaces.json` lists 13 CONSULTANT nav items (`:530-658`), all render `ComingSoon` (catch-all `page.tsx:50-59`). `docs/HANDOFF-ENT-CONSULTANT-WORKSPACE.md` is a plan; its API folder `consultantws` and BFF `me-workspace` conflict with the "each role has its own namespace" rule (marketer = `mkt`) — see ADR-024 D-13.

## 3. Verified defects/gaps in the *current* marketer build that the design must absorb

These are not hypothetical; each was read in code (V). Several are P0 for the pipeline's correctness, independent of the consultant pages.

| # | Finding | Evidence |
|---|---|---|
| F1 | **Approval is recorded by the marketer.** `requestApproval` and `recordApproval` both use `submissions.record`; there is no consultant `authorize` endpoint, contradicting ADR-010 | `MktSubmissionsService.java:207-236` |
| F2 | **No unique key on live submissions `(org, consultant, requirement)`**; guard is check-then-insert (race) — doc 31 §3 promised a UNIQUE | `MktSubmissionsService.java:179-181`; `LQ/20261104030000_mkt_submissions.xml:46-47` |
| F3 | **Check-then-insert races are uncaught** (`OPPORTUNITY_EXISTS`, submission): a concurrent second request hits the unique key and surfaces a 500 (`DataIntegrityViolationException` is never caught in `service/ent/mkt`) | `MktOpportunitiesService.java:239-243` |
| F4 | **No optimistic/pessimistic locking** on any talent/mkt entity (`@Version` only on `OrgGroup`, `ResumeDoc`); read-modify-write is last-write-wins | grep (V) |
| F5 | **Two assign paths disagree** (`MktMatchesService.assign` idempotent, no resume gate; `MktOpportunitiesService.assign` 409 `ALREADY_ASSIGNED`, 409 `RESUME_NOT_APPROVED`, creates `mkt_opportunity`); `MktJobsService` has a third | `:197-214` vs `:264-273,383-415` |
| F6 | **Resume edit does not invalidate approvals/submissions**: edit bumps `version_no`, sets resume PENDING; a submission approved on v3 keeps `resume_version=3`. No revocation, no `RESUME_STALE` | `MktResumesService.java:163-172` (V) |
| F7 | **Consent not enforced** in submissions/opportunities/matches/resumes services (only applications/talent/activity/performance check `data_share`); FULL pairing required by ADR-009 is not checked | grep for `DataShare` in `service/ent/mkt` (V) |
| F8 | **Resume approver is the org admin**, ADR-009 says the consultant approves | `MktResumesService.java:210-229` (V) |
| F9 | `MktScope` ignores `marketer_assignment.status` (an INACTIVE row still grants access) and `org_assignment`; two assignment models run in parallel, `marketer_assignment` has **no history** (one mutable row) | `MktScope.java:57-65`; `LQ/…ent_talent.xml:171` (V) |
| F10 | `org_resume.visibility` is declared and never enforced; no unique key for one primary resume per consultant; `primary_for_org` never set by services | grep (V) |
| F11 | **Discovery/matches filter in memory**; KPIs rescan the set per request (comment: "hundreds, not millions") | `MktJobsService.java:57-58,377-530` (V) |
| F12 | **Skill-overlap scoring is implemented 3 times** and stored `score` ≠ displayed components | `MktJobsService.overlapScore:267`, `MktOpportunitiesService.overlapScore:657`, `MktMatchRules.skillOverlap:95` (V) |
| F13 | No `Idempotency-Key` on mkt writes; `IdempotencyService` exists (24 h) and is used only by member/offboarding/groups services | grep (V) |
| F14 | Applications/interviews/placements/marketer_assignments have **no production creator** (seeders only) | `new TalentApplication()`/`new MarketerAssignment()` grep (V) |
| F15 | `OrgIsolationIT.COVERAGE` has **no `mkt` rows** while it sweeps every `/api/orgs/{orgId}/**` route (whether it currently fails is A: not executed, no Docker) | `OrgIsolationIT.java:151,450-465` |

## 4. Why a global canonical Job with `org_id` bolted on is rejected (verified invariants)
1. `client_requirement.org_id NOT NULL` + composite tenant FKs `(org_id, client_id)`, `(org_id, id)` (`ent_talent.xml:182,206-210`).
2. `EntRepositoryContractTest` — every `repository.ent` method takes `orgId` first, no `findById` (`:60-70`); the only NULL-org precedent is the system-role allow-list.
3. `TalentSchemaIT` checks `org_id NOT NULL` + FK on every talent table (`:103`).
4. ADR-001 chose an explicit `org_id` discriminator and **no** Hibernate `@Filter`/`@TenantId`; every JPQL is written `where … orgId = :orgId`.
5. The row carries commercially sensitive tenant data: client, contact, `rate_min/max_minor`, `owner_member_id`, marketer priority/visa (ADR-011).

## 5. Reuse matrix

| Existing asset | Reuse for the consultant views? | Note |
|---|---|---|
| `client_requirement`, `requirement_skill`, `mkt_job_meta` | **Yes — this is the org's canonical Job Opportunity** | add provenance/lifecycle columns additively (doc 51) |
| `requirement_match` | **Yes — ConsultantJobMatch** | add explanation/version columns |
| `mkt_opportunity` (+event) | **Yes — the consultant's assignment/response state** | extend lifecycle (doc 52) |
| `mkt_submission` (+event) | **Yes — ClientSubmission record** | add authorization + FKs |
| `talent_application` (+event/notes) | **Yes — org-side JobApplication + ApplicationStatusHistory** | link to submission/match |
| `MktMatchRules`, `MktJobsLogic` | Yes, but extract to a neutral package and make `public` | single scorer |
| `Mkt*Service` classes | **No** (all start with `MktScope.resolve` = marketer permission) | extract role-neutral query core; add `con` services |
| `job_posting/job_source/JobIngestService/HttpJobBoardClient/JobPostingSearchRepository` | Yes as the **public source layer**, table-coupled | ADR-024 D-3 (adopt flow) |
| `JobFitReport.tsx` (`packages/ui`) | Yes as-is (presentational) | |
| `JobSheet`/`ReviewDrawer` (`marketer-ws`) | Pattern yes, location no | extract to neutral folder (doc 54) |
| `IdempotencyService`, `TenantScoped`, `OrgAuditService`, `DataShareService` | Yes | |
| `EntitlementService` (personal Pro) | No (personal only); consultant licensing is design-only (D/24) | doc 55 |

## 6. Traceability matrix

| Requirement | Existing implementation (evidence) | Gap | Recommended change | Priority |
|---|---|---|---|---|
| **Canonical Job identity** | `client_requirement` is the org's job (V `ClientRequirement.java`); global `job_posting` unrelated (V) | no `external_id/url/first_seen/last_seen/closing/visibility`; no source occurrence; no dedupe key; two worlds unlinked | Keep org-owned canonical; add `posting_id` + provenance columns + `org_job_source_occurrence`; adopt-from-public flow (ADR-024 D-1..D-4) | P0 |
| **Job Discovery** | `mkt/jobs` in-memory search, saved searches (V `MktJobsService`) | no consultant view; in-memory O(n); no connector feeding jobs; saved-search alerts not delivered | role-neutral `JobQueryService` with SQL filtering + FULLTEXT; `con/jobs` read API; connector writes via adoption | P0 / P1 |
| **Consultant matching** | `requirement_match` seeded/manual; `MktMatchRules` read-time (V) | no engine, no stored explanation/version/staleness, scorer triplicated, no hard-vs-soft split | one `JobMatchScorer`; persist components+version+calculated_at; per-org recompute via `TenantScoped`; keep rules-based core free, AI as licensed overlay | P0 (scorer) / P1 (engine) |
| **Job assignment** | `requirement_match.ASSIGNED` + `mkt_opportunity` (V) | no Viewed/Declined/NeedInfo/ReadyForSubmission/Closed; no consultant write endpoint; no assignment history; two assign paths disagree; `marketer_assignment` history missing | extend `mkt_opportunity` lifecycle; one `OpportunityAssignmentService`; marketer-assignment history table | P0 |
| **Submission approval** | `mkt_submission.approval_state` marketer-recorded (V F1) | consultant authorize missing; no resume-version pin enforcement; no stale/revocation rule; no consent check | consultant-side `authorize` (OWN); approval bound to `resume_id+version`; auto-invalidate on edit; revocation semantics (doc 52 §4) | P0 |
| **Job applications** | `talent_application` (seeder-created) + personal `application` (V) | no production creator; unlinked to submission/match; no unique link to personal application | `application_id` on submission, `submission_id`/`match_id` on application; unique `(org,requirement,consultant)` kept; consultant "I applied" path records an application without a marketer | P1 |
| **Shared job details** | `JobSheet` (marketer, 500px overlay, not mobile-ready), `ReviewDrawer` (narrow→fullscreen) (V) | no neutral component; mobile/tablet screen missing; no consultant-scoped detail endpoint | `JobDetailsView` in `web/src/components/ent/jobs/` + `con/jobs/{id}?context=` (doc 54) | P1 |
| **Tenant isolation** | proxy + `TenantResolver` + `OrgPermissionInterceptor` + `AuthorizationService` + `MktScope` + contract tests (V) | no consultant scope; `OrgIsolationIT` has no `mkt` rows; shared pool leakage vectors (§4) | `con` namespace OWN scope via `ConScope`; add isolation rows; public-fields-only link to global postings | P0 |
| **Feature entitlements** | permission keys exist (`EntPermissions.java:93-105`); `AuthzStep` 6–8,10–11 have **zero implementers**; no license tables; `ai.job_matching` only in docs (V) | no licensing enforcement anywhere | rule-based discovery/assigned = free core (D/21:76, D/37:31); implement `EntitlementCheckStep` + `@RequiresFeature` before any AI-scored UI ships | P1 (gate AI) |

## 7. Open assumptions (A) to confirm
- The `consultant_profile` id is the right consultant key for `con` OWN scope (consultants need not be seats: `member_id` can be null) — a seat-less consultant cannot log in, so OWN scope can only mean seat-linked consultants (`consultant_profile.member_id`).
- Whether `OrgIsolationIT` currently fails on this branch (not executed).
- Whether the 7-day retention of `job_posting` is acceptable as a *source* layer if orgs adopt postings (adopted copies must survive deletion — hence copy-on-adopt).
- `MktJobsService.assign` body (third assign path) was not read in full.
