# HANDOFF - Enterprise demo prep (demo on 2026-10-19)

> **START HERE.** Written 2026-10-18 by the session that restyled the enterprise UI and audited the applying flow.
> Read this whole file, then the repo-root `CLAUDE.md`, then `docs/HANDOFF-NEXT-WEEK.md` (the other session's pause handoff: demo stack, inbox, verification debt).
>
> - **Branch:** `ent-demo-prep` was merged into `version2` and deleted. Cut a fresh branch: `git fetch origin && git switch -c ent-demo-p1 origin/version2`. Push it; open PRs into `version2`; **never merge** (see Rules).
> - **First commands:** `git fetch origin && git switch -c ent-demo-p1 origin/version2 && git status`
> - **First task:** Phase 1 below - EXPLORATION ONLY. No code changes in Phase 1. Deliver the inventory + workflows + gap list, then stop and show the user.
> - **Read section 0 first:** `version2` moved after this file was written.

## 0. Updates since this was written (2026-10-18, evening; `version2` at `2d29f311`)

The other session (`hasmika-naari`) is active on `version2` and pushed 24 commits. Coordinate with its work; don't redo it.

- **Prepare switch now has an org level and a licence gate** (`9d60cc13`, `191fc751`). This partly supersedes §3.2:
  - The platform setting `enterprise.autopilot.prepare.enabled` is still the master switch, and it is still off by default. Turn it on in platform admin settings for the demo.
  - Each organization now opts in on **Organization Settings** (`GET/PUT /api/orgs/{orgId}/org-settings/prepare`) and can set its own limits.
  - Prepare also requires the consultant's licence to carry `automation.approved_apply`.
  - The demo seed opts Acme in and adds that add-on to Anika's and Ben's licences.
- **§3.1 (the prepare hand-off to the extension) is still NOT fixed.** No `job-autofill/` file changed. `prepareBatch.ts` only gained "why it's off" notes.
- **Extension connect fixed:** the enterprise connect-code exchange no longer gives a 500 (`f3471c6a`).
- **The other session is recording demo videos** ("v3 video specs" 01-12, branches `rec-a/b/c`). Read `docs/HANDOFF-ENT-STORY-VIDEOS.md` before planning:
  - It overlaps the user's Phase 3.
  - Spec 09 "apply with the extension" is WIP, and spec 10 "email tracking" has not been run yet. Both are must-show flows here.
  - It adds a **local Greenhouse-style fixture page**, which may solve §3.6 (demo job URLs).
- **Kiwiply.com demo panel:** it now offers App admin instead of the demo org card (`ba758c59`). The demo company is signed into on its own host, `acme.localhost`.

---

## 1. The goal

Tomorrow (2026-10-19) the user demos to an **enterprise (a consultancy) that wants its own spin-off of Kiwiply**. The demo must show **as many features as possible** for three roles, through workflows that run **without breaking**.

- Things may run on **mock or demo data** and on **chosen websites**. They do not have to be complete behind the scenes. The **workflow on screen must work**.
- The demo runs on **this laptop's local stack**. Production does not have this code: `version2` has not been promoted, and PR 130 (`version2` → `main`) is open and must not be merged.

### Roles to show (demo tenant "Acme Staffing", host `acme.localhost`)
| Role | Demo person | Sign-in |
|---|---|---|
| **Org Admin** (also Marketing Manager) | Sarah Chen | `/login` → **Demo accounts** tab (left edge) → Sarah Chen |
| **Marketing Specialist** | Omar Haddad | Demo accounts → Omar Haddad |
| **Consultant** | Anika Rao (Ben Okafor is a second consultant) | Demo accounts → Anika Rao |

The roster is in `web/scripts/fixtures/enterprise-demo.json` and `api/.../service/ent/EnterpriseDemoSeeder.java`. Two assignments are seeded: Sarah is Anika's primary marketer, Omar is Ben's.

### Must-show flows (the user named these explicitly)
1. **Autopilot (enterprise):** a marketer assigns several jobs to a consultant. The consultant (on the Autopilot add-on) selects them and clicks once. Each job opens **in its own tab, already filled in**. The consultant only reviews and submits. **Nothing is ever auto-submitted.**
2. **Pro (enterprise):** the consultant's Pro features (AI help on application questions, best resume for the posting, job fit/gap check, resume tailoring), shown in the web app and in the extension.
3. **Email (Autopilot):** the consultant's Gmail is connected. During the demo the user **sends a real email live**, Kiwiply **reads it**, and the **job board/application status updates** from it (e.g. an interview invite or a rejection).
4. **The browser extension**, for both marketer (save a job for a consultant) and consultant (fill, assigned jobs, prepare batch, submit detection).
5. **Every other feature of the three roles**, some as quick show-offs (see Phase 1).

### Subscriptions
- **Pro** and **Autopilot** are the paid tiers. For enterprises they come as **org add-ons per consultant** (CLAUDE.md "Organizations" bullet).
- The demo must show both flows **for enterprise consultants**. Personal (non-enterprise) Autopilot is **out of scope** for this demo.

---

## 2. The three phases (the user's structure)

**Phase 1 - Exploration and plan (this chat's first job; no code)**
1. Inventory **every feature** for the three roles: web app pages, extension, email inbox, and what each needs from the API. Use the left menu of each role's workspace as the starting checklist, then dig deeper (dialogs, drawers, actions).
2. Write the **demo workflows**: the order of events the user would click through to show those features, role by role and across roles (marketer → consultant → admin). Mark which are "quick show-offs".
3. For every step of every workflow, say: **works now** / **works with demo data** / **broken** / **missing**. Check it for real where cheap: the local stack is described in section 4. Run pages, call APIs, read code.
4. Produce a **gap list**. For each gap give the fastest demo-safe fix (real fix vs. demo-only data/config/mock), a rough time, and a risk.
5. Save it as `docs/enterprise-v2/demo/DEMO-PLAN.md` (features by role, workflows, gap list). Commit it to `ent-demo-prep`, push the branch, and **stop and present a short summary to the user**. Do not start fixing until they approve.

**Phase 2 - Make the workflows demo-ready, then a UI pass.**
Fix the gaps the user approved, then do a full UI run-through and clean-up of everything shown.

**Phase 3 - Demo script, backup video, last-minute prep.**
Not now. The user will start this later.

---

## 3. What is already known (from this session's audit; verify, don't re-litigate)

**Works today (code-level; not all browser-verified):**
- **Marketer:** finds and saves jobs; assigns and matches to consultants; prepares a resume and asks the consultant to approve it. Also "save for consultant" from the extension: `MktFromExtensionResource`, `tracking.js` `saveForConsultant`.
- **Consultant:** sees Assigned Opportunities. The extension shows an "Assigned by" chip and the Jobs tab.
- **Submit detection** links the application back. `PipelineApplicationLinker` marks the opportunity APPLIED, and the marketer sees it.
- **Interviews, offers and placements** have pages and APIs.
- **Personal Pro** works end to end. Enterprise accounts do not get it (below).
- **The enterprise UI was restyled and merged:** title bands with the bee, pastel cards, a footer, and signed-out pages that match the sign-in scene.
- **CI on `version2` is fully green** (all 13 checks) as of `116cef73`.

**Broken or missing (each verified in code by this session):**
1. **"Prepare selected openings" (enterprise Autopilot) never reaches the extension:**
   - (a) Chrome channel: the web uses `window.postMessage` (`web/src/lib/ent/consultant-ws/prepareBatch.ts` ~l.219). The extension's page relay is Firefox-only (`job-autofill/entrypoints/connect-relay.content.ts` l.58 `include: ["firefox"]`), and Chrome only listens on `onMessageExternal`.
   - (b) The web sends a **numeric** `sessionId`, but the extension requires a **string** (`job-autofill/src/lib/prepare-batch.js` l.46/99 → `bad-session`).
   - (c) The extension replies `accepted`, but the web reads `ok` and treats a missing `ok` as success (`prepareBatch.ts` l.214).
2. **Prepare is switched off:** the admin setting `enterprise.autopilot.prepare.enabled` defaults to `false` (`EnterpriseSettingKeys.java:149`; gate `PrepareBatchEntitlement`). It is a global switch, not tied to the paid add-on license.
3. **Enterprise consultants get no Pro features:**
   - `EntitlementService.isPro()` returns false for every enterprise login (l.153), so the AI budget returns `PRO_REQUIRED`.
   - Builder/tailoring return 402 `FEATURE_NOT_LICENSED` (`OrgResumePolicy.java:143`).
   - Org license tables exist and the demo seeder writes licenses, but almost nothing reads them (only `InboxEntitlement`).
4. **The fill uses the consultant's own personal resume,** not the marketer-prepared resume they approved. Prepare jobs carry no pinned resume (`ConPrepareDTO`).
5. **Two assigned-job lists:**
   - the web page uses `me-workspace/opportunities` (keyed by `matchId`);
   - the extension uses `con/opportunities` (keyed by opportunity id).
   They can disagree.
6. **Seeded demo job URLs are fake:** Greenhouse/Lever boards of made-up companies (e.g. `boards.greenhouse.io/hooli/...`). They will 404. For the demo, point assigned jobs at **real live Greenhouse/Lever postings**: the extension's content script auto-runs only on known ATS hosts (`job-autofill/entrypoints/content.ts` matches) and there is no submit. Or add a dev-only local mock ATS host.
7. **Extension has no:**
   - consultant Interested / Decline / Need-info actions (declared in `tracking.js`, no UI);
   - "Prepared" status written back to the marketer;
   - connect from a tenant host. Connect uses a one-time code and the platform `/connect` page; in dev that is `localhost:3000`.
8. **Custom tenant domains** (e.g. `jobs.acme.com`) cannot send a prepare batch today.
   - **Feasible later:** either start the batch from inside the extension (it pulls the job list from the API), or request a one-time host permission and register a relay content script for that domain.
   - The future white-label spin-off can list its domain in its own manifest.
   - **Not needed for the demo.**
9. **Email inbox:** built and browser-walked on a **sample mailbox** (`docs/enterprise-v2/qa/INBOX-FEATURE-STATUS.md`; `docs/HANDOFF-NEXT-WEEK.md` §2-3; sample Gmail `kiwiply.demo.anika@gmail.com` connects with any 16 letters on the demo API).
   - For a **live** email in the demo, check:
     - a real dedicated Gmail plus an App Password;
     - `DOSSIER_INBOX_KEY` (32-byte base64) set on the API;
     - the poll interval (`DOSSIER_INBOX_POLL_CRON`, default every 15 min, too slow live; look for a "check now"/sync action or shorten it locally);
     - which email types update the board (interview invite, reschedule, rejection; rejections may be "held for review").
   - Product rules: IMAP + App Password only, never send/move/delete mail, never store attachments.

**Status tracker caveat:** `docs/enterprise-v2/progress-tracker.md` lists several items as "Not Started" that exist in code: X9.2, X9.9, parts of X12.2. Trust the code.

---

## 4. How to run it locally (this machine, Windows)

**Real stack (recommended for the demo):**
1. **MySQL:** `docker compose -f api/src/main/docker/mysql.yml up -d` (port 3306, root, no password, DB `dossierApi`).
2. **API on 8080** (Git Bash):
   `cd api && export JAVA_HOME="/c/Program Files/Java/jdk-17" DEMO_ENABLED=true ENT_DEMO_SEED=true DOSSIER_TENANT_HOST_SECRET=dev-secret-123 APPLICATION_LIQUIBASE_ASYNC_START=false DOSSIER_STORAGE_DRIVER=local DOSSIER_STORAGE_LOCAL_ROOT=./build/ent-demo-uploads && ./gradlew bootRun -Dorg.gradle.vfs.watch=false`
   - Add `DEMO_ALLOW_WRITES=true` to let demo members write.
   - Add `DOSSIER_INBOX_KEY=<32-byte base64>` for the inbox.
   - Health: `http://localhost:8080/management/health`.
3. **Web on 3000:** `cd web && DOSSIER_API_URL=http://localhost:8080 DOSSIER_TENANT_HOST_SECRET=dev-secret-123 TRUST_PROXY_HOST=false npm run dev`
4. **Open:** `http://acme.localhost:3000/login` → Demo accounts.

The other session's variant (API 18183, web 3200 from a production build, inbox key, sample mailbox) is in `docs/HANDOFF-NEXT-WEEK.md` §3 and `docs/enterprise-v2/real-stack-runbook.md`.

**Extension:** `cd job-autofill && npm run build` → load `job-autofill/.output/chrome-mv3` unpacked in Chrome (`chrome://extensions`, Developer mode). Connect from the tenant account menu → **Connect extension** (one-time code). The dev build trusts `localhost:3000` / `localhost:8080`. The built-in Claude browser pane cannot load extensions, so use Playwright's Chromium with `--load-extension` to verify, or the user's Chrome.

**Mock stack** (`npm run dev:demo -w web`, mock API on 8080): fine for UI. Many enterprise pages and the whole consultant workspace have **no mock data**, so use the real stack for workflows.

**Gotchas seen this session:**
- **OneDrive:** paths can lock or dehydrate files. `rm -rf api/build` if `bootRun` fails on build files. Use `-Dorg.gradle.vfs.watch=false`.
- **Gradle vs. a running API:** don't run a Gradle test/compile while `bootRun` is running. It recompiles classes under the running app, and its DevTools restart then fails (missing MapStruct beans). Restart the API afterwards.
- **First request 404 on `acme.localhost`:** Next caches a cold-start "enterprise off" answer. Delete `web/.next/dev/cache/fetch-cache` and restart.
- **`next dev` lock:** only one `next dev` per project. Stop the 3000 server before running Playwright e2e, which starts its own on 3100.
- **Git Bash:** paths like `/w/admin` passed as arguments get rewritten. Set `MSYS_NO_PATHCONV=1`.
- **Line endings:** files are CRLF/LF mixed. Multi-line string replacements in scripts fail, so use single-line edits.
- **Gradle tests:** JDK 17 only (PATH Java is 26). For integration tests set `TESTCONTAINERS_RYUK_DISABLED=true`.

---

## 5. Rules (the user's standing instructions - follow exactly)

- **Never merge anything into `version2` until the user says "merge".** Push topic branches, open PRs into `version2`, then stop.
- **PR 130 (`version2` → `main`) = a production deploy.** Never merge it without an explicit "merge" for it. Before that: DB dump, migration review, feature flags off on prod, Caddy routes (user's step).
- **Enterprise only:** change only the enterprise flow (`components/ent`, `lib/ent`, `app/(tenant)`, the tenant-scoped `theme-tenant.css`, `job-autofill/` enterprise paths, enterprise API). **Do not touch the personal Kiwiply flow,** Kiwiply admin or shared Kiwiply UI unless the user says so.
- **Extension strategy (decided):**
  - **One** extension for now; build all consultancy features into it.
  - **Org theming on connect is ON HOLD.**
  - A white-label spin-off comes at the very end, only for enterprises that forbid any Kiwiply branding.
- **CLAUDE.md hard rules:**
  - no auto-submit ever;
  - no CAPTCHA bypass;
  - never collect sensitive PII;
  - one design system (`@kiwiply/ui`);
  - capture real ATS DOM before writing selectors;
  - one task = one commit;
  - bump extension versions (`job-autofill/wxt.config.ts` + `package.json`) when the extension changes.
- **How to talk to the user:** very **concise**, straight to the point, easy for someone **without technical background or context**; **structured** with headings, short bullets and tables. No jargon without a plain explanation.

---

## 6. Phase 1 output checklist (what "done" looks like)
- [ ] Features by role: Org Admin, Marketing Specialist, Consultant (web + extension + email), one line each.
- [ ] Demo workflows in show order, with "quick show-off" marks.
- [ ] Status per workflow step: works / works with demo data / broken / missing, with evidence.
- [ ] Gap list with demo-safe fix, time, risk. Start with: prepare hand-off (§3.1), prepare switch (§3.2), enterprise Pro AI (§3.3), demo job URLs (§3.6), live email hookup (§3.9), extension connect.
- [ ] `docs/enterprise-v2/demo/DEMO-PLAN.md` committed on `ent-demo-prep`, branch pushed, short summary to the user, **then stop**.
