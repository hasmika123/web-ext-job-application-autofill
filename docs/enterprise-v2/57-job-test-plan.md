# 57 — Test plan (DESIGN, proposal)

> Environment facts (V): API ITs are `@IntegrationTest` (`@SpringBootTest` + Testcontainers MySQL) and **need Docker**; Docker-free tests are Mockito/`standalone MockMvc` (`*ResourceTest`), `EntRepositoryContractTest`, interceptor/tenant tests, and web vitest. Playwright configs exist (`playwright.real*.config.ts`). The plan marks which tier each test needs; the owner's machine/CI runs the Docker tier.

## 1. Unit (no Docker) — must pass on any machine
- `JobMatchScorer`: golden fixtures reproducing the **three current formulas** (`MktJobsService.overlapScore`, `MktOpportunitiesService.overlapScore`, `MktMatchRules`) before unification; then v2 cases: hard-eligibility (work authorization, availability window, closed job) excludes from ranking; soft preferences change score only; deterministic; missing-skills list; weights from settings.
- `JobQueryService` filters (every filter in doc 53 §2.1), keyset boundaries (ties on `posted_at`), facet counts, rate normalisation (yearly/2080), `ASSIGNED_ONLY` visibility.
- Dedupe: `dedup_key` normalisation (case, punctuation, "Sr."), **same title+client different location ⇒ not a candidate**, different end-client ⇒ never; merge re-points relationships; occurrence status machine (`ACTIVE→MISSING→EXPIRED`) and job closure only when all occurrences gone.
- Adopt sync: respects `field_overrides`; source conflict priority; hash unchanged ⇒ no event.
- State machines (doc 52): every allowed and every **illegal** transition (409), idempotent repeat (200 no-op), `If-Match` conflict, who-can matrix per actor.
- Submission authorization: bound to resume version; edit ⇒ `STALE`; revoke semantics for SUBMITTED vs not; override audit; live-key uniqueness behaviour in the service pre-check.
- `ConsentGate` over `data_share.scope` NONE/SUMMARY/FULL × every marketer read/write path (the F7 matrix).
- `ConflictTranslator`: unique-violation ⇒ same response as the pre-check.
- DTO guard: reflection test that `Con*` DTO classes contain no field named like marketer/other-consultant data (`marketerNote` only in the assignment DTO addressed to self, no `matches[]`, no `contact*`, no `ownerMemberId`, no bill rate unless setting).
- `ConScope`: no seat / no consultant_profile / suspended ⇒ 404; id never from request.
- Resource tests (MockMvc standalone): every `con` handler has `@OrgPermissionRequired`; error mapping; validation; sensitive-text 422; no 403 anywhere.
- Repository contract: new repositories extend bare `Repository`, `orgId` first.

## 2. Integration (Docker)
- Liquibase M1–M8 on empty and on a seeded DB (counts, idempotent re-run, backfill correctness, pre-flight failure when duplicates remain, composite-FK refusal across orgs).
- **Cross-tenant 404s for every new route** through HTTP (not stubbed scope): other-org owner, platform admin without org, no-org user, suspended/invited/departed seats, and every role lacking the permission; also org B owner with org A ids on org B's own path. **Add rows to `OrgIsolationIT.COVERAGE` for all `con` routes and the new `mkt` routes** (it currently has none for `mkt`, F15) — required for the sweep `everyOrgRouteIsListedInTheCoverageRegistry`.
- **Concurrency:** two threads assign the same pair (one row, both 200/200-existing); two marketers create the same submission (one row, one 409/200-existing); authorize vs resume edit race (authorization either bound to old version and then STALE, or rejected `RESUME_CHANGED`); recompute vs assignment; optimistic-lock `VERSION_CONFLICT`.
- **Idempotency:** replay of `Idempotency-Key` for assign/authorize/apply returns the stored response; reuse with a different body ⇒ 422.
- **Recompute job** per org via `TenantScoped`: wrong-tenant data never read (seed two orgs with overlapping skill names and ids); two instances running concurrently claim disjoint work.
- **Source sync:** adopt, update (override respected), disappear → MISSING → EXPIRED → job CLOSED; retry/duplicate delivery of the same payload (idempotent); malformed payload quarantined.
- Search performance smoke: 50 000 jobs × 3 orgs, discovery p95 < 300 ms with filters (MySQL FULLTEXT + indexes); KPI counts use indexes (EXPLAIN assertions).
- Audit: each write produces exactly one `org_audit_event`; event rows appended; HIGH-risk actions carry reason.
- Entitlements (when built): licensed vs unlicensed consultant on `scoreWith=AI` ⇒ 402; core routes unaffected; metering rows created exactly once per retry.

## 3. Permission tests (matrix, IT or MockMvc with real interceptor)
Roles × routes × expected status (consultant, marketer ASSIGNED, marketing manager TEAM, org admin, HR, finance, exec viewer, no-role) for each endpoint in doc 53 — generated from the route registry so a new route without a row fails CI.

## 4. Frontend (vitest + Playwright)
- Component: lists per page (filters, empty, error/retry, loading), `JobDetailsView` sections per `context`, `allowedActions[]` rendering, wrapper choice (`useCompact` mocked at 1023/1024), back-navigation preserving filters, optimistic update + rollback + 409 reload prompt, no hex colours/inline svg (lint), `WorkspaceDocSyncTest` for the new nav item.
- Playwright real-stack journeys (Docker + API): **E2E-1 happy path:** job adopted → match → marketer assigns → consultant views (state VIEWED) → interested → marketer prepares resume + requests authorization → consultant authorizes → marketer records submitted → application tracked → interview → offer → placement. **E2E-2 direct:** consultant applies without marketer; later a marketer submission for the same job finds the existing application (no duplicate). **E2E-3 revoke:** consent revoked mid-pipeline. **E2E-4 tenant:** `beta.localhost` cannot see `acme` jobs/assignments (URL and API). Viewports: 1440 desktop (drawer), 820×1180 tablet and 390×844 phone (screen + back + sticky bar), screenshots saved under `design/enterprise-consultant/built/`.
- Accessibility: axe on drawer/screen, keyboard path for authorize.

## 5. Non-functional
Load (k6 or Gatling optional): 200 concurrent consultants on discovery; recompute of 10 000 matches per org < 5 min; observability assertions (metrics exist, tenant MDC present).

## 6. Exit criteria per phase
Defined per story in doc 58 (acceptance + verification). A phase is done only when its Docker-tier tests have actually run green; "compiled but not executed" is reported as such (the project's honesty rule).
