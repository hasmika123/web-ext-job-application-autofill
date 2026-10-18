# HANDOFF - Full feature-flow story videos (Enterprise V2), second machine

> Written 2026-10-15 for a Sonnet session on the SECOND machine. Start ONLY when the coordinator says `version2` contains the merged
> change-audit branch (look for "Merge change-audit" in `git log origin/version2`). Self-contained: read fully before starting.
> Read first: `CLAUDE.md` (O4 separate accounts), `docs/enterprise-v2/qa/00-README.md` (how the story kit works; section 3 is the runbook),
> `docs/enterprise-v2/qa/03-test-data-and-environment.md`, `docs/enterprise-v2/real-stack-runbook.md`, the story lists in
> `docs/enterprise-v2/qa/stories/{admin,marketing,consultant,platform}.md`, `docs/enterprise-v2/19-separate-enterprise-accounts.md` section 7.1.

## 1. BRANCH RULES (read twice)

| Do | Don't |
|---|---|
| `git fetch origin` then `git switch -c ent-videos-b origin/version2` | Never commit to or push `version2`, `develop` or `main`. |
| Commit ONLY on **`ent-videos-b`**, push often: `git push -u origin ent-videos-b` | Never force-push; never `git stash` (WIP commits); no pull requests (the coordinator merges). |
| Sync only when told: `git fetch origin && git merge origin/version2` | NEVER commit videos, traces, screenshots or `test-results-stories/` (they are git-ignored; keep them local). |

Commits: `ent-videos: <subject>`, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. Goal

The user wants a complete set of recorded flow videos, one per business flow, running on the REAL stack (Spring API + MySQL + `next start`)
with the demo tenants (Acme, Beta, and Gamma, the new SEPARATE-accounts demo organization), plus a short index so the user can watch them
in order. You run your OWN local stack (this machine has its own database; nothing is shared with the other machine).

## 3. Bring the stack up (see qa/00-README section 3.1 and the real-stack runbook)

MySQL container on 127.0.0.1:33511 (your own DB `dossier_ent_demo`, never reuse another machine's), the API on 18183 via `./gradlew bootRun`
with `DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true APPLICATION_LIQUIBASE_ASYNC_START=false DOSSIER_STORAGE_DRIVER=local
DOSSIER_STORAGE_LOCAL_ROOT=<folder> DOSSIER_TENANT_HOST_SECRET=<random> DOSSIER_INBOX_KEY=<random 32-byte base64>` (the inbox page needs the key),
the datasource URL must contain `allowPublicKeyRetrieval=true`; the web from a PRODUCTION build (`npm ci` at the repo root, `npm run build -w web`,
then in `web/`: `DOSSIER_API_URL=http://localhost:18183 DOSSIER_TENANT_HOST_SECRET=<same> TRUST_PROXY_HOST=false next start -p 3200`). Start the API and web as
DETACHED background processes. Check `http://acme.localhost:3200/login`, `http://beta.localhost:3200/login` and `http://gamma.localhost:3200/login`
(Gamma is seeded by `EnterpriseDemoSeeder.seedSeparate()`; its people sign in with their email and the dev password from
`dossier.demo.separate-password`, read it from the seeder/config, never print it in logs or docs). Run ONE gradle command at a time (RAM).

## 4. Step A: make the existing stories pass (no recording yet)

The first full run on 2026-10-14 had 105 passed and 61 failed of 166 (mostly environment: shared sessions on three workers, `acme.localhost` lookups from
Node, a redirect loop on `/w/admin`, browsers closed under load). Run with ONE worker: `STORY_WORKERS=1 E2E_REAL_PORT=3200 E2E_API_URL=http://localhost:18183
DOSSIER_TENANT_HOST_SECRET=<secret> npx playwright test -c playwright.stories.config.ts <path>` (if the bundled Chromium is missing run
`npx playwright install chromium`; `PW_CHANNEL=chrome` only if Chrome is installed). The web login rate limit is 10 per 5 minutes per IP: restart `next start` to clear it.
Work area by area (platform, admin, consultant, marketing). For each failing story decide: story bug or timing (fix the spec: waits, selectors from the real DOM,
use the helpers in `web/e2e/stories/**/_helpers.ts`), stale after an intentional product change (update the spec and say why), or a real product bug (fix the
smallest correct change in `web/` or `api/`, add a test, list it in your report). Never weaken an assertion just to go green and never delete a story.

## 5. Step B: add the missing flow stories (new specs under `web/e2e/stories/`, ids not yet used: grep first)

The recording must cover these end-to-end FLOWS, in this order (each flow = one video file made from one or more stories run in sequence in the same test or a
`test.describe.serial`; narrate every step with `narrate(page, "...")`):

1. **F1 Platform admin onboards an enterprise:** app admin signs in on the platform host, opens Organizations, creates "Gamma-like" new organization, the shown-once
   temporary password, provisions the subdomain (reserved and taken refusals), enterprise switch with a reason, Modules panel (APP-01..07 exist; extend where needed).
2. **F2 Owner first sign-in:** owner signs in on the new tenant host with the temporary password, is forced to choose a new password, lands on the Organization Dashboard.
3. **F3 Org Admin builds the organization:** branding draft, departments and teams, roles (system roles and a custom role), invitations, "Create account now" for
   an employee with a temporary password (ADM-15..19, ADM-20..31, ADM-70..72).
4. **F4 New employee first login:** the employee created with a temporary password signs in, is forced to change it, lands on their role's workspace; the old password no longer works (ADM-19b).
5. **F5 Invitation acceptance on a SEPARATE org:** an invitation is accepted on the tenant host, the person chooses a password, consents, lands on the workspace;
   the same email as a personal Kiwiply account stays untouched (new stories MKT-49, PLT-55/56, APP-07, ADM-92..94; the invitation link must be read from the API/DB in the test, not email).
6. **F6 Consultant workspace:** home, jobs, applications pipeline, resumes: CREATE a resume with the Resume Builder inside the workspace (CON-80..85), Inbox: connect the demo
   Gmail sandbox, suggestion, disconnect (CON-70..77), notifications, interview prep.
7. **F7 Marketer workspace:** assigned talent, resumes including "New resume for <consultant>" (act-for) and the consultant approving it (MKT-47/48), opportunities,
   submissions (records only, no submit), job streams, follow-ups, tasks.
8. **F8 Who changed what:** the "Updated ... by ..." line on an application and the history list, as consultant, marketer and org admin (change-audit stories; add specs: the admin
   changes a stage, the consultant sees "by Sarah (admin)", the marketer's act-for save shows "on behalf of").
9. **F9 Offboarding:** Org Admin offboards an employee (preview shows account disabled, sessions revoked, mailbox removed, retention date), the employee's next request fails, reinstate.
10. **F10 Walls and mobile:** tenant isolation and role denial (PLT-16..29), the 390 px mobile shell (PLT-40..44).
Where a flow needs a capability that does not exist yet, write the story description in the qa/stories files with status BLOCKED and say so in the index; do not fake it.

## 6. Step C: record

Presentation settings: `STORY_WORKERS=1 STORY_SLOWMO=300 STORY_PAUSE_MS=1200` (see qa/00-README 3.2). Record flow by flow in the order above; videos land in
`web/test-results-stories/<test folder>/video.webm`. Copy each finished flow's video(s) into ONE local folder `qa-videos/` (outside git, e.g. next to the repo, named
`F1-platform-admin-onboards-enterprise.webm`, `F2-...`) and write `docs/enterprise-v2/qa/videos-index.md` (committed): for each flow the story ids, the file name, duration,
what it shows, the result (PASS / BLOCKED with reason). Record only green stories; re-record after any fix.

## 7. Rules

No sensitive PII in any story data; passwords for demo/test accounts come from the seeders/UI at runtime and are never printed or put in docs; no real mail server; no
auto-submit anywhere in the product; one design system `@kiwiply/ui` for any product fix; additive Liquibase only; for any `api/` change run the matching ITs and
`OrgIsolationIT` once at the end (`./gradlew integrationTest -x test --offline --tests '*OrgIsolationIT'`, 15-25 min, run in the background) and `cd web && npx vitest run <touched folders>` + `npx tsc --noEmit`.

## 8. Done when

Every flow F1..F10 has a recorded video (or a documented BLOCKED reason), `videos-index.md` is committed, all story fixes and product fixes are committed and pushed on
`ent-videos-b`, and you have written a report as the final message AND a committed file `docs/HANDOFF-ENT-STORY-VIDEOS-REPORT.md` (what you fixed in specs and in the
product, the final pass/fail counts per area, flows blocked and why, where the videos are, how to re-record). Then stop and wait.
