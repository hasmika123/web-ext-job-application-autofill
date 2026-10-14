# HANDOFF-ENT-COORDINATOR — Enterprise V2 org-admin pages: state of everything, and how the MAIN (coordinator) machine continues

## START HERE

**Written:** 2026-10-14, when the account's weekly usage hit ~90% and work was stopped on purpose. Everything uncommitted was committed
(WIP snapshots) and every branch below was pushed (never `main`, never merged into `version2`).

**Who you are:** the agent on the **MAIN machine = coordinator**. Other machines run other agents on *their own branches*
(see "Other machines" below). **You do all merging. Other machines never merge into shared branches.** Your job: (1) finish the
org-admin pages here, (2) periodically merge the other machines' pushed branches into the integration branch `ent-all`
(`git fetch origin`, then `git merge --no-ff origin/<branch>`), resolve the few shared-file conflicts, run the tests, re-publish `ent-all`,
(3) report to the user. The user decides when anything goes into `version2` (they said: **do NOT merge into `version2` yet**) or `main`
(never without being asked by name).

**Read first (in order):** `CLAUDE.md` (hard rules), this file, `docs/HANDOFF-ENTERPRISE-ADMIN.md`,
`docs/enterprise-v2/real-stack-runbook.md`, `docs/enterprise-v2/progress-tracker.md` (Log = latest facts), the per-page docs
`docs/enterprise-v2/page-*.md`, `docs/enterprise-v2/talent-foundation.md`, `ops-data-foundation.md`, `billing-data-foundation.md`.
Memory: `memory/enterprise-pages-status-2026-10-13.md`.

**Git setup on a fresh machine:**
```
git clone https://github.com/hasmika123/web-ext-job-application-autofill.git && cd web-ext-job-application-autofill
git fetch origin
git checkout -b ent-all origin/ent-all
```
(Branches are all on `origin` — see table. On the original machine they also exist as worktrees under `.claude/worktrees/<branch>`.)

## The goal (user's words, paraphrased)
Build every Enterprise org-admin page **end to end** (real Spring API + MySQL + seeded demo data + web), and make each page look and feel
**EXACTLY** like its board image. Boards are the source of truth for look/feel; data is real seeded data (numbers differ from the
mock-ups, which is fine; layout, fonts, sizes, colour roles, spacing, radii, shadows, icons, pills, avatars-as-initials, bee help card must match).
21 pages are specified so far and the user will send ~10 more boards later.

## Board → page map (boards live in the repo)
- `design/enterprise-admin/`: employees, invitations, teams, departments, roles-permissions (+ older dashboard)
- `design/enterprise-talent/`: dashboard (new), consultants, jobs, marketing-assignments, applications, resumes
- `design/enterprise-more/`: reports, hr, finance, feature-usage, billing, consultant-licenses, subscription-overview, clients, placements, interviews
- Login: `design/enterprise-login/**` (done). Screenshots of built pages: `design/**/built/`.

## Page status (be honest: NONE is signed off as "exact match" yet)
| Page | Built end to end (API+DB+web+tests)? | Exact match? | Where |
|---|---|---|---|
| Dashboard v2 | yes | no (agent A, WIP) | `ent-dashboard` 502e2cf2; polish WIP on `ent-exact-a` |
| Employees | yes | partly (polished once, then WIP) | `ent-pol-employees` 2ec74731; WIP `ent-exact-a` |
| Invitations | yes | partly | `ent-pol-invitations` 43cc8799; WIP `ent-exact-a` |
| Teams, Departments | yes | partly | `ent-pol-groups` 0998d805; `ent-exact-b` (partial, unverified visually) |
| Roles & Permissions | yes | partly | `ent-pol-roles` 26232421; `ent-exact-b` |
| Consultants | yes | no | `ent-consultants` 28d3e4f5; `ent-exact-b` |
| Resumes, Marketing Assignments, Jobs, Applications | yes | no | their `ent-*` branches; WIP polish on `ent-exact-c` 3669384b |
| Interviews | page in progress | no | `ent-interviews` c927eb8d (WIP, not finished) |
| Clients | page in progress | no | `ent-clients` 0471e466 (WIP) |
| Placements | page in progress | no | `ent-placements` 539c05ca (WIP) |
| Subscription Overview, Consultant Licenses, Billing, Feature Usage | **NOT started** (data layer done) | no | data on `ent-billing-data` dcc5d7f7 |
| HR, Finance, Reports | **NOT started** (data layer done) | no | data on `ent-ops-data` 70de110c |
The first 11 pages (rows 1-9 above except Interviews/Clients/Placements = Dashboard, Employees, Invitations, Teams, Departments, Roles,
Consultants, Resumes, Marketing, Jobs, Applications) are MERGED TOGETHER on `ent-all` and were smoke-tested (all routes load, real data, in
sidebar). `ent-all` does NOT yet contain: `ent-final` (shared look), the polish `ent-exact-*` branches, `ent-interviews/clients/placements`,
`ent-billing-data`, `ent-ops-data`, `ent-boards`. Remaining sidebar pages without boards (Domains, Integrations, Audit Logs, Settings, `/me`
pages): the user will send ~10 more boards; do not build those without boards.

## Branch map (all pushed to origin; SHA at hand-off)
Base/pushed earlier: `version2` eaec3922 (regular app + `demo-admin` account, flag `DEMO_ADMIN_ENABLED`; NOT merged with enterprise), `enterprise` 2ec4f0b0, `ent-admin` 5339ebaa, `ent-talent` 3df7a684 (**frozen shared base for the other machines — never commit to it**).
Integration: **`ent-all` 172aeb94** (= ent-talent + 6 page branches + 4 polish branches + integration fixes; the line to keep advancing).
Shared look: `ent-final` 3764d64c (shell/sidebar/header/tokens/pills/KpiTile; NOT yet merged into ent-all — merge it FIRST, then the polish branches).
Boards: `ent-boards` a665a931 (= ent-all + `design/enterprise-more/`).
Pages: `ent-consultants` 28d3e4f5, `ent-resumes` e0117276, `ent-jobs` d3773396, `ent-marketing` daf1262a (**this is the admin Marketing Assignments page, not the marketer role**), `ent-applications` ef05bdbf, `ent-dashboard` 502e2cf2.
Polish: `ent-pol-employees` 2ec74731, `ent-pol-invitations` 43cc8799, `ent-pol-groups` 0998d805, `ent-pol-roles` 26232421.
Exact-match WIP (cut from ent-final): `ent-exact-a` 6eb26ab1 (Dashboard/Employees/Invitations), `ent-exact-b` 72764048 (Teams/Departments/Roles/Consultants; structural only, never checked visually; production build never finished), `ent-exact-c` 3669384b (Resumes/Marketing/Jobs/Applications).
New pages WIP (cut from ent-boards): `ent-interviews` c927eb8d, `ent-clients` 0471e466, `ent-placements` 539c05ca.
Data layers (cut from ent-boards, no REST/UI): `ent-billing-data` dcc5d7f7, `ent-ops-data` 70de110c.

## Other machines (isolated work; you merge)
- **Consultant workspace (`/w/consultant/**`)**: branch `ent-talent-consultant` from `origin/ent-talent`; handoff `docs/HANDOFF-ENT-CONSULTANT-WORKSPACE.md`.
- **Marketer workspace (`/w/marketing/**`)**: branch `ent-talent-marketer` from `origin/ent-talent`; handoff `docs/HANDOFF-ENT-MARKETER-WORKSPACE.md`.
- They push only their own branches, add only new files + additive entries in shared lists (workspaces.json, OrgIsolationIT rows, tracker, playwright config), never merge into shared branches. Merge procedure for you: `git fetch origin && git checkout ent-all && git merge --no-ff origin/ent-talent-consultant` (then marketer), expect conflicts ONLY in: `OrgIsolationIT.java`, `workspaces.json`, `docs/enterprise-v2/progress-tracker.md`, `docs/roadmap/*` (regenerate with `docs/roadmap/build-master-roadmap.mjs`), `web/playwright.real.config.ts`, `api/openapi.json` (regenerate, never hand-merge), `packages/ui/styles/theme-tenant.css` (keep both sides). Union both sides, never drop either. Run the tests below after each merge.
- Check their reports/commits periodically (`git log origin/ent-talent-consultant`); answer questions; give them boards when the user supplies them (the user may also give new boards directly on their machines — tell them to put images under `design/<area>/` and push).

## Do next (in this order)
1. Fresh machine only: `npm ci` at the repo root, JDK 17, Docker (MySQL container) — see runbook. Original machine: stacks listed below.
2. In `ent-all`: `git merge --no-ff ent-final` (shared look), then the `ent-exact-*` branches **in order a, c, b** (b is structural only), resolving union conflicts (`theme-tenant.css`, shared `KpiTile`, `HelpBanner`, tests). Then rebuild, restart the combined stack, run the 11-route smoke, run tests.
3. **Visually finish the exact match** for the 11 pages, per page: screenshot at 1672x941 next to the board, list differences, fix, repeat, also 1440/768/390. `ent-exact-b` pages were never checked visually.
4. Finish Interviews, Clients, Placements (branches have WIP; merge `ent-final` into each first), then build the 7 pages that now have data: Subscription Overview, Consultant Licenses, Billing, Feature Usage (on `ent-billing-data`), HR, Finance, Reports (on `ent-ops-data`). Merge the data branches into `ent-all` first (they are additive Liquibase + seeders; they changed `TalentDemoSeeder` source labels and `consultant_profile.license_status` seeding — check ITs).
5. Re-run everything (below), publish `ent-all`, report to the user with an honest per-page status table.
6. Wait for the user to say when to merge into `version2`. Trial merge of `ent-talent` into `version2` conflicted in `DemoAccountService.java`, `DemoResource.java` (version2 has the `demo-admin` account), and `docs/roadmap/master-roadmap.html` (regenerate). Resolve only with the user's go-ahead.

## Running things on the original machine (may be stopped)
Combined stack: web `http://acme.localhost:3211/login` → Demo accounts → Sarah Chen; API 18201, DB `dossier_ent_all` (MySQL container `rb-demo-mysql`, port 33511). Regular Kiwiply app: web 3000 + API 18182 (`DEMO_ADMIN_ENABLED=true` gives a `demo-admin` login). Older enterprise stack 3200/18183. Fresh demo seed takes ~14 min; to save time `mysqldump` an existing DB into a new one. Next dev mode does NOT work in worktrees: use production build + `next start`.

## Verification commands (honest results only)
API (JDK 17 `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot`, `DOCKER_API_VERSION=1.44`, `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`): `./gradlew compileJava compileTestJava`; `./gradlew integrationTest --tests '<IT>'` (plain `test` skips ITs): Org*ResourceIT, TalentSchemaIT, OpsSchemaIT, BillingSchemaIT, OrgIsolationIT (slow, ~6 min, run LAST alone), OpenApiContractIT, EntRepositoryContractTest, WorkspaceServiceTest, SettingDefinitionsTest, TenantModulesTest. Testcontainers MySQL init can time out on a loaded machine: re-run, do not weaken tests. Web: `cd web && npx tsc --noEmit` (known noise: `parser-core.cjs` is generated by prebuild), `npx eslint`, `npx vitest run` (known load flakes: `ReasonSheet.test.tsx`, an app-v3 DocumentCanvas test), `npm run build`, Playwright journeys `web/e2e/journeys/tenant-*.spec.ts` with `PW_CHANNEL=chrome` (own configs per page).

## Lessons (cost the user a usage limit; follow them)
- **Never run more than ~5 agents at once**; 10 at once exhausted the 5-hour limit and pinned the CPU at 100%, which then made builds hang (a `next build` sat 50 min). Prefer 3-4, and stagger heavy builds/seeds.
- One gradle at a time per worktree; never machine-wide `taskkill` (kill only your own PIDs); do not restart other agents' servers.
- Duplicate agent hand-back notices happen (a finished agent with a stuck background job re-sends the same report); `TaskStop` the agent to end the repeats.
- When messaging agents by id, double-check the id↔page mapping (I once swapped Marketing and Applications).
- Merge scripts must detect refusal (a dirty regenerated `openapi.json` made merges silently no-op).

## Rules that never change (CLAUDE.md wins)
No sensitive PII (no SSN/bank/tax/passport/DOB; HR/Finance are record-only; cards live in Stripe, only brand+last4 may be mirrored). Additive Liquibase only (no drops/renames of existing objects), new changelog files, org_id + composite tenant FKs. Everything tunable (limits, thresholds, prices) is admin/org-setting driven, never hard-coded; the catalog ships without prices (demo prices are demo-marked `org_contract_price` rows). 404-not-403 for tenant/permission failures. One design system `@kiwiply/ui`, no inline `<svg>`, tenant theme only via `--brand-*` and the `--ent-*` tokens (Acme demo brand = board blue `#1d5bd8`). E1: marketers prepare/request/record, the **consultant submits**, Kiwiply never submits. Gen Z/Notion UX (autosave, no Save buttons, undo toasts). Tab title/icon on tenant hosts must be the org's, never Kiwiply's (done in `tenant-metadata.ts` + workspace page `generateMetadata`; unverified in a running stack). Fable designs / Sonnet agents build. **Never push `main`; never merge into `version2` or `main` without the user's explicit OK.**

## Decisions still open for the user
Whether/when to merge enterprise into `version2` (and resolve the 3 conflicts); `ORG_ADMIN` role holds all permissions except `org.close`/`org.transfer_ownership` (side effect: `member.view_full`/`member.act_for`, consent-gated) — confirm; `docs/enterprise-v2/08-decisions-for-user.md` (D2, E8, E21–E29, esp. E27 point-in-time backup, E28 least-privilege MySQL user before real money); edge work only the user can do (E12 deny rule, `KIWIPLY_ASK_TOKEN`, no `X-Frame-Options: DENY` on tenant hosts, host secret on api+web before enabling the flag in prod); `demo-admin` account is for testing only — remove (`DEMO_ADMIN_ENABLED` unset) before production.

## Repo hygiene audit (2026-10-14) — nothing is lost
- Every local branch of consequence is on `origin`. The old per-story branches (`ent-x*`, `ent-login-v2`, `ent-fix-merge`, `ent-integ`, `demo-sandbox`, `ev2-build-p1`, `ev2-design-e`, `enterprise-v2` lineage) are fully contained in `ent-all`/`origin` history.
- 11 old agent scratch branches held 1 commit each that was on no remote. They are now pushed (not merged) under `origin/archive/worktree-agent-*`: roadmap-area work (`pay`, `plat`, `mob`, `ext`, `ai`, `sup`, `trust`, `mkt` areas + the reconciliation pass `3c577344`), `rb0.3` resume-doc endpoints with ETag/If-Match (`73f07938`), and the `23.0` consultancy-ops timesheets-first design proposal (`f035de06`). The user earlier decided NOT to merge the roadmap-area branches; keep them as archive unless asked.
- The stop-time WIP snapshot accidentally committed Playwright output in `ent-clients` and `ent-placements` (`web/test-results-real-*`); removed in follow-up commits and `web/.gitignore` now ignores `test-results-real-*/`. Other WIP snapshots (`ent-exact-a/c`, `ent-interviews`) were checked: no logs/artifacts committed.
- Untracked scratch files that are intentionally NOT committed: agent `*.log` files in worktree roots, `web/shot-inv.mjs` (ent-pol-invitations), the user's local `.claude/launch.json`, `kiwiply-2026-10-12.bundle`.
- `version2` on origin = eaec3922 (regular app + `demo-admin`). Enterprise is not merged into it by the user's instruction.
