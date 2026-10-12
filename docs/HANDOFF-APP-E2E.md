# HANDOFF-APP-E2E — User + Org dashboards, real data end to end

Written 2026-10-12 (Fable, design only — nothing implemented). Read after root `CLAUDE.md`. The plan itself
is **`docs/APP-E2E-PLAN.md`**; this file is the continuation point for whoever builds it.

## START HERE

**Branch to build on:** create **`app-e2e`** from the local `resume-builder` tip (`9954a7f`, "Merge commit
'6c1e097' into resume-builder") — it is a superset of `version2` (app v3, org v2, admin, Resume Builder,
Onboarding v2 design). The orchestrator later merges `resume-builder`'s docs merge `1775076` (Timesheets area +
Products roadmap group) on top; no code conflict expected. PR into `develop` only when the user asks; never `main`.

```bash
git checkout resume-builder && git checkout -b app-e2e
npm ci                                  # repo ROOT (npm workspaces)
npm test -w web                         # tsc + eslint + vitest (88 suites) — green
cd api && ./gradlew test                # unit (no Docker); ./gradlew integrationTest needs Docker (JDK 17)
node docs/roadmap/build-master-roadmap.mjs --list     # 0 dangling ids; statuses live in docs/roadmap/areas/*.json
npm run dev:demo -w web                 # mock API + Next; /login → "Job seeker" / "Organization admin" → Open demo
```

**First wave = APP-E2E-PLAN §4 Wave 1 (22 stories, four lanes).** Start order, one Sonnet session each:
1. **E2E-U0.0** page kit (lane K — everything imports it) and **U19.3** Playwright + fixtures + CI job, in parallel.
2. Then in parallel: lane A **U6.1** tracker schema → **U6.2** list API v2 → **U6.4** interviews; **E2E-U7.0**
   notification prefs; lane C **O1.1** → **O1.4** → **O1.2** → **O1.3** → **O6.1** → **E2E-O1.9** → **O1.5**
   (`OrgIsolationIT`, the CI gate) → **O1.8** demo org seed; lane B after U6.2: **U6.3** detail sheet, **U5.1**
   saved, **U3.1** dashboard, **U12.1** analytics, **E2E-U14.0** settings panels; **U0.5** last (sample gate).
3. Wave 1 ends with the click-through demo in §4 ("Wave 1 demo") passing on the real stack and on `dev:demo`.

**Build progress (update as stories land).**
- Lane A (API, user), built on the `resume-builder` tip `3f192c0`: **U6.1 done** (`e2e-u6.1`): tables `application_event`,
  `application_note`, `interview` + `application` columns (`last_event_at`, `next_action[_at]`, `outcome`, `accepted_at`,
  `cover_letter_resume_id`, `posting_id`) in `20261013030000_application_events.xml` (with the CREATED / STATUS backfill);
  statuses `IN_REVIEW` / `WITHDRAWN`; `ApplicationEventService` is the one place an event is written (create / status /
  archive / resume on the sync endpoints, inbox moves via the `StatusChanged` listener, source `EXTENSION|WEB|INBOX|SYSTEM`);
  `TrackerDataService` erases / exports / demo-seeds the three tables; `tracker.*` settings live in `ResumeBuilderSettingKeys`.
  **U6.2 done** (`e2e-u6.2`): list v2 / detail / PATCH / notes / bulk / activity on `/api/profile/applications`
  (`ApplicationListService`, `ApplicationPatchService`, `ApplicationNoteService`), BFF `app/api/applications/**`,
  `web/scripts/mock-tracker.mjs`. `ApplicationListPage` stands in for E2E-U0.0's `ListPage` (same JSON; swap when it merges).
  **U6.4 done, API half** (`e2e-u6.4`): interviews CRUD + outcome + date-range feed + `.ics` (`InterviewService`,
  `IcsCalendar`, `InterviewResource`), BFF `app/api/interviews/**` + `app/api/applications/[id]/interviews/**`,
  `web/src/lib/interviews.ts` (fetchers, `icsHref`, `googleCalendarUrl`, `needsOutcome`), mock in `mock-tracker.mjs`.
  **U6.3 done** (`e2e-u6.3`, lane B, web only): `/applications` is the real list v2 (`useListQuery`, paging, search, sort,
  summary-count tabs) and opens `ApplicationDetail` (right `SideSheet` / phone `BottomSheet`, `?app=<id>`): status picker
  with undo, next step, notes, interviews (`InterviewForm.tsx`, `.ics` + Google link, outcome chips), emails and resume
  tabs. Shared pieces for the next stories: `lib/applications.ts` (the `Application` type moved here, status model,
  fetchers), `lib/tracker-client.ts` (`call`, `toAutosave`), `lib/datetime-local.ts`,
  `components/app-v3/applications/AutosaveChip.tsx`. `ApplicationBoard.tsx` is deleted.
  **U5.1 done** (`e2e-u5.1`, web only): `/saved` is list v2 filtered to SAVED (tabs To apply / Applied / Not interested =
  archived SAVED), `SavedCard` with Apply = `jobUrl`, mark applied, remove (archive) and put back, all with Undo; no
  expired-posting badge yet (no freshness field). **U3.1 done** (`e2e-u3.1`, web only): the dashboard has no sample at
  all: tiles + donut from the list `summary`, `ActivityCard` (activity feed, real 7/30/90 select), `UpcomingInterviews`
  (interview feed + "How did it go?" chips), AI Insights removed, Job Alerts an honest empty state until U7.2. Lane B
  still owes U12.1 and E2E-U14.0. U3.1 reads
  `GET /api/applications/activity` and `GET /api/interviews`. Deferred: reminders (U7.1), inbox-proposed
  interviews (I9.9), bulk select / swipe (U6.5), manual email linking (U6.6).
  **U12.1 done** (`e2e-u12.1`, lane B, API + web): `GET /api/profile/analytics?range&tz` (`ProfileAnalyticsService`, "first
  became X" over `application_event`; cohort response rate; `analytics.*` settings), BFF `app/api/analytics`, `lib/job-analytics.ts`,
  `/analytics` fetches in the browser with a real period select; `AN_SAMPLE` / `AN_SKILLS` deleted, "Skills in demand" removed.
  **E2E-U4.0 done** (`e2e-u4.0`, lane A, API + mock): `/api/jobs/{search,suggest,{id},{id}/save,{id}/feedback}` over the posting
  store (`job_posting.search_text` + FULLTEXT, `job_feedback`, `jobs.*` settings, `JobQueryParser` / `JobRanker`, `DemoJobSeeder`
  for demo accounts, `scripts/mock-jobs.mjs`). **U4.3 is paused as a WIP commit** (BFF `app/api/jobs/**`, `lib/jobs.ts`,
  `FilterPanel`, `FilterSheet`, a new `JobRow` and `JobDetail` are written; `JobsPage.tsx` still imports the old sample code, so
  `tsc` fails until it is rewritten on `useListQuery("/api/jobs/search")` and `V3_JOBS` / `JOBS_SAMPLE_TOTAL` / `GOOGLE_V3_DETAIL` /
  `JOB_*`, `components/app-v3/jobs/{filter.ts,FilterRail.tsx}` and `JobBits.SaveButton` are removed; the dashboard "Recommended"
  card should read `search?sort=best&size=3`). U4.5 and U4.8 are not started.

- Lane D (org join / consent / team / settings), built on `2e92c48`: **O2.2 done** (`e2e-o2.2`, API): `OrgInviteService`
  (invite + resend), `OrgJoinService` (previews + accept by token or code), `OrgJoinCodeService` (create only; O2.4 owns the
  endpoints), `OrgMemberResource` (`POST /api/orgs/{id}/members/invite`, `.../{m}/resend`), `JoinResource` (public previews,
  accepts), `JoinRateLimiter`, mail `orgInviteEmail.html`; migration `20261014010000_org_invites`; nine `org.invite.* / org.join.*`
  settings keys; new notification kind `ORG_INVITE_ACCEPTED`. Invite mail goes through `MailService` (the invitee may have no
  account, `publish` needs a user id); the inviter's notice goes through `NotificationService.publish`.

Mark progress with `node docs/roadmap/build-master-roadmap.mjs --set U6.1=done` (edits the right JSON,
regenerates `master-roadmap.html`; commit both). One story = one commit (`e2e-u6.1: …` / `e2e-o1.1: …`),
pushed on `app-e2e`.

## Key facts an implementer must not rediscover

- **The audit of 2026-10-12** (APP-E2E-PLAN §1): user app = 9 REAL / 5 PARTIAL / 5 SAMPLE / 1 STUB routes;
  org console = 10 SAMPLE + a session-only gate; **no organization table, no org endpoint, no org mock**.
  Sample constants live in `web/src/components/{app-v3,app-v2,org-v2}/sample-data.ts` **and** in page literals
  (billing tiles, settings defaults, donut centres, filter option lists, the org bell "1", the "Admin" label).
- **Spring facts:** user data keyed by `user_id`; `ApplicationSyncService.listApplications` is unsorted/unpaged;
  `NotificationService` has **no `publish`** (only `onStatusChanged`, kind string `STATUS_FROM_MAIL`);
  `EntitlementService.isPro(login)` over one `subscription` row; **interim settings seam** =
  `ResumeBuilderSettingKeys` + `ResumeBuilderSettings` over `app_setting` (60 s cache) — use it for every
  `setting \`x.y\`` a story names; `SensitiveContent.check` on every new free-text write (422 `SENSITIVE_CONTENT`);
  `OpenApiContractIT` regenerates the committed `api/openapi.json` — commit it with every endpoint; ArchUnit
  layering (Web ← Config, Service ← Web/Config); ITs use Testcontainers MySQL 9.2 via `@IntegrationTest`.
- **Org hooks already in the code:** `service/resume/OrgResumeSharing` (interface, **no bean** — O6.1 implements
  it), `resume.share_with_org`, `ResumeAccessService.Via.ORG`, `ResumeViewEvent.KIND_ORG`, settings keys
  `org.resumes.*`, demo account `demo-org` (landing `/org`, nothing seeded).
- **Web facts:** BFF styles — use `forward()` from `web/src/lib/resume-doc-proxy.ts` for new routes (relays
  status/body/etag, maps demo read-only); `serverApiFetch` for server components; `proxy.ts` only refreshes
  tokens. Route tests pattern: `web/src/app/api/resumes/**/*.route.test.ts`. **No Playwright yet** (U19.3 adds
  it; `playwright-core` is only the PDF renderer). Mock API `web/scripts/mock-api.mjs` must gain every new route
  (fixtures under `web/scripts/fixtures/`).
- **Kit to reuse, not rebuild** (`packages/ui/src/index.ts`): `EmptyState`, `Skeleton`, `Tooltip`, `IconButton`,
  `SideSheet`, `SwipeCard`, `SavedTick`, `Dialog`, `Menu`, `Popover`, `useToast` (toast `action` = undo). Resume
  builder autosave: `components/app-v3/resume-builder/SaveStatusChip.tsx` + `state/autosave.ts` (`createAutosave`,
  800 ms, If-Match, 409 pause); E2E-U0.0 lifts them into the kit.
- **Rules that bind every story:** APP-E2E-PLAN §7 (autosave, undo, tooltips, honest empty states, phone-first,
  no fallback constants, demo content from the server seed, admin-configured numbers). Locked decisions in
  `CLAUDE.md` (no auto-submit, never collect sensitive PII, consent-scoped orgs, Marketer never submits/signs in,
  inbox = user's own Gmail over IMAP, no scraping, Stripe is billing truth).
- **Tenancy gate:** `OrgIsolationIT` (O1.5) is route-discovered and runs in CI's `integrationTest`; no `(org)`
  page story merges while it is red. Cross-tenant reads answer **404**, never 403.
- **Feature flag:** `dossier.orgs.enabled` (env `ORGS_ENABLED`) — off in prod, on in dev/CI/mock; `/api/orgs/**`
  404 when off (E2E-O1.9). Billing-off activation: `dossier.orgs.dev-activate=true` + `POST /api/orgs/{id}/activate`
  (E2E-O4.0) — prod never sets it.
- **Decisions waiting on the user** (APP-E2E-PLAN §5, defaults apply): D-1 aggregator (Adzuna), D-2 orgs behind a
  flag (yes), D-3 keep STAFF (yes), D-4 demo seed names (`demo-bootcamp`, Priya Sharma), D-5 Stripe test keys
  (Wave 5), D-6 Gmail test account, D-7 "Did you accept?" in U6.3 (yes), D-8 self-serve `/org/new` (yes).
  Waves 1–4 need **no** credential and no decision.

## What this commit changed

- `docs/APP-E2E-PLAN.md` (new): §1 inventory + status-change table, §2 foundations, §3 external deps, §4 waves,
  §5 decisions, §6 risks, §7 UX bar.
- `docs/roadmap/areas/user.json`: +4 stories (E2E-U0.0, E2E-U4.0, E2E-U7.0, E2E-U14.0); statuses U3.5→done,
  U2.4→partial, U0.4→partial, U6.3→not_started; dependency re-points so Waves 1–2 are buildable (U4.3, U6.3,
  U6.5, U8.2, U6.4, U12.1, U7.2, U0.5, U3.1, U7.3, U4.5, U4.8, U11.1); E2E-U0.0 supersedes U0.2.
- `docs/roadmap/areas/org.json`: +2 stories (E2E-O1.9, E2E-O4.0); re-points O2.1, O1.6, O13.3, O1.8, O1.5, O4.10.
- `docs/roadmap/master-roadmap.html` regenerated (0 dangling ids).
- This handoff.

## Not done here (by design)

No code, no mock routes, no tests were written. The Spring deep-dive, the BFF inventory and the per-page audits
that fed §1 are summarised in the plan; re-run the greps in §1.3 if the branch has moved.
