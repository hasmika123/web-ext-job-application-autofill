# 56 — Migration plan (DESIGN, proposal)

> Principles (ADR-023): additive only, flag-gated, precondition-guarded Liquibase changeSets (one per table/column group, `MARK_RAN` on re-run, empty rollbacks except where noted), no data loss, no breaking API change during a release. New changelog files with unique timestamps, registered at the end of `master.xml`, one per concern. Nothing here has been executed.

## 1. Order of schema changes (each independently deployable)
| Step | Changelog (proposed name) | Content | Backfill | Rollback |
|---|---|---|---|---|
| M1 | `…_job_core_columns.xml` | `client_requirement` +cols (`posting_id, external_id, url, apply_url, first_seen_at, last_seen_at, closing_date, closed_reason, dedup_key, field_overrides, work_authorization, version`); `requirement_skill.kind` default `REQUIRED`; indexes `(org_id, dedup_key)`, FULLTEXT `(title, description_text)` + `search_text` | `first_seen_at = posted_at`, `last_seen_at = updated_at`, `dedup_key` computed by a batch `ApplicationRunner` (chunked, idempotent), `kind='REQUIRED'` default | columns left (unused) — flags off |
| M2 | `…_job_occurrence.xml` | `org_job_source_occurrence`, `org_job_change_event` | one occurrence per existing job from `mkt_job_meta.source_label` (`external_id NULL`) | drop tables (empty) |
| M3 | `…_match_explainability.xml` | `requirement_match` +cols (components, missing_skills, explanation, hard_eligible, algorithm_version, resume ref, calculated_at, stale_at, updated_at, version); status validated by Java enum (no CHECK on MySQL 8.0.16- ⇒ DB check optional) | `hard_eligible=true`, `calculated_at=created_at`, `algorithm_version='legacy'`, components NULL (UI shows "not itemised") | columns left |
| M4 | `…_opportunity_lifecycle.xml` | `mkt_opportunity` +cols (state, viewed_at, responded_at, decline_reason, info_request, notes, priority, due_at, assigned_by_member_id, closed_*, version) | `state` derived from `interest` per doc 52 §2 mapping; `assigned_by_member_id` from `requirement_match.assigned_by_member_id` | columns left |
| M5 | `…_submission_authorization.xml` | `mkt_submission` +cols (opportunity_id, authorized_*, authorization_basis, channel_label, external_reference, application_id, version) + `approval_state` values REVOKED/STALE; **live-uniqueness generated key** | **pre-flight dedupe report**: existing duplicate live `(org, consultant, requirement)` rows are listed and the older ones archived (`archived_at`, event `DEDUPED`) *before* the unique key is created — the changeSet fails safely (precondition) if duplicates remain | drop key (not data) |
| M6 | `…_application_links.xml` | `talent_application` +cols (submission_id, match_id, entry_path, personal_application_id, version); `talent_interview` composite FK `application_id`; `talent_placement.application_id` | `entry_path='LEGACY'` | columns left |
| M7 | `…_consultant_state.xml` | `org_saved_job`, `marketer_assignment_event`; `org_resume` generated `primary_key` + unique (one primary per consultant) after a pre-flight that demotes extra primaries (keep the latest approved) | seed one history row per existing assignment (`from=NULL`) | drop tables / key |
| M8 | `…_settings.xml` | settings keys (`consultants.job_discovery`, `consultants.see_rate`, `jobs.source_gone_days`, `consultant_jobs.ai_scoring_enabled`) + flag `flag.enterprise.consultant_jobs` declared **live** | – | – |
Rules: each step ships with its Testcontainers IT (migration, seeded counts, idempotent re-seed, cross-tenant composite-FK refusal) — written here, executed in CI/Docker.

## 2. Code migration (strangler, no big bang)
1. **Extract** (`service/ent/jobs/`): `JobQueryService` (SQL filters, keyset), `JobMatchScorer` (one implementation; golden tests lock the *current* three formulas' outputs on fixtures, then the unified scorer is introduced with `algorithm_version=2` and a documented delta), `OpportunityAssignmentService`, `SubmissionAuthorizationService`, `ConflictTranslator`, `ConsentGate`. `mkt` services become facades calling them (no behaviour change except the F5 unification, flagged).
2. **Add** `con` facades + `ConScope`; BFF; pages (feature-flagged `flag.enterprise.consultant_jobs`).
3. **Deprecate** (one release): marketer `POST /mkt/jobs/{id}/assign`, `POST /mkt/matches/{id}/assign`, `POST …/submissions/{id}/approval` — kept as aliases returning `Deprecation` header; remove next release. `approval` semantic change (marketer can no longer approve) ships behind `submissions.consultant_authorization=true` per org; until the flag is on the marketer path keeps working (the only controlled breaking behaviour; announced in the changelog and the progress tracker).
4. **Repositories** stay bare `Repository`; new `Mkt*/Con*Repository` follow the contract; no edits to `repository/ent/talent/*` beyond the 17 older repos' pre-existing contract failure (separate ticket).

## 3. Data migration for the adopt flow
No bulk copy from `job_posting`. Existing `client_requirement` rows keep `posting_id NULL`. Adoption is user-initiated (marketer) or by stream rule; first adopt creates the row and the occurrence. Existing demo seeders keep working (they set `source`, new columns nullable).

## 4. Environments and flags
`flag.enterprise` (master) → `.marketing` (live) → `.consultant_jobs` (new, default OFF). Demo orgs get both via `EnterpriseDemoSeeder.enableFlags` (the same list that was missing the marketing flag in round 1 — add `FLAG_CONSULTANT_JOBS` there). Production stays dark until the owner turns it on per org (allow-list), per ADR-023.

## 5. Rollout and rollback
Order: M1–M4 + extraction (no user-visible change) → marketer unification + `ConflictTranslator` (F3/F5 fixes) → M5–M7 + consultant authorization behind per-org flag → `con` pages. Rollback at any step = turn the flag off; schema stays (additive). The one destructive-looking step (M5 archive of duplicate drafts) is reversible (`archived_at` + `DEDUPED` event) and runs behind a pre-flight report that must be reviewed.

## 6. Observability during migration
Row-count and duplicate reports as Liquibase pre-flight output; counters for `alreadyAssigned`, `SUBMISSION_EXISTS`, `VERSION_CONFLICT` to confirm the race fixes work in production traffic.
