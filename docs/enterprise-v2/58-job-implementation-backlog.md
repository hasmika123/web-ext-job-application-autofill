# 58 — Implementation strategy and agile backlog (PLAN, proposal — nothing approved or built)

> Phases are adjusted to what exists (verified): the marketer pages are built; the consultant side, connectors, scorer, link columns and consultant authorization are not. Story ids `J-<phase><n>`; each story is small, independently testable, additive, and lists **Depends**, **Acceptance**, **Verify**. Priority P0 = correctness/security fixes of the current build, P1 = needed for the consultant views, P2 = hardening/scale. Environment note: stories that say "IT" need Docker.

## 0. Phases (adjusted from the suggested six)
| Phase | Goal | Why this order |
|---|---|---|
| **P0 Correctness of the built pipeline** | Fix F1–F10 in the marketer build without new UI: races, uniqueness, locking, consent, resume-stale, approval owner, assign unification | These are bugs/gaps users hit today; consultant pages would amplify them |
| **P1 Job core** | Provenance/occurrence/lifecycle/dedupe columns, adopt-from-public, `JobQueryService` (SQL search) | The consultant Discovery needs a scalable, source-aware job pool |
| **P2 Match & assignment core** | One `JobMatchScorer`, persisted explanation/staleness, per-org recompute, opportunity lifecycle, `OpportunityAssignmentService` | Matches/Assigned views need explainable stored data and one lifecycle |
| **P3 Consultant API + pages** | `ConScope`, `con` APIs (jobs/matches/opportunities/submissions/applications), registry + pages, shared details drawer/screen | The user-facing deliverable |
| **P4 Submission/approval/application consistency** | Consultant authorization, resume-version binding, application entry paths, links across stages | Completes the workflow; relies on P2 lifecycle |
| **P5 Entitlements, performance, hardening** | `EntitlementCheckStep`/`@RequiresFeature`, AI scoring behind it, load/scale, monitoring, isolation sweep | Licensing exists only as design today; do not ship AI scoring earlier |

## 1. Epics and stories

### E-P0 — Correctness of the built pipeline (marketer)
- **J-P01 (P0) Constraint + conflict translation.** Add `ConflictTranslator`; wrap check-then-insert in opportunity/submission/match create; return existing (200) or 409, never 500. *Depends:* none. *Accept:* two concurrent identical requests ⇒ one row, both succeed; no unhandled `DataIntegrityViolationException`. *Verify:* IT (threads).
- **J-P02 (P0) Live-submission unique key (M5 part 1).** Generated `live_key` + UNIQUE; pre-flight dedupe report. *Accept:* duplicate live submission impossible at DB level; migration refuses if duplicates remain. *Verify:* IT.
- **J-P03 (P0) Optimistic locking.** `@Version` + `If-Match` on `requirement_match`, `mkt_opportunity`, `mkt_submission`, `talent_application`; 409 `VERSION_CONFLICT`. *Verify:* unit + IT.
- **J-P04 (P0) One assign service.** `OpportunityAssignmentService` used by the three assign paths; same gates (job open, scope, consent, resume approved) and idempotency; aliases kept. *Accept:* the three endpoints behave identically; golden tests. *Verify:* unit.
- **J-P05 (P0) Consent gate.** `ConsentGate` in matches/opportunities/submissions/resumes services; FULL pairing + `edit_allowed` for resume edit (ADR-009). *Accept:* NONE ⇒ 404 for consultant-specific data; SUMMARY ⇒ summary only. *Verify:* matrix test.
- **J-P06 (P0) Assignment status + history.** `MktScope` honours `status`; add `marketer_assignment_event` (M7 part). *Accept:* INACTIVE row grants nothing; reassign writes history. *Verify:* unit + IT.
- **J-P07 (P0) Resume change invalidates approvals.** Edit ⇒ un-submitted authorizations `STALE`; submit re-checks version. *Accept:* F6 scenario ends STALE. *Verify:* IT.
- **J-P08 (P0) Isolation sweep rows.** Add `OrgIsolationIT.COVERAGE` rows for all `mkt` routes; fix what the sweep finds. *Verify:* IT (owner's machine).
- **J-P09 (P1) `Idempotency-Key` on assign/submit/approve/applicant writes.** *Verify:* IT replay.
- **J-P10 (P1) One primary resume per consultant** (generated unique key; enforce or drop `visibility`). *Verify:* IT.

### E-P1 — Job core
- **J-J01 (P1) M1+M2 schema.** Provenance/lifecycle columns, `org_job_source_occurrence`, `org_job_change_event`, FULLTEXT + `search_text`. *Accept:* migrations idempotent; backfill per doc 56. *Verify:* IT.
- **J-J02 (P1) `JobQueryService`.** SQL filters, keyset pagination, facets (bounded sample, orgId-keyed cache); `mkt/jobs` switches to it (response unchanged). *Accept:* all filters of doc 53; p95 target on 50 k jobs; KPIs via COUNT. *Verify:* unit + perf IT.
- **J-J03 (P1) Dedupe candidates + merge.** `dedup_key` job, duplicate suggestions endpoint, merge service (re-point rows, audit, reversible event). *Accept:* different location/end-client never candidates. *Verify:* unit + IT.
- **J-J04 (P1) Adopt-from-public.** `GET /mkt/public-postings`, `POST /mkt/jobs/{id}/adopt-from-posting` (copy + `posting_id` + occurrence); static check that tenant code never writes `job_posting`. *Accept:* adopt idempotent per `(org, posting_id)`; survives posting deletion. *Verify:* unit + IT.
- **J-J05 (P1) Source sync service.** Landing API for connectors (`recordSync` extended: upsert occurrences, change events, MISSING/EXPIRED/CLOSED rules, overrides). No external calls. *Verify:* unit + IT.
- **J-J06 (P2) Connector adapter** (Phase 16 dependency, not this plan): ATS public APIs + one licensed aggregator through J-J05.

### E-P2 — Match and assignment core
- **J-M01 (P0/P1) `JobMatchScorer`.** Extract, golden-test current formulas, ship v2 with `algorithm_version`; seeder + manual assign use it. *Verify:* unit.
- **J-M02 (P1) M3 schema + persistence of components/explanation/staleness.** *Verify:* IT.
- **J-M03 (P1) Staleness events + per-org recompute job** (`TenantScoped`, lease/claim for multi-instance, metrics). *Accept:* job/resume/profile change marks stale; recompute clears; two instances do not double work. *Verify:* IT.
- **J-M04 (P1) M4 schema + opportunity lifecycle service** (doc 52 §2), allowed-transition table, events, `allowedActions[]`. *Verify:* unit (every transition).
- **J-M05 (P1) Hard-eligibility rules** (work authorization, availability, closed job) + settings. *Verify:* unit.

### E-P3 — Consultant API and pages
- **J-C01 (P1) `flag.enterprise.consultant_jobs` + `ConScope` + permission keys** (`submissions.authorize_override`, `resumes.approve`, settings). RoleTemplates/doc-sync tests updated. *Verify:* unit + sync tests.
- **J-C02 (P1) `con/jobs` (Discovery) + save/interest.** *Verify:* unit + IT + isolation rows.
- **J-C03 (P1) `con/matches`** (list, detail, dismiss, ask-marketer, recompute). *Verify:* same.
- **J-C04 (P1) `con/opportunities`** (list, detail, viewed/interest/decline/request-info/resume-change). *Verify:* same + lifecycle.
- **J-C05 (P1) BFF + libs + registry + catch-all branch + nav item "Job Discovery".** *Verify:* vitest + build.
- **J-C06 (P1) Shared `JobCard/JobFilters/MatchScoreBadge`** + Discovery/Matches/Assigned pages (theme per boards to be supplied). *Verify:* vitest.
- **J-C07 (P1) `JobDetailsView` + drawer + compact screen + `useCompact`**; marketer `JobSheet` migrates. *Accept:* ≥1024 drawer, <1024 screen with back + preserved filters; sections per context. *Verify:* vitest + Playwright 1440/820/390.

### E-P4 — Submission, approval, application consistency
- **J-S01 (P0/P1) Consultant authorization** (`con/submissions/{id}/authorize|reject|revoke`; marketer request-authorization; admin override; resume-version binding; flag per org). *Accept:* marketer cannot approve; STALE/REVOKED semantics of doc 52 §3. *Verify:* unit + IT.
- **J-S02 (P1) M5 remainder** (`opportunity_id`, authorization columns, channel/ref). *Verify:* IT.
- **J-S03 (P1) Application entry paths + links (M6)**: direct "I applied", assisted on recorded submit, idempotent per `(org, requirement, consultant)`, `submission_id/match_id` links; stage transition table. *Verify:* unit + IT + E2E-2.
- **J-S04 (P1) Resume approval moves to consultant** (ADR-009 alignment) + admin override. *Verify:* IT.
- **J-S05 (P2) Offer respond + placement link** (`offers.respond`, `application_id` on placement). *Verify:* IT.
- **J-S06 (P2) Unified timeline read model** (`TimelineFeed` union of event tables per job/consultant, role-filtered). *Verify:* unit.

### E-P5 — Entitlements, scale, hardening
- **J-E01 (P1, gating) `EntitlementCheckStep` + `@RequiresFeature` + `AuthzCoverageTest`** (X5.6 dependency); until done `scoreWith=AI` is rejected. *Verify:* unit + IT.
- **J-E02 (P2) AI scoring overlay behind J-E01** + `usage_event` metering + `ai.job_matching` allowance; UI renders from `license` block. *Verify:* IT.
- **J-E03 (P2) Load/perf + monitoring dashboards** (metrics in doc 55 §6). *Verify:* k6 + alerts.
- **J-E04 (P2) Multi-instance safety** for scheduled work (leases). *Verify:* IT.
- **J-E05 (P2) Full permission matrix + E2E journeys + a11y** (doc 57). *Verify:* CI.

## 2. Reusable components (summary)
Tables: `client_requirement`, `requirement_skill`, `mkt_job_meta`, `requirement_match`, `mkt_opportunity(+event)`, `mkt_submission(+event)`, `talent_application(+event/note)`, `talent_interview`, `talent_placement`, `org_resume`, `data_share(+event)`. Code: `MktScope` (pattern), `MktMatchRules`/`MktJobsLogic` (extract), `IdempotencyService`, `TenantScoped`, `OrgAuditService`, `DataShareService`, `JobFitReport`, `SideSheet`/`TimelineFeed`/`ConsentChip`/`FunnelChart`. Public layer: `JobIngestService`, `HttpJobBoardClient`, `JobPostingSearchRepository`.

## 3. Risks and rollback
| Risk | Likelihood/impact | Mitigation | Rollback |
|---|---|---|---|
| Scorer unification changes visible numbers | M/M | golden tests + `algorithm_version` + changelog note | keep v1 behind setting for one release |
| Moving authorization from marketer to consultant changes current workflows | M/H | per-org flag; aliases; admin override | flag off restores marketer-recorded approval |
| Dedupe merge corrupts relationships | L/H | single transaction, audit, reversible event, IT with all relationship types | revert from event log |
| Public adoption drift | M/L | `field_overrides`, change events | un-adopt = stop sync |
| FULLTEXT/indexes slow writes | L/M | measured in perf IT | drop index |
| Docker-less environments skip ITs | H/M | report "not executed" honestly; owner CI gate | – |
| Consultant pages blocked on missing boards | H/L | build against doc 54 structure, apply boards when supplied | – |
| `consultant_profile`↔seat linking gaps (seat-less consultants) | M/M | `ConScope` requires seat-linked profile; admin tool to link | – |

## 4. Definition of done (per story)
Acceptance met · tests added (unit green; IT green *when run*) · docs 50–58 and `progress-tracker.md` updated · additive migration + flag · repositories obey the contract · `OrgIsolationIT` rows for new routes · one commit per story on its own branch, merged by the owner.

## 5. Proposed order of work (after approval)
J-P01 → J-P02 → J-P03 → J-P04 → J-P05 → J-P06 → J-P07 → J-P08 (P0 block, small, high value) → J-J01 → J-J02 → J-M01 → J-M02 → J-M04 → J-C01 → J-C02/J-C03/J-C04 (parallel) → J-C05 → J-C06 → J-C07 → J-S01 → J-S03 → J-J03/J-J04/J-J05 → J-M03/J-M05 → J-S04 → J-E01 → J-E02 → J-E03…J-E05.
