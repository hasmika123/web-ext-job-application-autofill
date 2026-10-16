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

Folder: `C:\work_bench6_april\claude_code_work_bench\kiwiply-videos
atural-voice\` (same file names as the originals, `.srt` next to each; `04` is `04-who-changed-what.mp4`).

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
4. Intermittent "We couldn't load your workspace" on a first tenant navigation (the page offers Try again). The recorder presses it, as a person would.
5. Story kit (fixed): Settings is built (ADM-05 stale), clipboard permission for the shown-once Copy button, the Role list pushed the Department list below the fold (ADM-19, ADM-15..17), strict-mode name clash on "Copied", row-menu timing (ADM-15). Not fixed: ADM-57 and ADM-62 (pipeline) failed in the first run.

## How to re-record

1. Stack: MySQL `kiwiply-v2-mysql` (database of your own, here `dossier_ent_videos2`); API on 18183 with `DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true` (see `docs/enterprise-v2/real-stack-runbook.md`); `npm run build -w web`, then `next start -p 3200`.
2. Gamma sign-in password: `GAMMA_DEMO_PASSWORD` in the environment (read from the seeder config, never written in a spec or a doc). `STORY_PERSONAS=anika,omar,sarah,ben,cora,marco,oscar` limits the one-time sign-ins (the web login limit is 10 per 5 minutes).
3. Record one flow: `STORY_SLOWMO=250 STORY_NARRATION_LOG=<dir>/01.json E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.videos.config.ts e2e/videos/01-consultant.video.ts`
4. Render the MP4 with the voice: `node scripts/story-video/render.cjs --log <dir>/01.json --out <folder>/01-consultant-resume-and-applying.mp4 --srt`
   (`STORY_TTS_CACHE=<folder>` keeps the generated speech; ffmpeg path in `FFMPEG`, default is the winget install.)
5. How it works: `narrate()` in `web/e2e/stories/_support/story.ts` writes `{ms since video start, text}` to the log when `STORY_NARRATION_LOG` is set and then waits for the spoken length plus a pause (`STORY_SPEECH_PAD_MS`, default 700). `web/scripts/story-video/` holds the SAPI script (`speak.ps1`), the speech cache (`tts.cjs`) and the renderer (`render.cjs`: sample-accurate mix, then ffmpeg to H.264 + AAC). Needs Playwright's own ffmpeg (`npx playwright install ffmpeg`) for the recording.
6. Re-running adds data: each take creates a few resumes for Cora, a submission draft and a task. Use a fresh database if you want a pristine look.

## Story suite state after this work (one worker, real stack, fresh sign-ins per area)

| Area | Last full run | After the spec fixes made here (re-run of the failures) | Still failing, and why |
|---|---|---|---|
| Admin (ADM) | 47 passed, 4 failed | not improved | ADM-21 (departments and teams) and ADM-55, ADM-57, ADM-62 (pipeline): timing and data accumulation against the shared pages; not diagnosed further. ADM-05, ADM-15, ADM-19 and ADM-19b were fixed (see Findings 5) |
| Consultant (CON) | 45 passed, 8 failed | CON-13, CON-14, CON-20, CON-47, CON-50, CON-57 now pass (6 of 8) | CON-44 (onboarding checklist state) and CON-51 (a task created in the story is not found): data left by earlier runs |
| Marketing (MKT) | 6 passed, 21 failed | 8 passed, 19 failed | Stale after the marketing pages became the shared organization pages: the old `data-*` markers (`data-stat-tile`, `data-task-row`, `data-con-row`, `data-perf-card` and others) no longer exist, so most stories need a rewrite against the current DOM. Video 02 covers the same flows with the current selectors. Fixed here: the `*.localhost` lookup in `captureJob` (it fell over on Node's DNS), the `ready()` helper, strict-mode name clashes |
| Platform (PLT, APP) | 36 passed, 15 failed | 46 passed, 5 failed | PLT-23 (audit evidence answers 404 for the org admin), PLT-42 (a role's home overflows 390 px by 76 px: a real layout finding), PLT-43, PLT-05 (demo role label), PLT-12 (timeout). Fixed here: APP-02..05 (strict "Copied"), PLT-10, the API URL variable of PLT-23/24 |

Totals counted per area at the last run of each: 45 + 47 + 46 + 8 passed; the failures above are listed, none was hidden or weakened. The four recorded videos use their own specs (`web/e2e/videos/`) and passed on the stack above.
