# QA suite for Kiwiply Enterprise V2: how it is organised and how to run it

> Written 2026-10-14 against branch `ent-integration-all`. Audience: the QA lead who runs and extends the suite, and any product stakeholder who wants to watch a recorded walkthrough.
> Facts below were read from code and docs on that branch. Anything not confirmed is marked **unverified**.

## 1. What this folder is

`docs/enterprise-v2/qa/` is the master QA and product documentation set for the Enterprise V2 tenant product (Acme Staffing and Beta Talent demo tenants).

| File | What it is | Who it is for |
|---|---|---|
| `00-README.md` (this file) | How the suite is organised, how to run it, ID scheme, status vocabulary, personas | QA lead |
| `01-product-goals-features-roadmap.md` | Product vision, roles, the full feature catalogue (built vs designed), Release 1 vs Phase 2, pricing model, non-negotiables, architecture, roadmap | Product stakeholder, QA lead |
| `02-use-case-catalogue.md` | Index of every use-case story (ADM / MKT / CON / PLT) and the cross-role end-to-end journeys | QA lead |
| `03-test-data-and-environment.md` | Demo tenants, what is seeded, reset, switches, known environment gaps | QA lead, developers |
| `stories/admin.md`, `stories/marketing.md`, `stories/consultant.md`, `stories/platform.md` | The use-case stories themselves (written separately; the catalogue indexes them) | QA lead |
| `E2E-JOURNEYS.md` | Cross-page, cross-persona **end-to-end journeys** (`E2E-ONB/STF/CON/MKT/XC-*`), feature by feature: enterprise onboarding and setup, staff onboarding and roles, consultant profile + resume + applying with the browser extension (captured-fixture design, never live LinkedIn, never auto-submit), marketer assignments and act-for resumes, status tracking. Each story carries run mode, automation status (runnable / partial / blocked), priority and the spec file to write; plus the P0 build order, the seed accounts (incl. Gamma) and the gap list | QA lead, the Sonnet agent writing the Playwright specs |

The stories describe behaviour in business language and carry a status (section 6). The runnable counterpart of an `AUTOMATED` story is a Playwright "story" spec that records a video of the walkthrough (section 3).

## 2. The three layers of testing in the repo (so you know where the story kit fits)

| Layer | Where | What it proves | How to run |
|---|---|---|---|
| Unit and slice tests | `api/src/test` (about 269 `*Test.java`), `web/src/**/*.test.ts(x)` (about 296 files), `job-autofill` tests (about 31 files) | Logic, DTOs, parsers, components | `cd api && ./gradlew test`, `cd web && npm test`, `cd job-autofill && npm test` |
| Integration tests (Spring + MySQL) | `api/src/test` (about 179 `*IT.java`, Testcontainers MySQL 9.2), notably `OrgIsolationIT` (every `/api/orgs/**` route, tenant walls) and `NoSubmitSurfaceTest` | Real queries, tenant isolation, permission gates | `./gradlew test` needs Docker. Several page ITs are recorded as "written, not run" in `progress-tracker.md` (no Docker on the author's machine); treat as **unverified** until a Docker run is green |
| Real-stack journeys | `web/e2e/journeys/*.spec.ts` (config `web/playwright.real.config.ts`) | A page works end to end against Spring + MySQL + `next start` | see the runbook, section 3 |
| **Use-case story walkthroughs (this suite)** | `web/e2e/stories/**/*.story.ts` (config `web/playwright.stories.config.ts`) | A role can complete a business story on the real stack, **recorded on video** with on-screen captions | section 3 |

The story kit files (`web/e2e/stories/_support/{global-setup,personas,story}.ts` and `web/playwright.stories.config.ts`) were untracked in git when this README was written (see the worktree status), so commit them with the first story specs.

## 3. How to run the story suite

### 3.1 Bring the real stack up

Follow `docs/enterprise-v2/real-stack-runbook.md`. In short:

1. MySQL container `rb-demo-mysql` on `127.0.0.1:33511`; create your own database (for example `dossier_ent_demo`).
2. API on 18183 (`./gradlew bootRun` in `api/`) with `DEMO_ENABLED=true`, `ENT_DEMO_SEED=true`, `DOSSIER_TENANT_HOST_SECRET=<random>`, `APPLICATION_LIQUIBASE_ASYNC_START=false`, `DOSSIER_STORAGE_DRIVER=local`, `DOSSIER_STORAGE_LOCAL_ROOT=<folder>`, and the datasource variables. First boot migrates (about a minute) and logs `Enterprise demo seeded: 2 orgs, ...`.
3. Web from a **production build** (Next dev mode does not work in worktrees): `npm run build -w web`, then from `web/`: `DOSSIER_API_URL=http://localhost:18183 DOSSIER_TENANT_HOST_SECRET=<same random> TRUST_PROXY_HOST=false next start -p 3200`.
4. Open `http://acme.localhost:3200/login` once by hand to confirm the **Demo accounts** tab is there (Chromium resolves `*.localhost`; no hosts-file change).

**Stories that write data** (invite someone, create a job, assign, approve, move a stage) need the API started with `DEMO_ALLOW_WRITES=true`. Without it the demo sandbox refuses account and billing writes for demo members; some pure data writes may still pass, which is **unverified** per page. Start with the flag on for the whole suite.

### 3.2 Run the stories

From `web/`:

```
E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.stories.config.ts
```

A presentation recording (slower, longer captions):

```
STORY_SLOWMO=300 STORY_PAUSE_MS=1200 E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.stories.config.ts
```

Run one area or one story: add a path or `-g`, for example `npx playwright test -c playwright.stories.config.ts e2e/stories/admin` or `-g "ADM-03"`.

Open the HTML report: `npx playwright show-report playwright-report-stories`.

### 3.3 Environment variables

| Variable | Default | Effect |
|---|---|---|
| `E2E_REAL_PORT` | `3200` | Port of the `next start` web server. Tenant URLs become `http://acme.localhost:<port>` and `http://beta.localhost:<port>`. |
| `PW_CHANNEL` | unset (bundled Chromium) | Browser channel. Use `chrome` to run installed Chrome. Used both by global setup and by the test project. |
| `STORY_SLOWMO` | `150` (ms) | Playwright `slowMo` per action (set in `playwright.stories.config.ts`). Raise for a watchable demo. |
| `STORY_PAUSE_MS` | `900` (ms) | Pause after each on-screen caption written by `narrate(page, text)` (set in `_support/story.ts`). |

Fixed settings in the config: one worker, no parallelism, no retries, 180 s test timeout, 15 s expect timeout, viewport 1440 x 900, Desktop Chrome, `testMatch: **/*.story.ts` under `web/e2e/stories`.

### 3.4 Where the evidence lands (all relative to `web/`)

| Output | Path |
|---|---|
| Videos (1440 x 900, one per persona context per test), traces (`trace: on`), screenshots (`screenshot: on`) | `web/test-results-stories/<test folder>/` |
| Machine-readable results | `web/test-results-stories/results.json` |
| HTML report (open with `npx playwright show-report playwright-report-stories`) | `web/playwright-report-stories/` |
| Cached sign-in state per persona | `web/e2e/.auth-stories/<persona>.json` (created by global setup; delete to force a fresh sign-in) |

Neither output folder existed when this README was written (nothing has been run yet). Both are regenerated on every run, so do not commit them. `web/.gitignore` ignores `test-results-real*` but, when this was written, did NOT list `test-results-stories/`, `playwright-report-stories/` or `e2e/.auth-stories/`: add those three lines before the first run.

### 3.5 How a story spec is written

```ts
import { test, expect, narrate } from "./_support/story";

test("ADM-01 Sarah reviews the organization dashboard", async ({ as }) => {
  const { page, go } = await as("sarah");          // own browser context, signed in as that persona, recorded on video
  await go("/w/admin");                            // path on that persona's tenant host
  await narrate(page, "Sarah opens the Admin dashboard");   // on-screen caption + pause
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
});
```

Rules of the kit:

- The story ID goes first in the test title (`ADM-01 ...`). That is how the report is mapped back to `02-use-case-catalogue.md`.
- `as(who)` opens an isolated context per persona, so one test can use two people (a marketer assigns, a consultant responds). Contexts are closed after the test and their videos land in the test's output folder.
- Global setup signs every persona in once (the **Demo accounts** list is rate-limited) and caches the browser state. A persona whose sign-in fails only logs a warning (`[stories] sign-in as ... failed`); its stories then run signed out, so a wave of failures on one persona means setup failed for that person.
- Never type a password: there is none. Sign-in is the one-click **Demo accounts** tab on the tenant login page.
- Stories must not auto-submit anything on a job site and must not leave the demo tenants: the product rule is that Kiwiply never submits an application (see `01`, section 8).

## 4. Demo personas

Sign in with the **Demo accounts** tab on `http://<tenant>.localhost:<port>/login`; the button is labelled `Sign in as <name>`. Source of truth: `api/.../service/ent/EnterpriseDemoSeeder.java`, mirrored by `web/e2e/stories/_support/personas.ts`.

| Key | Name | Tenant | Roles (template keys) | Lands on | In global setup? | Notes |
|---|---|---|---|---|---|---|
| `sarah` | Sarah Chen | Acme | ORG_ADMIN + MARKETING_MANAGER | `/w/admin` | yes | Primary marketer of Anika. The marketing manager workspace (`/w/marketing-mgmt`) is **not built** (placeholder pages). |
| `omar` | Omar Haddad | Acme | MARKETING_SPECIALIST | `/w/marketing` | yes | Primary marketer of Ben. |
| `anika` | Anika Rao | Acme | CONSULTANT | `/w/consultant` | yes | Real seat with a consultant profile and seeded workspace data. |
| `ben` | Ben Okafor | Acme | CONSULTANT | `/w/consultant` | yes | Same, assigned to Omar. |
| `hana` | Hana Petrov | Acme | HR_SPECIALIST | `/w/hr` | yes | HR workspace is **not built** (shell + placeholders only, except Employees). |
| `felix` | Felix Ng | Acme | FINANCE_SPECIALIST | `/w/finance` | yes | Finance workspace **not built**. |
| `amara` | Amara Silva | Acme | ACCOUNT_MANAGER | `/w/accounts` | yes | Account Manager workspace: Clients and Placements pages are built as shared pages; the rest is placeholder (verify per nav item). |
| `tomas` | Tomas Berg | Acme | TALENT_ACQUISITION | `/w/hr` | yes | HR workspace, same state as Hana. |
| `eve` | Eve Lindqvist | Acme | EXECUTIVE_VIEWER | `/w/exec` | yes | Executive workspace **not built**. |
| `bea` | Bea Turner | Beta | OWNER | `/w/admin` | yes | Only member of Beta Talent (COMPANY); proves isolation and different branding. |
| (not in kit) | Sam Whitfield | Acme | CONSULTANT, status SUSPENDED | none | no | Listed on the Demo accounts tab but cannot be opened. Use for suspended-member stories. |
| (not in kit) | Nina Vogel | Acme | CONSULTANT, status INVITED | none | no | Invited, no account yet. Use for invitation stories. |

`/w/accounts` and the other not-yet-built workspaces still open: the sidebar lists the pages and each unbuilt page shows "This page is on the way" (`ComingSoon`), so a story for such a page is `NOT-BUILT`, not broken.

Tenants: **Acme Staffing** (CONSULTANCY, host `acme.localhost`, 11 people, 153 consultants in the talent seed) and **Beta Talent** (COMPANY, host `beta.localhost`, 1 person, 46 consultants in the talent seed). Details in `03-test-data-and-environment.md`.

## 5. ID scheme

Every use-case story has a stable ID: `<AREA>-<NN>` with a two-digit running number per area, never reused or renumbered (retire a story by marking it superseded, not by deleting its number).

| Prefix | Area | Primary personas | Story file |
|---|---|---|---|
| `ADM-` | Organization administration workspace (`/w/admin/**`): dashboard, employees, invitations, teams, departments, roles, consultants, resumes, marketing assignments, jobs, applications, interviews, clients, placements, branding | Sarah, Bea | `stories/admin.md` |
| `MKT-` | Talent marketing workspace (`/w/marketing/**`) including the browser-extension capture and assignment of jobs | Omar (and Sarah as manager) | `stories/marketing.md` |
| `ACC-` | Account Manager workspace (`/w/accounts/**`): home, contacts, requirements intake and assignment | Amara | `stories/accounts.md` |
| `CON-` | Consultant workspace (`/w/consultant/**`) including applying with the extension and tracking | Anika, Ben | `stories/consultant.md` |
| `PLT-` | Platform and cross-cutting: tenant resolution and isolation, branded sign-in and demo accounts, multi-role switcher and shell, permissions (404 rule), the Kiwiply platform admin (`/admin/**`), audit and data lineage, and workspaces for roles whose pages are not built (HR, Finance, Accounts, Executive) | all, Bea for isolation | `stories/platform.md` |

Related identifiers you will meet: `X<phase>.<n>` are build stories in `docs/enterprise-v2/07-backlog.md` and `progress-tracker.md`; `ADR-nnn` are decisions in `docs/enterprise-v2/adr/`; `E1..E29`, `B*`, `C*`, `D*` are escalations in `08-decisions-for-user.md`; `SEC-nn` and `N1..N24` are security and negative-test IDs in `42-threat-model.md` and `43-testing-plan.md`. A story may cite these but never reuses them as its own ID.

## 6. Status vocabulary

Each story and each test case carries exactly one status.

| Status | Meaning | What QA does |
|---|---|---|
| `AUTOMATED` | The feature is built and the story has a recorded Playwright story spec (`*.story.ts`) that passes on the real stack. | Run the suite, review the video. |
| `BLOCKED` | The feature is built (or partly built) but the story cannot be run end to end here: needs something outside the demo stack (real e-mail delivery, Stripe, a live job-board page with the browser extension, DNS and certificates, a second machine) or a known bug/gap stops it. The blocker is written next to the status. | Run manually when the blocker is lifted, or accept the evidence named in the story. |
| `NOT-BUILT` | The feature is designed (docs and backlog exist) but the page or API is not implemented on this branch. The story documents the intended behaviour so it can be turned on when the feature ships; today's expected result is the honest placeholder ("This page is on the way") or a 404 from the API. | Do not file a defect. Re-classify when the feature merges. |

Rules: a story whose spec is written but has never been run stays `BLOCKED (not yet run)`, not `AUTOMATED`. `AUTOMATED` means a green run exists. Do not mark a story `AUTOMATED` on the strength of the Java ITs alone.

## 7. Conventions QA should know before reading failures

- **404, not 403.** Outside the member's tenant, role or scope the API answers a generic 404 on purpose (no information leak). A story that expects "Access denied" will be wrong; the UI shows "This isn't part of your role" or a not-found state. The only 403-style refusal is consent (`CONSENT_REQUIRED`), because the consultant must be able to see the request.
- **Records, not actions.** Anything that sounds like submitting (Record as Submitted, Schedule Interview, Send Reminder, Authorize) writes a record; nothing is sent to a client or a job site by Kiwiply. Toasts say so.
- **Autosave and Undo.** Many pages autosave and offer an Undo toast; undo appends an event (history is append-only).
- **Sample data is labelled.** Consultant workspace blocks that are stand-ins show a `Sample` mark (for example My Features allowances, Messages from My Marketer). A story must not treat sample numbers as real.
- **Time-relative seed data.** Dates in the seed are relative to the moment of seeding. Do not assert exact dates or "N days ago"; assert structure, counts that the seeder fixes (for example 153 consultants), or values the story itself creates.
- **Idempotent seed, one-way writes.** Stories that create data leave it behind. Re-running a suite against the same database accumulates data (duplicate names, more rows). Use unique names (a timestamp suffix) in every created record, or reset the database (see `03`).
