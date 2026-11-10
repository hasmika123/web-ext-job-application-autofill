# version2 test pass report

Branch `v2-test-fixes`, from `origin/version2` = `9b3f1034` (every branch of both machines merged). Run on 2026-10-15/16 by the Sonnet QA pass.

## 1. Counts: baseline vs after

| Suite | Baseline on the unchanged tip | After the fixes |
|---|---|---|
| API unit (`./gradlew test`) | **could not run: the test tree did not compile** (`OrgResumeBuilderIT.java:910 illegal start of expression`, a merge dropped one `}`). With that brace restored: 2827 passed, 0 failed | 2827 passed, 0 failed |
| API integration (`integrationTest`, 207 classes) | not runnable on the tip (same compile error). With the brace restored, run in 9 separate JVM chunks: 2124 tests, **28 failed** | 2124 tests, **1 failed** (`EntRolesMigrationIT`, product bug 1). 6 more failed in the last pass (`JoinResourceIT` x2, `JoinTenantHostIT` x4, HTTP 429) and passed when re-run alone, see section 5 |
| `OrgIsolationIT` alone, last | passed (10/10) | passed (10/10) |
| Web vitest | 330 files passed, 1 skipped; 3867 tests passed, 3 skipped | identical (the changes are e2e only) |
| `tsc --noEmit` | clean | clean (see the `.next/types` note, section 5) |
| `eslint .` | **1 error** (`web/e2e/stories/_support/story.ts` rules-of-hooks), 19 warnings | 0 errors, 19 warnings |
| `npm run build -w web` | OK | OK |
| Playwright, mock, default config | the default config collected 220 tests in 28 files, 12 of them real-stack specs with no guard. The 16 mock files (175 tests) gave 148 passed, 22 skipped, 5 failed | 175 tests, 151 passed, 22 skipped, 2 failed, both in `onboarding-v2.spec.ts` and both passing alone (26/26): load flakes, section 5 |
| Extension `npm test` | 31 suites green | 31 suites green |

**Chunking.** The whole integration suite in one JVM hangs: the test JVM is capped at 1 GB (`maxHeapSize` in `api/gradle/profile_dev.gradle`) and runs out of memory (`OutOfMemoryError ... JPLISAgent`) after about 370 tests, after which Gradle waits forever. I ran it as 9 package-based chunks (`web.rest.A*`..., `ent.*`, `consultantws.*`, `mkt.*`, `org.*`, `service.*`...), each in its own JVM, and checked that every IT class produced a result (207 of 209; the other two are abstract bases). Consider doing the same in CI or raising the heap.

## 2. Failure table

Verdicts: ADJUST TEST, PRODUCT BUG, FLAKY/LOAD, PRE-EXISTING.

| File :: test | Error | Explaining change | Verdict |
|---|---|---|---|
| `OrgResumeBuilderIT` (whole API test tree) | `illegal start of expression`: the closing `}` of `aConsultantInTheOrganizationCannotArchive...` is missing | `42bdad26` Merge ent-share-links (conflict resolution dropped a line) | ADJUST TEST (merge mistake in a test file; restored the brace) |
| `ConOpportunitiesIT` x8 | `ConstraintViolation: updatedAt must not be null` persisting an `Application` | `application.updated_at` is `@NotNull` since the first schema; the fixture (`b7eb54cc`) never set it. Never executed by its author | ADJUST TEST (fixture sets it) |
| `ConOpportunitiesIT.viewedInterestedAndApplied...` | `linkedApplicationId` expected 1508 was 0 | `2549e57b` ent-marketer: no `pipeline_application_link` at consent NONE; the fixture consultant had no share | ADJUST TEST (fixture grants SUMMARY, the intended path) |
| `ConsultantHomeResourceIT.aConsultantGetsTheirTiles...` | sparkline expected empty was `[0,0,0,0,0,0]`; then `mode` expected VIDEO was NOT_SET | `19203e66` ent-consultant: Home reads real submissions and interview mode. Its own test edit left a stale assertion and contradicted itself (VIDEO and NOT_SET for the same field) | ADJUST TEST |
| `ConsultantResumesResourceIT.renameAndVisibility...` | approvalStatus expected APPROVED was PENDING | `d5bc7cca` OrgResume defaults to PENDING. Already recorded as pre-existing in `HANDOFF-ENT-RESUME-BUILDER-IN-ORG-REPORT.md` | ADJUST TEST (fixture row is APPROVED, the test is about an approved resume) |
| `MktResumesIT.aMarketerSeesFewerResumes...` | admin id set missing ids that the marketer sees | the helper reads one page of 100 and the demo seed holds more. Already recorded as pre-existing in the same report | ADJUST TEST (helper reads every page) |
| `MktJobsIT.assignWrites...` | 409 `RESUME_NOT_APPROVED`, then a 15 s timeout | the approved-resume gate in `OpportunityAssignmentService` (ent-marketer, Oct 14); the fixture consultant had no resume. The assign writes through `REQUIRES_NEW` helpers that cannot see the class transaction's uncommitted rows | ADJUST TEST (approved resume fixture, pool of 4, this one test runs without the class transaction) |
| `MktJobsIT.aConsultantOutsideTheScope...` | 15 s timeout | single connection pool with `REQUIRES_NEW` | ADJUST TEST (pool of 4) / FLAKY under load |
| `MktMatchesIT.assignRecordsTheMatchOnly` | 409 `CONSULTANT_INACTIVE`, then Hikari "connection is not available" | same gate (the first seeded SUGGESTED match belonged to an inactive consultant), and `REQUIRES_NEW` with a pool of 1 | ADJUST TEST (pick an assignable match, pool of 4) |
| `FromExtensionIT` x3 | Hikari pool exhausted; then ASSIGNED ledger rows 0 (the first two options were `CONSULTANT_INACTIVE`); then teardown FK errors | pool of 1 with `REQUIRES_NEW`; the picker lists inactive consultants; the clean-up ran outside a transaction on an auto-commit-off datasource, so its deletes were rolled back. The class says it was never executed | ADJUST TEST (pool of 4, assignable consultants, `TransactionTemplate` clean-up, 240 s on the seeding `@BeforeEach`) |
| `MktFollowupsIT.theMarketerSeesTheBoard...` | 18 completed today expected, was 25 | a marketer also sees the consultants she backs up; the helper ignored `MktScope` ignoring non-ACTIVE assignments (`b6e671cc`). Never executed (page doc) | ADJUST TEST (counts from rows, ACTIVE assignments only) |
| `MktHomeIT.theMarketerSeesTheSixTiles...` | assigned tile 35, helper 36 | same ACTIVE-assignment rule | ADJUST TEST |
| `MktTasksIT.theMarketerSeesTheBoard...` | tabs 24 expected, was 23 | tasks of a consultant whose assignment is PAUSED are out of scope | ADJUST TEST (seeded numbers minus out-of-scope rows) |
| `MktActivityIT` | not failing; same helper pattern | same rule | ADJUST TEST (preventive, same helper) |
| `OrgClientResourceIT.aNoteIsValidated...` | a card number in a note was accepted (201) | the scanner never covered cards ("cards go to Stripe", and `progress-tracker.md` line 446 made the same call for `OrgInterviewResourceIT`) | ADJUST TEST (SSN instead of a card) |
| `OrgClientResourceIT.aPrivateMailbox...` | consumer-domain list set as an `OrgSetting` had no effect | `ClientsSettings.consumerDomains()` reads the platform `app_setting`; only the two day counts are org overrides | ADJUST TEST (writes the platform setting, restores it) |
| `OrgClientResourceIT.theTilesAre...` | previous 3 expected, was 2 | Gamma is created 10 days ago: not "at least 30 days", and it is "new this month" | ADJUST TEST (2 and 1) |
| `OrgClientResourceIT.filtersSearchSortAndPaging` | 15 s timeout | load | FLAKY (passes in the later runs) |
| `BillingSchemaIT.billingFoundation` | overdue count 1 expected, was 2 | date-dependent: the latest recurring invoice is due 14 days after its period, so from the 15th of the month it is overdue too (the 16th when run) | ADJUST TEST (expectation follows the calendar, the onboarding invoice is always asserted) |
| `TalentSchemaIT.sixMonthsOfHistoryWithARisingTrend` | interviews month 3 = 11, month 2 = 14 minus 2 | date/time-dependent random spread of the demo seed | ADJUST TEST (a month is never below the same month a quarter earlier; both six-month sums stay). Passed unchanged at another hour: flaky |
| `MktSubmissionsIT` x2-3, `Phase1JobIdentityIT` | `seed() timed out after 15 seconds` | the first class on an empty database seeds the whole demo world; lifecycle methods default to 15 s (`junit-platform.properties`) even with a class `@Timeout(240)` | ADJUST TEST (`@Timeout(240)` on the seeding `@BeforeEach`) |
| `EntTenancyMigrationIT` | 120 s timeout | load | FLAKY: passes alone (3 runs, 29 tests with the Join ITs) |
| `EntRolesMigrationIT.theRolesChangelogBackfillsEveryLiveMemberAndRollsBackCleanly` | `RollbackImpossibleException: No inverse to RawSQLChange` | `20261110010000-5`, `-6` and `20261110020000-7`, `-8` (change-audit backfills, `ae7db99d` / `161485e5`) have raw `<sql>` and no `<rollback>`; the test rolls back every changeset after the roles changelog | **PRODUCT BUG 1** |
| `JoinResourceIT` x2, `JoinTenantHostIT` x4 (last chunk only) | HTTP 429 instead of 200/404/409 | the invite rate limiter is process-wide; the chunk ran twice as slowly (machine shared with other agents). They passed in the first chunk run and alone | FLAKY (proof: `EntTenancyMigrationIT`+Join ITs alone, 29/29) |
| `tenant-shell.spec.ts` "single-workspace owner... every menu page resolves" | `/w/admin/teams` (and the rest) match none of the page markers | the Teams, Departments, Consultants, Resumes, Jobs... pages were built after the test; Settings is real-API only | ADJUST TEST (markers for the built pages) |
| `tenant-shell.spec.ts` "Sarah: two workspaces, the switcher" | `[data-workspace-switcher=sidebar]` not found | the board shell (`ent-final`) opens the switcher from the account menu or Ctrl+Shift+W; there is no sidebar chip | ADJUST TEST |
| `tenant-unknown.spec.ts` test 1 | body lacks `isn&#x27;t available` | `next dev` streams the generic 404 in the flight payload with a raw apostrophe | ADJUST TEST (regex accepts both) |
| `tenant-unknown.spec.ts` test 2 | 307 instead of 200 | X2.6 login-first routing (`04298038`): a signed-out `/` on a tenant host redirects to `/login` (it also expected the title "Acme Staffing", the mock name is "Acme") | ADJUST TEST (asserts the 307 and the `/login` title) |
| `web/e2e/stories/_support/story.ts` | eslint `react-hooks/rules-of-hooks` on Playwright's `use` | `e0d9f106` story kit | ADJUST TEST (renamed the callback `provide`) |
| default `playwright.config.ts` | collects 12 real-stack journeys | G13 in `E2E-JOURNEYS.md` | ADJUST TEST (`testIgnore`, the real configs untouched) |
| `onboarding-v2.spec.ts:471` and `:91` (other widths) | 686.58 vs 686 px; axe color-contrast on one step | layout/animation timing | FLAKY: both passed in an isolated file run (26/26); different tests failed in each of three full runs |

Nothing in `security/**`, `AuthenticateController`, `DomainUserDetailsService`, `UserService` or `AccountScopes` was touched, and no security assertion was weakened (no assertion was deleted; the card-to-SSN change keeps the scanner assertion on a never-collected class, matching the tracker's earlier decision).

## 3. Product bugs found

1. **Change-audit changelogs cannot be rolled back.** `20261110010000_change_audit_tracker.xml` changesets `-5` and `-6` and `20261110020000_change_audit_enterprise.xml` `-7` and `-8` are data backfills (`<sql>`) with no `<rollback>`, so Liquibase refuses to roll back past them (`EntRolesMigrationIT`). Suggested fix: add `<rollback/>` (empty, they only fill nullable columns) to each. I tried that locally: the rollback then gets further and fails on a **second** problem: `Cannot drop index 'uk_member_org_id': needed in a foreign key constraint` while undoing `20261018010000-20` (`ent_employees`), meaning a changeset added after it creates a foreign key onto `org_member(org_id, id)` and its rollback does not drop it (or is empty). I reverted the experiment (not a merge mistake, not mine to fix); the owner should find that foreign key (`information_schema.referential_constraints` on a migrated schema) and give its changeset a real rollback.
2. **Demo seed shows two overdue invoices after the 14th of the month** (Billing board tile "1 overdue"): `BillingDemoSeeder` makes the open latest recurring invoice due `period end + 14 days`. Cosmetic for the demo; the test now follows the calendar.
3. **Test harness limit:** the integration test JVM (1 GB) cannot run the whole suite in one process (OOM, then an indefinite hang). Not a product bug; see section 1.

No merge mistake in product code was found; the only merge mistake was the dropped `}` in `OrgResumeBuilderIT`.

## 4. Real-stack Playwright specs still to run (need the seeded Spring + MySQL stack)

Configs (not run here): `playwright.real.config.ts` (employees, dashboard-v2, invitations, consultants, jobs, marketing-assignments, resumes, applications), `playwright.real-applications.config.ts`, `playwright.real-clients.config.ts`, `playwright.real-interviews.config.ts`, `playwright.real-placements.config.ts`, `playwright.real.consultant.config.ts` (`consultant-*.spec.ts`), `playwright.real.resumes.config.ts`, `playwright.realstack.config.ts` (`tenant-groups`), and `tenant-roles.spec.ts` (guarded by `E2E_REAL_STACK=1`). Also `playwright.stories.config.ts` (the recorded stories; its eslint error is fixed). The 12 specs removed from the mock run: `consultant-home`, `consultant-pages`, `tenant-applications`, `tenant-clients`, `tenant-consultants`, `tenant-employees`, `tenant-groups`, `tenant-interviews`, `tenant-jobs`, `tenant-marketing-assignments`, `tenant-placements`, `tenant-resumes`. Three more real-stack specs (`tenant-dashboard-v2`, `tenant-invitations`, `tenant-roles`) already guard themselves and show as the 22 skipped tests of the mock run.

## 5. Remaining flaky / environment items, with proof

- **`EntTenancyMigrationIT`** (120 s timeout): failed in 3 loaded runs, passed alone (`it3/joins`, with the Join ITs: 29 tests, 0 failed).
- **`JoinResourceIT`, `JoinTenantHostIT`** (429): passed in chunk `c09-org` of the first pass (153 tests, 0 failed) and alone; failed when the chunk took 33 min instead of 17.
- **`TalentSchemaIT`, `BillingSchemaIT`**: passed or failed depending on the day and hour, now calendar-proof.
- **`onboarding-v2.spec.ts`** (mock Playwright): 26/26 when the file runs alone, 1-4 failures (different tests) in every full run on a loaded machine.
- **`tsc --noEmit` after `next build`**: `.next/types/validator.ts` leaks stale route types (`'/_t' is not assignable to LayoutRoutes`) into `tsc`; clean when `.next` is absent or run before the build (the same quirk is noted in `HANDOFF-ENT-RESUME-BUILDER-IN-ORG-REPORT.md`).
- **Environment:** Docker via Testcontainers (`DOCKER_API_VERSION=1.44`), Playwright with `PW_CHANNEL=chrome` and ports 3191-3193 (the default 3100/8180 may belong to other sessions; `tenant-unknown.spec.ts` hard-codes `:3100` only in the Host header, which is harmless).
- **Generated file:** `web/src/lib/generated/parser-core.cjs` comes from `npm run sync:parser -w web`; `npm ci` alone does not make it.
