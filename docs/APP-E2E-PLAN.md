# APP-E2E-PLAN — User Dashboard + Org Admin Dashboard, end to end

Written 2026-10-12 (Fable, design) on the `resume-builder` tip `9954a7f`. Build branch: **`app-e2e`**
(create it from that tip — see `docs/HANDOFF-APP-E2E.md`). Implementers: Sonnet agents, one story per
session, strict file ownership, **no design decisions in the session** — if a story and a cited design
doc disagree, the design doc wins; if something is unspecified, stop and ask.

The user's brief, verbatim: *"need to work on Users Dashboard pages and Org Admin Dashboard pages
connect end to end.. make it functional.."* — every signed-in user page and every `/org/*` page goes
from sample/placeholder data to real, working features: **web page → Next BFF route → Spring API →
MySQL**, with honest empty states for real accounts and seeded content for the demo accounts.

Inputs this plan reconciles (read them for the full shapes; this file names deltas, not copies):
root `CLAUDE.md` (locked decisions), `docs/roadmap/{AUDIT,PLAN}-{user,org}.md`,
`docs/roadmap/areas/{user,org}.json` (story ids), `docs/roadmap/RECONCILIATION.md` (build order,
decisions D1–D65, never-collected rule §0.5, admin-configured rule §0.6), `docs/design/user/*.md`,
`docs/design/org/*.md`, `docs/design/admin/runtime-settings-feature-flags.md`,
`docs/ONBOARDING-V2-DESIGN.md`, `docs/RESUME-BUILDER-DESIGN.md` §9.12/§10.18 (org Resumes & Profiles),
and the code audit of 2026-10-12 (§1).

Sections: §1 page inventory · §2 foundations · §3 external dependencies · §4 waves · §5 decisions
for the user · §6 risks · §7 UX bar (applies to every story).

## 1. Page inventory (code audit, 2026-10-12, tip `9954a7f`)

State legend — **REAL**: every number from an endpoint, writes persist · **PARTIAL**: real spine, sample or
inert limbs · **SAMPLE**: renders a `sample-data.ts` constant, nothing persists · **STUB**: a shell with a
canned response or no data at all · **MISSING**: the design names it, no route exists. "Ext dep" = external
dependency (none · IMAP · aggregator · Stripe · AI). Evidence paths are under `web/src/` unless stated.

### 1.1 User dashboard (`(app)/**`, 20 routes + shell)

| Route | Shows | State | Data it needs | Existing API | Missing API / tables | Ext dep | Stories |
|---|---|---|---|---|---|---|---|
| `(app)/layout` + `AppShell` + bell | session gate, nav, plan pill, notifications | **REAL** (bell real: `/api/notifications` + read-all; Messages nav dot hard-coded `dot:true`) | account, plan, notifications | `/api/account`, `/api/billing/me`, `/api/profile/notifications` | grouping/cursor (U7.6); unread counts per nav item | none | U7.6, U0.1 |
| `/dashboard` | greeting, 4 stat tiles, activity bars, status donut, recent applications, recommended, profile strength, "we learned N", AI insights, interviews, alerts | **PARTIAL** — real only when ≥1 non-SAVED application; `DASH_STATS/ACTIVITY/STATUS/RECENT` when empty, `DASH_RECOMMENDED` for Free, `DASH_INSIGHTS`/`DASH_INTERVIEWS`/`DASH_ALERTS` **always** sample; redirects to `/welcome` via `needsOnboarding` | applications + events, interviews, alerts, matches, completeness | `/api/profile/{applications,resumes,suggestions,completeness,job-matches}`, `/api/profile` | `interview` rows (U6.1/U6.4), `job_alert` (U7.2), applications summary (U6.2) | none | U3.1, U3.2, U3.3, U3.4, R1.7 |
| `/jobs` (+`?q=`, `?job=`) | search box, filter rail, list, detail panel | **PARTIAL** — Pro nightly matches real (`/api/profile/job-matches`); Free and empty Pro render `V3_JOBS` (29 rows, "1,234 jobs found" = `JOBS_SAMPLE_TOTAL`); filters/sort/paging client-side; Apply on sample toasts; "+" collection toasts | search over `job_posting`, filters, save, feedback | `GET /api/profile/job-matches`, `POST …/{id}/save` | **no search endpoint**; FULLTEXT index; `job_preference`, `job_feedback` | none now; aggregator later | E2E-U4.0, U4.3, U4.5, U4.8, U4.1/U4.2 (v2) |
| `/applications` | tabs, table, kebab | **PARTIAL (read-only)** — real rows mapped from `/api/profile/applications`; `V3_APPLICATION_ROWS` + fake tab counts when empty; no status change, notes, detail panel; `?app=` deep link ignored; `ApplicationBoard`/`ApplicationEmails`/`ResumeFit`/`TailorDialog` orphaned (never rendered) | list v2 with summary counts, events, notes, interviews, mail | `GET/POST/PUT/DELETE /api/profile/applications`, `GET …/{id}/mail`, ats-score/job-fit/resume-match/tailor | `application_event`, `application_note`, `interview`; list filters/paging/summary; `IN_REVIEW`/`WITHDRAWN` | IMAP for the Emails tab (optional) | U6.1–U6.6, U6.8 |
| `/profiles` | overview + item tabs | **REAL** (sample text only as fallback copy: `V3_PROFILE_FALLBACK`, `V3_RESUME_VERSION_SAMPLES`, hard-coded job prefs, "Visible to employers" static; "View full profile"/"Change"/"Connect" toast) | bio, items, completeness, resumes, job preferences | `/api/profile`, `/api/profile/{items,completeness,provenance,resumes}` | `job_preference` (U4.5) for the prefs card; visibility is a future (U13.3) | none | U13.1, U4.5 |
| `/profiles/setup` | onboarding wizard (R1.4/R1.5) | **REAL** (writes at Finish; draft in `sessionStorage`) | — | items import + bio PUT | server draft (R1.8) | none | R1.7–R1.12 (own it) |
| `/assistant` | chat | **STUB** — canned reply `ASSISTANT_CANNED_REPLY` after 650 ms; recent chats toast | threads, SSE, tools | — | `assistant_*` tables + service | AI (Pro) | U8.1–U8.5 |
| `/alerts` | alert list, create/edit dialog, settings tab | **SAMPLE** — `ALERTS` in `useState`; dialog says "examples for now" | alerts CRUD, preview, prefs | — | `job_alert`, `job_alert_hit`, `notification_preference` | none (push later) | E2E-U7.0, U7.1, U7.2, U7.3 |
| `/resume-builder`, `/[id]`, `/templates`, `/shared/[id]` | My Resumes, editor, gallery, shared view | **REAL** (R0–R4.1 built; R5/R7 panels are explicit placeholders) | — | 50+ routes (`resumes/**`) | — | AI for R4 UI | R-stories (not re-planned) |
| `/resumes` (legacy, not in nav) | old workspace | **REAL** | — | — | — | none | retire after R2.6 nav check |
| `/interview-prep` | modes, sets, questions, sessions, progress | **SAMPLE** — all `IP_*`; every Start/Practice toasts | question bank, sessions | — | `interview_question`, `practice_session` | AI only for U9.3 | U9.1, U9.2, U9.4, U9.3 |
| `/messages` | threads + thread view | **SAMPLE** — `CONVERSATIONS`; "launches with Inbox v2" note | inbox threads | `GET /api/profile/applications/{id}/mail` (per app only) | `inbox_message.thread_key` + threads API | IMAP (user's own) | U10.1, U10.2 |
| `/saved` | tabs To apply/Applied/Not interested, grid | **SAMPLE** — `V3_SAVED_JOBS` though SAVED applications exist | SAVED applications + posting freshness | `GET /api/profile/applications` (`status=SAVED`), `POST /api/profile/job-matches/{id}/save` | list v2 filters (U6.2) | none | U5.1, U5.2 |
| `/explore` | companies, roles, paths, resources | **SAMPLE** — `EX_*`; every click toasts | companies from the posting store, content | — | `GET /api/jobs/companies` (over `job_posting`) | none | U11.1, U11.2, U11.3 |
| `/analytics` | 4 stats, over-time, response by company, status, skills | **PARTIAL** — computed from applications when ≥1 submitted; `AN_SAMPLE` otherwise; `AN_SKILLS` always sample; period select toasts | events (first-became-X), inbox-derived responses | `GET /api/profile/applications` | `application_event` (U6.1); `GET /api/profile/analytics` | IMAP for response rate (optional) | U12.1 |
| `/settings` | account (read-only), AI meter, billing card, inbox status, autofill rows, delete/export | **PARTIAL** — real actions exist; `SoonRow` ×3 (digests, reminders, product updates), "Time zone: Automatic" static, no notification/privacy/job-preference panels | notification prefs, job prefs, privacy copy | `/api/account`, `/api/billing/me`, `/api/ai/usage`, `/api/profile/inbox`, export/delete | `notification_preference`, `job_preference` | none | E2E-U7.0, E2E-U14.0, U14.1, U14.3, U4.5 |
| `/settings/inbox` | Gmail connect/test/disconnect | **REAL** | — | `/api/profile/inbox` | — | IMAP (user's own) | U6.7 (phone pass) |
| `/settings/organizations` | memberships, what they see, change scope, leave | **MISSING** | org memberships + scope | — | `data_share`, `GET /api/me/orgs`, `PUT …/share`, `POST …/leave` | none | O6.3 |
| `/welcome` | six Tier-A questions | **REAL** (retired into `/profiles/setup` by R1.7/R1.11) | — | `PUT /api/profile` | — | none | R1.7 |
| legacy redirects (`/board`, `/matches`, `/resume`, `/profile`, …) | — | redirect | — | — | `/board?app=` target lost (U6.3 fixes) | — | U6.3 |

**Counts (user):** REAL 9 (shell/bell, profiles, profiles/setup, resume-builder ×4 counted as one row, resumes, settings/inbox, welcome) · PARTIAL 5 (dashboard, jobs, applications, analytics, settings) · SAMPLE 5 (alerts, interview-prep, messages, saved, explore) · STUB 1 (assistant) · MISSING 1 (`/settings/organizations`).

### 1.2 Org admin (`(org)/**`, 10 routes + shell) — every number is sample; zero API calls besides sign-out

| Route | Shows (board structure to keep) | State | Data it needs | Existing API | Missing API / tables | Ext dep | Stories |
|---|---|---|---|---|---|---|---|
| `(org)/layout` + `OrgShell` + `OrgChip` | session gate only (any signed-in user), 10-item nav, bell "1 unread" hard-coded, role label "Admin" hard-coded, `ORG = Acme Corp / Enterprise` | **STUB** (gate) | memberships, role, permissions, org bell | `/api/account` | `GET /api/orgs/mine`, `GET /api/orgs/{id}`, `/api/config/public` flag | none | O1.6, O1.7, E2E-O1.9 |
| `/org` Dashboard | 4 stat tiles (Employees/Applications/Interviews/Placements), placement pipeline bar, recent activity, upcoming interviews, top opportunities, quick actions | **SAMPLE** (`DASHBOARD_STATS`, `PLACEMENT_PIPELINE`, `TIMELINE`, `UPCOMING_INTERVIEWS`, `OPPORTUNITIES`, `DASHBOARD_QUICK_ACTIONS`) | activation checklist, metric tiles, needs-attention, consented activity | — | `GET /api/orgs/{id}/onboarding`, `/metrics/summary`, `org_metric_daily`, `org_audit_event` | none | O2.7, O7.1–O7.4, O7.7 |
| `/org/team` | 4 tiles, tabs All/Active/Needs attention/Placed, table (Name, Role, Department, Support Owner, Placement Stage, Last Activity), departments donut, support owners, recent activity; Add Employee / Import CSV / Bulk Assign inert | **SAMPLE** (`EMPLOYEES`, `TEAM_TABS`, `DEPARTMENTS`, `SUPPORT_OWNERS`, `TEAM_STATS`) | members (consent-scoped), groups, invites, support owners | — | `org_member`, `org_group`, `data_share`, members API, invite API | none | O5.1–O5.8, O2.2, O2.4, O2.5 |
| `/org/opportunities` | 4 tiles, table (Company, Role, Location, Work mode, Assigned, Match, Owner, Status), top hiring, pipeline donut, recent assignments | **SAMPLE** (`OPPORTUNITIES`, `TOP_HIRING`, `PIPELINE_DONUT`, `RECENT_ASSIGNMENTS`) | shared jobs (`org_job_share`), later `job_assignment` (marketer) | — | `org_job_share` (O8.2); Match % per org role **not built** (no engine) | none | O8.2, O10.5 (Wave 5) |
| `/org/applications` | 4 tiles, tabs by stage, table (Employee, Company, Role, Date, Stage, Owner, Resume status, Next action), follow-up tasks, stage donut, recent responses, quick actions | **SAMPLE** (`APPLICATIONS`, `APPLICATION_TABS`, `STAGE_BREAKDOWN`, `RECENT_RESPONSES`, `FOLLOW_UP_TASKS`) | per-member stage counts (SUMMARY); detail only for FULL-paired | `application` rows per user | consent-scoped members/applications API; employer names hidden below FULL (table columns change) | none | O8.1 |
| `/org/interviews` | 4 tiles, week calendar, upcoming table, prep status, prep checklist, outcomes; prev/next/today inert | **SAMPLE** (`CALENDAR_EVENTS`, `UPCOMING_INTERVIEWS`, `PREP_STATUS`, `PREP_CHECKLIST`, `INTERVIEW_OUTCOMES`) | upcoming counts (SUMMARY), FULL calendar entries, ICS | — | `interview` (U6.1), org interviews API, ICS feed (O12.3) | none | O8.3, O12.3 |
| `/org/analytics` | 5 tiles, trend bars, funnel, response-rate lines, department bars, support-owner table, ROI tiles; filters inert | **SAMPLE** (`ANALYTICS_*`, `ROI_TILES`) | rollups with k-anonymity | — | `org_metric_daily`, metrics APIs; ROI/satisfaction tiles **dropped by design** | none | O7.1–O7.6 |
| `/org/resumes` | 4 tiles, tabs, table (Name, Role, Target, Resume score, ATS score, Version, Status), AI suggestions rail, 3 tool cards (bulk tailor…) | **SAMPLE** (`EMPLOYEE_RESUMES`, `RESUME_SUGGESTIONS`, `RESUME_TOOLS`) | readiness (SUMMARY) + consent-scoped resume cards (FULL pairing) | `OrgResumeSharing` interface exists (no impl); `resume.share_with_org`; `ResumeAccessService.Via.ORG` | `org_resume_mark`, `org_saved_view`, org resumes API (R8.1); admin-triggered AI on members **not built** | none (AI never on admin click) | O8.4, R8.1, R8.2, R8.3 |
| `/org/integrations` | 4 tiles, 9 "Connected" app cards, webhooks/API keys, notification routing, automation toggles; fake Run Sync | **SAMPLE** (`INTEGRATIONS`, `AUTOMATION_FLOWS`, `API_ACCESS_ROWS`, `NOTIFICATION_ROUTES`) | honest inventory: extension + inbox counts; Slack/ICS/webhooks/API key later | — | `org_webhook`, `org_api_key` (O12.4/O12.5) | none | O12.1, O12.2–O12.5 |
| `/org/billing` | 4 tiles (Enterprise, 72/100 seats, usage, renewal), plan summary, seat donut, Visa 4242, invoices, usage, subscription details, contacts | **SAMPLE** (`INVOICES`, `USAGE`, `SUBSCRIPTION_DETAILS`, `BILLING_CONTACTS` + page literals) | org status, items, upcoming invoice, invoices mirror | per-user `BillingResource`/`StripeGateway` pattern | `org_assignment`, `org_subscription*`, `org_invoice`, `/api/orgs/{id}/billing` | **Stripe (test keys)** | E2E-O4.0 (billing-off state), O4.1–O4.7 (Wave 5) |
| `/org/settings` | tabs: Organization Profile (local form), Team Permissions (local toggles), + 5 "Coming soon" (Notification Rules, Placement Workflow, Branding, Security & SSO, Audit Logs); fake Save; Admin roles, Approval rules, Security "Secure" rail | **SAMPLE** (`ABOUT_COMPANY`, `DEFAULT_ROLES`, `PERMISSION_TOGGLES`, `ADMIN_ROLES`, `APPROVAL_RULES`, `SECURITY_CHECKS`) | org profile, defaults, admins list, audit, honest security | — | `PATCH /api/orgs/{id}`, logo upload, audit API; approval rules/SSO **not built** | none | O13.1, O13.2, O13.4, O13.5, O13.6 |
| `/org/new`, `/org/welcome`, `/join/{slug}/{code}`, `/join/t/{token}`, `/org/marketer/*` | create flow, post-checkout, join + consent, marketer workspace | **MISSING** | — | — | all org tables | Stripe only for the pay screen | O2.1, O2.8, O2.3, O6.2, O10.3 |

**Counts (org):** REAL 0 · PARTIAL 0 · SAMPLE 10 · STUB 1 (shell/gate) · MISSING 5 routes.
Sample-like literals also live **outside** `org-v2/sample-data.ts` (billing tiles, settings defaults, donut centres "85"/"48"/"124", every filter option list, the shell's bell count and "Admin" label) — each page story removes its own.

### 1.3 What the audit found underneath (reuse, don't rebuild)

- **Spring**: 58 resources; user data keyed by `user_id`; JWT carries `USER_ID_CLAIM`; `ApplicationSyncService.listApplications` is unsorted/unpaged (U6.2 fixes); `NotificationService` has **no generic `publish`** (only `onStatusChanged`, kind `STATUS_FROM_MAIL`, free-string `kind` column); `EntitlementService.isPro` over the single `subscription` row; `ResumeBuilderSettings` over `app_setting` (60 s cache, typed getters, keys in `ResumeBuilderSettingKeys`) is **the interim settings seam** until A5.1; `SensitivePatterns`/`SensitiveContent` (422 `SENSITIVE_CONTENT`) must run on every new free-text write; `OpenApiContractIT` regenerates the committed `openapi.json` (every endpoint story commits it); ArchUnit layer rules (Web ← Config; Service ← Web, Config); ITs = Testcontainers MySQL 9.2 (`@IntegrationTest`), unit tests run without Docker.
- **Org hooks already waiting**: `service/resume/OrgResumeSharing` (interface, no bean: `pairingOf`, `isFullPairedViewer`, `ownersSharingFullWith`, `auditFullRead`), `ResumeViewEvent.KIND_ORG`, `ResumeAccessDTOs` org row `{scope, pairedWith, shareWithOrg}`, settings keys `org.resumes.{newDays,pageSize,maxSavedViews}`, demo account `demo-org` (landing `/org`, nothing seeded).
- **Web**: BFF styles A (`serverApiFetch` + hand-mapped errors), B (`forward()` from `lib/resume-doc-proxy.ts` — **use this one** for new routes), C (raw `fetch(apiUrl())` for auth/binary); `proxy.ts` only refreshes tokens; vitest (88 suites) + route tests under `app/api/resumes/**` are the pattern; **no Playwright**; mock API `web/scripts/mock-api.mjs` (1 422 lines, `npm run dev:demo`) has **no org endpoints** and seeds 8 applications / 6 resumes / 0 notifications / inbox 404 / matches 402.
- **Demo**: `DemoAccountService.resetData()` seeds "Jordan Lee" + 2 resumes + 8 applications for `demo`; `demo-org` is wiped, never seeded; `demo-admin` exists only in the mock.

### 1.4 Tracker status corrections applied in this commit (`docs/roadmap/areas/{user,org}.json`)

Rule: `done` = real data + API + tests · `partial` = UI on sample data or pieces missing · `not_started` = nothing of the story exists.

| Story | Old → new | Why (evidence) |
|---|---|---|
| U3.5 Profile strength card from the Common Profile completeness | partial → **done** | R1.6 shipped `ProfileProgressCard`/`BuildProfileCard` from `GET /api/profile/completeness` on the dashboard (`app/(app)/dashboard/page.tsx:76`, tests `setup/ProfileProgressCard.test.tsx`) |
| U2.4 Step 3: resume paths into the R1.4 card review | not_started → **partial** | the R1.4/R1.5 wizard (`/profiles/setup`: upload / paste / start fresh → card review) is built and tested; only its placement inside the U2 five-screen flow is missing (R1b owns that) |
| U0.4 Skeletons, empty states and error boundaries for every route | not_started → **partial** | `loading.tsx` skeletons exist on 5 of 20 routes; `EmptyState` primitive exists but every app-v3 page hand-rolls its own |
| U6.3 Detail sheet/panel: timeline, notes, next action | partial → **not_started** | no detail panel exists on the v3 page (`?app=` ignored); the legacy `ApplicationBoard` that had one is dead code |

Four changes. Everything else audited matches its recorded status (org: all 14 partial shells are UI-on-sample, as recorded; O14.1 done).

---

---

## 2. Foundations that block many pages

Five foundations are built first because almost every page depends on at least one. Each has a story
id (existing `O*`/`U*` ids where they fit, new `E2E-*` ids where the roadmap had a gap); the stories
themselves are specified in §4.

### 2.1 Organization tenant model (O1.1–O1.5, O6.1, O1.8) — `docs/design/org/tenant-model.md` is the spec

Today there is **no organization anywhere in the API** (46 changelogs, none org-related; `(org)/layout.tsx`
admits any signed-in user; `OrgShell` hard-codes "Admin" and "Acme Corp"). Everything under `/org/*` keys on
this model, so it is Wave 1, API lane, no UI.

**Tables** (one additive changelog `20261013010000_org_core.xml`, exactly as `tenant-model.md` §2):
`organization`, `org_member`, `org_group`, `org_invite_batch`, `org_join_code`, `org_domain`,
`org_audit_event`; plus `20261013020000_org_data_share.xml`: `data_share`, `data_share_event`
(`consent-data-sharing.md` §2). Money tables (`org_assignment`, `org_subscription*`, `org_invoice`) are
**Wave 5** (`billing.md` §3) — the pages that need them get a billing-off state first (§3.4).

**Roles.** The user named **OWNER / ADMIN / MARKETER / FINANCE / MEMBER**. The enum ships as the design
has it — `OrgRole { OWNER, ADMIN, STAFF, MEMBER, MARKETER, FINANCE, COACH }` — with `COACH` rejected by
validation (reserved) and `STAFF` = the Team page's "Support owner" (a person who looks after a subset of
members; needed by O5.4 and the STAFF nav). If the user does not want STAFF, it is one enum value and one
matrix row to drop (decision §5 D-3). Permission matrix = `tenant-model.md` §4, verbatim, in
`OrgPermission` + `OrgRole.permissions()`; `OrgPermissionMatrixTest` is table-driven over that section.

**`OrgAccessService.require(orgId, OrgPermission)`** → `OrgMembership` or throws `OrgNotFoundException`
(**404, never 403**, message never says "forbidden"). Every `/api/orgs/{orgId}/**` handler calls it on its
first line via `@OrgPermissionRequired(OrgPermission.X)` (an `HandlerInterceptor` + annotation so the check
cannot be forgotten); `OrgResourceGuardTest` reflects over every `OrgResource*` class and fails on an
unannotated handler. Org-scoped repositories live in `repository.org.*` and have **no method without an
`orgId` parameter** except `findMine(userId)` (`OrgRepositoryContractTest`).

**State machine** (`tenant-model.md` §3): `DRAFT → PENDING_SETUP_FEE → ACTIVE ↔ PAST_DUE → SUSPENDED`,
`→ CLOSED`. Until Wave 5 only `DRAFT`, `ACTIVE` and `CLOSED` are reachable: `DRAFT → ACTIVE` happens through
the **dev/CI activation path** (E2E-O4.0, §3.4) when billing is off, and through the setup-fee webhook
(O4.3) once Stripe is wired. Nothing in Waves 1–4 depends on Stripe.

**Isolation gate (O1.5)** — `OrgIsolationIT` discovers every `/api/orgs/{orgId}/**` route from
`RequestMappingHandlerMapping`, seeds org A and org B, calls each route as a member of B with A's ids and
asserts 404 + no audit row. **It runs in CI before any org page merges** (ROADMAP 21.0 gate). New org
routes fail it until they pass.

**Demo org (O1.8).** `DemoAccountService.resetData()` additionally seeds `demo-bootcamp` (type BOOTCAMP,
ACTIVE, owner = `demo-org`) with 12 synthetic members in two groups ("Cohort 26-A", "Cohort 26-B"), two
STAFF support owners, 9 members at SUMMARY scope, 2 at NONE, 1 INVITED; each consenting member has 2–6
applications across statuses so the dashboard/analytics tiles are non-trivial. The `demo` job-seeker
account is a MEMBER of that org at SUMMARY scope (so `/settings/organizations` demos). Seeded through the
same services as real traffic (no SQL fixtures), labelled by the existing `DemoBadge`. **Nothing in a page
component carries sample rows once its story lands** — demo content comes from this seed only.

### 2.2 The `(org)` route gate + feature flag (O1.6, O1.7, E2E-O1.9)

`(org)/layout.tsx` keeps the session probe, then calls `GET /api/orgs/mine` (`serverApiFetch`):
- `flag.orgs` off (see below) → redirect `/dashboard` (today's `noindex` stays, `NON_INDEXABLE_PATHS` unchanged);
- zero memberships → redirect `/org/new` (the create flow, O2.1 — in Wave 2 the minimal two-screen version);
- only MEMBER memberships → redirect `/dashboard?toast=org_member` (members' org surface is
  `/settings/organizations`, O6.3);
- one admin-ish membership → render; several → cookie `kiwiply_org` (httpOnly, 1 year) picks, `OrgChip`
  becomes the switcher sheet (O1.7).
The layout passes `{org, role, permissions[]}` to `OrgShell`, whose nav is **role-aware** from
`permissions[]` (`tenant-model.md` §8). Every org page component receives `orgId` as a prop; **no page
reads an org id from the client** — the BFF resolves it from the cookie/`mine` on the server.

**Flag.** Until A5.3 lands, the switch is the env/property `dossier.orgs.enabled` (env `ORGS_ENABLED`,
default `false` in prod, `true` in dev/CI/mock) exposed to the web as `GET /api/config/public → {orgs: bool}`
(a tiny `PublicConfigResource`, no auth, 5-min cache; A5.9 later folds it into `/api/config/public`). The API
returns 404 for every `/api/orgs/**` route when off. The web reads it once in the layout. When A5.3 ships,
the key becomes `flag.orgs` in the registry with the same default — the story that lands A5.3 renames it.

### 2.3 "Empty or real" — the one rule for data on a page (E2E-U0.0, U0.5, U0.4)

**Rule:** a page component never imports a sample constant. Data comes from a BFF route; when the list is
empty, the page renders an honest empty state with one action; demo accounts look full because the
*server* seeds them (`DemoAccountService`, §2.1). The three sample files
(`app-v3/sample-data.ts`, `app-v2/sample-data.ts`, `org-v2/sample-data.ts`) shrink page by page and are
**deleted** by the last story that touches them (U0.5 for the user app, O8.5 for org).

What already exists in `@kiwiply/ui` (`packages/ui/src/index.ts`) and is **reused, not rebuilt**:
`EmptyState` (`{icon,title,description,action}` — used by one legacy page only; every app-v3 page
hand-rolls a dashed `<p>` instead), `Skeleton`, `Spinner`, `Tooltip`, `IconButton`, `SideSheet`
(left/right/fullscreen), `SidePanel`, `SwipeCard`, `SavedTick` + `useSavedFlash`, `Dialog`, `Menu`,
`Popover`, `ToastProvider`/`useToast` (toast `action: {label, onClick}` is the undo pattern), `Tabs`,
`ChipInput`, `ConfettiBurst`, `DiffText`. The resume builder's autosave lives in web:
`components/app-v3/resume-builder/SaveStatusChip.tsx` (`SaveStatusChip`, statuses
`saved|saving|retrying|conflict|error`, offline label) and `state/autosave.ts` (`createAutosave`,
debounce 800 ms, serialised saves, If-Match, 409 pause, backoff) — framework-free, wired inside
`ResumeEditor.tsx`; undo toasts use `UNDO_TOAST_MS = 8000` (`uiTiming.ts`); `useLeaveGuard`,
`useOnline`, `ConflictDialog`, `ConfirmDialog` sit next to them; `profiles/useProfileItems.ts` has the
optimistic-delete + Undo (6 s) pattern.

What E2E-U0.0 ships once, as the kit every page story imports:
- **Move up** to `@kiwiply/ui`: `SaveStatusChip` (+ `SaveStatus` type), a `BottomSheet` = `SideSheet` with
  `side="bottom"` for phones (drag handle, 70 %/full snap), `ListSkeleton`/`TileSkeleton`/`TableSkeleton`
  compositions of `Skeleton`, and an `ErrorState` ("Couldn't load X · Retry", request id when present).
  The resume builder keeps importing its local `SaveStatusChip` until R6 re-points it (no behaviour change).
- **New in `web/src/lib/`**: `useAutosave(value, save, {debounceMs=600, onConflict})` — a React hook over
  `createAutosave` (moved to `web/src/lib/autosave.ts`, re-exported from its old path) returning
  `{status, savedAt, retry}`; `undoToast(toast, {title, onUndo, ms=6000})` — one helper so every page
  shows the same undo toast; `useListQuery` (§2.4).
- `EmptyState` gets a `variant: "page" | "inline"` prop and a `mascot?: boolean` slot (page variant only).
- The rule "every icon-only control has a tooltip + `aria-label`" becomes a lint rule
  `kiwiply/icon-button-needs-label` in the web ESLint config (the resume builder already passes it —
  `iconControls.tooltips.test.tsx`).

### 2.4 Shared list / pagination / filter contract (E2E-U0.0, API + web halves)

Every list endpoint added by this plan uses one shape so one hook renders them all:

```
GET …?page=0&size=20&sort=<field>,<asc|desc>&q=<text>&<filter>=<value>…
→ 200 { items: T[], total: number, page: number, size: number, summary?: Record<string, number> }
```
- `size` ≤ 50 (server clamps), `sort` whitelisted per endpoint (400 `SORT_INVALID` otherwise), `q` ≤ 120 chars,
  filters are named query params (`status=APPLIED,INTERVIEW` = CSV in), `summary` = per-tab counts when
  the page has tabs (e.g. `{ALL: 12, APPLIED: 7, INTERVIEW: 2}`).
- Java: `ListPage<T>` record + `ListQuery` (page/size/sort/q parsing + `Sort` whitelist helper) in
  `service/dto/`; existing endpoints (`/api/profile/applications`, `/api/notifications`) gain the shape
  additively (old fields kept until the web stops reading them).
- Web: `useListQuery<T>(path, {filters, page, size, sort})` in `web/src/lib/list-query.ts` — URL-synced
  (`?q=&status=&page=` via `history.replaceState`), keeps the previous page while loading (no flash),
  exposes `{data, summary, isLoading, error, setFilter, setPage, refetch, optimistic(id, patch)}`.
- Bulk: `POST …/bulk {ids[≤50], action, …}` → `{done: id[], failed: [{id, reason}]}`; the UI toasts
  "11 of 12 archived".

### 2.5 Activity, events and the dashboard feeds (U6.1, O1.4)

Two append-only event tables feed every "recent activity" and "timeline" surface; nothing else is built:
- **User:** `application_event` (`applications-inbox.md` §1) — written by every status/notes/interview/mail
  change with `source ∈ EXTENSION|WEB|INBOX|SYSTEM|ASSISTANT`; backfilled from `created_at`/`applied_at`.
  The dashboard "Recent activity", the application timeline tab, analytics "first became X" and the org
  rollups (`analytics.md` §2 "first became") all read it.
- **Org:** `org_audit_event` (`tenant-model.md` §2.7) — every org actor action on a person; the org
  dashboard "Recent (consented)" feed, the member detail sheet's "what the org did" and the audit viewer
  (O13.4) read it.
Product analytics (U18.1) is **not** part of this plan — it measures, it does not render pages.

### 2.6 Notifications (existing table, two slices)

`notification` + `NotificationService` + the bell exist (14.6). This plan adds only what pages need:
- **E2E-U7.0 Notification preferences v0** — `notification_preference` (matrix_json, quiet hours, tz,
  digest fields per `alerts-notifications.md` §1) + `GET/PUT /api/profile/notification-preferences` +
  `NotificationService.publish` honours `matrix[kind].email ∈ off|now` for the **existing** kinds. Makes
  Settings › Notifications real without the engine refactor. The full engine (U7.1: policy, dedupe,
  digest, push) comes in Wave 3 and must keep this table and endpoint.
- **O13.3 org kinds** — `NotificationKind` gains `ORG_INVITE_ACCEPTED, ORG_ACTIVE, SHARE_REVOKED,
  ORG_ITEM_GRANTED, ORG_COVERS_YOUR_PLAN`; delivered through the same service; the org bell count stops
  being hard-coded "1 unread" (O1.7).

---

## 3. External dependencies — what works without them, and the fallback for each

| Dependency | Needed by | Works without it | Fallback shipped by the page story | Who unblocks |
|---|---|---|---|---|
| **none** | Dashboard, Applications tracker (all tabs, timeline, notes, interviews), Saved, Profiles, Settings (account, notifications prefs, privacy, job preferences, help), Analytics, Resume Builder, Jobs search over the existing posting store, Explore companies (from the store), Interview Prep question bank + sessions, every org foundation page (team, settings, dashboard checklist/tiles, applications summary, interviews counts, resumes readiness, integrations honest, audit, security honest) | ✓ build first (Waves 1–4) | — | — |
| **Job aggregator** (one licensed API — Adzuna / Jooble / Careerjet, D61) | wider coverage on `/jobs`, instant matches breadth | ✓ `/jobs` is real today over **219 ATS public boards** (Greenhouse/Lever/Ashby ingest, 13.6a) + the three parsers U4.4 adds (Workable, SmartRecruiters, Recruitee); the ranker, filters and alerts need no aggregator | search runs over `job_posting` (ATS rows only); a one-line "via <aggregator>" attribution appears only once a source of kind AGGREGATOR exists | user picks the aggregator and supplies the key (§5 D-1); U4.4's aggregator client is the last story of U4 |
| **Gmail IMAP + App Password** (user's own account — locked model) | Messages page, "Emails" tab on an application, inbox-driven status changes, response-rate analytics | ✓ the inbox stack is built (14.x, `/settings/inbox` real) — it needs **a user who connects**, not a platform key | Messages / Emails tab render `EmptyState` "Connect your Gmail to see recruiter mail here · Connect" → `/settings/inbox`; analytics hide response-rate tiles until ≥ 1 inbox-sourced event (never a fake %) | nothing to decide; the demo seed gets 6 synthetic `inbox_message` rows attached to seeded applications so the demo shows the feature (no IMAP call) |
| **Stripe (test keys)** | org setup fee, org seats/items, org billing page numbers, per-user plan upgrade sheet | ✓ per-user billing already runs keyless in dev (`StripeGateway.isEnabled()`); org billing = Wave 5 | org pages run on **E2E-O4.0 billing-off activation** (`dossier.orgs.dev-activate=true` in dev/CI: `POST /api/orgs/{id}/activate` moves DRAFT→ACTIVE, 404 in prod); `/org/billing` renders the real org status + "Billing isn't connected in this environment" card instead of invoices | user supplies Stripe **test** keys + the org price ids when Wave 5 starts (§5 D-5) |
| **AI (Gemini key, Pro budget)** | Assistant (U8), AI mock interview (U9.3), Score this job (U4.7), resume AI (R4) | ✓ every page has a no-AI path: Assistant = Pro sheet + deterministic chips on Free and a key-missing state on Pro; Interview Prep = question bank + self-rated sessions; Jobs = rules ranking (same list for every tier) | `AiBudgetService.decide` already returns the 402/503 shapes; pages show them as cards, never spinners | prod key exists (13.x); dev needs `DOSSIER_AI_*` only for the AI stories |
| **Web push (`web-push` dep, D62)** | push channel of alerts | ✓ alerts are in-app + email digest without it | the preferences matrix shows "Push: not available yet" greyed | user approves the dependency (already default-yes in RECONCILIATION D62); U7.4 is after this plan's waves |
| **`@dnd-kit`** (already a web dep since R2.2) | drag-reorder | — | — | none |

**Order consequence:** Waves 1–4 contain **no story that needs a credential or a user decision**. The two
decision-gated lanes (aggregator client U4.4; org Stripe O4.x/O3.x) are Wave 5 and can start the day the
user answers §5 D-1 and D-5.

---

## 4. Waves — the build order (each story = one Sonnet session, strict file ownership)

Conventions for every story block: **id · title · size · owners · deps** then *Files* (owned by that
session — nobody else touches them in the same wave), *API* (method path → response; errors as
ProblemDetail codes), *Tables* (additive Liquibase, file name given), *Tests* (named; API unit tests must
run without Docker, ITs run in CI), *Mock* (what `web/scripts/mock-api.mjs` gains so the page can be
demoed with `npm run dev:demo -w web`). Deps on `A5.1`/`A5.3`/`B1.1`/`B1.2` in the JSON are satisfied by the
**interim settings seam** (`ResumeBuilderSettingKeys` + `ResumeBuilderSettings` over `app_setting`, key
named in the story) — do not wait for the admin area. Every API story commits the regenerated
`api/openapi.json` (`OpenApiContractIT`). Every page story: deletes its sample constants, uses the §2.3
kit, meets §7, adds a vitest test, adds its mock routes, and adds a row to the wave's Playwright journey.

Lanes run in parallel: **A** API-user · **B** web-user · **C** API-org · **D** web-org · **K** kit/infra.
A wave is "done" when its click-through demo passes on the real stack (`rb-smoke`-style script +
Playwright journey) and on `dev:demo`.

### Wave 1 — "Honest app · tracker with memory · org core" (22 stories)

Goal: no real account ever sees a fake row again; the applications tracker remembers (events, notes,
interviews) and feeds the dashboard and analytics; the org model exists with isolation proven in CI.

**Lane K (first — everything imports it)**

- **E2E-U0.0 · Page kit: autosave/undo/empty/list contract · M · ui, web, API · deps —**
  *Files*: `packages/ui/src/primitives/{SaveStatusChip,BottomSheet,ListSkeleton,ErrorState}.tsx` (+ `index.ts`
  exports; `EmptyState` gains `variant`/`mascot`), `web/src/lib/{autosave,undo-toast,list-query}.ts` (+ tests),
  `web/src/components/app-v3/resume-builder/state/autosave.ts` → re-export shim, `web/eslint.config.*`
  (rule `kiwiply/icon-button-needs-label`), `api/src/main/java/com/dossier/api/service/dto/{ListPage,ListQuery}.java`.
  *API*: none new; `ListQuery.parse(page,size,sort,q, allowedSorts)` → 400 `SORT_INVALID`. *Tests*: vitest
  `autosave.test.ts` (debounce, conflict callback, retry), `list-query.test.tsx` (URL sync, keep-previous),
  `BottomSheet.test.tsx` (snap, Esc, focus trap), `ListQueryTest.java`; `packages/ui` vitest green.
  *Supersedes* U0.2 (bottom sheet + swipe: `SwipeCard` already exists). *Mock*: none.
- **U19.3 · Test infrastructure: Playwright + mock fixtures + CI job · M · web · deps —**
  *Files*: `web/playwright.config.ts`, `web/e2e/{fixtures,journeys}/**`, `web/scripts/mock-api.mjs` (fixture
  loading via `MOCK_FIXTURE=<name>`), `.github/workflows/ci.yml` (job `web-e2e` on `dev:demo`), `web/package.json`
  (`test:e2e`). *Tests*: journey `smoke.spec.ts` opens all 20 user routes + 10 org routes at 390/1440 and asserts
  no console errors, no horizontal overflow. Dev dep `@playwright/test` (already approved via `@axe-core/playwright`, R6.5).
- **U0.5 · Remove sample fallbacks behind one gate · S · web · deps E2E-U0.0**
  *Files*: `web/src/components/app-v3/sample-data.ts` (exports go through `samples(name)` → `[]` unless
  `isDemoLogin(login) && process.env.NEXT_PUBLIC_BOARD_SAMPLES==="1"`), every page that imports it (edit the
  import line only; the page stories delete the constants). *Tests*: Playwright `fresh-account.spec.ts` — a new
  non-demo fixture sees `EmptyState` on dashboard/jobs/applications/saved/alerts/messages/explore/interview-prep/analytics.

**Lane A (API, user)**

- **U6.1 · Tracker schema: events, notes, interviews, IN_REVIEW/WITHDRAWN · M · API · deps —**
  Spec `applications-inbox.md` §1–§2. *Files*: `changelog/20261013030000_application_events.xml`,
  `domain/{ApplicationEvent,ApplicationNote,Interview}.java`, `domain/enumeration/ApplicationStatus.java` (+2 values),
  `repository/{ApplicationEvent,ApplicationNote,Interview}Repository.java`, `service/ApplicationEventService.java`
  (`record(app, kind, from, to, source, refId, summary)` — called by `ApplicationSyncService.update/upsert`,
  `InboxParser` status moves, `JobMatchService.save`), `MailMatcher.next` (adds IN_REVIEW between APPLIED and
  INTERVIEW), `AccountDeletionService`/`AccountExportService` (cascade + export `events/notes/interviews`).
  *Tables*: `application_event`, `application_note`, `interview` exactly as the design; `application` +
  `last_event_at, next_action, next_action_at, outcome, accepted_at, cover_letter_resume_id`; backfill changeset
  (one CREATED event per row, one STATUS from `applied_at`). *Tests*: `ApplicationEventServiceTest` (every status
  change writes one event; forward-only inbox rule; terminal states), `ApplicationEventIT` (backfill counts),
  `MailMatcherTest` (IN_REVIEW mapping), extension guard: `job-autofill` `tracking.js` maps unknown statuses to a
  neutral chip (one jsdom test; version bump). *Mock*: statuses extended.
- **U6.2 · Applications list API v2 · M · API · deps U6.1, E2E-U0.0**
  *API*: `GET /api/profile/applications?status=&q=&company=&archived=&sort=updatedAt,desc&page=&size=` →
  `ListPage<ApplicationDTO>` + `summary {ALL, SAVED, APPLIED, IN_REVIEW, INTERVIEW, OFFER, REJECTED, WITHDRAWN,
  ARCHIVED}` (old unpaged shape kept when no `page` param, for the extension); `GET …/{id}` → DTO +
  `{events[≤50], notes[], interviews[], mailCount, suggestions[]}`; `PATCH …/{id}` `{status|nextAction|nextActionAt|
  starred|archived|resumeId|outcome}` (writes events; `outcome: ACCEPTED` sets `accepted_at` — D-7);
  `POST/PUT/DELETE …/{id}/notes[/{nid}]`; `POST …/bulk {ids[≤50], action: ARCHIVE|UNARCHIVE|STATUS|STAR, status?}`
  → `{done[], failed[]}`. DTO adds `lastEventAt, nextStep{label,at}, ghosted, interviewsCount, notesCount, mailCount`.
  *Files*: `web/rest/ApplicationSyncResource.java`, `service/ApplicationSyncService.java`, `service/dto/ApplicationDTO.java`,
  `repository/ApplicationRepository.java` (specification + `countByUserGroupByStatus`). *Tests*: `ApplicationSyncResourceIT`
  (paging, summary, filters, bulk partial failure, foreign id → 404), `GhostedDerivationTest` (21-day boundary).
  *Mock*: list v2 + notes + bulk.
- **U6.4 · Interviews: CRUD, .ics, outcome · M · API, web · deps U6.1, U6.3** (reminders arrive with U7.1 — AC rows
  about reminders are deferred, noted in the PR)
  *API*: `POST/PUT/DELETE /api/profile/applications/{id}/interviews[/{iid}]` `{kind, startsAt, endsAt?, tz, location?,
  interviewer?, notes?}`; `POST …/{iid}/outcome {outcome}`; `GET /api/profile/interviews?from=&to=`;
  `GET /api/profile/interviews/{id}/ics` (text/calendar with VTIMEZONE). *Files*: `web/rest/InterviewResource.java`,
  `service/InterviewService.java`, `service/dto/InterviewDTO.java`, web `app/api/interviews/**` (style B), `app/api/
  applications/[id]/interviews/**`, `components/app-v3/applications/InterviewForm.tsx` (autosave per field),
  `lib/interviews.ts`. *Tests*: `InterviewResourceIT` (CRUD, ics content-type, outcome, foreign id 404, writes INTERVIEW
  event), vitest `InterviewForm.test.tsx`. *Mock*: interviews + ics.
- **E2E-U7.0 · Notification preferences v0 (per-kind in-app/email, quiet hours) · M · API, web · deps —**
  *Tables*: `changelog/20261013040000_notification_preference.xml` → `notification_preference` (`alerts-notifications.md`
  §1) + `notification.dedupe_key, group_key` (+ unique `(user_id, dedupe_key)`), `notification.kind` stays a string
  but a `NotificationKind` enum is introduced (`STATUS_FROM_MAIL`→`APP_STATUS` alias, `INTERVIEW_REMINDER`,
  `PROFILE_SUGGESTION`, `BILLING`, `SECURITY`, `SYSTEM`, org kinds reserved). *API*: `GET/PUT /api/profile/
  notification-preferences` → `{matrix: {KIND: {inapp: true, email: off|now}}, quietStart, quietEnd, tz}`;
  `NotificationService.publish(kind, userId, {title, body, link, applicationId?, groupKey?, dedupeKey?})` (idempotent
  on dedupe; email only when matrix says `now` and kind not in quiet hours; BILLING/SECURITY email locked on) —
  `onStatusChanged` becomes a caller of `publish`. *Files*: `service/NotificationService.java`, `service/
  NotificationPreferenceService.java`, `web/rest/NotificationPreferenceResource.java`, web `app/api/notification-
  preferences/route.ts`, `components/app-v3/settings/NotificationsPanel.tsx` (toggles autosave, `SavedTick`).
  *Tests*: `NotificationPolicyTest` (matrix × locked kinds × quiet hours incl. DST), `NotificationServiceIT` (dedupe
  replay), vitest `NotificationsPanel.test.tsx`. *Mock*: prefs GET/PUT.

**Lane B (web, user)**

- **U6.3 · Applications detail panel/sheet: timeline, notes, next action, outcome · M · web · deps U6.2, E2E-U0.0**
  Spec `applications-inbox.md` §4. *Files*: `components/app-v3/applications/{ApplicationsV3Page,ApplicationDetail,
  TimelineTab,NotesTab,StatusPicker}.tsx`, `app/(app)/applications/{page,loading}.tsx`, `app/api/applications/
  [id]/route.ts` (adds GET, PATCH via `forward`), `app/api/applications/[id]/notes/**`, `app/api/applications/bulk/
  route.ts`, `lib/applications.ts` (`useListQuery` wrapper, `patchApplication`, `addNote`). Desktop = right
  `SideSheet`, phone = `BottomSheet`; `?app=<id>` opens it (fixes `/board?app=`); status change = optimistic +
  `undoToast`; notes autosave; "Did you accept? 🎉" chip on OFFER (D-7). Deletes `V3_APPLICATION_ROWS`,
  `V3_APPLICATION_SAMPLE_COUNTS`; tabs read `summary`. *Tests*: vitest `ApplicationDetail.test.tsx`,
  `ApplicationsV3Page.test.tsx` (tabs from summary, empty state), Playwright `tracker.spec.ts` (390: open sheet,
  change status, undo, add note, add interview). *Mock*: covered by U6.2/U6.4.
- **U5.1 · Saved Jobs on real SAVED applications · M · web · deps U6.2, U0.5**
  *Files*: `components/app-v3/saved/{SavedV3Page,SavedCard}.tsx`, `app/(app)/saved/{page,loading}.tsx`, `lib/
  applications.ts` (reuse). Tabs To apply = `status=SAVED`, Applied = `status≥APPLIED` with `source=SAVED` origin
  (events), Not interested = `archived=1`; remove = archive + `undoToast`; "Apply" opens `jobUrl`; deletes
  `V3_SAVED_JOBS`. *Tests*: vitest `SavedV3Page.test.tsx`; Playwright row in `tracker.spec.ts`.
- **U3.1 · Dashboard real tiles, activity, donut, recent, interviews, no sample · S · web · deps U6.2, U6.4, U0.5**
  *Files*: `app/(app)/dashboard/page.tsx`, `components/app-v3/home/{DashboardPage,compute,ActivityCard,
  UpcomingInterviews}.tsx`. Tiles from `summary`, activity from `application_event` (new `GET /api/profile/
  applications/activity?days=30` → `[{day, count}]` — add to U6.2's resource, 10 lines), interviews from
  `GET /api/profile/interviews`, "AI insights" card **removed** (no source), alerts widget hidden until U7.2
  (`EmptyState inline` "Create your first alert"). Deletes every `DASH_*` constant. *Tests*: vitest `compute.test.ts`,
  `DashboardPage.test.tsx` (empty vs seeded).
- **U12.1 · Analytics on real data, honest empty state · M · API, web · deps U6.1**
  *API*: `GET /api/profile/analytics?range=30|90|365` → `{range, stats{applied, replies, interviews, offers},
  overTime[{week, applied, interviews, offers}], byStatus[], responseByCompany[{company, applied, replied}] (only
  when ≥1 inbox-sourced event), real: bool}` computed from `application_event` (first-became-X). *Files*:
  `web/rest/ProfileAnalyticsResource.java`, `service/ProfileAnalyticsService.java`, web `app/api/analytics/route.ts`,
  `components/app-v3/analytics/{AnalyticsPage,compute}.tsx`. Period select real; "Skills in demand" card **removed**
  until U4.1 enrichment exists; deletes `AN_SAMPLE`, `AN_SKILLS`. *Tests*: `ProfileAnalyticsServiceTest` (week
  bucketing, first-became rule), vitest `AnalyticsPage.test.tsx`. *Mock*: analytics.
- **E2E-U14.0 · Settings panels v0: Notifications, Privacy, Help · S · web · deps E2E-U7.0**
  *Files*: `components/app-v3/settings/{SettingsV3Page,panels,PrivacyPanel,HelpPanel}.tsx`. Notifications =
  `NotificationsPanel` (E2E-U7.0); Privacy = static "what we store / who sees it" list generated from a typed
  `DATA_MAP` constant (`lib/data-map.ts`: table → purpose → who sees → retention) + links to export/delete;
  Help = bug report widget, contact, keyboard shortcuts; `SoonRow`s deleted; "Time zone" becomes a real
  `tz` select saved to `notification_preference.tz`. *Tests*: vitest `panels.test.tsx`.

**Lane C (API, org)** — spec `tenant-model.md` + `consent-data-sharing.md`

- **O1.1 · Org core schema · M · API · deps —** *Tables*: `changelog/20261013010000_org_core.xml` → `organization`,
  `org_member`, `org_group`, `org_invite_batch`, `org_join_code`, `org_domain`, `org_audit_event` (§2.1–§2.7 verbatim,
  incl. generated unique keys). *Files*: `domain/org/*.java`, `domain/enumeration/{OrgType,OrgStatus,OrgRole,
  OrgMemberStatus}.java`, `repository/org/*Repository.java` (every finder takes `orgId` first). *Tests*:
  `OrgSchemaIT` (Liquibase applies; generated columns enforce one live row per email), `OrgRepositoryContractTest`
  (reflection: no method without an orgId param except `findMine`).
- **O1.4 · org_audit_event + OrgAuditService · S · API · deps O1.1** *Files*: `service/org/OrgAuditService.java`
  (`record(orgId, actorMembership, action, targetType, targetLogin?, targetId?, details)`; action constants §2.7;
  repository has no delete/update). *Tests*: `OrgAuditServiceTest`, `OrgAuditRepositoryNoDeleteTest`.
- **O1.2 · OrgAccessService + permission matrix + 404 semantics · M · API · deps O1.1**
  *Files*: `service/org/{OrgPermission,OrgAccessService,OrgMembership}.java`, `web/rest/org/OrgPermissionRequired.java`
  (annotation) + `config/OrgPermissionInterceptor.java`, `web/rest/errors/OrgNotFoundException.java` (404, generic
  message). *Tests*: `OrgPermissionMatrixTest` (table-driven over `tenant-model.md` §4 — the test file embeds the
  table), `OrgResourceGuardTest` (every handler under `/api/orgs/**` annotated), `OrgAccessServiceTest` (foreign org
  → 404, suspended member → 404, OWNER-only rules).
- **O1.3 · Org endpoints: create DRAFT, mine, get, patch, close, groups · M · API · deps O1.2, O1.4**
  *API*: `tenant-model.md` §5 rows 1–5 + groups CRUD; `GET /api/orgs/{id}` returns `{org, me: {role, permissions[]},
  memberCount, status}`; `PATCH` body validated by `OrgSettings` record (`SensitiveContent.check` on free text).
  *Files*: `web/rest/org/{OrgResource,OrgGroupResource}.java`, `service/org/{OrgService,OrgSettings}.java`, DTOs in
  `service/dto/org/`. *Tests*: `OrgResourceIT` (create → OWNER row + audit; slug collision → suggestion; close; mine
  for 0/1/2 orgs), `OrgGroupResourceIT`.
- **O6.1 · data_share + data_share_event + ShareField matrix · M · API · deps O1.1**
  *Tables*: `changelog/20261013020000_org_data_share.xml` (consent doc §2). *Files*: `domain/org/{DataShare,
  DataShareEvent}.java`, `service/org/{ShareField,ShareScope,DataShareService}.java` (`scopeOf(orgId, memberId)`,
  `set(...)` writes the event; `MemberSummaryDTO` generated from `ShareField`), **implements
  `service/resume/OrgResumeSharing`** as a bean (`pairingOf`, `isFullPairedViewer`, `ownersSharingFullWith`,
  `auditFullRead` → `org_audit_event SHARE_READ_FULL`) so the existing resume access path works for org viewers,
  consent text `resources/consent/org-share/v1.md`. *Tests*: `ShareMatrixTest` (renders the enum to the §3 table and
  diffs the doc), `MemberSummaryScopeTest`, `RevocationIsImmediateTest`, `ResumeAccessServiceTest` gains the ORG via case.
- **E2E-O1.9 · Org feature flag + public config endpoint · S · API · deps O1.3**
  *Files*: `config/application.yml` (`dossier.orgs.enabled: ${ORGS_ENABLED:false}`, `application-dev.yml` true),
  `web/rest/PublicConfigResource.java` (`GET /api/config/public` → `{orgs: bool, demo: bool}`, permitAll, `Cache-Control:
  public, max-age=300`, schema-asserted so it can never carry per-user data), `config/OrgsEnabledFilter.java` (404 for
  `/api/orgs/**`, `/api/join/**`, `/api/me/orgs/**` when off), `SecurityConfiguration` permit rule. When A5.3 lands,
  the key moves to `flag.orgs` (same default). *Tests*: `PublicConfigResourceIT` (schema, no auth), `OrgsEnabledFilterTest`.
- **O1.5 · OrgIsolationIT (route-discovered) · M · API · deps O1.3, O1.4, O6.1**
  *Files*: `src/test/java/com/dossier/api/web/rest/org/OrgIsolationIT.java` + `OrgFixtures` (org A: a1 owner, a2
  member, a3 staff; org B: b1 owner, b2 member; one row of every org table in each). Discovers every `/api/orgs/{orgId}/**`
  route via `RequestMappingHandlerMapping`, calls each as b1 with A's ids (path ids substituted from the fixture by
  name) → asserts 404 + zero `org_audit_event` rows for org A with actor b1; also asserts every mutating route wrote
  exactly one audit row when called legitimately. **CI gate**: `.github/workflows/ci.yml` runs it in `integrationTest`;
  nothing under `(org)` merges while it is red.
- **O1.8 · Demo org seed · S · API · deps O1.3, O6.1**
  *Files*: `service/DemoAccountService.java` (`seedOrg()` per §2.1: `demo-bootcamp`, 12 members, 2 groups, 2 STAFF,
  scopes 9×SUMMARY/2×NONE/1×INVITED, 2–6 applications each through `ApplicationSyncService` + events, 6 synthetic
  `inbox_message` rows linked to applications, `demo` user = MEMBER at SUMMARY), `DemoAccountServiceTest` (idempotent
  reset; counts). Copy per D-4. *Mock*: `scripts/mock-api.mjs` gets the same org fixture under `/api/orgs/**` for
  `demo-org` (JSON file `web/scripts/fixtures/demo-org.json` shared by seed tests and the mock).

**Wave 1 demo (click-through):** sign up a fresh account on the real stack → every route shows an honest empty
state (Playwright `fresh-account.spec.ts`) → "+ Add application" with a URL → status → In review (undo) → add a
note (autosaves, ✓) → add an interview → dashboard shows "Upcoming: Google · Thu 10:00" and the stat tiles →
Analytics shows 1 applied, honest "no replies yet" → Settings › Notifications toggle persists after reload →
sign in as `demo` → full dashboard from the server seed, `DemoBadge` visible → `curl /api/orgs` as `demo-org` lists
`demo-bootcamp`; `OrgIsolationIT` green in CI.

### Wave 2 — "Jobs are real · the org console opens" (20 stories)

**Lane A/B (user)**

- **E2E-U4.0 · Job search v0 over the existing posting store · M · API · deps —**
  *Tables*: `changelog/20261013050000_job_posting_search.xml` → `job_posting.search_text MEDIUMTEXT`, FULLTEXT
  `ft_job_posting_search (title, company, search_text)`, `ix_job_posting_pub (published_at DESC, id)`,
  `job_source.platform` (from `ats`), backfill `search_text` for existing rows; `JobIngestService` fills it on upsert.
  *API*: `GET /api/jobs/search?q&loc&remote&type&posted&company&sort=best|newest&page&size` → `JobSearchPage`
  (`job-search-matching.md` §5 — `facets` limited to `remote|type|postedBuckets`, `suggestions` = relaxations,
  `match` filled from `job_match` for Pro), `GET /api/jobs/{id}` → `JobDetail` (410 when purged), `POST /api/jobs/{id}/save`
  (one code path with `JobMatchService.save`, `ApplicationKeys` dedup), `POST/DELETE /api/jobs/{id}/feedback {signal:
  HIDE|HIDE_COMPANY}` (`job_feedback` table from §3.4 — LIKE/DISLIKE weights arrive with U4.6). Ranking = §6 with
  `preference_fit` from `MatchPreferences.from(bio, resume)` until U4.5 adds the explicit row. Short-token fallback,
  1 000-result cap, `?explain=1` for admins. *Files*: `web/rest/JobSearchResource.java`, `service/jobs/{JobSearchService,
  JobRanker,JobQueryParser}.java`, `repository/JobPostingSearchRepository.java` (native FULLTEXT query), DTOs. *Tests*:
  `JobRankerTest` (each term, exclusions, stable ties), `JobQueryParserTest`, `JobSearchServiceIT` (FULLTEXT on Testcontainers:
  boolean exclude, fallback, facets, relaxations, cap), `JobFeedbackIT`. *Mock*: search over a 60-row fixture. **U4.2
  extends this (ranker v2, `explain`, Meilisearch threshold) — it does not replace the endpoint.**
- **U4.3 · Jobs page on real search, 390 px first · L · web · deps E2E-U4.0, E2E-U0.0**
  *Files*: `app/(app)/jobs/{page,loading}.tsx` (server-rendered first page from `?q=`), `components/app-v3/jobs/
  {JobsPage,FilterSheet,JobRow,JobDetail,filter}.tsx`, `app/api/jobs/{search,[id],[id]/save,[id]/feedback}/route.ts`,
  `lib/jobs.ts` (`useListQuery` over search; `saveJob`, `hideJob` optimistic). Filter rail → chips + `BottomSheet`
  on phones; swipe right = save (`SwipeCard`), left = hide with `undoToast`; empty state shows relaxations + "Create an
  alert" (links to `/alerts`, disabled until U7.2 with a tooltip); Pro match ring from `match`; "+" collection button
  **removed** (U5.3 is P2). Deletes `V3_JOBS`, `JOBS_SAMPLE_TOTAL`, `GOOGLE_V3_DETAIL`, `JOB_*` facets; removes
  `app-v2/jobs/data.ts` `SAMPLE_JOBS` fallback (dashboard recommended reads `search?sort=best&size=3`). *Tests*: vitest
  `JobsPage.test.tsx`, `filter.test.ts`; Playwright `jobs.spec.ts` (type, chip, open sheet, save → appears in /saved,
  hide + undo, empty relaxations).
- **U4.5 · Explicit job preferences (API + Settings panel + Profiles card) · M · API, web · deps E2E-U4.0**
  *Tables*: `changelog/20261013060000_job_preference.xml` (§3.3). *API*: `GET/PUT /api/profile/job-preferences`;
  `MatchPreferences.from(bio, resume, explicit)` override; `JobSearchService` uses it. *Files*: `web/rest/
  JobPreferenceResource.java`, `service/jobs/JobPreferenceService.java`, web `app/api/job-preferences/route.ts`,
  `components/app-v3/settings/JobPreferencesPanel.tsx` (chips + autosave), `components/app-v3/profiles/OverviewTab.tsx`
  (prefs card reads it; hard-coded "$120K–$180K" etc. deleted; "Change" → the panel). *Tests*: `JobPreferenceResourceIT`
  (limits, override), `MatchPreferencesTest` (explicit wins), vitest `JobPreferencesPanel.test.tsx`.
- **U4.8 · Top-bar search → real results, recent searches, title typeahead · S · web, API · deps E2E-U4.0**
  *API*: `GET /api/jobs/suggest?q=` → top 8 titles from `job_posting` (prefix, 60 s cache). *Files*: `components/
  app-shell/{AppShell,SearchBox}.tsx`, `app/api/jobs/suggest/route.ts`; recent searches in `localStorage` (≤ 8).
  *Tests*: vitest `SearchBox.test.tsx`, `JobSuggestIT`.
- **U6.5 · Phone cards with swipe status/archive, bulk select, "+ Add application" with URL paste · M · web · deps U6.3, E2E-U0.0**
  *Files*: `components/app-v3/applications/{ApplicationCard,AddApplicationSheet,BulkBar}.tsx`, `lib/job-meta.ts` (URL →
  company/title via the existing `JobCapture` rules ported from `job-autofill/src/lib/capture` — read-only copy, no
  engine import). *Tests*: vitest + Playwright rows (swipe → status sheet, bulk archive "11 of 12").
- **U6.6 · Mount inbox components on v3 + manual email linking · S · web, API · deps U6.3**
  *API*: `POST /api/profile/applications/{id}/mail/link {inboxMessageId}` (409 if linked elsewhere; MAIL event; matcher
  hint). *Files*: `components/app-v3/applications/EmailsTab.tsx` (mounts `board/ApplicationEmails` + `SuggestionsCard`
  inside the detail sheet; `EmptyState` "Connect your Gmail" when `/api/profile/inbox` says not connected), delete
  `components/ApplicationBoard.tsx` (move the `Application` type to `lib/applications.ts`). *Tests*: `MailLinkIT`, vitest
  `EmailsTab.test.tsx` (three states: no inbox, connected empty, messages).
- **U13.1 · Profiles hub integration · S · web · deps R1.1, R1.2**
  *Files*: `components/app-v3/profiles/OverviewTab.tsx`: delete `V3_PROFILE_FALLBACK`/`V3_RESUME_VERSION_SAMPLES`/
  `V3_PROFILE_VARIANTS`; "Linked profiles" = the bio's `linkedin/github/website` with inline autosave inputs (no
  "Connect"); "View full profile" + visibility rows **removed** (U13.3 is P2); resume versions from `/api/profile/resumes`
  or `EmptyState inline` → `/resume-builder`. *Tests*: vitest `OverviewTab.test.tsx`.

**Lane C/D (org)** — specs `tenant-model.md` §8, `onboarding-invites.md`, `consent-data-sharing.md` §4–§5

- **E2E-O4.0 · Billing-off activation path + billing page "not connected" state · S · API, web · deps O1.3**
  *API*: `POST /api/orgs/{id}/activate` (OWNER; only when `dossier.orgs.dev-activate=true` **and** `StripeGateway.
  isEnabled()==false`; prod never sets it → 404) moves `DRAFT→ACTIVE`, audit `BILLING_DEV_ACTIVATED`; `GET /api/orgs/{id}/
  billing` → `{status, billingEnabled: false, subscription: null, items: [], invoices: []}` when billing is off (O4.6 fills
  it in Wave 5). *Files*: `web/rest/org/OrgBillingResource.java` (skeleton), `service/org/OrgActivationService.java`, web
  `components/org-v2/billing/BillingPage.tsx` (real status card + `EmptyState page` "Billing isn't connected in this
  environment" / "Set up billing" CTA when enabled-but-DRAFT; deletes every sample + literal), `app/api/orgs/[orgId]/
  billing/route.ts`. *Tests*: `OrgActivationServiceTest` (flag matrix), vitest `BillingPage.test.tsx` (three states).
- **O1.6 · Web gate on `/api/orgs/mine` + flag + role redirects · M · web · deps O1.3, E2E-O1.9**
  *Files*: `app/(org)/layout.tsx` (§2.2 branches), `lib/org.ts` (`getMyOrgs()`, `currentOrg()` cookie `kiwiply_org`,
  `orgFetch(path)` = `forward` with the org id from the cookie — pages never send it), `app/api/orgs/mine/route.ts`,
  `app/api/orgs/[orgId]/route.ts` (GET/PATCH), `app/api/config/public/route.ts`, `lib/site.ts` (unchanged until flag on).
  *Tests*: vitest `layout.test.tsx` (4 branches with mocked `serverApiFetch`), Playwright `org-gate.spec.ts`.
- **O1.7 · OrgChip real + switcher sheet + role-aware nav + real bell · M · web · deps O1.6**
  *Files*: `components/org-v2/shell/{OrgShell,OrgChip,OrgSwitcherSheet,OrgPageHero}.tsx`; nav from `permissions[]`;
  role label from `me.role`; bell = `NotificationBell` (shared with the user app) once O13.3 adds org kinds, until then
  the existing per-user notifications; deletes `ORG` sample. *Tests*: vitest `OrgShell.test.tsx` (nav per role).
- **O2.1 · `/org/new` — create flow (name+type → about you → activate/pay) at 390 px · M · web · deps O1.3, E2E-O4.0**
  Spec `onboarding-invites.md` §2; screen 3 shows **"Activate workspace (dev)"** when `billingEnabled=false` (calls
  E2E-O4.0) and the Stripe button only when enabled (O4.1, Wave 5); "Skip for now" lands in the DRAFT console with the
  pay banner. *Files*: `app/(org)/org/new/page.tsx` (outside the gate's "no orgs → /org/new" loop), `components/org-v2/
  new/{CreateOrgFlow,Step1,Step2,Step3}.tsx`, `app/api/orgs/route.ts` (POST), `app/api/orgs/[orgId]/activate/route.ts`.
  *Tests*: vitest `CreateOrgFlow.test.tsx` (slug derive/edit, 16+ attestation required for SCHOOL/BOOTCAMP), Playwright
  `org-create.spec.ts` at 390.
- **O2.2 · Email invites + join preview/accept · M · API · deps O1.3, O1.4**
  *API*: `POST /api/orgs/{id}/members/invite {emails[≤200], role, groupId?, supportOwnerMemberId?}` → `{invited[],
  invalid[], alreadyMember[]}` (DRAFT: ADMIN only, ≤3; ACTIVE: any); `POST …/members/{m}/resend`; `GET /api/join/{token}`
  (public preview); `POST /api/join/{token}/accept {shareScope, consentVersion}` → membership ACTIVE + `data_share` +
  events + `Notification` to inviter. Invite mail template (Thymeleaf, copy §3.2 incl. "Not you?"). Setting
  `org.invite.daily_cap` (default 1 000) via the seam. *Files*: `web/rest/org/{OrgMemberResource,JoinResource}.java`,
  `service/org/{OrgInviteService,OrgMemberService}.java`, `MailService` + templates, `SecurityConfiguration` (permit
  `GET /api/join/*`). *Tests*: `OrgInviteServiceTest` (token hash, expiry, resend rotates, cap), `JoinResourceIT`
  (preview without auth, accept twice → 409 `ALREADY_MEMBER`, expired → 409 `INVITE_EXPIRED`, SEAT_STATE in DRAFT),
  `InviteEmailTest`.
- **O6.2 · Consent screen on join + `PUT /api/me/orgs/{id}/share` · M · API, web · deps O6.1, O2.2**
  *API*: `GET /api/me/orgs` → consent doc §4; `PUT /api/me/orgs/{orgId}/share {scope, consentVersion, fullTo?}`;
  `POST /api/me/orgs/{orgId}/leave`. *Files*: `web/rest/MeOrgResource.java`, web `components/org-join/
  {ConsentScreen,WhatExactlySheet}.tsx` (§5.1 wireframe; two options; FULL never offered here), `app/api/me/orgs/**`.
  *Tests*: `MeOrgResourceIT` (scope change writes event; FULL without pairing → 422), vitest `ConsentScreen.test.tsx`
  (44 px targets, both options).
- **O2.3 · Join pages `/join/{slug}/{code}` and `/join/t/{token}` · M · web · deps O2.2, O6.2**
  *Files*: `app/join/[slug]/[code]/page.tsx`, `app/join/t/[token]/page.tsx`, `components/org-join/{JoinPreview,
  JoinDone}.tsx` (preview → sign-in/sign-up hand-off with `next=` → consent → done screen §4 with "Add the extension" /
  "Upload or build a resume"), `app/api/join/**`. *Tests*: Playwright `org-join.spec.ts` (signed-out preview → sign in →
  consent → done → `/settings/organizations` shows the org).
- **O5.1 · Members API (consent-scoped) + Team page real · L · API, web · deps O1.3, O6.1**
  *API*: `GET /api/orgs/{id}/members?status&role&groupId&supportOwnerId&q&page&size&sort` → `ListPage<MemberRowDTO>` +
  `summary {ALL, ACTIVE, INVITED, NOT_SHARING, NEEDS_ATTENTION}`; `MemberRowDTO` = seat fields + summary fields (null
  below SUMMARY) + `shareScope`; `GET …/members/{m}/summary` (403 `SHARE_SCOPE` below SUMMARY, audited SHARE_DENIED);
  `GET …/members/{m}` seat + items + scope + audit rows about them. Summary numbers computed live (counts per stage from
  `application` of consenting members, last activity day, resume readiness band) — rollups arrive with O7.2. *Files*:
  `web/rest/org/OrgMemberResource.java` (extend), `service/org/MemberSummaryService.java`, web `components/org-v2/team/
  {TeamPage,TeamTable,MemberCard,NotSharingChip}.tsx`, `app/(org)/org/team/{page,loading}.tsx`, `app/api/orgs/[orgId]/
  members/**`. Tabs from `summary`; "Not sharing" chip + explainer (§5.3, no "request access"); cards under `md`;
  departments donut from `org_group` counts; "Add Employee" opens the invite sheet (emails textarea → O2.2); Import CSV /
  Bulk Assign hidden until O2.5/O5.5. Deletes `EMPLOYEES`, `TEAM_TABS`, `DEPARTMENTS`, `SUPPORT_OWNERS`, `TEAM_STATS`.
  *Tests*: `MemberSummaryScopeTest`, `OrgMemberResourceIT` (filters, summary, foreign → 404), vitest `TeamTable.test.tsx`
  (every status × scope fixture), Playwright `org-team.spec.ts`.
- **O13.1 · Org profile settings real · M · API, web · deps O1.3**
  *API*: `PATCH /api/orgs/{id}` (name, website, timezone, billingEmail, sizeBand, country, settings), `POST /api/orgs/
  {id}/logo` (multipart ≤ 2 MB, PNG/JPG/SVG sanitised, through `FileStorage` prefix `org-logos/` added to
  `StorageKeys`), `GET /api/orgs/{id}/admins`. *Files*: `components/org-v2/settings/{SettingsPage,ProfileTab,
  DefaultsTab,AdminsRail}.tsx` — every field autosaves (`SaveStatusChip`), fake `SaveButton` deleted, "Team
  Permissions" tab becomes **Defaults** (default role for invites, default share scope, allow self-leave — the
  `settings_json` record), the five "Coming soon" tabs are **removed from the tab list** (Notification rules O13.2,
  Audit O13.4 and Security O13.5 add theirs back when real; Placement workflow and Branding are not planned), Approval
  rules rail **removed**, Security rail replaced by a one-line honest status until O13.5. *Tests*: `OrgResourceIT`
  (patch validation, logo limits, `StorageKeysTest` prefix), vitest `SettingsPage.test.tsx`.
- **O13.3 · Org notification kinds + delivery · M · API · deps O1.3, E2E-U7.0**
  `NotificationKind` += `ORG_INVITE_ACCEPTED` (batched per day per org: "5 people joined today"), `ORG_ACTIVE`,
  `SHARE_REVOKED`, `ORG_ITEM_GRANTED`, `ORG_COVERS_YOUR_PLAN`, `ORG_INVITES_EXPIRING`; `OrgNotificationService.toAdmins(
  orgId, kind, payload)` fans out through `NotificationService.publish`; daily digest job at `settings.digestDay/time`
  in `organization.timezone` (email via `MailService`). *Tests*: `OrgNotificationServiceTest` (batching, quiet hours),
  `OrgDigestJobTest`.
- **O2.7 · Activation checklist + dashboard empty state · M · API, web · deps O1.3, O2.2**
  *API*: `GET /api/orgs/{id}/onboarding` → `{items: [{key, done, count?, total?, href}], done, total}` (§5 list, computed
  server-side). *Files*: `web/rest/org/OrgOnboardingResource.java`, `service/org/OrgOnboardingService.java`,
  `components/org-v2/dashboard/{DashboardPage,ActivationChecklist}.tsx`, `app/(org)/org/{page,loading}.tsx`, `app/api/
  orgs/[orgId]/onboarding/route.ts`. The dashboard renders the checklist until complete, then the four live tiles
  (`seats.total/active`, `applications.submitted` 30 d, `members.placed` — live counts over consenting members, 60 s
  in-process cache; O7.4 swaps in rollups) + "Recent (consented)" from `org_audit_event` + `application_event` of
  SUMMARY members (never an employer name below FULL). Deletes `DASHBOARD_STATS`, `PLACEMENT_PIPELINE`, `TIMELINE`,
  `UPCOMING_INTERVIEWS`, `OPPORTUNITIES`, `DASHBOARD_QUICK_ACTIONS`. *Tests*: `OrgOnboardingServiceTest`, vitest
  `DashboardPage.test.tsx` (checklist vs tiles), Playwright `org-dashboard.spec.ts`.

**Wave 2 demo:** `/jobs` on a fresh account shows real postings from the ATS boards ("128 jobs · Best"), chips filter,
swipe saves a job → `/saved` shows it → `/applications` shows it as Saved; Settings › Job preferences change re-ranks
the list. Org: `demo-org` → `/org/new` → name "Acme Bootcamp" → Bootcamp + 16+ → "Activate workspace (dev)" → console
with the checklist → Team › Add people (an email) → open the invite link in a second browser → sign up → consent
(Progress summary) → done screen → Team page shows the member with a summary; the member's `/settings/organizations`
(O6.3 ships Wave 3 — in this demo the `GET /api/me/orgs` response is shown via the join done screen) → Org settings
rename autosaves with ✓.

### Wave 3 — "Alerts, messages, members & org metrics" (27 stories)

**User (lanes A/B)**: **U7.1** notification engine refactor (L — publish/policy/fan-out over E2E-U7.0's table; digest
scheduler; no push yet) → **U7.2** job alerts CRUD + evaluator after ingest (L; `job_alert`, `job_alert_hit`,
`alerts-notifications.md` §1/§4; 402 `ALERT_LIMIT` with setting `alerts.max` Free 2 / Pro 15 via the seam) →
**U7.3** Settings › Notifications full matrix + digest + "Send a test" (M; replaces the v0 panel) → **U7.6** bell v2
(grouping, cursor, deep links) (S) → **U3.3** dashboard "Today's matches + alerts" widget (S) · **U10.1** inbox threads
(`thread_key`, `GET /api/profile/messages[/{threadKey}]`) (M) → **U10.2** Messages page (threads, thread view, "Reply in
Gmail", link to application, connect-Gmail empty state; deletes `CONVERSATIONS`) (M) · **U9.1** question bank content
(`interview_question` table seeded from `resources/content/interview-questions.json`, ~120 rows, tags role/kind) + API +
Questions tab (M) → **U9.2** practice sessions (`practice_session`, start/finish, self-rating, history, progress ring;
deletes every `IP_*`) (M) → **U9.4** hand-off from the tracker/dashboard ("Prep for Google Thursday") (S) · **U3.4**
next-best-action card (M) · **U15.1** in-app upgrade sheet on every 402 (M; `BottomSheet`, stays in the app) · **U11.1**
Explore › Companies from the posting store (`GET /api/jobs/companies?q` counts/open roles; follow = alert on company;
deletes `EX_COMPANIES`) (M).

**Org (lanes C/D)**: **O5.2** role changes / suspend / remove / transfer ownership (M) · **O5.3** groups UI (S) ·
**O5.4** support owners (STAFF) + STAFF scoping (M) · **O5.6** pending invites (resend/revoke/bounced/expiring) (S) ·
**O5.8** member detail sheet (S) · **O2.4** join codes + QR + share sheet (M) · **O2.5** CSV/paste import with the
20 % rule + `SensitivePatterns` refusal (M) · **O6.3** user app `/settings/organizations` (M) · **O6.4** revocation
immediate + SHARE_REVOKED/SHARE_DENIED (S) · **O6.5** GDPR hooks (export `organizations[]`, erasure anonymises
membership) (M) · **O7.1** `OrgMetricDefinitions` as code + doc-sync test (M) → **O7.2** `org_metric_daily` + nightly
rollup (M) → **O7.3** metrics read API with k-anonymity (M) → **O7.4** dashboard on rollups (tiles, this-week spark,
needs-attention, consented recent) (M) → **O7.5** Analytics page real (cohort funnel, weekly trends, group/owner
breakdown, response rate, time-to-place; ROI/satisfaction tiles deleted; filters real) (L) · **O7.7** needs-attention
feed (S) · **O13.4** audit log viewer tab (S).

**Wave 3 demo:** create an alert from an empty search → the next ingest run (triggered via `/api/admin/job-sources/run`)
produces "3 new for 'ux intern'" in the bell → Messages lists the demo seed's recruiter threads, "Reply in Gmail" opens
a mailto → Interview Prep: pick a set, finish a session, progress ring moves → a Free account hits "Score this job" →
upgrade sheet in place. Org: import a 10-row CSV (one invalid row reported) → join code QR on a projector view → the
member changes scope to NONE in `/settings/organizations` → the admin's Team row shows "Not sharing" on the next
request → Analytics shows the funnel "Based on 9 of 12 members" with one cohort "<5" suppressed → audit tab lists
every action of the demo.

### Wave 4 — "Every remaining page real · sample-data.ts deleted" (31 stories)

**User**: **U8.1** assistant service (threads, tool registry, Gemini function calling, metering) (L) → **U8.2**
assistant page (SSE, chips, cards, Free sheet; deletes `ASSISTANT_*`) (L) → **U8.3** write tools with confirm chips (M)
→ **U8.4** memory + privacy surface (S) · **U4.1** posting store v2 (enrichment, gates, 30-day retention) (L) → **U4.2**
ranker v2 + `?explain` (L) → **U4.6** feedback loop + Free daily matches (rules) + Pro matches from the catalog seam
(M) → **U4.7** "Score this job" (S) · **U11.2** roles & paths content (M), **U11.3** guides (S) · **U9.3** AI text mock
interview (Pro) (L) · **U6.8** stale nudges + follow-up dates (S) · **U6.7** inbox connect phone pass (S) · **U0.1**
bottom tab bar + More sheet (M) · **U0.3** dark mode for the signed-in app (M) · **U0.6** hero compaction on phones (S)
· **U14.2** privacy panel with per-feature switches (M) · **U12.2** benchmarks — **not in this plan** (P2).

**Org**: **O8.1** Applications page consent-scoped (stage counts per member at SUMMARY; employer columns only for
FULL-paired viewers; follow-up tasks/recent responses **removed**) (M) · **O8.3** Interviews page (upcoming counts at
SUMMARY, calendar of FULL-shared `interview` rows, week nav real, prep checklist **removed**; mock-interview CTA → sales)
(M) + **O12.3** ICS feeds (M) · **O8.4** Resumes page readiness overview (has resume / ATS band / updated; suggestions
rail + AI tool cards **removed** — no admin-triggered AI) (M) → **R8.1** org-scoped resume search API (L) → **R8.2** org
"Resumes & Profiles" page to the board (L) → **R8.3** marks, saved views, bulk, CSV (M) · **O8.2** shared jobs
(`org_job_share`; Opportunities page = the org's curated list for groups; members see "From your org" in Jobs; match %
column **removed**) (L) · **O12.1** honest Integrations page (Connected: extension + inbox counts; Available: Slack/ICS/
webhooks/API key as they ship; fictional apps deleted) (M) · **O13.2** notification rules tab (M) · **O13.5** security
tab honest (M) · **O13.6** close organization (S) · **O7.6** export CSV + scheduled report (M) · **O6.6** placement share
card (M) · **O15.1** mobile org shell (bottom tabs, cards) (M) · **O15.2** optimistic UI + rollback toasts (S) ·
**O15.5** Playwright suite for the whole org journey in CI (L) · **O8.5** delete `org-v2/sample-data.ts` + `APP-V2-SPEC`
pointer (S) — and the user side's last sample import goes with U0.5's `samples()` being deleted in **U0.4** (skeletons +
`EmptyState` on every route, final pass) (M).

**Wave 4 demo:** Pro account asks "find me 3 remote design internships like the Stripe one" → cards → "Create an alert
for this" confirm chip → alert exists; "Score this job" → 84 with reasons; mock interview (text) scores a session.
Org: Applications shows stage counts per member and the admin cannot see employers; a FULL-paired marketer (seeded) sees
the board; Resumes & Profiles lists the paired consultant's shared resumes with audited PDF view; Opportunities holds
three curated links visible to cohort 26-A in their Jobs page; Integrations shows "Extension: 7 of 12 connected ·
Inbox: 4 connected"; `grep -r sample-data web/src` returns nothing.

### Wave 5 — "Money and marketers" (gated on D-1 and D-5; not sized here beyond the JSON)

**O3.1 → O3.2 → O3.3 → O3.4 → O3.5 → O3.6** (catalog rows, `org_assignment` → `entitlement_grant`, resolve over grants,
"via Acme") · **O4.1 → O4.3 → O4.4 → O4.5 → O4.6 → O4.7 → O4.8 → O4.9 → O4.2** (Stripe setup fee, webhook handler,
quantities, dunning, the real billing page, portal, reconciler, leave/erase, invoice path) · **O5.5** assign items per
person/bulk · **O2.8** `/org/welcome` polling · **O2.6** domain verification · **O2.9**/**O2.10** nudges + funnel ·
**O10.1 → O10.10** marketer (pairing, FULL consent, workspace, marketer-made resumes, job bank, consultant side,
extension "Save for consultant…", submit-detect, marketer inbox, NoSubmitSurfaceTest) · **U4.4** aggregator client +
three ATS parsers (the parsers can start any time — only the aggregator half waits for D-1) · **U7.4** web push
(D62) · **U2.5/U2.6** instant matches + alert step inside the R1b onboarding flow · **U16.x**, **U18.x** as the roadmap orders them.

### Wave sizes at a glance

| Wave | Stories | S / M / L | Lanes in parallel | Ends with |
|---|---|---|---|---|
| 1 | 22 | 6 / 15 / 1 | K, A, B, C | fresh-account honesty + tracker memory + `OrgIsolationIT` green |
| 2 | 20 | 5 / 13 / 2 | A/B, C/D | real job search; org create → invite → join → team |
| 3 | 27 | 9 / 16 / 2 | A/B, C/D | alerts fire; messages; org members + metrics |
| 4 | 31 | 8 / 15 / 8 | A/B, C/D | assistant, Pro surfaces, every org page, no sample files |
| 5 | ~40 | — | gated | Stripe org billing, marketer workspace, aggregator |

---

## 5. Decisions for the user (only the ones that are genuinely yours; each has a default that applies until you say otherwise)

| # | Decision | Recommended default | Blocks |
|---|---|---|---|
| **D-1** | **Licensed job aggregator** (RECONCILIATION D61): Adzuna (free developer tier, attribution line, salary estimates) vs Jooble vs Careerjet | **Adzuna** — terms check first; record pick + key handling in ROADMAP 16.1. Jobs search ships first over the ATS boards regardless. | U4.4 aggregator half (Wave 5); nothing in Waves 1–4 |
| **D-2** | **Org pages behind a feature flag in production?** | **Yes** — `dossier.orgs.enabled` (→ `flag.orgs`) default **off in prod** until Wave 4's demo passes and the isolation IT is green in CI; **on** in dev/CI/mock. `/org/*` keeps `noindex` until then. | O1.6 (ships the flag) |
| **D-3** | **Roles**: you named OWNER/ADMIN/MARKETER/FINANCE/MEMBER. The design also has **STAFF** (= "Support owner": a career-services person who sees only their own members) | **Keep STAFF** (enum + Team page assignment, O5.4); it is what makes a 60-student cohort workable for a school. Drop = one enum value + one matrix row. | O5.4 (Wave 3) |
| **D-4** | **Demo seed content**: the demo org name/type and persona (`demo-bootcamp`, BOOTCAMP, 12 members, cohorts 26-A/26-B; job seeker "Jordan Lee" vs "Priya Sharma", RECONCILIATION D47) | `demo-bootcamp` + **Priya Sharma** as the seeded job seeker (D47 default); the `demo` user is a SUMMARY-scope member of it | O1.8 copy only — the seed structure is fixed |
| **D-5** | **Stripe test keys + org price ids** for Wave 5 (setup fee $499, Pro seat $24.99, Autopilot $49.99, AI Interview $9.99, Marketer $29.99 — initial catalog seed, re-priced from admin) | Provide a Stripe **test-mode** key pair + webhook secret for dev; prices are created by O3.1's seed script, not by hand | O4.1–O4.7, O3.x (Wave 5) |
| **D-6** | **Gmail test account** for the inbox/messages click-through (a dedicated consumer Gmail + App Password, locked model) | Use the existing dev test mailbox if one exists; otherwise create one and keep the App Password in the password manager. The demo seed covers the demo without IMAP. | the Wave 3 demo's "Messages shows a real thread" step only |
| **D-7** | **Member-visible "Did you accept? 🎉" placement declaration** (`application.outcome`, `consent-data-sharing.md` §6) — ship with the tracker (Wave 1) so org "placed" has a source from day one? | **Yes, in U6.3** (one chip on OFFER); the share card (O6.6's image) stays later | O7.x "placed" tiles |
| **D-8** | **`/org/new` self-serve** (any signed-in user can create a DRAFT org — `onboarding-invites.md` D1) vs sales-only creation from the admin console (O14.4) | **Self-serve DRAFT** (costs nothing, no seats until ACTIVE); admin console link as well. Behind D-2's flag. | O2.1 |

Everything else in this plan is a design default already recorded in the cited docs (RECONCILIATION §4
lists them); implementers do not re-open those.

---

## 6. Risks

| # | Risk | Mitigation in this plan |
|---|---|---|
| R-1 | **Org tenancy leak** — a route forgets `OrgAccessService` or a repository takes no `orgId` | `@OrgPermissionRequired` interceptor + `OrgResourceGuardTest` (reflection) + `OrgRepositoryContractTest` + route-discovered `OrgIsolationIT` in CI **before any org UI story merges** (Wave 1 ends with it green) |
| R-2 | **Sample rows reach real accounts** during the transition (a page half-wired shows `V3_JOBS` to a paying user) | E2E-U0.0 lands first: `samples()` returns `[]` unless demo; each page story deletes its constants; the Wave 1 demo includes "fresh non-demo account sees empty states on every route" (Playwright) |
| R-3 | **Consent reduces what admins see** and the sample pages promised more (employer names per person) | the Team/Applications/Interviews org pages are built to the visibility matrix with the "Not sharing" explainer; the plan removes the promises instead of leaking (`AUDIT-org.md` §3); marketing copy follows in O14.2 |
| R-4 | **Status enum change (`IN_REVIEW`, `WITHDRAWN`) breaks the extension or the inbox mapper** | additive values only; `ApplicationSyncResource` keeps accepting the old set; the extension's `tracking.js` seam maps unknown statuses to a neutral chip (E2E-U6.0 adds the one-line guard + test); inbox parser maps "under review" only when the value exists |
| R-5 | **Web test debt** — `npm test -w web` is tsc + eslint; "tests green" would be a fib | U19.3 is in Wave 1 (vitest already runs the resume-builder suites; add Playwright + mock-API fixtures + the CI job); every page story names a vitest test and the wave demo is a Playwright journey |
| R-6 | **Search quality on day one** (FULLTEXT over ATS boards only, no aggregator) | the ranker is deterministic and explainable (`?explain=1` for admins); the honest empty state offers relaxations; coverage grows with U4.4's three parsers before the aggregator decision |
| R-7 | **Stripe-before-grant ordering** when Wave 5 starts | `billing.md` §4 sequence is the story AC; `OrgSeatReconciler` alerts on drift, never auto-fixes money; test-clock runbook (O4.10) |
| R-8 | **Agents re-implement primitives** (four sheets, three empty states) | the kit (E2E-U0.0) is a hard dependency of every page story; PR review checks imports come from `@kiwiply/ui` (web ESLint `no-inline-svg` already enforces icons) |
| R-9 | **Dev environment friction** (Docker/MySQL not on every machine; Testcontainers on Windows) | every API story has unit tests that run without Docker; ITs run in CI; the mock API (`web/scripts/mock-api.mjs`) gains every new route so page stories can be built and demoed with `npm run dev:demo -w web` |
| R-10 | **Scope creep from the boards** (approval rules, ATS sync, bulk AI on members, ROI tiles) | removed by design (`AUDIT-org.md`, `analytics.md` D5); a story that finds a board element with no data source renders nothing and notes it in its PR, it does not invent a source |

---

## 7. UX bar — applies to every story in §4 (DECISIONS #32/#33, Gen Z / Notion)

1. **Autosave, no Save buttons in forms.** Every editable field saves on change (debounced 400–800 ms) through
   `useAutosave`; the page shows `SaveStatusChip` once (top-right of the form) and `SavedTick` next to the field;
   conflicts (409/ETag) open the existing `ConflictDialog` pattern. Dialogs that *create* something keep one
   primary button ("Add", "Invite", "Create alert") — that is not a Save button.
2. **Undo, not confirm.** Destructive-but-reversible actions (archive, remove from list, dismiss, pause) act
   immediately and offer `undoToast` for 5 s. Only irreversible actions (delete account, close org, remove a
   member, delete a thread) use a confirmation sheet with the consequence list.
3. **Tooltips + `aria-label` on every icon-only control**; 44 px targets; visible focus; one `<h1>` per page.
4. **Honest empty states** (`EmptyState`): say what is missing and offer one action; never a fake row, never a
   fake %, never "Coming soon" on a shipped page (a feature that is not built is not in the nav).
5. **Phone-first**: 390 px layout designed first (tables → cards under `md`, side panels → bottom sheets from the
   kit), then 1024/1440. No horizontal scroll at 390.
6. **Optimistic UI with rollback** for list actions (status change, save, archive); skeletons on first load only,
   never on refetch (keep the previous data).
7. **Copy**: ≤ 12 words per heading, no exclamation stacking, no urgency/guilt, numbers only when real.
8. **Every number comes from an endpoint**; the component has no fallback constant.
9. **Demo accounts** look full from server seed; a `DemoBadge` labels the page.
10. **Admin-configured**: any cap/limit a story introduces is a `ResumeBuilderSettingKeys`-style key read through
    the settings seam (until A5.1) with the default in the story — never a literal in a gate site.
