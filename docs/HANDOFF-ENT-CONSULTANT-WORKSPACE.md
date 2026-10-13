# HANDOFF-ENT-CONSULTANT-WORKSPACE — building the Consultant ("My workspace") pages on a second machine

## START HERE

**Who this is for:** an agent/developer on a second machine who builds the **Consultant workspace** (`/w/consultant/**`, the pages a
consultant sees about themselves) while the first machine finishes the Org Admin pages. Work is isolated: new files on its own branch,
merged back later.

**Branch to start from:** `ent-talent` (on GitHub `origin/ent-talent`). It holds the whole enterprise platform (multi-tenant host
resolution, branded login, shell, roles/permissions, org admin pages) plus the shared **talent data foundation**
(clients, consultants, jobs, applications, interviews, placements, resumes, seed data).
```
git fetch origin
git checkout -b ent-consultant-ws origin/ent-talent
```
Never commit to `ent-talent`, `version2`, `main` or any branch you did not create. Do not push to those. Push only your own branch
(`origin ent-consultant-ws`, or `ent-consultant-<page>` per page if you split the work).

**First tasks (in order):**
1. Read this file, `CLAUDE.md` (hard rules), `docs/HANDOFF-ENTERPRISE-ADMIN.md`, `docs/enterprise-v2/real-stack-runbook.md`,
   **`docs/enterprise-v2/talent-foundation.md`** (the tables, repositories, seeded data and KPI formulas you will read), and
   `docs/enterprise-v2/38-ux-talent-workspaces.md` §3 (Consultant workspace) + §1 (shared rules) + §6 (empty states).
2. Run the real stack (below) and open an existing admin page (e.g. Consultants, Jobs) to see the patterns you must copy.
3. Build one page end to end per branch/commit series (list below), each with API + web + tests + a real-stack journey.

## The pages (from `api/src/main/resources/config/ent/workspaces.json`, workspace `CONSULTANT`, label "My workspace")
home `/w/consultant` · profile · resumes · matches · opportunities · applications · interviews · interview-prep · offers · placements ·
features · notifications · settings (all under `/w/consultant/…`). Design intent for each is in `38-ux-talent-workspaces.md` §3 and the
owner docs: 13 (profiles), 17 (assignments), 30 (resumes), 31 (talent marketing), 32 (applications), 33 (interviews), 35 (placements).
**Look and feel:** the user supplies a board image per page (`design/enterprise-*/…png`); when a board exists it must be matched
EXACTLY (layout, fonts, sizes, icon-tile colours, pills, spacing). If no board exists yet, follow the existing admin pages' look
(same tiles, tables, drawers, bee help card) and ask for the board before polishing.

## Rules that make this independent from the other machine (read twice)
- **New files only.** Put your code in your own folders: web `web/src/components/ent/consultant-ws/**`,
  `web/src/lib/ent/consultant-ws/**`, routes `web/src/app/(tenant)/%5Ft/w/consultant/<page>/page.tsx` (real pages are plain sibling
  folders and win over the catch-all), BFF `web/src/app/api/orgs/[orgId]/me-workspace/**` (or per page); API
  `api/.../web/rest/ent/consultantws/**` + `service/ent/consultantws/**`; tests beside them.
- **The consultant sees only their own data.** Every endpoint is scoped OWN (the logged-in member's consultant record); permission
  keys already exist (`resumes.view_for`, etc., see `PermissionCategories` / `RoleTemplates`). Consent rules (E1): the marketer prepares,
  the **consultant submits**; Kiwiply never submits. HR/Finance data is record-only. **No sensitive PII** (SSN, bank, tax, passport,
  DOB) anywhere, ever.
- **Shared files — add only your own entries, never reformat/restructure:**
  `api/src/main/resources/config/ent/workspaces.json` (flip only your `CONSULTANT` items live), `OrgIsolationIT` (your route rows and
  fixtures only), `docs/enterprise-v2/progress-tracker.md` (one Log line per task), `web/playwright.real.config.ts` (or give each page
  its own playwright config like `playwright.real.resumes.config.ts`), `api/openapi.json` (regenerate, never hand-edit).
- **Database:** new tables/columns only via a NEW Liquibase changelog file with a unique timestamp name (`20261103xxxxxx_ent_cws_<topic>.xml`),
  additive, precondition-guarded, follows `docs/enterprise-v2/41-database-design.md` R1–R10 (org_id on org-owned tables, composite
  tenant FKs). Never edit an existing changelog. Register it at the END of `master.xml`.
- **Shared UI:** use `@kiwiply/ui` primitives only (no inline `<svg>`, no hand-rolled primitives). Need a new shared visual? Add it to
  `packages/ui` first as a small additive change (new file or new optional prop) and note it. Theme only through `--brand-*`
  variables (never hard-coded colours). Enterprise-only bee mascot, one per view.
- **Do not touch** the shell sidebar/header (`web/src/components/ent/shell/**`, `web/src/lib/ent/shell.ts`) or `packages/ui` shared
  styles beyond additive props; the first machine is still finishing them. If you need a shell change, write it in your handoff notes.
- **Quality bar per page:** vitest component + lib tests, API ITs (incl. cross-tenant 404 and permission denial), `OrgIsolationIT`
  rows for every new route, a Playwright journey on the real stack (`PW_CHANNEL=chrome`) including `beta.localhost` cannot see
  `acme` data, a 390px phone check, honest empty states (no fake numbers), and screenshots saved under `design/enterprise-*/built/`.

## Run the real stack (details: `docs/enterprise-v2/real-stack-runbook.md`)
- MySQL container (`rb-demo-mysql` on the first machine; any MySQL 8/9 works): create your own database, e.g. `dossier_ent_cws`.
- API (JDK 17): `cd api && ./gradlew bootRun` with `DEMO_ENABLED=true ENT_DEMO_SEED=true APPLICATION_LIQUIBASE_ASYNC_START=false
  DOSSIER_TENANT_HOST_SECRET=<any> DEMO_ALLOW_WRITES=true` + the datasource env from the runbook. First boot seeds **Acme Staffing**
  (rich: ~150 consultants, applications, interviews, placements, resumes, marketers) and **Beta Talent** (smaller). Seeding is
  slow (~14 min the first time on a loaded machine); the seeders are idempotent.
- Web: **production build + `next start`** (Next dev mode does not work inside git worktrees): `npm ci` at the repo root, then
  `cd web && npm run build && npx next start -p <port>` with `TRUST_PROXY_HOST=false`, `DOSSIER_API_URL=http://127.0.0.1:<apiport>`, and the same host secret.
- Open `http://acme.localhost:<port>/login` → **Demo accounts** tab → pick a member. Use a member whose role is **Consultant**
  (see the demo people in `EnterpriseDemoSeeder` / `web/scripts/fixtures/enterprise-demo.json`); Sarah Chen is the Org Admin.
  The Consultant demo member must be linked to a `consultant_profile` row to see data — if the seeded consultant members are not
  linked yet, linking them is your first small task (extend `TalentDemoSeeder`, idempotent).
- JDK/Docker for tests: `JAVA_HOME` = JDK 17, `DOCKER_API_VERSION=1.44 JAVA_TOOL_OPTIONS=-Dapi.version=1.44`. One gradle at a time.
  Never run machine-wide `taskkill`/`killall`; stop only the PIDs you started.

## Data you can use (all org-scoped, seeded) — see `talent-foundation.md`
`consultant_profile`, `consultant_skill`, `client_account`, `client_contact`, `client_requirement` (jobs), `requirement_skill`,
`requirement_match`, `marketer_assignment`/`marketer_capacity`, `talent_application` (+events, notes), `talent_interview`,
`talent_placement`, `org_resume` (+experience), `org_spend_entry`. Repositories are in `repository/ent/talent` (every method takes
`orgId` first). Admin page APIs already exist for most of these (Consultants, Jobs, Applications, Resumes, Marketing Assignments)
— read `docs/enterprise-v2/page-<name>.md` on the integrated branch for their contracts; build consultant-scoped (OWN) views, do not
change the admin endpoints.

## Merging back
The first machine will merge your branch into the integration branch with `git merge --no-ff`, resolving only the shared-file
additions listed above. Keep your commits small and logical; keep your branch merged from `origin/ent-talent` (or `ent-all` once it
is published) regularly (`git merge origin/ent-talent`) so conflicts stay tiny. Write `docs/enterprise-v2/page-<yourpage>.md` per page
(endpoints, permissions, components, real vs empty-state, known gaps) and a Log line in the progress tracker.

## Status at hand-off (2026-10-13)
`ent-talent` = platform + six admin pages (Dashboard v1, Employees, Invitations, Teams, Departments, Roles) + talent foundation.
In progress on the first machine (will be published as `ent-all` after verification): Consultants, Jobs, Marketing Assignments,
Applications, Resumes pages, the rebuilt Dashboard, and exact-match polish passes. Open design decisions are in
`docs/enterprise-v2/08-decisions-for-user.md` (D2, E8, E21–E29). Requirement coverage: `docs/enterprise-v2/45-requirements-coverage.md`.
