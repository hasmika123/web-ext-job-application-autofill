# Enterprise demo plan (demo on 2026-10-19, Acme Staffing on `acme.localhost`)

> Phase 1 deliverable (exploration only, no code changed). Written 2026-10-18 on branch `ent-demo-p1` (= `version2` at `f60f79ff`).
> Sources: `docs/HANDOFF-ENT-DEMO.md`, `docs/HANDOFF-NEXT-WEEK.md`, `docs/enterprise-v2/qa/*`, the v3 video specs, and a code read of web, API and extension (file references are given where it matters).
> Status words: **works** = code read and previously browser-walked · **works with demo data** = works once the demo data or a flag is set as described · **broken** = exists but fails · **missing** = not built.

## 0. The five things to know first

1. **The demo stack is not running.** An API answers on `localhost:8080`, but it is **not** in demo mode (`/api/public/tenant/demo` says `enabled:false`, no demo accounts). The demo needs an API started with the demo flags (section 5). Port 8080 and the MySQL container on 3306 are in use by that other process, so start the demo API on `18183` and the web on `3200` as in the runbook, or stop the 8080 process first (your call).
2. **Autopilot batch ("Prepare selected openings") cannot reach the extension today.** Five independent defects (gap G2). This is the biggest fix.
3. **Enterprise consultants have no Pro AI anywhere.** Every AI call answers 402. In the tenant **web app** there is no AI screen at all (job fit, tailoring and "ask a question" are rule-based or static). In the **extension** the Pro screens exist (AI answer help, job-fit check, best resume for the posting) and one admin override unlocks them (gap G5).
4. **Live email works only on the Inbox page and only 15 minutes after the mail arrives.** There is no "check now"; the 15-minute wait is hard-coded, not the cron. The consultant's My Applications page and the marketer's pages do **not** change from an inbox move (gap G6).
5. **Sarah has no Marketing workspace.** Her second workspace is "Marketing Management", which is eight placeholder pages. Show every marketer flow as **Omar**; Sarah stays Org Admin. (DEMO-READINESS's "switch Sarah to Marketing" step is wrong.)

## 1. Features by role (one line each)

### 1.1 Org Admin: Sarah Chen (`/w/admin`)

| Menu entry | Status | What to show |
|---|---|---|
| Dashboard | works | KPI tiles, activation checklist, alerts with dismiss |
| Employees | works | filter, suspend/reinstate, offboarding preview, role edit |
| Invitations | works | Invite employee, resend/revoke, "Create account now" with a shown-once password |
| Teams, Departments | works | create team/department, structure view |
| Roles & Permissions | works | custom role, permission diff/history, restore to template |
| Consultants | works | 153 consultants, details drawer, **License dialog** (the only licence UI), assign marketer, availability |
| Resumes | works | resume library across consultants, filters, bulk |
| Marketing Assignments | works | workload bars, assign, backup marketer, reassign now/on a date, temporary cover, undo (video 04) |
| Jobs, Applications, Interviews, Clients, Placements | works | seeded and populated; "record a move", CSV export, client drawer |
| Reports | works (not browser-walked) | date range, CSV download |
| Organization Branding | works | draft, contrast guard, phone preview, publish, history (video 03) |
| Audit Logs | works | Activity tab + Captured jobs tab, CSV |
| Settings | works with demo data | General, Security (reason required), Resume Builder share links, **Prepare section** (org opt-in + per-consultant limits; writes need `DEMO_ALLOW_WRITES=true`) |
| Policies | works | draft/submit per policy kind, Kiwiply review queue |
| Subscription, Consultant Licenses, Billing, Feature Usage, HR, Finance, Domains, Integrations | **missing** | greyed "Soon" in the menu; do not click |
| Account menu → Connect extension | works with demo data | one-time code → platform `/connect` page (gap G7 for the local build) |

### 1.2 Marketing Specialist: Omar Haddad (`/w/marketing`). All 14 pages are real.

| Menu entry | Status | What to show |
|---|---|---|
| Home | works | KPIs, tasks |
| My Assigned Talent | works | 34 consultants, profile drawer, saved views |
| Resumes | works | approve / needs-update / download. **"New resume for…" is greyed on Acme** (shared accounts, decision O4) — only works on Gamma |
| Job Discovery | works | 51 openings, filters, job sheet with **Match**, **Save for a consultant**, **Assign** (duplicate guard) |
| Job Matches | works | review, compare, assign |
| Opportunities | works | **Add a job by hand**, assign/bulk assign, reassign, answer the consultant's question, withdraw, consultant answers shown ("is interested", "asked a question", "says they applied") |
| Job Streams | works | add stream, pause/resume |
| Submissions | works | draft package, request approval (records only, never a submit) |
| Applications | works | stage change, next action, notes, "Updated … by …" |
| Interviews | works | calendar/list, confirm, reschedule, feedback, prep checklist |
| Follow-ups, Tasks, Activities, Performance | works | log call, reminder, tasks, monthly targets |
| Extension (marketer) | works with demo data | drawer shows only **Save for consultant** (title, company, note, priority, due date, consultant picker) → appears on Opportunities and on the consultant's Assigned Opportunities |

### 1.3 Consultant: Anika Rao / Ben Okafor (`/w/consultant`). All 20 pages are real.

| Menu entry | Status | What to show |
|---|---|---|
| Home | works | today's focus, quick actions |
| My Career Profile | works | summary, skills, work authorization, preferences, availability |
| My Resumes | works | Create (from profile / upload PDF-DOCX-TXT / copy / scratch), builder with versions, set primary, approve or send back a marketer-made resume. **Builder AI is off in the tenant** |
| My Marketer | works | message, schedule call, ask about an opportunity, request resume update |
| Job Discovery | works | search, save job, saved searches |
| Job Matches | works | skill-fit breakdown (**rule-based, not AI**), compare up to 3, express interest |
| Assigned Opportunities | works | tiles, row menu: Express Interest, Need More Info, Decline, Reopen, I applied, Request resume update; details sheet with marketer quick info and **Open job link** (video 08) |
| → Prepare selected openings | **broken** (gap G2) | tick rows → "Prepare N" → confirm → extension should open each job in its own tab, prefilled |
| My Applications | works | pipeline, stage timeline, "Updated by", Ask marketer |
| Submissions & Approvals | works | approve / decline a marketer's submission package |
| Interviews, Interview Prep | works | calendar, join link, feedback; prep checklist and self-scored practice (**no AI**) (video 11) |
| Offers | works | compare, accept / decline / negotiate (video 12) |
| My Placement | works | checklist, status update, past placements |
| Availability, Tasks, Activity Timeline, Notifications, Settings | works | — |
| Inbox | works with demo data | guided Gmail connect (App Password), "Applications your mail is tracking", "Needs your review" + Undo, "Found in your mail" suggestions (sample mailbox walked; live Gmail: gap G6) |
| My Features | works | usage tiles ("AI credits left" is cosmetic) |
| Extension (consultant) | works with demo data | drawer: account chip "Acme Staffing · Enterprise", **Jobs tab** (assigned jobs, Open posting, I applied), **Autofill tab** (scan → review overlay → Fill selected), resume picker, **Check fit** + best-resume ranking (Pro, gap G5), AI answer help on questions (Pro, gap G5), submit detection → application APPLIED and the opportunity linked |

## 2. Demo workflows in show order

Legend: ★ = must-show flow from the brief · (q) = quick show-off · each step carries its status.

### W0. Setup off camera (before the demo)
| Step | Status | Evidence |
|---|---|---|
| Start MySQL, demo API (`18183`) and web (`3200`) with the flags in section 5 | works | runbook; the 8080 API is not demo-enabled (checked live) |
| Wait for the seeders to finish (Demo accounts tab appears) | works | videos-index "wait a few minutes after Started" |
| Build the extension in **development mode** and load it unpacked in Chrome; use two Chrome profiles (one for Anika, one for Omar) | works with demo data | gap G7; the extension holds one account at a time |
| Check `GET /api/orgs/{acme}/consultant/prepare/status` as Anika answers "on" | works with demo data | gap G3 (licence add-on only lands if the random seed gave Anika an ACTIVE licence) |
| Put 3–5 demo postings on reachable hosts in Anika's Assigned Opportunities (via Omar) | **missing** today | gap G4 (seeded links are `jobs.example.com`, which 404 and the extension has no permission there) |
| Reset Anika's Orbit Freight / Cedar Analytics to Applied before the API starts (never by SQL while it runs) | works | HANDOFF-NEXT-WEEK §3 gotcha |

### W1. Org Admin tour — Sarah (6 min, all quick show-offs)
| Step | Status |
|---|---|
| Login page → Demo accounts tab → Sarah | works |
| Dashboard (q) → Consultants → open Anika → **License dialog** (shows the Pro/Autopilot add-ons as licence features) (q) | works |
| Marketing Assignments: assign two consultants to a marketer, set backup, Undo (q) | works (video 04) |
| Settings → **Prepare section**: show the org opt-in switch is on and the per-day/month/batch limits ("this is where the organization turns Autopilot on") | works with demo data (`DEMO_ALLOW_WRITES=true` to edit) |
| Branding: change title, publish (q) | works (video 03) |
| Audit Logs → Captured jobs tab (q) | works |
| Reports → CSV (q) | works, not browser-walked |
| Do not click: Subscription, Licenses, Billing, Usage, HR, Finance, Domains, Integrations | missing |

### W2. Marketer finds and assigns work — Omar (5 min) ★ (feeds W3)
| Step | Status |
|---|---|
| Sign in as Omar → Home (q) → My Assigned Talent (q) | works |
| Job Discovery: filter, open a job sheet, **Match**, **Assign to Anika** (duplicate guard with reason) | works |
| Opportunities: **Add a job by hand** for Anika with the demo posting URL (×3), priority, due date, quick info | works (MKT-15 fix) |
| **Extension (marketer):** on a posting page, open the drawer → "Save for consultant" → Anika → appears on Opportunities | works with demo data (Omar connected in his own Chrome profile; gap G7) |
| Resumes: approve a built resume / mark needs update (q) | works ("New resume for…" is greyed on Acme by design) |
| Submissions: draft a package (q, "records only, never submits") | works |

### W3. Consultant Autopilot batch — Anika (6 min) ★★ the headline
| Step | Status |
|---|---|
| Sign in as Anika → Assigned Opportunities: the jobs Omar just assigned, quick info, Express Interest on one, Need More Info on another | works (video 08) |
| Tick 3 jobs → **Prepare 3** → confirm dialog ("nothing is submitted for you") | works with demo data (switches: gap G3) |
| Extension opens each job in its own tab and prefills it; progress panel shows Opened → Filled | **broken** (gap G2: Chrome channel, origin check, session id type, ack field, stale build) and needs reachable job pages (gap G4) |
| Anika reviews tab 1, writes the free-text answer herself, presses the page's own Submit | works on the local fixture page (video 09) |
| Extension detects the submit → My Applications shows the application; Omar's Opportunities says "applied" | works (PipelineApplicationLinker; video 09 end) |
| Back on the web: progress panel shows "Submitted" for that job | works with demo data (event mapping is consistent) |
| Resume used for the fill is Anika's own default, not the marketer-approved one | **broken by design today** (gap G8; demo-safe: make the approved resume her default) |

### W4. Consultant Pro features — Anika (5 min) ★
| Step | Status |
|---|---|
| **Extension on a posting:** resume picker with best-resume ranking, **Check fit** (missing keywords / red flags), AI answer help on an open question (draft → review → insert) | **broken** (402 `PRO_REQUIRED`; gap G5a unlocks all three with one admin override) |
| **Web:** Job Matches skill-fit breakdown and Compare (present it as "fit/gap check"; it is rule-based) | works |
| **Web:** My Resumes → builder: AI rewrite / summary / tailoring | **missing in the tenant** (builder runs with AI off; tailoring has no tenant UI; gap G5b) |
| Interview Prep (q), Offers compare (q) | works (videos 11, 12) |

### W5. Live email — Anika (5 min) ★
| Step | Status |
|---|---|
| Inbox page: privacy panel, enter the dedicated demo Gmail + App Password → Check and connect → first read | works with demo data (needs `DOSSIER_DEMO_INBOX_SANDBOX=false`, `DEMO_ALLOW_WRITES=true`, `DOSSIER_INBOX_KEY`) |
| You send, live, "Interview invitation: Platform Engineer at Orbit Freight" (body must also say interview) | works (scores exactly 80 = the auto-apply threshold; exact wording in gap G6) |
| Kiwiply reads it within a minute and Orbit Freight moves to **Interview** on the Inbox page, "from your inbox" | **broken for a live demo**: hard-coded 15-minute wait, no "check now" (gap G6) |
| You send "Not moving forward: Backend Developer at Cedar Analytics" → lands under **Needs your review** → Accept → Rejected → Undo | works with demo data (same wait) |
| Interview invite for an untracked company → "Found in your mail" → Add to board | works with demo data |
| The change on My Applications / the marketer's board | **missing** (inbox moves the consultant's private tracker only; org pages need a linked, full-consent application) |
| Fallback if Gmail misbehaves: the built-in sample mailbox (any 16 letters) shows the same screens with richer data | works (video 10 path, browser-walked) |

### W6. Marketer sees the results — Omar (2 min, q)
| Step | Status |
|---|---|
| Opportunities board: Anika "is interested", "asked a question", "says they applied" | works (ent-opp-unify) |
| Applications: the new application with its stage and "Updated by" | works |
| Interviews / Follow-ups (q) | works |

### W7. Extension extras (q, 1 min)
| Step | Status |
|---|---|
| Jobs tab "Assigned by Omar" chip when the open page matches an assigned job | works with demo data (needs the job URL to match) |
| Interested / Decline / Need info inside the extension | **missing** (web only) |
| Enterprise account chip "does not touch any personal Kiwiply account" | works |

## 3. Gap list (fastest demo-safe fix, time, risk)

Order = suggested fixing order. "Demo-only" means data, config or a dev-only switch; "real" means product code that stays.

| # | Gap | Evidence | Demo-safe fix | Time | Risk |
|---|---|---|---|---|---|
| **G1** | Demo stack not running; 8080 API is a non-demo instance, 3306 MySQL busy | live probe of `/api/public/tenant/demo` | Start the QA stack (API 18183, web 3200 production build) with the flags in section 5; keep the old `DOSSIER_INBOX_KEY` (a new key disables the inbox) | 30 min + seeder time | low |
| **G2** | **Prepare batch never reaches the extension (Chrome).** (a) web sends `window.postMessage`, extension's relay content script is Firefox-only and Chrome listens only on `onMessageExternal`; (b) extension refuses `http://acme.localhost:3000` (`tenantOriginAllowed` wants https + `.kiwiply.com`); (c) web sends numeric `sessionId`, extension requires a string; (d) extension acks `accepted`, web reads `ok`, so a refusal shows as success; (e) prefill on a host without permission reports `unsupported` | `prepareBatch.ts:186,209-235`; `connect-relay.content.ts:58`; `service-worker.js:475`; `prepare-batch.js:46,99,154-166` | **Real fix, small:** make the relay content script run on Chrome too and (dev builds only) match `http://*.localhost:3000/*`; accept the dev origin in `tenantOriginAllowed` when `mode !== production`; send `sessionId` as a string from the web; web reads `accepted` (keep `ok` for compatibility); unit tests in `prepare_batch*.test.js` + `prepareBatch.test.ts`. Alternative: start the batch from the extension's Jobs tab (no page message at all) — bigger | 3–4 h | medium (two codebases, must be tried in real Chrome) |
| **G3** | Prepare switches: platform switch and Acme opt-in are seeded, but the `automation.approved_apply` add-on lands on Anika/Ben only if the random billing seed gave them an **ACTIVE** licence; no admin UI for the platform switch (API only, reason ≥ 10 chars) | `ConsultantPrepareDemoSeeder.java:100-171`; `BillingDemoSeeder.java:503-516`; `AdminSettingsResource.java:74-77` | Check `prepare/status` after start; if `NO_LICENSE`, make the seeder force an ACTIVE licence for Anika and Ben (demo-only, 15 lines) | 30 min | low |
| **G4** | **Demo job pages:** seeded links are `https://jobs.example.com/...` (404 in a real browser; no extension permission). Video 09's Greenhouse fixture only exists inside Playwright's request interception | `ConsultantWsJobSourceDemoSeeder.java:21,65`; `09-apply-with-extension.video.ts:75` | **Demo-only:** serve `greenhouse-apply.html` as 3 static pages (different company/role) from the web app at `http://jobs.localhost:3200/...` and add that host to the dev-build content-script matches + host permissions; Omar assigns those URLs. Optionally one **real** Greenhouse/Lever posting for a "this is a real site" fill (fill only, never press Submit on a real employer) | 1.5 h | low (dev-only manifest entries) |
| **G5a** | **Enterprise Pro in the extension:** AI draft, job-fit and resume-match all 402 `PRO_REQUIRED` (`isPro` false, no budget window) | `EntitlementService.java:151-163`; `AiBudgetService.java:128-132,204-206` | **Demo-only:** enable `DEMO_ADMIN_ENABLED=true`, sign in as `demo-admin`, `PUT /api/admin/users/demo-ent-acme-anika/ai-quota` (and Ben); needs an Anthropic key on the API. Then all three extension Pro screens work. **Real fix later:** AI budget honours org licence add-ons | 30 min | low |
| **G5b** | **Enterprise Pro in the web app:** no AI UI in the tenant (builder "no AI" mode, tailoring/job-fit have no tenant pages); API also blocks with `FEATURE_NOT_LICENSED` | `OrgResumePolicy.java:141-145`; `ResumeEntitlements.java:29-32`; page inventory | Option 1 (honest, 0 h): show web "fit/gap" as the rule-based Job Matches breakdown, and all AI in the extension. Option 2: switch the tenant builder to AI-on for licensed consultants and let `requireAiLicensed` read the licence feature `ai.resume_tailoring` (seed it on Anika) → AI rewrite/summary in the builder | 0 h / 3 h | low / medium |
| **G6** | **Live email:** (a) hard-coded 15-minute wait per mailbox, no sync endpoint or button (the cron env does not help); (b) connect blocked for demo accounts without `DEMO_ALLOW_WRITES`; (c) personal-Gmail senders max at confidence 80 = the auto-apply threshold, so wording must be exact (interview: subject `Interview invitation: Platform Engineer at Orbit Freight`, body says "schedule an interview"; rejection: `Not moving forward: Backend Developer at Cedar Analytics`, no "interview"/"assessment" words; the REAL-GMAIL-DEMO subjects score 68 and get held); (d) the move shows on the Inbox page only | `InboxPoller.java:33,139-150`; `ConsultantInboxResource.java:41-106`; `ConsultantInboxService.java:141,151`; `MailConfidence.java:22-61`; `ConsultantApplicationsService.java:113` | **Real fix, small:** add `POST me-workspace/inbox/sync` (consultant scope, licensed, reuses the immediate-read path `onConnected`) + a "Check now" button on the connected card; a 2-minute rate limit. Demo-only alternative with 0 code: re-POST the connect call from devtools (awkward on stage). Update REAL-GMAIL-DEMO.md wording. Keep the sample mailbox as the fallback | 1.5 h (+30 min for the doc) | medium (IMAP timing on the day; have the fallback ready) |
| **G7** | **Extension connect in dev:** the built bundle is stale (0.64.0 vs source 0.68.0) and production-mode (trusts only kiwiply.com, so `localhost:3000/connect` can't hand over the session); the API's connect URL points at the platform base, which must be the local web | manifest in `.output/chrome-mv3`; `wxt.config.ts:44-50`; `AuthenticateController.java:435-455` | `npx wxt build --mode development` (adds `localhost:3000` + local API), or patch the manifest like `_kit.ts` for port 3200/18183; bump versions per CLAUDE.md if any extension code changes; load unpacked in two Chrome profiles | 20 min | low |
| **G8** | Fill uses the consultant's own default resume, not the marketer-approved one; prepare jobs carry no resume | `HomeView.tsx:122-128`; `ConPrepareDTO.java:15` | Demo-only: set the approved resume as Anika's primary/last used. Real fix (pin an approved resume on the opportunity) is post-demo | 10 min | low |
| **G9** | Two assigned-job lists: the extension's Jobs tab lists only matches that already have a `mkt_opportunity` row; the web page lists all matches | `ConOpportunityRepository.java:22-26`; `ConPrepareService.java:161` | Create the demo jobs through Omar's Opportunities / extension save (both create the row). No code | 0 h | low |
| **G10** | Sarah's "Marketing" workspace is Marketing Management = 8 placeholders | `RoleTemplates.java:176`; `workspaces.json:442-511` | Script: Sarah = admin only; Omar = all marketing | 0 h | none |
| **G11** | Admin placeholders (Subscription, Licenses, Billing, Usage, HR, Finance, Domains, Integrations) | `shell.ts:37` | Don't click; licences are shown from Consultants → License dialog | 0 h | none |
| **G12** | Extension has no Interested / Decline / Need-info and no "Prepared" write-back | `AssignedJobs.tsx:32-43` | Show those on the web; skip | 0 h | none |
| **G13** | Org admin cannot flip the platform prepare switch from a page | `AdminSettingsResource.java` only | Seeder does it; if ever off: `PUT /api/admin/settings/enterprise.autopilot.prepare.enabled` with a reason, as `demo-admin` | 5 min | low |
| **G14** | Acme marketer cannot "New resume for…" (shared accounts) | DEMO-READINESS | Say so, or switch to Gamma (`gamma.localhost`, Marco → Cora) for that one scene | 0 h | none |

**Suggested Phase 2 budget:** G1 + G7 + G3 (1 h) → G4 (1.5 h) → G2 (3–4 h) → G5a (0.5 h) → G6 (2 h) → G8/G9 data (0.5 h) → UI run-through of W1–W7 (2 h). About **10–11 hours** with G5b option 1. Add 3 h for G5b option 2.

**Recommended cuts if time runs out:** do G6 via the devtools re-connect trick instead of a button; show G5b as option 1; keep the sample mailbox as the email fallback.

## 4. What is not in scope and why
- Personal (non-enterprise) Autopilot and the personal web app: out of scope per the brief.
- Custom tenant domains sending a prepare batch: not needed for the demo (handoff §3.8).
- Org theming of the extension: on hold (decision).
- Resume act-for flows (MKT-47/48, CON-84/85): need the Gamma organization; mention only.

## 5. Stack settings for the demo (from the runbook, checked against code)

API (`./gradlew bootRun`, JDK 17, port 18183):
`DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true DEMO_ADMIN_ENABLED=true APPLICATION_LIQUIBASE_ASYNC_START=false DOSSIER_STORAGE_DRIVER=local DOSSIER_STORAGE_LOCAL_ROOT=./build/ent-demo-uploads DOSSIER_TENANT_HOST_SECRET=<same as web> DOSSIER_INBOX_KEY=<the key used before on this DB> DOSSIER_DEMO_INBOX_SANDBOX=false` (set `true` again to use the sample mailbox), plus the Anthropic key for G5a.
Web: production build, `DOSSIER_API_URL=http://localhost:18183 DOSSIER_TENANT_HOST_SECRET=<same> TRUST_PROXY_HOST=false npx next start -p 3200`.
Extension: `cd job-autofill && npx wxt build --mode development`, load `.output/chrome-mv3` unpacked (its manifest key gives the fixed id the web expects).
Gotchas: wait for the seeders; delete `web/.next/dev/cache/fetch-cache` on a cold "enterprise off" 404; never run Gradle while the API runs; never reset Anika's board by SQL while the API runs.

## 6. Open questions for the user (answer before Phase 2)
1. **G5b:** honest option 1 (AI only in the extension, web shows rule-based fit) or option 2 (3 h to light up builder AI in the tenant)?
2. **G6:** build the "Check now" button (1.5 h, real code) or accept the devtools re-connect trick on stage?
3. **G1:** may the non-demo API on 8080 be stopped, or run the demo stack on 18183/3200 beside it?
4. **G4:** include one real Greenhouse/Lever posting (fill only) in addition to the local fixture pages?
