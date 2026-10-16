# Narrated flow videos of Kiwiply Enterprise (index)

> Recorded 2026-10-16 on branch `ent-videos-b` (version2 plus the P0 audit fixes, merge `88616f4f`), against the real stack: Spring API + MySQL + `next start`.
> Voice: offline Windows SAPI (Microsoft Zira Desktop). Captions are burned into the picture and also written as `.srt`. Videos are local files and are never committed.
> Folder: `C:\work_bench\2026_april\claude_code_work_bench\kiwiply-videos\` (outside the repo). Format: 1440x900, H.264 + AAC MP4.

## Watch in this order

| # | File | Length | Roles | Result |
|---|---|---|---|---|
| 01 | `01-consultant-resume-and-applying.mp4` | 6.2 min | Consultant (Anika at Acme, Cora at Gamma) | PASS, see notes |
| 02 | `02-marketer-a-day-and-a-new-resume-for-a-consultant.mp4` | 5.2 min | Marketer (Omar at Acme, Marco at Gamma) | PASS, see notes |
| 03 | `03-org-admin-running-the-organization.mp4` | 5.7 min | Org Admin (Sarah at Acme) | PASS, see notes |
| 04 | `04-who-changed-what.mp4` | 4.4 min | Org Admin, Consultant, Marketer (Acme) and Marco, Cora, Oscar (Gamma) | PASS, see notes |

Why two organizations: Acme Staffing is the rich demo tenant (153 consultants, applications, interviews). Its people are shared-mode accounts, and the strict rule (decision O4, doc 19) lets a marketer act for a consultant only when the consultant has an enterprise account of that organization. Gamma Consulting is the SEPARATE-accounts demo organization, so the act-for resume work and the resume builder run there.

## 01 Consultant: `01-consultant-resume-and-applying.mp4`

- Spec: `web/e2e/videos/01-consultant.video.ts`. Story ids: CON-01 home, CON-10 profile, CON-25/26/27 assigned opportunities and the job link, CON-32 application tracking, CON-33/34 submission approval, CON-36/37 interviews and prep, CON-80/81 create and edit in the Resume Builder, CON-84 approve or send back a marketer-made resume.
- Shows: Anika's Home and Career Profile; Assigned Opportunities (Express Interest records her wish); Open job link; she applies herself on a demo employer page and Kiwiply submits nothing; My Applications with the stage timeline and who last updated it; Submissions and Approvals; Interviews and Interview Prep. Then Cora (Gamma): Create New Resume from her profile, edit name, headline, summary and skills, Save version, the version list, a second resume from scratch, Approve one marketer-made resume, Send back another with a note, Set as primary.
- Honest notes: "accept an assigned opportunity" is Express Interest (the page has no separate Accept). The employer page is a local fixture served by the recorder (`jobs.example.com` is intercepted), and the browser extension cannot be recorded, so the caption says the extension fills and the consultant applies. Interviews, My Marketer and several tiles carry a Sample mark in the product; the video does not hide it. If Anika has no submission waiting (earlier takes approve them), the caption says so instead of approving.

## 02 Marketer: `02-marketer-a-day-and-a-new-resume-for-a-consultant.mp4`

- Spec: `web/e2e/videos/02-marketer.video.ts`. Story ids: MKT-01 home, MKT-04 assigned talent and consultant drawer, MKT-10 resumes board, MKT-12 assign a job (Job Discovery, mounted by the D5 fix), MKT-30 submission package (a draft record, never a submit), MKT-31/32 applications and interviews, MKT-33 follow-up call, MKT-34 task, MKT-36 performance, MKT-47/48 "New resume for <consultant>" in act-for mode with "Pending consultant approval".
- Shows: Omar's dashboard, talent, resume board, assigning a job to Camila Kamara, a submission draft, applications with the Updated column, interviews, logging a call, adding a task, performance. Then Marco (Gamma): New resume for Cora, picker limited to his assigned consultants, the chooser speaking about her, the builder opening in the organization frame with "Pending consultant approval", headline edit, and the board listing it as pending.
- Honest notes: Ben (on a project, marketing status PAUSED) cannot receive a job; the API answers a generic 404 for him, so the video uses Camila Kamara (see Findings). Nothing in the video submits anything for a consultant.

## 03 Org Admin: `03-org-admin-running-the-organization.mp4`

- Spec: `web/e2e/videos/03-org-admin.video.ts`. Story ids: ADM-01 dashboard, ADM-70 branding (draft, colour guard, preview, publish), ADM-20/21 departments and teams, ADM-30/31 roles (custom role, owner-only lock, delete), ADM-19 create account now plus the invitation mode (ADM-15), ADM-48 marketing assignments, Settings share links (ent-resume; no story id yet).
- Shows: Sarah lands on the Organization Dashboard; types a welcome title (draft), tries a too-light amber (refused, suggests a darker one), previews on a phone, sees the publish diff, publishes; creates the Legal department and a team; builds a custom role and sees the Owner-only lock; creates an employee account with a shown-once temporary password; assigns a consultant to David Kim; turns the share-links setting on and undoes it.
- Honest notes: this take was recorded before the P0 merge on the earlier database; the admin pages did not change. The recorder tidies what it created (draft, team, department, role), but Acme's secondary colour stays at the accessible suggestion because the seeded amber cannot be republished (see Findings). Billing, Licenses, HR, Finance, Reports, Domains, Integrations and Audit Logs are placeholders ("coming soon" / "on the way") and are not shown. The platform-admin onboarding and the owner's first sign-in (F1, F2) were not recorded; the Org Admin flow uses Sarah.

## 04 Who changed what: `04-who-changed-what.mp4`

- Spec: `web/e2e/videos/04-who-changed-what.video.ts`. Change-audit stories X9.13/X9.14 plus the resume authorship of ent-resume.
- Shows: Sarah edits the next action and adds a note on Ben's application and sees "Updated just now by you"; the Activity tab lists each change; Ben (consultant) reads "Updated just now by Sarah Chen" with the admin tag; Omar (Ben's marketer) sees the same line in his Applications table. Then Marco edits Cora's resume in act-for mode; the builder header reads "by Marco Bellini (marketer)"; Cora's My Resumes shows the same line and the resume waits for her approval again; Oscar's resume library shows it too.
- Honest notes: "on behalf of" wording on an application needs the save-for-consultant route (X9.12), which is not built, so it is not shown. The admin side of the resume version history is the version list in the builder (shown in video 01).

## Natural voice (Ava), recorded 2026-10-16

A second set of the same four flows, re-scripted as a person talking you through it and re-recorded on a fresh database (`dossier_ent_videos3`, version2 at `c9a755bf`). The Zira originals above stay exactly as they were in the parent folder; nothing was deleted or overwritten.

Folder: `C:\work_bench\2026_april\claude_code_work_bench\kiwiply-videos\natural-voice\` (same file names as the originals, `.srt` next to each; `04` is `04-who-changed-what.mp4`).

| # | File | Length |
|---|---|---|
| 01 | `01-consultant-resume-and-applying.mp4` | 8.4 min |
| 02 | `02-marketer-a-day-and-a-new-resume-for-a-consultant.mp4` | 6.9 min |
| 03 | `03-org-admin-running-the-organization.mp4` | 6.7 min |
| 04 | `04-who-changed-what.mp4` | 5.0 min |

- Voice: Microsoft neural `en-US-AvaMultilingualNeural` through `edge-tts` (needs the network), rate -5%. Switch: `STORY_TTS=edge` (default stays `sapi`), `STORY_TTS_VOICE=<voice>`, `STORY_TTS_RATE=<+/-n%>`, own cache with `STORY_TTS_CACHE`. Other candidates: `en-US-AndrewMultilingualNeural`, `en-US-EmmaMultilingualNeural`, `en-US-BrianMultilingualNeural`.
- Walkthrough style (opt-in, `STORY_HUMAN=1`, code in `web/e2e/stories/_support/human.ts`): a visible cursor that glides with easing to each element, a hover beat and a click ripple before every click, human-speed typing, smooth scrolling, a soft ring around what the narrator talks about, a beat after each page loads. Normal story runs never load it. `narrate(page, text, ms, at?)` and `narrateDo(page, text, action)` (speak while doing) are in `story.ts`.
- Recording: `node scripts/story-video/prewarm.cjs e2e/videos/<spec>` generates the speech first (parallel), then record with `STORY_HUMAN=1 STORY_TTS=edge STORY_SLOWMO=40 ...`, then `render.cjs` as above. Gamma sign-in uses `GAMMA_DEMO_PASSWORD`.
- Recording order was 03, 02, 04, 01 (not 03, 04, 02, 01): on a fresh database, video 04's resume segment needs the "Cora Lindahl, Data Engineer" resume that video 02 creates, and 01 needs the marketer-made resumes of 02 and 04.

What differs from the first recordings:

1. Video 04: in the fresh demo data Ben Okafor's applications carry no marketer (`APP-CWS-4-x`), so Omar's Applications table does not list them. The marketer segment now follows an application Omar does look after (`APP-2026-119`): Sarah edits its next action on camera, then Omar sees "Updated ... by Sarah Chen". The Ben (consultant) segment is unchanged. Finding: if Ben's applications should be visible to his marketer, the demo seed needs to set their marketer.
2. Video 01: the builder showed the "Skills" group twice for Cora's profile-based resume (same four skills in both). The video shows it as it is; the spec types into the first one. Worth a look as a product finding.
3. The first take of 01 failed on that duplicate-field click, so Cora has one extra "Salesforce Developer" resume in `dossier_ent_videos3`. No effect on the videos.
4. Video 03 recorded on the first try with no spec change other than the new script.

## Findings (nothing here was fixed by the video work unless stated)

1. Product: the seeded Acme secondary colour `#f59e0b` fails the product's own publish contrast rule (the publish error asks for `#a56a07`). Seed data issue; no code change made.
2. Product (UX): assigning a job to a consultant who is not being marketed (marketing status PAUSED, for example on a project) answers a generic 404 "Not found" (`MktJobsService.assign` maps the soft refusal to a 404), while the picker still lists them.
3. Product: one transient 500 on `GET /api/profile/completeness` in Gamma, a duplicate insert on `bio.ux_bio_user` when two first requests for a new account race.
4. FIXED (ent-story-fixes): intermittent "We couldn't load your workspace" on a first tenant navigation. Root cause and fix are in the table below.
5. Story kit (fixed): Settings is built (ADM-05 stale), clipboard permission for the shown-once Copy button, the Role list pushed the Department list below the fold (ADM-19, ADM-15..17), strict-mode name clash on "Copied", row-menu timing (ADM-15). Not fixed: ADM-57 and ADM-62 (pipeline) failed in the first run.

## How to re-record

1. Stack: MySQL `kiwiply-v2-mysql` (database of your own, here `dossier_ent_videos2`); API on 18183 with `DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true` (see `docs/enterprise-v2/real-stack-runbook.md`); `npm run build -w web`, then `next start -p 3200`.
2. Gamma sign-in password: `GAMMA_DEMO_PASSWORD` in the environment (read from the seeder config, never written in a spec or a doc). `STORY_PERSONAS=anika,omar,sarah,ben,cora,marco,oscar` limits the one-time sign-ins (the web login limit is 10 per 5 minutes).
3. Record one flow: `STORY_SLOWMO=250 STORY_NARRATION_LOG=<dir>/01.json E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.videos.config.ts e2e/videos/01-consultant.video.ts`
4. Render the MP4 with the voice: `node scripts/story-video/render.cjs --log <dir>/01.json --out <folder>/01-consultant-resume-and-applying.mp4 --srt`
   (`STORY_TTS_CACHE=<folder>` keeps the generated speech; ffmpeg path in `FFMPEG`, default is the winget install.)
5. How it works: `narrate()` in `web/e2e/stories/_support/story.ts` writes `{ms since video start, text}` to the log when `STORY_NARRATION_LOG` is set and then waits for the spoken length plus a pause (`STORY_SPEECH_PAD_MS`, default 700). `web/scripts/story-video/` holds the SAPI script (`speak.ps1`), the speech cache (`tts.cjs`) and the renderer (`render.cjs`: sample-accurate mix, then ffmpeg to H.264 + AAC). Needs Playwright's own ffmpeg (`npx playwright install ffmpeg`) for the recording.
6. Re-running adds data: each take creates a few resumes for Cora, a submission draft and a task. Use a fresh database if you want a pristine look.

## Story suite state after ent-story-fixes (2026-10-16, one worker, real stack, fresh database, branch `ent-story-fixes`)

| Area | Before (video agent's last run) | After | Still not green, and why |
|---|---|---|---|
| Admin (ADM) | 47 passed, 4 failed | **51 passed** | none |
| Consultant (CON) | 45 passed, 8 failed | **53 passed**, 1 skipped (CON-75 needs the QA MySQL container) | none |
| Marketing (MKT) | 8 passed, 19 failed | **27 passed, 6 skipped as BLOCKED** (33 tests) | MKT-03, MKT-36b (the Marketing Manager workspace is not built), MKT-21b, MKT-22b, MKT-23b (a consultant's answer on the live page does not reach the marketer's board), MKT-24 (the live page has no "I applied") |
| Platform (PLT, APP) | 46 passed, 5 failed | **51 passed**, 1 skipped (PLT-12b needs `GAMMA_DEMO_PASSWORD` at sign-in) | none |

Diagnosis by story: stale after an intentional change (the spec was updated, never weakened): ADM-05/06, PLT-14 (Audit Logs is a built page), ADM-57 (no toolbar Clear button; the interview drawer is a side dialog at 1440 px), CON-01/30 (D12, no invented marketer messages or "Responsive" badge), CON-56 (security link is `/me#security`), PLT-05 (role names), PLT-23 (an unknown job id is the generic 404), CON-20 (quick info only where the marketer wrote it), the 19 MKT stories (shared Resumes, Applications and Interviews pages; the live consultant Assigned Opportunities page); spec problems: ADM-21 and CON-47/57 (dropdowns close on scroll: re-open until the option is up), CON-42 (three elements say "Negotiation requested"), CON-44 (the locator "first unchecked item" stopped matching once ticked), CON-51 and ADM-11 and MKT-30 (lists page at 8 or 10 and grow with every run: find the row by name, clean leftovers, take the next free pair), PLT-12 (ten recorded browsers; split Gamma into PLT-12b), PLT-43 (a phone hides the header subtitle), ADM-62 (the first page of placements holds none that is quiet); **real product bugs, fixed with a test:** PLT-42 and the first-navigation panel (below), and Add opportunity answering 404 (MKT-15).

## Fixed product bugs (ent-story-fixes)

1. **"We couldn't load your workspace" on a first tenant navigation.** One page view makes about fourteen layout renders (the page and the prefetch of every menu link) and each made its own `GET /api/me/tenant` with the same token, with a hard 4 s budget. Under load (a cold or busy API, a recording machine, several people signing in) the last calls queued and missed the budget; when it was the navigation itself the member got the "try again" panel, and pressing it worked because the burst was over. Reproduced with twelve parallel browsers: the web server logged `TimeoutError` for the session call. Fix: calls with the same host and token share one in-flight request and a success is kept for 2 s (`web/src/lib/ent/share-calls.ts`; a failure is never kept, so Try again always asks afresh), the budget is 8 s, and every "unavailable" now says why on the server log (`[tenant-session] /api/me/tenant unavailable: ...`). Tests: `share-calls.test.ts`, `tenant-session.share.test.ts` (fourteen concurrent renders make one API call; a failure is not remembered), and the cause-logging tests in `tenant-session.test.ts`. The story kit's retry helper looked for a button; the panel's Try again is a link.
2. **PLT-42, a role's home overflows 390 px by 76 px.** The Marketing home (Omar): the Job Stream Monitor and Top Openings tables had no overflow box (the other two tables did), so the page grew wider than the phone. Both now scroll inside their cards; `MarketingHomePage.test.tsx` asserts every table sits in an `overflow-x-auto` box and PLT-42 measures the real overflow.
3. **Add opportunity answered 404 for the row it had just created** (found by MKT-15; the Add dialog stayed open). The new match is committed by the assignment service's own transaction, which the caller's MySQL REPEATABLE READ snapshot cannot see, so `MktOpportunitiesService.require` found nothing. It now falls back to a REQUIRES_NEW read (`JobIdentityTx.readOpportunityRow`), the pattern the other find-or-create paths use. Unit test added.

## Product gaps found, not fixed (queued as a background task)

The consultant's Assigned Opportunities page exists twice: the live one (explicit route, ent-consultant: Express Interest, Need More Info, Decline, Reopen, rows `[data-opp]`) and an older registry version (ent-marketer: I applied, answer display, detail route) that the explicit route shadows. The marketer's Opportunities board reads its own interest state, so Ben's answer on the live page never reaches Omar's board (it stays No response), a question does not reach the marketer (`answer-info` answers 409 NO_OPEN_INFO_REQUEST), the live page shows no answer, and a job saved by the extension has no `cws_job_source` row so its Open job link is disabled. Stories MKT-21b, 22b, 23b and 24 carry the steps under `test.fixme`. Also: Sarah's Marketing Manager workspace is a placeholder (MKT-03, MKT-36b).

## How the suites were run here

Own stack: MySQL `kiwiply-v2-mysql` database `dossier_ent_stories`, API on 18220 (`DEMO_ENABLED ENT_DEMO_SEED DEMO_ALLOW_WRITES`), web from a production build on 3220, `STORY_WORKERS=1 PW_CHANNEL=chrome`. Kit changes: a cached sign-in older than 9 minutes is renewed before a browser opens (a long suite signed itself out: the refresh token is single-use), `STORY_REUSE_SIGNIN_MIN` keeps a fresh sign-in between runs, and the marketing `ready()` helper now requires the signed-in shell (a signed-out page's own heading used to count as "ready"). Keep `DOSSIER_INBOX_KEY` fixed across API restarts: a different key switches the inbox off (the canary check) and CON-70..77 then fail.

