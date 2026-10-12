# ADMIN-E2E-PLAN — Platform admin area, end to end

Written 2026-10-12 (Fable, design) on the `resume-builder` tip `bddac23`. Build branch: **`admin-e2e`** (create it
from that tip — see `docs/HANDOFF-ADMIN-E2E.md`). Implementers: Sonnet agents, one story per session, strict file
ownership, **no design decisions in the session** — if a story and a cited design doc disagree, the design doc wins;
if something is unspecified, stop and ask.

The user's brief, verbatim: *"lets continue with completing user dashboard pages and app admin pages.."* — the user
dashboard half is `docs/APP-E2E-PLAN.md`; this file is the **app admin** half: every route under
`web/src/app/(admin)/admin/**` (Kiwiply staff with `ROLE_ADMIN`) goes from sample panels and inert controls to real,
working operator tools: **admin page → Next BFF route → Spring `/api/admin/**` → MySQL**, every write audited, every
number from an endpoint, and a Settings home where every feature's switch, limit and price lives.

Inputs this plan reconciles (read them for the full shapes; this file names deltas, not copies): root `CLAUDE.md`
(locked decisions: everything admin-configured, never collect sensitive PII, billing mechanics, ≥ 80 % margin floor,
keys from env only, no Coach tier), `ADMIN-PLAN.md` (9.A–9.C), `docs/roadmap/{AUDIT,PLAN}-admin.md`,
`docs/roadmap/areas/admin.json` (17 epics, 97 stories before this commit), `docs/design/admin/*.md` (eight design
docs — cited per story), `docs/AI-ADMIN-CONFIG-DESIGN.md` (I1.9–I1.13 are **built**: `/admin/ai/providers`,
`AdminSettingsWriter`, `app_setting_history`), `docs/APP-E2E-PLAN.md` (format, kit, UX bar, list contract) and
the code audit of 2026-10-12 (§1).

Sections: §1 current-state audit · §2 the admin target (per page + the Settings home) · §3 cross-cutting concerns ·
§4 waves and stories · §5 decisions · §6 user questions · §7 non-goals · §8 risks · §9 UX bar.

---

## 1. Current-state audit (code audit, 2026-10-12, tip `bddac23`)

State legend — **REAL**: every number from an endpoint, writes persist and are audited · **PARTIAL**: real spine,
sample or inert limbs · **SAMPLE**: renders constants, nothing persists. "BFF" = Next route handlers under
`web/src/app/api/admin/**`; server pages call Spring directly through `serverApiFetch`. Paths are under `web/src/`
unless stated; `api/` paths are under `api/src/main/java/com/dossier/api/`.

### 1.1 Route-by-route

| Route | Shows | State + evidence | Data it needs | API exists | API / schema missing | Ext dep | Stories |
|---|---|---|---|---|---|---|---|
| `(admin)/layout.tsx` + `admin-shell/AdminShell.tsx` | gate, 13-item sidebar, search, bell, account chip | **PARTIAL** — gate real (`GET /api/account` → `ROLE_ADMIN` else `notFound()`, `layout.tsx:21-39`); bell = `Link` to `/admin/audit` with a permanent coral dot (`AdminShell.tsx:306-314`); search always `router.push('/admin/users?q=')` (`:184-188`), hidden under `sm`; Security nav carries `soon: true` (`:58`); no `/api/admin/me` | roles/permissions, unread counts (failed jobs, HIGH bugs, open privacy requests), typed search | `GET /api/account` | `GET /api/admin/me`, `GET /api/admin/search?q=`, an "attention" count endpoint | none | A0.3, A0.6, A15.2 |
| `/admin` Overview | 4 KPI tiles, growth chart, platform health, quick actions, area tiles | **PARTIAL** — tile values real (`GET /api/admin/analytics` → `totalUsers, activationRatePct, signups7d, activeUsers7d`, `overview/OverviewPage.tsx:75-78`); deltas + sparklines `OVERVIEW_TILE_EXTRAS`, chart `GROWTH_SIGNUPS/ACTIVE/X`, health list `PLATFORM_HEALTH` all from `admin-v3/sample-data.ts:12-34`; Period select inert (`:90`); "Send newsletter" / "Export data" tiles link to the subscribers page | previous-period values, daily signups, real health (actuator + sources + AI probe + Stripe webhooks) | `AdminAnalyticsResource.overview()` (`api/web/rest/AdminAnalyticsResource.java:29`) | `previous` values; `GET /api/admin/analytics/series?metric=signups&days=30`; `GET /api/admin/system/health-list` | none | E2E-A11.0, A11.5 |
| `/admin/users` | 4 tiles, user table (search/role/status), segments donut, role distribution, recent account actions | **PARTIAL** — list + `x-total-count` real (`users/page.tsx:521`, `UserResource.getAllUsers` `api/web/rest/UserResource.java:167`, sorts whitelisted, **no `q`/role/plan/status params**); `UsersTable.tsx:52-60` filters the **loaded page only**; `USERS_TILE_EXTRAS` (pending 86, suspended 24), `USER_SEGMENTS` with hard-coded centre "1,284" (`UsersPage.tsx:63`), `ROLE_DISTRIBUTION`, `RECENT_ACCOUNT_ACTIONS` (`sample-data.ts:39-68`) | server search over login/email/name; role/plan/status filters; summary counts; recent admin actions on users | `GET /api/admin/users` (paged) | `?q=&role=&plan=&status=` in SQL (plan from `subscription`), `GET /api/admin/users/summary`; recent actions from `admin_audit_event` (target USER) | none | A1.3 |
| `/admin/users/[login]` | header, 6 facts, Billing (status + timeline + note form), Actions, Sessions, AI budget | **REAL (v2 styling)** — `GET /api/admin/users/{login}`, `/ai-quota`, `/sessions`, `/customers/{login}` (`users/[login]/page.tsx:681-730`); BFF `app/api/admin/users/[login]/route.ts` (POST action whitelist → `AdminUserActionResource`, DELETE → `/data` = `AccountDeletionService`), `.../ai-quota/route.ts`, `.../sessions/[familyId]/route.ts`, `customers/[login]/notes/route.ts`; every action audited (`AdminUserActionService`, `AdminAiQuotaService`, `CustomerAdminService`) | — | all of the above | account fixes (resend verification, change email, extension connections), entitlement explainer, flags/block, debug panel, timeline beyond billing | none | A1.9 (restyle), A1.4, A1.8, A1.6, A1.7 |
| `/admin/customers` | 4 tiles, status-mix donut, Renewals / Onboarding / Churn-risk panels, table | **PARTIAL** — list + counts real (`GET /api/admin/customers?filter=&page=&size=`, `/counts`, `customers/page.tsx:206-210`); the three panels are derived client-side from a **second unfiltered fetch of 100 rows** (`:209`, `CustomersPage.tsx:60-64`); `CUSTOMER_TILE_EXTRAS` deltas + the whole **MRR tile** are sample (`customers/sample-data.ts`, `CustomersPage.tsx:84-87`); "Add Customer" = coming-soon toast (`CustomersTable.tsx:83-86`); search = loaded page only; `CustomerAdminService.list` paginates **in memory over `findAll()`** (`api/service/CustomerAdminService.java:97-117`) | MRR, server pagination/search, renewal/onboarding/risk lists server-side | `AdminCustomerResource` list/counts/detail/notes; `AdminAnalyticsService.billing()` already computes `mrr` | `GET /api/admin/customers/summary` (counts + mrr + renewalsThisMonth + newThisMonth + atRisk), `?q=` in SQL, `Pageable` on a repository query | Stripe (mirror only — `subscription`, `stripe_event`) | A2.1, A2.3, A2.2, A2.6 |
| `/admin/ai` AI usage | 4 tiles, trend chart, feature breakdown, top users, limits & quota, alerts | **PARTIAL** — real: total calls, users, est. cost, per-task table, top users with % of Pro budget, spend-vs-pool row, near-cap alerts (`GET /api/admin/ai-usage?period=`, `AdminAiUsageResource.java:67`, ledger `ai_call`); sample: `AI_TILE_EXTRAS` (tokens "12.8M"), `AI_TREND_*`, `DAILY_REQUEST_LIMIT` 100 000, `AI_ALERTS` (`ai/sample-data.ts`); Period select inert | daily series for the month, token totals, real cap, real alerts | `/api/admin/ai-usage`; ledger has `input_tokens, cached_tokens, output_tokens, provider, latency_ms, success, error_kind` (`domain/AiCall.java:33-60`) | `series[]` + `tokens` on the usage view (from the ledger by day); platform cap = setting `ai.daily_cost_cap_cents` (A4.3); `ai_alert` (A4.4); `ai_daily_rollup` (A4.2) | AI (none to read) | A4.1, A4.2, A4.3, A4.4 |
| `/admin/ai/providers` | provider cards + Test, routing table, pricing, Server AI switch, recent calls, history drawer | **REAL** — `GET /api/admin/ai/config`, `/calls` (server), 9 BFF routes under `app/api/admin/ai/**` → `AdminAiConfigResource` (`PATCH config/global`, `providers/{id}`, `routes/{task}`, `PUT/DELETE prices/{model}`, `POST providers/{id}/test`, `GET calls`, `GET config/history`); writes go through `AdminSettingsWriter` → `app_setting` + `app_setting_history` + `AI_CONFIG_CHANGE` audit; autosave ✓ + undo, reason dialog for HIGH; vitest `AiProvidersPage.test.tsx`, route tests `ai-config.routes.test.ts`, Playwright `e2e/journeys/admin-ai.spec.ts`; mock fixture `scripts/fixtures/admin-ai.mjs` | — | all | — (I1.14 live smoke is the ai area's) | AI key in env | done (I1.9–I1.13) |
| `/admin/job-sources` | 4 tiles, sources table (search/type/status, paging, switch on/off, add), type donut, sync history, performance, recent errors, quick actions, last-run lines | **PARTIAL** — list/add/toggle/run/match real (`GET/POST /api/admin/job-sources`, `PUT /{id}`, `POST /run`, `POST /match`; BFF `job-sources/{route,[id]/route,run/route,match/route}.ts`); `running`/`matching` are in-memory flags; `SOURCES_TILE_EXTRAS`, `PERF_*`, `SYNC_*` charts sample (`job-sources/sample-data.ts`); `/run` and `/match` **unaudited**; no per-source sync/test/retry; dead `admin/JobSourcesPanel.tsx` (303 lines, unused) | run history per source and per night, per-source actions | `AdminJobSourceResource` (`api/web/rest/AdminJobSourceResource.java:77-113`) | `ingest_run`, `ingest_source_run`, `ingest_source_daily` (`job-source-operations.md` §2); per-source endpoints | public ATS JSON APIs (exist) | A6.2, A6.3, A6.4, A6.5 |
| `/admin/security` | 4 tiles, Overview / Roles / Sessions / Policies tabs | **SAMPLE** — the page fetches nothing (`security/page.tsx` renders `<SecurityPage/>`); every table reads `SECURITY_TILES`, `SECURITY_EVENTS`, `SUSPICIOUS_ALERTS`, `PASSWORD_RESETS`, `BLOCKED_IPS`, `ROLES_MATRIX`, `SESSIONS_SAMPLE`, `POLICIES` (`admin-v3/sample-data.ts:72-130`); the four "Access control" tiles link to `/admin/security` itself (`SecurityPage.tsx:116-119`); an amber strip says "coming soon" | active sessions (all users), staff list + MFA status, real policies, later security events + blocked IPs | `AdminSessionResource` (per user only); `refresh_token` families; `admin_mfa_challenge` | `GET /api/admin/security/{overview,sessions}`, `DELETE sessions/{familyId}` (global); `security_event`, `ip_block`, `user_flag` (A9.1–A9.3) | none | E2E-A9.0, A0.2, A9.1, A9.2, A9.3 |
| `/admin/analytics` | filter row, 4 tiles, user growth, activation funnel, engagement, revenue, applications by status, fill quality, cohorts, countries, channels | **PARTIAL** — real: tile values, funnel, applications by status, revenue block (MRR from configured prices), fill quality by ATS (`AnalyticsPage.tsx`, `AdminAnalyticsService`, `fill_event`); sample: `ANALYTICS_TILE_EXTRAS`, `TOTAL_USERS_SERIES`/`ACTIVE_USERS_SERIES`, `ENGAGEMENT`, `COHORTS`, `COUNTRIES`, `CHANNELS` (`analytics/sample-data.ts`); every filter select toasts "coming soon" (`AnalyticsFilters.tsx:36`); active users = refresh-token proxy (`AdminAnalyticsService.java:156-157`) | previous-period values, daily series, feature engagement, cohorts | `GET /api/admin/analytics` | `product_event`, `metric_daily`, `user_cohort` (`analytics-event-pipeline.md` §2); `GET /api/admin/metrics?metric=&from=&to=` | none | E2E-A11.0, A11.2, A11.3, A11.4 |
| `/admin/subscribers` (nav "Email") | 4 tiles, Campaigns / Templates / Subscribers / Automations tabs, "Send Campaign" | **PARTIAL** — real: subscriber list (server status filter + paging), counts, CSV export (`GET /api/admin/subscribers`, `/counts`, BFF `subscribers/export/route.ts` → `/export`); sample: `EMAIL_TILE_EXTRAS` (open/click/bounce), `OPEN_RATE`/`CLICK_RATE`, `RECENT_CAMPAIGNS`, `SEGMENTS` (all but the first), `TEMPLATES`, `AUTOMATIONS` (`email/sample-data.ts`); "Send Campaign" and "View report" toast (`EmailPage.tsx:96,126`); the **default tab is the all-sample Campaigns tab** (`subscribers/page.tsx:365`); CSV export has **no formula-injection guard and is unaudited** (`AdminSubscriberResource.java:78-110`) | subscriber counts incl. new-30d; later mail log, suppressions, deliverability | `AdminSubscriberResource` list/counts/export | `mail_log`, `email_suppression`, Brevo webhook (A7.2); `GET /api/admin/email/overview` (A7.3) | Brevo (sending exists; webhooks not) | E2E-A7.0, A7.2, A7.3, A7.4, A7.5, A7.6 |
| `/admin/bug-reports` | 4 tiles, status pills, table (search/severity), severity donut, crash trend, top issues | **PARTIAL** — list (server status filter + paging) + counts real (`GET /api/admin/bug-reports`, `/counts`); search + severity filter the loaded page only (`BugReportsPage.tsx:55-59`); `BUG_TILE_EXTRAS`, `SEVERITY`, `CRASH_*`, `TOP_ISSUES` sample (`bug-reports/sample-data.ts`); no assignee / priority / first response / export; kebab only "Open and triage" | server search + filters, assignee, priority, first-response, severity counts, similar-report grouping, export | `AdminBugReportResource` list/counts/get/put (`api/web/rest/AdminBugReportResource.java:57-89`) | `bug_report` + `assignee_login, priority, first_response_at, resolved_at, fingerprint`; `?q=&severity=&assignee=&priority=`; `GET /counts` extended; `GET /export` | none | A8.2, A8.5 |
| `/admin/bug-reports/[id]` | report, 5 facts, Triage (status / severity / notes + **Save triage** button) | **REAL (v2 styling)** — `GET /api/admin/bug-reports/{id}`, BFF `bug-reports/[id]/route.ts` PUT → `BugReportService` (audited `BUG_TRIAGE_UPDATE`); explicit Save button (UX bar violation) | — | all | assignee/priority/first response (A8.2) | none | A1.9, A8.2 |
| `/admin/inquiries` | 4 tiles, SLA chart, category mix, escalations, list with inline follow-up | **PARTIAL** — list (server status filter + paging), counts, follow-up `PUT {status, adminNotes}` real (`AdminSalesInquiryResource.java:54-74`, BFF `inquiries/[id]/route.ts`, audited `INQUIRY_UPDATE`); `InquiryFollowUp.tsx` has a **Save** button; search + category filter the loaded page only; `INQUIRY_TILE_EXTRAS`, `SLA_*`, `CATEGORY_MIX`, `ESCALATIONS` sample (`inquiries/sample-data.ts`) | server search/filters, priority, assignee, first-response SLA, topic mix, export | `AdminSalesInquiryResource` | `sales_inquiry` + `assignee_login, priority, first_response_at, closed_at`; `?q=&topic=&assignee=&priority=`; `/summary`; `/export` | none | A8.4, A8.5 |
| `/admin/system` | 4 tiles, health table, deployments, jobs queue, system events, resource usage, demo accounts, log levels, quick actions, environment | **PARTIAL** — real: overall + per-component health, build version/app/profiles, uptime, CPU count, JVM memory, effective log levels (`GET /management/health|info|jhimetrics|loggers`, `system/page.tsx:427-434`), demo status + reset (`GET /api/admin/settings/demo`, BFF `settings/demo/reset/route.ts` POST, audited `DEMO_RESET`); sample: `SYSTEM_TILES` (latency, jobs, error rate + uptime trend), `DEPLOYMENTS`, `JOBS`, `EVENTS`, `RESOURCES`, `ENV_SAMPLE` (Redis / PostgreSQL / BullMQ / CloudFront — none of which exist), `HEALTH_FALLBACK` (`system/sample-data.ts`); the four quick actions toast "Coming soon" (`SystemPage.tsx:454-457`) | job registry + ledger, deployments, system events, host stats, backup status, log level writes | actuator; `AdminDemoResource` | `job_run`, `deployment`, `system_event`, `ops_check`, `request_metric_minute` (`observability-backup-incident.md` §2); `PUT /api/admin/system/loggers/{name}` | Healthchecks.io (A10.3, after P0.1) | E2E-A10.0, A10.2, A10.4, A10.3, A10.5, A10.6 |
| `/admin/audit` | 4 tiles, table (search/actor/area/type/risk), export CSV, event distribution, risk breakdown, flagged, compliance, sensitive actions, quick actions | **PARTIAL** — rows + total + paging real (`GET /api/admin/audit?page=&size=&sort=createdDate,desc`, `AdminAuditResource.java:43`; the API's `?actor=` filter is not used by the page); **area and risk are regexes over the action name on the client** (`AuditPage.tsx:52-66`); all five filters and the CSV export work on the loaded page only (`:134-141,160-175`); `AUDIT_TILES` (high-risk 142, exports 68, reviews 24) and `COMPLIANCE` sample (`audit/sample-data.ts`); "Create retention rule" toasts; no IP/device column (not stored) | server filters (actor, area, risk, action, target, date), audited server CSV, stored area/risk/ip/user agent | `AdminAuditService.findAll(actor, pageable)`; `admin_audit_event` (actor_login, action, target_type, target_id, reason, details, created_date) | `area, risk, ip, user_agent, actor_roles` columns; `GET /api/admin/audit?area=&risk=&action=&target=&from=&to=`, `GET /api/admin/audit/summary`, `GET /api/admin/audit/export` (HIGH, audited) | none | A12.2, A12.3, A12.4 |
| *(no route)* Settings home | — | **MISSING** — there is no `/admin/settings`; the only runtime-settings UI is the AI page. Underneath, **the write path exists**: `AdminSettingsWriter.write(key, value, reason, risk)` validates against `ResumeBuilderSettingKeys.find(key)` (which consults `AiSettingKeys` families), writes `app_setting`, appends `app_setting_history`, audits `AI_CONFIG_CHANGE`, invalidates the 60 s cache (`api/service/AdminSettingsWriter.java`); `ResumeBuilderSettings.get*/stored/storedWithPrefix` is the read seam; keys declared: `feature.resume_*.enabled`, `resume.*`, `profile.*`, `tracker.*`, `ai.*` families | one registry with area + risk per key; generic endpoints; a page | `AdminSettingsWriter`, `ResumeBuilderSettings`, `app_setting`, `app_setting_history` | `GET /api/admin/settings?area=&q=`, `PUT/DELETE /api/admin/settings/{key}`, `GET /{key}/history`; `area`/`risk` on the `Key` record; non-AI key families (`jobs.*`, `inbox.*`, `ratelimit.*`, `ops.*`, `email.*`, `flag.*`, `ext.*`, `admin.*`) | none | A5.1, A5.8, A5.2, A5.3, A5.4, A5.5, A5.6, A5.7, E2E-A5.1, A5.9 |

**Counts (admin, 15 route rows + 1 missing):** REAL 3 (`/admin/ai/providers`, `/admin/users/[login]`, `/admin/bug-reports/[id]` — the latter two in v2 styling with Save buttons) · PARTIAL 11 (shell, overview, users, customers, ai, job-sources, analytics, subscribers, bug-reports, inquiries, system, audit — twelve rows, the shell counted with them) · SAMPLE 1 (security) · MISSING 1 (settings home).

Every PARTIAL page follows the same shape: **the table and its counts are real; every tile delta, sparkline, time
series, donut and "recent …" list is a constant from a `sample-data.ts`**, labelled with `SampleTag` but rendered
to every admin, including production.

### 1.2 Sample constants that go (one file per page, deleted by the story that owns the page)

`admin-v3/sample-data.ts` (overview + users + security sections) · `analytics/sample-data.ts` · `audit/sample-data.ts`
· `bug-reports/sample-data.ts` · `customers/sample-data.ts` · `email/sample-data.ts` · `inquiries/sample-data.ts` ·
`job-sources/sample-data.ts` · `system/sample-data.ts` · `ai/sample-data.ts`. Plus page literals: `AnalyticsFilters`
options (`FILTERS`), the Users donut centre "1,284", the shell's bell dot and `soon` pill, `ENV_SAMPLE` rows, and the
"Add Customer" / "Send Campaign" / "Create retention rule" / System quick-action toasts.

### 1.3 What the audit found underneath (reuse, don't rebuild)

- **Spring**: 14 `Admin*Resource` classes under `/api/admin/**`, all locked to `ROLE_ADMIN` by `SecurityConfiguration`
  (`:71`); JHipster `UserResource` (`POST/PUT/DELETE /api/admin/users`) still **bypasses audit and the self-guards**
  (`UserResource.java:107,138,203`); `AuthorityResource` (`/api/authorities`) unaudited. `AdminAuditService.record()`
  runs in the caller's transaction (good) with action constants for every built feature; the table has **no area /
  risk / ip / user agent**. `AdminSettingsWriter` + `app_setting_history` are the A5.1 write path already built (AI
  only names the audit action: `AI_CONFIG_CHANGE`). `ResumeBuilderSettings` caches the whole `app_setting` table for
  60 s. Nine `@Scheduled` jobs with no registry (`InboxPoller`, `InboxRetention`, `JobIngestScheduler`,
  `JobMatchScheduler`, `OnboardingDraftPurgeJob`, `ErrorDigestService.tick`, `ResumeViewEventPurgeJob`,
  `ResumePdfJobService`, `UserService.removeNotActivatedUsers`). `RateLimitFilter` exists, **off by default**
  (`application.yml:255`), keyed on `X-Forwarded-For`. `ErrorDigestService` is the only alert channel. `AiCall` has
  tokens/provider/latency/success. `AdminAnalyticsService.billing()` already computes `mrr` (configured prices).
  `AccountDeletionService` erases; `AccountExportResource` self-export. ProblemDetail everywhere; `OpenApiContractIT`
  regenerates `api/openapi.json`; ArchUnit layer rules; ITs on Testcontainers MySQL 9.2.
- **Web**: the admin-v3 kit `components/admin-v3/common/*` (`AdminHero`, `AdminStatTiles` with a *string* delta,
  `AdminPanel`, `AdminLinkTile`, `PersonCell`, chips, `LegendList`, `HBarList`, `BarLineChart`, `AdminTabs`) plus
  `app-v2/common` (`DataTable`, `Pagination`, `SearchInput`, `FilterSelect`, `KebabMenu`, `Donut`, `StatusChip`,
  `Progress`, `IconTile`, `LineChart`, `Sparkline`). The AI page is the **reference implementation** of the UX bar on
  admin: `ai/useAiAdmin.tsx` (optimistic save + ✓ + undo + inline error per key), `ai/useAiOps.tsx`,
  `ai/ReasonDialog.tsx` (Dialog on desktop, `BottomSheet` on phones), `ai/HistoryDrawer.tsx`, `lib/ai-admin.ts`
  (`Resolved<T> {value, source, envDefault, codeDefault}`, `aiFetch`), BFF helpers `app/api/admin/ai/respond.ts`
  (`passthrough`, `forward`, `readObject`, `onlyFields`). From APP-E2E: `@kiwiply/ui` `BottomSheet`, `ErrorState`,
  `ListSkeleton`, `SaveStatusChip`, `SavedTick`, `EmptyState`; `lib/list-query.ts` (`useListQuery`, URL-synced),
  `lib/autosave.ts`, `lib/undo-toast.ts`, `lib/samples.ts` (the demo-only sample gate). Playwright exists
  (`web/playwright.config.ts`, `e2e/journeys/*.spec.ts`, CI job `web-e2e` on `dev:demo`), `@axe-core/playwright`
  4.13 is a dev dep, `admin-ai.spec.ts` signs in as `demo-admin` through `POST /api/auth/demo` and intercepts writes.
- **Mock API** (`web/scripts/mock-api.mjs:1873-2019`): `demo-admin` is ROLE_ADMIN **in the mock only**; GET handlers
  for analytics, users (list only), settings/demo, audit (3 rows), customers (+counts), subscribers/bug-reports/
  inquiries (+counts, bug detail), ai/config|calls|history (fixture `scripts/fixtures/admin-ai.mjs`), ai-usage,
  job-sources, management/*. Every admin write is refused `403 DEMO_READ_ONLY`. Missing: user detail, ai-quota,
  sessions, customers/{login}, audit filters, everything this plan adds.

### 1.4 Tracker status corrections applied in this commit (`docs/roadmap/areas/admin.json`)

Rule: `done` = real data + API + tests · `partial` = UI on sample or pieces missing · `not_started` = nothing exists.

| Story | Old → new | Why (evidence) |
|---|---|---|
| A5.1 Typed, bounded runtime settings registry with audit and history | not_started → **partial** | I1.9 built `AdminSettingsWriter`, `app_setting_history`, `ResumeBuilderSettings.stored()`, `AiSettingKeys` families and the audit row; missing: area/risk on the `Key`, non-AI key families, the generic `/api/admin/settings` endpoints |
| A4.2 Ledger columns, failed-call rows and the daily rollup | not_started → **partial** | I1.10 added `provider, latency_ms, success, error_kind` + failure rows (`20261013020000_ai_runtime_config.xml`); the rollup, `feature`/`org_id` and the overview endpoint remain |
| A4.3 Platform caps and kill switches in the gateway | not_started → **partial** | global (`ai.enabled`) and per-task (`ai.route.<task>.enabled`) kill switches are live on `/admin/ai/providers` (I1.11/I1.13); platform daily/monthly caps, `AI_PAUSED`, the gateway order remain |
| A15.1 Admin web test harness and CI | not_started → **partial** | U19.3 shipped Playwright + CI `web-e2e`; `admin-ai.spec.ts` + `AiProvidersPage.test.tsx` exist; the per-page smoke at 390/768/1440 light+dark and axe per page remain |
| A12.1 Audit viewer with actor filter and immutable trail | partial (unchanged) | the page never sends `?actor=`; A12.2 completes it (relates added) |

Four changes. Everything else audited matches its recorded status.

---

## 2. The admin target — what "functional end to end" means per page

Ordered by what an operator of a live SaaS needs first. Each row is the definition of done for that page across the
three waves; the story ids in §4 carry the exact files and ACs.

| # | Page | Functional end to end means | Wave |
|---|---|---|---|
| 1 | **Users** + **user detail** | Search any user by login/email/name across all pages; filter by role / plan (from `subscription`) / status (active, pending, blocked); tiles from `/summary` (total, active 7 d, pending, blocked) with previous-period deltas or none; "Recent account actions" from the audit log. Detail page in admin-v3 at 390 px: summary card, sticky bottom action bar, every action a sheet; existing actions kept (activate/deactivate/roles/reset/force-logout/delete/sessions/AI budget/notes) — HIGH ones ask for a reason; then account fixes (resend verification, change email verified, clear lockout, extension connections), entitlement explainer, flags/block. No log-in-as, ever. | 1 → 2 → 3 |
| 2 | **Customers** (Stripe mirror, read-only) | Who pays, whose card failed, who is cancelling, renewals this month, new this month, MRR — all from the `subscription` + `stripe_event` mirror through one `/summary`; server pagination + search; "Open in Stripe" for anything involving money; refund/dispute notes with kinds; cancellation reasons mirrored; nightly reconcile with "apply Stripe value" (HIGH); comps once grants exist. Nothing here moves money. | 1 → 2 → 3 |
| 3 | **AI usage** + **AI providers** | Providers page is done. Usage page: daily series and token totals from the ledger (rollup later), real cap tiles once platform caps exist, real alerts with ack, per-user throttle/pause/block. "Edit limits" lives on Settings › AI. | 1 → 2 → 3 |
| 4 | **Bug reports** + **Inquiries** (triage) | Server search + filters; assignee (any admin login), priority, first-response timestamp (set on the first status change or note), SLA tile = median first response (7 d) from real rows; severity / topic mix from `GROUP BY`; "similar reports" by fingerprint; inline **autosave** triage (status, severity, priority, assignee, notes — no Save button; `SavedTick`); reporter linked to the user page when `user_login` is set; audited CSV export with formula guard; phone triage (swipe take/resolve) later. | 1 → 3 |
| 5 | **Job sources** (health) | Every nightly and manual run is a row; per-source run history and a daily chart from `ingest_source_daily`; `/run` and `/match` audited; per-source sync / test / retry with a polite retry policy; pause with reason, rename, archive, bulk; recent errors from the ledger. Never scraping; ATS public JSON only. | 1 → 2 |
| 6 | **Audit log** | `area`, `risk`, `ip`, `user_agent`, `actor_roles` stored at write time (never derived on the client); server filters (actor, area, risk, action, target, from/to); tiles from `/summary`; server CSV export that is itself a HIGH audit row; every mutation audited incl. the JHipster `UserResource`, `AuthorityResource`, job-source run/match, subscriber export, settings writes (`SETTING_CHANGE`); flagged events + retention rule later. | 1 → 3 |
| 7 | **System** + **Settings home** | System: honest actuator view, editable log levels (audited), then the scheduled-job registry with run ledger / run now / pause, deployments + system events + ERROR log ring, backup & drill status from Healthchecks (red "Not configured" until P0.1), diagnostics bundle, incidents. **Settings home `/admin/settings`**: every area's keys with type, bounds, env default, source ("overriding env"), inline autosave with ✓ and undo, reason sheet for HIGH, history + revert; Features tab (global switches now; per-plan matrix + per-org overrides when the catalog/grants land); flags, announcements, maintenance mode, extension remote config as tabs of the same page. | 1 → 2 → 3 |
| 8 | **Security** | Honest v0 first (active sessions across users with revoke, staff list with last sign-in + MFA status, policies from real config, roles tab = today's two roles); then `security_event` from every auth path, failed logins, blocked IPs (temporary, automatic, liftable), abuse flags/block, and the staff-role / TOTP / re-auth platform (A0.x) that every HIGH action later assumes. | 1 → 2 → 3 |
| 9 | **Overview** + **Analytics** | Deltas computed from a previous window or hidden; daily signups series from `jhi_user.created_date`; health list from real sources (actuator components, failing job sources, last AI probe, Stripe webhook failures 24 h, paused jobs); then `product_event` + `metric_daily` make DAU/WAU/MAU, engagement, cohorts and filters real; country/channel charts are **removed** until A11.6 captures the data. | 1 → 2 → 3 |
| 10 | **Email** | Subscribers tab is the page (double opt-in list, counts incl. new 30 d, audited CSV with formula guard); campaign/template/automation tabs return only when `mail_log`, the template registry and the automations registry exist (A7.2–A7.6, after Wave 3). | 1 |

### 2.1 The Settings home — build-ready spec (folds A5.1 · A5.3 · A5.7 · A5.8; reuses I1.9)

**Why it exists.** CLAUDE.md: *every feature's on/off switch, price, limit, cap and default is driven by config from
the app admin settings page — never hard-coded.* Today that is true for the AI column only (`/admin/ai/providers`).
The Settings home makes it true for every area with the mechanism I1.9 already built.

**Registry (`api/service/settings/SettingDefinitions.java`, A5.1).** One static, closed list assembled from
`ResumeBuilderSettingKeys.all()`, `AiSettingKeys` families and a new `AdminSettingKeys` (the keys below). The `Key`
record gains two additive fields with defaults so existing declarations compile unchanged:
`area` (derived from the key's first segment when not given — `feature`, `resume`, `profile`, `tracker`, `ai`,
`jobs`, `inbox`, `ratelimit`, `ops`, `email`, `admin`, `flag`, `ext`, `security`, `analytics`, `catalog`) and
`risk` (`LOW|MEDIUM|HIGH`, default `MEDIUM`; HIGH = every `*.enabled` kill switch, every `*cap*`/`*cost*`,
`inbox.retention_days`, `ext.min_version`, `ops.maintenance`, `ratelimit.*`). Unknown keys are refused
(`SETTING_UNKNOWN_KEY`). New keys declared by A5.1 (defaults = today's env/property values):

| Key | Type | Default | Bounds | Risk |
|---|---|---|---|---|
| `jobs.match_threshold` / `jobs.candidates_per_user` / `jobs.posting_age_hours` / `jobs.daily_target` / `jobs.disable_after_failures` | INT | 60 / 50 / 48 / 15 / 5 | 40–90 / 10–100 / 12–168 / 3–20 / 2–20 | MEDIUM / MEDIUM / LOW / LOW / LOW |
| `inbox.poll_minutes` / `inbox.retention_days` | INT | 15 / 365 | 5–120 / 30–730 | MEDIUM / HIGH |
| `ops.error_digest.to` / `ops.error_digest.interval_min` | STRING / INT | env | — / 5–120 | LOW |
| `ratelimit.{authenticate,mfa,google,refresh,inquiries,bug_reports,newsletter}.per_hour` | INT | current filter values | 1–1000 | HIGH |
| `email.daily_send_cap` | INT | 250 | 50–10000 | MEDIUM |
| `ai.daily_cost_cap_cents` / `ai.monthly_cost_cap_cents` / `ai.free_parse_reserved_pct` | INT | 4000 / 60000 / 10 | 500–50000 / 5000–500000 / 0–50 | HIGH (read by A4.3) |
| `admin.comp_max_days.support` / `admin.comp_max_days.finance` / `admin.comp_reauth_days` / `admin.support_access_hours` / `admin.debug_session_fills` / `admin.debug_session_hours` | INT | 30 / 90 / 30 / 24 / 5 / 48 | 1–365 / 1–365 / 1–365 / 1–72 / 1–20 / 1–168 | MEDIUM |
| `security.failed_login_block_threshold` / `security.ip_block_hours` / `security.event_retention_days` | INT | 20 / 1 / 400 | 5–100 / 1–24 / 30–730 | HIGH / MEDIUM / MEDIUM |
| `analytics.conversion_window_days` / `catalog.cap_hit_alert_pct` / `catalog.stripe.pct_bp` / `catalog.stripe.fixed_cents` / `catalog.margin_floor_subscription_pct` / `catalog.margin_floor_service_pct` | INT | 30 / 5 / 290 / 30 / 80 / 20 | 7–90 / 1–50 / 0–1000 / 0–100 / **80–95** / **20–60** | MEDIUM / MEDIUM / LOW / LOW / HIGH / HIGH |
| `flag.autopilot` / `flag.interview_practice` / `flag.orgs` / `flag.ops_timesheets` / … | FLAG (JSON `{on,pct,allow[],deny[]}`) | off | pct 0–100 | MEDIUM (A5.3) |
| `ext.min_version` / `ext.ats.{workday,greenhouse,lever,ashby,smartrecruiters,icims,generic}.enabled` / `ext.rules_version_hint` | STRING / BOOL / STRING | current / true / "" | semver / — / — | HIGH / HIGH / LOW (A5.5) |
| `ops.maintenance` | FLAG | off | — | HIGH (A5.6) |

Keys a later story introduces are declared **by that story** in `AdminSettingKeys` with the default in its AC (rule
D10 of `runtime-settings-feature-flags.md`); the margin-floor keys cannot go below their hard minimums (D12).

**Read seam.** `ResumeBuilderSettings` is renamed **`SettingsService`** in A5.1 (same bean, same methods, a
`ResumeBuilderSettings` type alias kept for one wave so the resume builder's 40 call sites do not change); reads stay
`getInt/getBool/getString/getJson/stored`, env fallback via `Key.defaultValue` (the env value is injected into the
default at startup for the keys that have one — the `AiRuntimeSettings` "row › env › code" rule, generalised in
`SettingsService.resolve(key)` → `Resolved<T>`).

**API (A5.1).**
```
GET    /api/admin/settings?area=&q=        → { areas: [{area, count, highCount}], items: [SettingItem] }
       SettingItem = { key, area, type, risk, description, value, source: "db"|"env"|"default", envDefault, codeDefault,
                       min, max, allowed, updatedBy, updatedAt, lastReason }
PUT    /api/admin/settings/{key}  {value, reason?} → SettingItem   400 SETTING_UNKNOWN_KEY | SETTING_OUT_OF_BOUNDS {min,max,allowed}
                                                      | SETTING_REASON_REQUIRED (HIGH without reason)
DELETE /api/admin/settings/{key}  {reason?}        → SettingItem   (back to env/default; HIGH keys need a reason)
GET    /api/admin/settings/{key}/history?limit=   → [{id, key, oldValue, newValue, actorLogin, reason, changedAt}]
POST   /api/admin/settings/{key}/revert {historyId, reason?} → SettingItem  (writes a new history row; never edits one)
```
All writes go through `AdminSettingsWriter.write(key, value, reason, risk)` with `risk` read from the definition;
the audit action becomes **`SETTING_CHANGE`** (target `SETTING`, `area` from the definition) for every key, and
`AI_CONFIG_CHANGE` stays for the AI endpoints so `AiProvidersPage`'s history drawer keeps working (one wave later the
AI page reads `/api/admin/settings/{key}/history`). `PUT /api/admin/settings/ai.*` is allowed (same writer) so the
Settings home and the AI page never disagree.

**Page (`/admin/settings`, A5.8).** Server page fetches `GET /api/admin/settings`; `components/admin-v3/settings/
SettingsPage.tsx` renders: left rail (desktop) / `AdminTabs` (phone) of areas with counts and a HIGH badge; a search
box (`q` over key + description, client-side over the loaded registry — it is ≤ 300 rows); rows grouped by area —
each row = key (mono), description, control by type (`Switch` for BOOL/FLAG.on, number `Input` with the bounds as
helper text for INT/DECIMAL, `Select` for ENUM, text `Input` for STRING, a JSON textarea with "Validate" for JSON /
FLAG details), a `source` chip ("env" / "overriding env" / "default") with **"Reset to env"**, a history icon
opening `HistoryDrawer` (moved to `admin-v3/common`), and a `Tick` after a save. Saving = `useAdminSave` (the
`useAiAdmin` save loop lifted to `admin-v3/common/useAdminSave.tsx` in E2E-A15.0): optimistic value, PUT, ✓,
`undoToast` with the previous value, inline error from the ProblemDetail on 400. HIGH keys open `ReasonSheet` first
(Dialog on desktop, `BottomSheet` on phones; copy per `runtime-settings-feature-flags.md` §8). Tabs on the same page,
added by their stories: **Features** (A5.8 v0: every `feature.*.enabled` switch with its description; E2E-A5.1 adds
the per-plan matrix + per-org overrides + limits inline once A5.7/B1.2 exist), **Flags** (A5.3: on/pct/allow/deny
editor with a "who sees this" preview for a login), **Announcements** (A5.4), **Extension** (A5.5: min version +
per-ATS switches with "n users below min version" from the version-check endpoint), **Maintenance** (A5.6: one switch,
HIGH, with the consequence list). Nav: a new sidebar item **Settings** (`GearIcon`) between System and Audit log; the
AI usage page's "Providers & routing" link stays, and `/admin/ai/providers` gets a "More settings → Settings › AI"
link. No Save button anywhere on the page.

**Mobile (390 px).** Areas as a horizontal chip row; rows stack label / control / source line; HIGH switch → bottom
sheet with reason; 44 px targets; no horizontal scroll (Playwright `admin-settings.spec.ts` asserts it).

**Tests.** `SettingDefinitionsTest` (every key has type, bounds, area, risk; no duplicate keys across the three
sources; every HIGH key named in this section is HIGH), `SettingsServiceTest` (row › env › code; out-of-bounds row
ignored with a WARN; cache bump on write), `AdminSettingsResourceIT` (HIGH without reason → 400; history row per
write; revert writes a new row; `SETTING_CHANGE` audit with area; normal user 403), vitest `SettingsPage.test.tsx`
(control per type, bounds helper, HIGH opens the sheet, undo restores, "Reset to env"), Playwright
`admin-settings.spec.ts` at 390/1440 + axe.

---

## 3. Cross-cutting concerns (apply to every story in §4)

### 3.1 Admin auth and the role model
- **Today**: one role, `ROLE_ADMIN`; the `(admin)` layout 404s everyone else; Spring locks `/api/admin/**`. Admin
  MFA is email OTP when `dossier.admin.mfa-enabled=true`. Three real gaps (Google bypass, stale roles on refresh,
  rate limiting off) are fixed first (**A0.2, Wave 1**).
- **Waves 1–2 build on `ROLE_ADMIN` only.** No read-only "support" role is introduced before **A0.3** (Wave 3), which
  adds `ROLE_SUPPORT / FINANCE / OPS / EXPERT_MANAGER` with the static `AdminPermissions` map from
  `rbac-audit-mfa-impersonation.md` §2. To make A0.3 mechanical, **every new `/api/admin/**` handler from Wave 1 on
  is annotated `@AdminArea("users")`** (a marker annotation in `api/security/AdminArea.java`, shipped by A12.2
  together with the audit columns; an `AdminAreaCoverageTest` reflects over `Admin*Resource` classes and fails on an
  unannotated handler). A0.3's interceptor turns the marker into VIEW/ACT checks without touching the resources.
- **Re-auth.** Until **A0.5** lands, HIGH actions require a **reason** (and type-to-confirm when irreversible) but no
  fresh TOTP. A0.5 adds the 428 `REAUTH_REQUIRED` handling in `adminFetch` and the `ReauthSheet`; nothing else
  changes.
- **Demo**: `demo-admin` is ROLE_ADMIN in the mock only; the real API never makes a public demo account an admin.

### 3.2 Audit of every admin write
- Every mutation on `/api/admin/**` writes `admin_audit_event` in the same transaction (existing rule). A12.2 adds
  `area, risk, ip, user_agent, actor_roles` (filled by `AdminAuditService.record` from the request + the definition
  of the action: a new `AdminActions` enum replaces the string constants, each with `area` + `risk`). A12.3 closes
  the unaudited paths (`UserResource` POST/PUT/DELETE — DELETE delegates to `AccountDeletionService`;
  `AuthorityResource`; job-source `/run` `/match`; subscriber CSV export; customer detail views; admin login/MFA
  events via `security_event` in Wave 2).
- **Exports are HIGH**: every CSV/JSON export endpoint writes an audit row with the filter and the row count, and
  escapes cells that start with `= + - @ \t \r` (formula injection) — one helper `CsvWriter.cell()` in
  `api/service/util/CsvWriter.java` (E2E-A7.0 ships it; A12.2 and A8.2/A8.4 reuse it).
- The web never derives area or risk from an action string again (`AuditPage` regexes deleted by A12.2).

### 3.3 Reason required
- **HIGH** actions (reason required, written to `admin_audit_event.reason`): any `*.enabled` kill switch off, caps,
  `inbox.retention_days`, `ext.min_version`, maintenance, user deactivate / block / delete, grant or revoke admin,
  force-logout, revoke a session that is not the user's own request, change email, clear a lockout, pause ingest /
  poll jobs, archive a source, every export, apply a Stripe reconcile value, comp above 30 days, execute a privacy
  request.
- **Irreversible** (type-to-confirm *and* reason): delete account, execute DELETE privacy request, archive a source,
  retire a price.
- Reversible destructive actions (pause, switch off a board, dismiss) act immediately with `undoToast` (6 s) and no
  dialog; the undo is a real inverse write that is itself audited.
- One component: `ReasonSheet` (`admin-v3/common/ReasonSheet.tsx`, lifted from `ai/ReasonDialog.tsx`; Dialog ≥ `md`,
  `BottomSheet` below). Reason ≥ 10 chars, ≤ 500; the BFF validates shape only, the API enforces.

### 3.4 PII handling
- Admins never see never-collected data because it does not exist (no SSN / bank / tax ID / passport / DOB anywhere).
- **Metadata by default.** Admin pages show account metadata (login, name, email, plan, counts, statuses) because
  support needs it to act; **resume, bio and application contents are never rendered in admin** in these waves
  (the reason-gated read-only "view as" is A1.5, after Wave 3). The user-detail "privacy summary" (A1.8) lists data
  classes with counts, never values.
- **No masking** of emails in admin tables (decision §5 D-6); emails and logins never go into URLs or query strings
  (search is a `q` param of a *list* request over logins — acceptable; user pages are keyed by login, as today).
- Bug reports and inquiries contain free text from users: rendered as text (never HTML), `SensitiveContent.check`
  already refuses sensitive patterns at intake; the admin never stores a copy elsewhere.
- IPs (A12.2 audit, A9.1 security events) are personal data: retention 400 d, purpose security, listed in the privacy
  policy (A9.5/T1.4 own the policy text).

### 3.5 The empty-or-real rule (admin edition)
- An admin page component never imports a `sample-data.ts`; each page story deletes its file; E2E-A15.0 adds the
  ESLint `no-restricted-imports` rule for `**/admin-v3/**/sample-data` so none comes back. **No decorative panels
  remain, not even labelled** — a panel without a data source is removed and returns with the story that gives it
  one (this supersedes A15.4's "SampleTag everywhere, hidden in prod" policy; `SampleTag` is deleted at the end of
  Wave 1).
- Every tile delta is computed from `{value, previous}` or not rendered (`AdminStatTiles` API change in E2E-A15.0).
- Empty states say what is missing and what fills it (`EmptyState` with `variant="inline"`), e.g. "No failed
  webhooks in the last 24 hours".
- Demo-admin looks full because **the mock API** serves full fixtures (§3.8); production admins see real numbers,
  including zero.

### 3.6 Shared admin page kit (E2E-A15.0 — every page story imports it)
- `admin-v3/common/`: `AdminStatTiles` (`delta` string → `{value, previous?}`; delta chip rendered only when
  `previous` is a number; sparkline prop removed), `AdminFilterBar` (search + `FilterSelect`s bound to
  `useListQuery` state: URL-synced, server-driven), `AdminTable` (= `DataTable` + `Pagination` + `ListSkeleton` +
  `ErrorState` + `EmptyState` wired to a `useListQuery` result; collapses to cards below `md` with the two primary
  columns and a details `BottomSheet`), `ReasonSheet`, `ConfirmTypedSheet` (type the login/name to confirm),
  `HistoryDrawer` (moved from `ai/`), `useAdminSave` (moved from `ai/useAiAdmin`: optimistic + ✓ + undo + inline
  error, keyed by row/field), `Tick`/`FieldError` (from `ai/controls.tsx`), `AttentionBadge` (count pill for nav).
- `web/src/lib/admin-client.ts`: `adminFetch<T>(method, path, body?)` generalising `aiFetch` (base `/api/admin`),
  `AdminFail {error, code, ...extras}`; `web/src/lib/admin-proxy.ts`: `forward`, `passthrough`, `readObject`,
  `onlyFields` moved from `app/api/admin/ai/respond.ts` (kept as a re-export shim) — **every new BFF route uses
  these**, never a hand-written passthrough.
- API: `ListPage<T>` + `ListQuery` from APP-E2E (already in `service/dto/`) for every new list endpoint:
  `?page=&size=&sort=&q=&<filter>=` → `{items, total, page, size, summary?}`; existing admin lists that return
  `x-total-count` arrays keep working until their page story moves them.
- `e2e/fixtures/admin.ts`: `signInAdmin(page)` (`POST /api/auth/demo` as `demo-admin`), `expectAccessible(page)`
  (`AxeBuilder` with the `wcag2a, wcag2aa` tags, 0 violations), `noOverflow(page)`, `shot(page, name)`.

### 3.7 Playwright + axe per page (A15.1, then one spec per story)
- `e2e/journeys/admin-<page>.spec.ts` for every route: 390 and 1440, light + dark (`colorScheme`), no console
  errors, no horizontal overflow, `expectAccessible`, the page's main table renders fixture rows, one write journey
  per page with request interception (the `admin-ai.spec.ts` pattern — the mock refuses writes with 403
  `DEMO_READ_ONLY`, the spec answers like the real API would).
- Vitest per component (`*.test.tsx` next to the component) for state logic (filters, autosave, sheets).
- API: unit tests run without Docker; ITs (`*IT`) on Testcontainers in CI; every endpoint story commits
  `api/openapi.json`.
- CI: the existing `web-e2e` job runs every `admin-*.spec.ts`; A15.1 adds a `web-a11y` summary step that fails on
  any axe violation.

### 3.8 Mock-API fixtures (`npm run dev:demo -w web`)
- One fixture module per page under `web/scripts/fixtures/admin-<page>.mjs` (pattern `admin-ai.mjs`), registered in
  `mock-api.mjs`'s admin block; every endpoint a story adds gets a GET fixture with enough rows to page (≥ 35 for
  lists), realistic statuses, and the same shapes as the API DTOs (the route tests import the same module).
- Writes stay refused (`403 DEMO_READ_ONLY`) — consistent with demo accounts being read-only everywhere; the page
  shows the friendly inline notice; Playwright specs intercept. (Decision §5 D-9.)
- `demo-admin` can walk every route in `dev:demo`; the Wave demo scripts in §4 assume it.

---

## 4. Waves — the build order (each story = one Sonnet session, strict file ownership)

Conventions for every story block: **id · title · size · owners · deps** then *Files* (owned by that session),
*API* (method path → response; errors as ProblemDetail codes), *Tables* (additive Liquibase, file name), *Tests*,
*Mock*. Every API story commits `api/openapi.json`. Every page story: deletes its sample file, uses the §3.6 kit,
meets §9, adds vitest + its `admin-<page>.spec.ts` row, adds its mock fixture. Deps on `A0.3`/`A0.5` are **removed
from Wave 1–2 stories** (reason-only HIGH until A0.5; ROLE_ADMIN only until A0.3) — the JSON reflects this.

Lanes: **K** kit/tests · **A** API · **B** web · **S** security (API). A wave is "done" when its click-through
demo passes on the real stack (`demo-admin` on `dev:demo` + a real admin on a local API) and the admin specs are
green in CI.

### Wave 1 — "Operator essentials · honest pages · Settings home v0" (18 stories)

Goal: no admin page shows an invented number; users, customers, queues and job sources are searchable and
actionable; the audit log stores area/risk and filters server-side; the Settings home exists over I1.9's writer; the
three auth gaps are closed.

**Lane K (first — everything imports it)**

- **E2E-A15.0 · Admin page kit: tiles with real deltas, filter bar, table, reason/confirm sheets, admin client + proxy, sample lint · M · web, ui · deps —**
  *Files*: `components/admin-v3/common/{AdminStatTiles,AdminFilterBar,AdminTable,ReasonSheet,ConfirmTypedSheet,HistoryDrawer,useAdminSave,controls,AttentionBadge}.tsx` (+ `index.ts`), `components/admin-v3/ai/{ReasonDialog,HistoryDrawer,useAiAdmin,controls}.tsx` → thin re-exports of the common ones (no behaviour change; `AiProvidersPage.test.tsx` stays green), `lib/admin-client.ts`, `lib/admin-proxy.ts`, `app/api/admin/ai/respond.ts` → re-export shim, `web/eslint.config.*` (`no-restricted-imports` for `**/admin-v3/**/sample-data`, allowed until each page story lands via per-file `eslint-disable` lines that the page story removes), `e2e/fixtures/admin.ts`.
  *Tests*: vitest `AdminStatTiles.test.tsx` (delta only with `previous`; sign + good/bad), `AdminTable.test.tsx` (skeleton → rows → empty → error; cards under `md`), `ReasonSheet.test.tsx` (≥ 10 chars, Esc, focus return, sheet on narrow), `useAdminSave.test.tsx` (optimistic, ✓, undo, inline 400), `admin-client.test.ts`; `npm test -w web` green. *Supersedes* A15.4. *Mock*: none.
- **A15.1 · Admin Playwright smoke + axe per page, light + dark, 390/768/1440 · M · web · deps E2E-A15.0**
  *Files*: `e2e/journeys/admin-smoke.spec.ts` (every admin route × 3 widths × 2 schemes: h1 present, no console errors, no overflow, `expectAccessible`), `playwright.config.ts` (an `admin` project with the `demo-admin` storage state), `e2e/auth.setup.ts` (+ `demo-admin`), `.github/workflows/ci.yml` (`web-e2e` runs it; a11y failures fail the job). *Tests*: the spec itself; it is red until the page stories remove the sample panels (each page story turns its rows green — the spec lists routes in the order of this wave).

**Lane S (security, API)**

- **A0.2 · Close the three auth gaps: Google bypass, stale roles on refresh, rate limiting · M · API · deps A0.1** — unchanged AC (`security-compliance-operations.md` D2). *Files*: `web/rest/GoogleAuthController.java`, `web/rest/AuthenticateController.java`, `web/filter/RateLimitFilter.java`, `service/AdminUserActionService.java`, `config/application.yml` + `application-prod.yml`, `config/SecurityConfiguration.java` (`/management/info` → ADMIN). *Tests*: `GoogleAdminMfaIT`, `RefreshReloadsRolesIT`, `RateLimitFilterIT` (spoofed XFF ignored; MFA/google/refresh/intake rules), `ManagementInfoIT`.

**Lane A (API)**

- **A12.2 · Audit columns (area, risk, ip, user agent, roles), `AdminActions` enum, `@AdminArea`, server filters, summary, audited CSV export · M · API, web · deps —** (dep on A0.3 removed)
  *Tables*: `changelog/20261014010000_admin_audit_columns.xml` → `admin_audit_event` + `area VARCHAR(30), risk VARCHAR(10), ip VARCHAR(45), user_agent VARCHAR(255), actor_roles VARCHAR(200)`, index `(area, risk, created_date)`; backfill `area`/`risk` for existing rows from the enum mapping (one changeset per action). *API*: `GET /api/admin/audit?actor=&area=&risk=&action=&targetType=&targetId=&from=&to=&page=&size=` → `ListPage<AdminAuditEventDTO>` (old array + `x-total-count` kept when no `page` param for one wave); `GET /api/admin/audit/summary?days=30` → `{total, highRisk, exports, accessReviews, byArea[], byRisk[], previous{total, highRisk, exports}}`; `GET /api/admin/audit/export?<same filters>` → CSV (HIGH: writes `AUDIT_EXPORT` with the filter + row count; `CsvWriter.cell` escapes). *Files*: `service/AdminActions.java` (enum: every existing constant + `SETTING_CHANGE`, `AUDIT_EXPORT`, `SUBSCRIBER_EXPORT`, `JOB_SOURCE_RUN`, `JOB_SOURCE_MATCH`, `USER_CREATE`, `USER_UPDATE_RAW`, `AUTHORITY_CHANGE`, `CUSTOMER_VIEW`, `LOG_LEVEL_SET`, `SESSION_REVOKE_GLOBAL` … each with `area` + `risk`), `service/AdminAuditService.java` (`record(AdminActions, targetType, targetId, reason, details)`; string overloads delegate; ip/user-agent from `RequestContextHolder`; roles from the security context), `security/AdminArea.java` + `AdminAreaCoverageTest`, `web/rest/AdminAuditResource.java`, `repository/AdminAuditEventRepository.java` (Specification), `service/util/CsvWriter.java`; web `components/admin-v3/audit/AuditPage.tsx` (rewrite on `AdminTable` + `AdminFilterBar`; `areaOf/riskOf` regexes deleted; tiles from `/summary` with previous; "Export CSV" = `GET /api/admin/audit/export?…` through BFF `app/api/admin/audit/export/route.ts`, confirms with `ReasonSheet`; compliance strip = `accessReviews` + privacy-request counts (0 until A9.4 — rendered as "0 · queue arrives with A9.4" only in the story PR note, the UI just shows 0); "Create retention rule" removed), `app/(admin)/admin/audit/page.tsx`, `app/api/admin/audit/route.ts`, delete `audit/sample-data.ts`. *Tests*: `AdminAuditResourceIT` (filters, summary, export writes AUDIT_EXPORT + escapes `=cmd`), `AdminActionsTest` (every action has area + risk), vitest `AuditPage.test.tsx`, Playwright `admin-audit.spec.ts`. *Mock*: `fixtures/admin-audit.mjs` (120 rows across areas/risks; summary; export). *Completes* A12.1.
- **A12.3 · Audit every mutation: UserResource, AuthorityResource, job-source run/match, exports, customer views; DELETE through AccountDeletionService · M · API · deps A12.2**
  *Files*: `web/rest/UserResource.java` (POST/PUT audited `USER_CREATE`/`USER_UPDATE_RAW` with field diff in `details`; DELETE → `AccountDeletionService.deleteAccount(login)` + the self-guard + `USER_DELETE`), `web/rest/AuthorityResource.java` (`AUTHORITY_CHANGE`, HIGH), `web/rest/AdminJobSourceResource.java` (`JOB_SOURCE_RUN` / `JOB_SOURCE_MATCH`), `web/rest/AdminSubscriberResource.java` (`SUBSCRIBER_EXPORT` HIGH + `CsvWriter`), `web/rest/AdminCustomerResource.java` (`CUSTOMER_VIEW` LOW on detail). *Tests*: `UserResourceAuditIT` (each mutation one row; delete cascades through the deletion service; self-delete 400), `AuthorityResourceIT`, `AdminJobSourceResourceIT` (+ run/match audited), `AdminSubscriberExportIT` (audited + `=` escaped).
- **A1.3 · Users list: server-side search and filters, plan and status columns, summary from real data · M · API, web · deps E2E-A15.0** (dep on A0.3 removed; role filter = ADMIN/USER)
  *API*: `GET /api/admin/users?q=&role=ADMIN|USER&plan=FREE|PRO|AUTOPILOT&status=ACTIVE|PENDING|BLOCKED&page=&size=&sort=` → `ListPage<AdminUserRow>` (`AdminUserDTO` + `plan` from `subscription` left join, `status` = `!activated → PENDING`, `activated → ACTIVE`; BLOCKED arrives with A9.3's flag and is `0` until then, `lastSeenAt` from the latest `refresh_token.created_at`); `GET /api/admin/users/summary` → `{total, active7d, pending, blocked, admins, previous{total, active7d}}`; `GET /api/admin/users/recent-actions?limit=6` → audit rows with `target_type=USER`. Old unpaged `GET /api/admin/users` (JHipster) kept for the API clients. *Files*: `web/rest/AdminUsersResource.java` (new, `/api/admin/users/{summary,recent-actions}` + the filtered list on `GET /api/admin/users?q=` — `UserResource` keeps the no-param path), `repository/UserRepository.java` (Specification + plan join), `service/AdminUserQueryService.java`; web `components/admin-v3/users/UsersPage.tsx`, `components/admin/UsersTable.tsx` → `admin-v3/users/UsersTable.tsx` on `AdminTable`/`AdminFilterBar` (plan + status + last seen columns; role/plan/status chips), `app/(admin)/admin/users/page.tsx`, `app/api/admin/users/route.ts` (GET), delete the Users section of `admin-v3/sample-data.ts`. Segments donut = status counts; role distribution = `{admins, users}` from summary; "Recent account actions" = `/recent-actions`. *Tests*: `AdminUsersResourceIT` (q over login/email/name across pages; plan/status filters; summary), vitest `UsersPage.test.tsx`, Playwright `admin-users.spec.ts`. *Mock*: `fixtures/admin-users.mjs` (60 users, mixed plans/statuses; summary; recent actions).
- **A5.1 · Typed, bounded runtime settings registry (area + risk), `SettingsService`, generic settings API over `AdminSettingsWriter` · M · API · deps —** (dep on A0.3 removed) — spec §2.1.
  *Files*: `service/settings/{SettingDefinitions,AdminSettingKeys,SettingsService,SettingsException}.java`, `service/ResumeBuilderSettingKeys.java` (`Key` + `area`, `risk` with defaults; `all()`), `service/ResumeBuilderSettings.java` → alias of `SettingsService`, `service/AdminSettingsWriter.java` (risk from the definition when the caller passes null; audit `SETTING_CHANGE` with area; `AI_CONFIG_CHANGE` kept for `AdminAiConfigService` callers), `web/rest/AdminSettingsResource.java` (`@AdminArea("settings")`), `service/dto/SettingItem.java`. *Tests*: as §2.1. *Mock*: `fixtures/admin-settings.mjs` (the full registry with a few `db` overrides and history rows).
- **A6.2 · Durable ingest ledger: `ingest_run`, `ingest_source_run`, `ingest_source_daily`; audit `/run` and `/match`; per-source history endpoint · M · API · deps A6.1**
  *Tables*: `changelog/20261014020000_ingest_runs.xml` (`job-source-operations.md` §2 verbatim); `job_source.last_*` stay as a cache. *API*: `GET /api/admin/job-sources` gains `running` from the open `ingest_run` (the in-memory flag goes), `lastRun` from the ledger; `GET /api/admin/job-sources/runs?page=` → `ListPage<IngestRunDTO>`; `GET /api/admin/job-sources/{id}/runs?page=` → `ListPage<IngestSourceRunDTO>`; `GET /api/admin/job-sources/daily?days=30` → `[{day, fetched, newCount, okSources, failedSources}]` (sum over `ingest_source_daily`). *Files*: `service/jobs/{JobIngestService,IngestLedger}.java`, `domain/jobs/{IngestRun,IngestSourceRun,IngestSourceDaily}.java`, repositories, `web/rest/AdminJobSourceResource.java`. *Tests*: `IngestLedgerTest` (one run row per run, one source row per board, daily upsert), `AdminJobSourceResourceIT` (runs paged; a FAILED board shows in its history). *Mock*: `fixtures/admin-job-sources.mjs` (+ runs + daily).
- **A2.1 · Customers: summary with real MRR, server pagination + search, renewals/onboarding/risk server-side, no "Add Customer" · M · API, web · deps A1.1, E2E-A15.0** (dep on A11.2 removed: MRR reuses `AdminAnalyticsService.billing()`)
  *API*: `GET /api/admin/customers?filter=&q=&page=&size=&sort=` → `ListPage<Customer>` over a `Pageable` repository query (no `findAll()`); `GET /api/admin/customers/summary` → `{counts{ALL,ACTIVE,PAST_DUE,CANCELLING,LAPSED,NEW}, mrrCents, previous{active, pastDue, cancelling, mrrCents} (from `stripe_event` 30 d ago), renewals[≤5], onboarding[≤5], atRisk[≤5]}` (the `/counts` endpoint stays as an alias for one wave). *Files*: `service/CustomerAdminService.java`, `repository/SubscriptionRepository.java`, `web/rest/AdminCustomerResource.java`; web `components/admin-v3/customers/{CustomersPage,CustomersTable}.tsx` (on `AdminTable`; "Add Customer" deleted; MRR tile real), `app/(admin)/admin/customers/page.tsx` (one fetch + summary), `app/api/admin/customers/route.ts`, delete `customers/sample-data.ts`. *Tests*: `AdminCustomerResourceIT` (150 subscriptions page; `q`; summary mrr equals analytics billing mrr), `CustomerAdminServiceTest`, vitest `CustomersPage.test.tsx`, Playwright `admin-customers.spec.ts`. *Mock*: `fixtures/admin-customers.mjs` (45 customers + summary + detail timeline for 3).

**Lane B (web, after the API story it names)**

- **A5.8 · Admin › Settings home v0: areas, search, inline autosave, source chip + reset to env, history + revert, reason sheet for HIGH, Features tab (global switches) · M · web · deps A5.1, E2E-A15.0** (deps A5.7/A0.5 removed; per-plan matrix → E2E-A5.1) — spec §2.1.
  *Files*: `app/(admin)/admin/settings/{page,loading}.tsx`, `components/admin-v3/settings/{SettingsPage,AreaRail,SettingRow,controls,FeaturesTab}.tsx`, `app/api/admin/settings/{route,[key]/route,[key]/history/route,[key]/revert/route}.ts`, `lib/admin-settings.ts` (types + fetchers), `components/admin-shell/AdminShell.tsx` (nav item Settings), `components/admin-v3/ai/AiUsagePage.tsx` (limits panel links to `/admin/settings?area=ai`). *Tests*: vitest `SettingsPage.test.tsx`, route tests `settings.routes.test.ts`, Playwright `admin-settings.spec.ts` (390/1440, flip a HIGH switch → sheet → reason → ✓ → undo). *Mock*: covered by A5.1.
- **A1.9 · Restyle user and bug detail pages to admin-v3 with a phone-first layout; no Save buttons · M · web, ui · deps E2E-A15.0** (dep on A1.4 removed; the action bar shows the actions that exist and gains buttons as A1.4/A2.4/A9.3 land)
  *Files*: `app/(admin)/admin/users/[login]/page.tsx`, `components/admin-v3/users/detail/{UserDetailPage,SummaryCard,ActionBar,ActionsSheet,SessionsPanel,AiBudgetPanel,BillingPanel,NotesPanel}.tsx` (replacing `components/admin/{UserActions,AiQuotaControl,SessionsList,CustomerBilling,CustomerNoteForm}.tsx`), `app/(admin)/admin/bug-reports/[id]/page.tsx`, `components/admin-v3/bug-reports/detail/{BugDetailPage,TriagePanel}.tsx` (replacing `components/admin/BugTriageControl.tsx`). Every action = `ActionsSheet` item; deactivate / revoke admin / force-logout / delete = HIGH → `ReasonSheet` (delete also `ConfirmTypedSheet`; the BFF passes `reason` through; `AdminUserActionResource` accepts an optional `{reason}` body — API half of this story, 10 lines); AI budget = number input with autosave + ✓ + undo; note form keeps its one "Add note" button (creation); bug triage = autosave per field. 390 px: header card, sticky bottom bar (Activate/Deactivate · Reset · More), sheets; dark mode verified. *Tests*: vitest `UserDetailPage.test.tsx`, `TriagePanel.test.tsx`, Playwright `admin-user-detail.spec.ts`. *Mock*: `fixtures/admin-users.mjs` gains detail / ai-quota / sessions / customers/{login}.
- **E2E-A10.0 · System page honest + editable log levels · S · web, API · deps E2E-A15.0**
  *API*: `PUT /api/admin/system/loggers/{name} {level}` → proxies actuator `POST /management/loggers/{name}`, MEDIUM audit `LOG_LEVEL_SET`, levels whitelisted. *Files*: `web/rest/AdminSystemResource.java` (new, `@AdminArea("system")`), web `components/admin-v3/system/SystemPage.tsx` (tiles = uptime, version, JVM memory %, log level ROOT; delete latency/jobs/error tiles, deployments, jobs queue, events, resources, `ENV_SAMPLE`, `HEALTH_FALLBACK`, the four toasts; health table shows actuator components only; log levels become `Select`s with autosave + ✓), `app/(admin)/admin/system/page.tsx`, `app/api/admin/system/loggers/[name]/route.ts`, delete `system/sample-data.ts`. *Tests*: `AdminSystemResourceIT` (level whitelist; audited), vitest `SystemPage.test.tsx`, Playwright `admin-system.spec.ts`. *Mock*: `fixtures/admin-system.mjs`.
- **E2E-A9.0 · Security page honest v0: active sessions across users with revoke, staff list, real policies, two-role matrix · M · API, web · deps A12.2**
  *API*: `GET /api/admin/security/overview` → `{activeSessions, staffCount, mfaMode: "email"|"off", rateLimitEnabled, previous{activeSessions}}`; `GET /api/admin/security/sessions?login=&page=` → `ListPage<SessionRow {login, familyId, createdAt, expiresAt, tokenCount}>` (active families, newest first); `DELETE /api/admin/security/sessions/{familyId} {reason}` (HIGH, `SESSION_REVOKE_GLOBAL`); `GET /api/admin/security/staff` → `[{login, email, roles, lastSignInAt (latest refresh_token.created_at), mfa: "email"|"none"}]`; `GET /api/admin/security/policies` → `[{name, value, source}]` from config (access TTL, refresh TTL, admin MFA mode, rate limiting on/off, lockout "not enforced yet", password min length). *Files*: `web/rest/AdminSecurityResource.java` (`@AdminArea("security")`), `service/AdminSecurityService.java`; web `components/admin-v3/security/{SecurityPage,SessionsTab,StaffTab,PoliciesTab,RolesTab}.tsx` (Overview = tiles + staff + "Events arrive with A9.1" empty state; Roles = static two-role table from `/api/admin/me`'s successor — until A0.3 a constant in `RolesTab.tsx` that A0.3 replaces; the self-linking tiles, failed-login, password-reset, blocked-IP and suspicious panels deleted), `app/(admin)/admin/security/page.tsx`, `app/api/admin/security/sessions/[familyId]/route.ts`, `components/admin-shell/AdminShell.tsx` (`soon` pill removed), delete the Security section of `admin-v3/sample-data.ts`. *Tests*: `AdminSecurityResourceIT` (sessions across users; revoke audited HIGH with reason; policies schema), vitest `SecurityPage.test.tsx`, Playwright `admin-security.spec.ts`. *Mock*: `fixtures/admin-security.mjs`.
- **E2E-A11.0 · Overview and Analytics honest: previous-period deltas, daily signups series, real health list, decorative panels removed · M · API, web · deps E2E-A15.0, A6.2**
  *API*: `GET /api/admin/analytics` gains `previous {totalUsers, activationRatePct, signups7d, activeUsers7d, signups30d, activeUsers30d}` (same queries, shifted window) and `series.signupsDaily[30] [{day, count}]` from `jhi_user.created_date`; `GET /api/admin/system/health-list` → `[{key, label, status: UP|DOWN|UNKNOWN|ATTENTION, detail, href}]` for `api` (actuator), `db`, `mail` (actuator component when present), `jobSources` (failing count from `job_source`), `ai` (last probe from `ai_call` PROBE rows / provider enabled), `stripeWebhooks` (`stripe_event.status=failed` in 24 h), `backups` (`UNKNOWN · not configured` until A10.3). *Files*: `service/AdminAnalyticsService.java`, `web/rest/AdminSystemResource.java` (+ health-list); web `components/admin-v3/overview/OverviewPage.tsx` (tiles with previous; growth chart = signups bars only, active-users line returns with A11.3; health list real; Period select removed; quick-action tiles point at real pages), `components/admin-v3/analytics/{AnalyticsPage,AnalyticsFilters}.tsx` (filter row deleted until A11.4; engagement / cohorts / countries / channels panels deleted; growth = signups series), delete `analytics/sample-data.ts` and the Overview section of `admin-v3/sample-data.ts`. *Tests*: `AdminAnalyticsResourceIT` (previous + series), `HealthListTest`, vitest `OverviewPage.test.tsx`, `AnalyticsPage.test.tsx`, Playwright `admin-overview.spec.ts`, `admin-analytics.spec.ts`. *Mock*: `fixtures/admin-analytics.mjs`.
- **E2E-A7.0 · Email page honest: Subscribers is the page; tiles from counts; audited CSV with formula guard · S · web, API · deps A12.3**
  *API*: `GET /api/admin/subscribers/counts` gains `new30d` and `previous{confirmed}`. *Files*: web `components/admin-v3/email/EmailPage.tsx` (tabs Campaigns/Templates/Automations removed from the tab list; tiles = confirmed / pending / unsubscribed / new 30 d; "Send Campaign" deleted; subscribers table on `AdminTable`), `app/(admin)/admin/subscribers/page.tsx` (default tab = subscribers), delete `email/sample-data.ts`, `email/chart-labels.ts` (moved to `common` if the bug/inquiry pages still use it — they will not after A8.2/A8.4). *Tests*: vitest `EmailPage.test.tsx`, Playwright `admin-email.spec.ts`. *Mock*: `fixtures/admin-email.mjs`.
- **A4.1 · AI usage page: daily series and tokens from the ledger, honest limits panel, real near-cap alerts only · M · API, web · deps E2E-A15.0** (status stays partial until this lands; the rollup A4.2 later swaps the series source)
  *API*: `GET /api/admin/ai-usage?period=` gains `tokens{input, cached, output}`, `series[{day, calls, users, costMicros}]` (ledger `GROUP BY DATE(created_at)` for the month), `failed`, `previous{totalCalls, userCount, totalCostMicros}` (previous month). *Files*: `web/rest/AdminAiUsageResource.java`, `repository/AiCallRepository.java`; web `components/admin-v3/ai/AiUsagePage.tsx` (trend = series; tokens tile real; limits panel = spend vs Pro pool + "Platform caps · set in Settings › AI" link, the daily request row deleted; alerts = near-cap users only, "Anomaly alerts arrive with A4.4" empty state), delete `ai/sample-data.ts`, `ai/ComingSoon.tsx`. *Tests*: `AdminAiUsageResourceIT` (series sums equal totals; tokens), vitest `AiUsagePage.test.tsx` (extend), Playwright `admin-ai-usage.spec.ts`. *Mock*: `mock-api.mjs` ai-usage handler → `fixtures/admin-ai-usage.mjs`.
- **A8.2 · Bug reports triage v1: server search/filters, assignee, priority, first response, fingerprint grouping, real severity mix, audited export, user link, autosave triage · M · API, web · deps A12.3** (deps A0.3/A12.2 → A12.3; assignee = any ROLE_ADMIN login)
  *Tables*: `changelog/20261014030000_bug_report_triage.xml` → `bug_report` + `assignee_login VARCHAR(50), priority VARCHAR(10), first_response_at DATETIME, resolved_at DATETIME, fingerprint CHAR(40)` (fingerprint = SHA-1 of the lower-cased first 60 chars of `message` + `category`, backfilled). *API*: `GET /api/admin/bug-reports?q=&status=&severity=&priority=&assignee=&source=&page=&size=&sort=` → `ListPage<BugReportDTO>` + `summary{byStatus, bySeverity, byPriority}`; `GET /api/admin/bug-reports/summary?days=30` → `{new, open, inProgress, resolved, medianFirstResponseMinutes, previous{...}, topFingerprints[≤5 {fingerprint, sample, count, trend}]}`; `PATCH /api/admin/bug-reports/{id} {status?|severity?|priority?|assigneeLogin?|adminNotes?}` (partial; first status change or note sets `first_response_at`; RESOLVED/WONTFIX sets `resolved_at`; audited); `GET /api/admin/bug-reports/export?…` (HIGH, `CsvWriter`); `GET /api/admin/staff-logins` → admin logins for the assignee select (replaced by `/api/admin/staff` in A0.6). *Files*: `web/rest/AdminBugReportResource.java`, `service/BugReportService.java`, `repository/BugReportRepository.java`; web `components/admin-v3/bug-reports/{BugReportsPage,BugTable,TriageInline}.tsx` (`AdminTable` + `AdminFilterBar`; severity donut + top recurring from `/summary`; crash trend deleted until A11.3; reporter → user page link; export via `ReasonSheet`), `components/admin-v3/bug-reports/detail/TriagePanel.tsx` (autosave PATCH per field), `app/api/admin/bug-reports/{route,export/route,[id]/route}.ts`, delete `bug-reports/sample-data.ts`. *Tests*: `AdminBugReportResourceIT` (q, filters, summary median, first_response rule, export audited), `BugFingerprintTest`, vitest `BugReportsPage.test.tsx`, Playwright `admin-bugs.spec.ts`. *Mock*: `fixtures/admin-bugs.mjs` (48 rows).
- **A8.4 · Inquiries triage v1: server search/filters, priority, assignee, first-response SLA, topic mix, escalations rule, audited export, autosave follow-up · M · API, web · deps A12.3** (dep A0.3 removed; A5.1 kept for `support.inquiry_sla_hours`)
  *Tables*: `changelog/20261014040000_sales_inquiry_triage.xml` → `sales_inquiry` + `assignee_login, priority, first_response_at, closed_at`. *API*: `GET /api/admin/inquiries?q=&status=&topic=&priority=&assignee=&page=&size=&sort=` → `ListPage` + `summary`; `GET /api/admin/inquiries/summary?days=30` → `{all, new, contacted, resolved, medianFirstResponseMinutes, slaHours (setting `support.inquiry_sla_hours`, default 24), overdue[≤5], byTopic[], previous{...}}`; `PATCH /api/admin/inquiries/{id}` (partial; CONTACTED sets `first_response_at`; WON/LOST sets `closed_at`; audited); `GET /api/admin/inquiries/export` (HIGH). *Files*: `web/rest/AdminSalesInquiryResource.java`, `service/SalesInquiryService.java`, `service/settings/AdminSettingKeys.java` (+ `support.inquiry_sla_hours` 1–168); web `components/admin-v3/inquiries/{InquiriesPage,InquiryRow}.tsx` (SLA tile real: median + overdue list = "escalations"; category mix from `byTopic`; follow-up = autosave `Select` + note with `SavedTick`, no Save), `components/admin/InquiryFollowUp.tsx` deleted, `app/api/admin/inquiries/{route,export/route,[id]/route}.ts`, delete `inquiries/sample-data.ts`. *Tests*: `AdminSalesInquiryResourceIT`, vitest `InquiriesPage.test.tsx`, Playwright `admin-inquiries.spec.ts`. *Mock*: `fixtures/admin-inquiries.mjs` (40 rows).

**Wave 1 demo (click-through, `demo-admin` on `dev:demo` and a real admin on a local API):** open every admin
route at 390 and 1440 → no `SampleTag` anywhere, `grep -r sample-data web/src/components/admin-v3` returns nothing →
Users: search "priya" finds a user on page 3, filter Plan = Pro, open her page → Deactivate asks for a reason →
reason → ✓ → Undo restores → Audit log shows the row with area `users`, risk HIGH, the reason and the IP → Settings
→ area Jobs → `jobs.match_threshold` 60 → 70 → ✓ → "overriding env" chip → Reset to env → history drawer shows two
rows → AI › `ai.feature.matches.enabled` off → sheet → reason → the AI providers page shows the same switch off →
Customers summary shows MRR equal to Analytics' revenue block → Bug reports: assign to yourself inline → ✓ → SLA
tile moves → Job sources: Read all boards → the run appears in `/runs` with per-source rows → Security › Sessions
lists every active family, revoke one with a reason → System: set `com.dossier.api` to DEBUG → ✓ → audited →
`admin-smoke.spec.ts` green with 0 axe violations in CI.

### Wave 2 — "Switches everywhere · security real · jobs and ops ledgers" (20 stories)

Goal: every feature's switch, cap and limit is a setting on the Settings home (flags, announcements, maintenance,
extension remote config included); the Security page runs on real events; job sources have per-source actions and
real charts; the System page has the job registry; AI has its rollup and the platform caps; the catalog schema and
the margin guard exist.

- **A5.2 · Move the env-only knobs onto settings: jobs, inbox, rate limits, digest, email cap · M · API · deps A5.1** — scope trimmed to the keys declared in §2.1 (`jobs.*`, `inbox.*`, `ratelimit.*`, `ops.error_digest.*`, `email.daily_send_cap`); each call site reads `SettingsService` ("env still works when the row is absent" per key); every other area's knobs are declared by the story that owns them.
- **A5.3 · Feature flags (on/off, percent, allow/deny) + `GET /api/config/flags` + Settings › Flags tab · M · API, web, extension · deps A5.1** — `FlagEvaluator` (deny › allow › pct `crc32(flag+login) % 100` › on), `/api/config/flags` (auth) for web + extension, `flag.orgs` replaces `dossier.orgs.enabled` (E2E-O1.9's rename AC), Flags tab with a "preview for login" field.
- **A5.4 · Announcements for web and the extension drawer + Settings › Announcements tab · M · API, web, extension · deps A5.1** — `announcement` table (§3 of the settings doc), `GET /api/config/client` (public, ETag, 5 min), web banner + drawer banner, dismissible per id.
- **A5.6 · Maintenance mode flag · S · API, web · deps A5.3** — `ops.maintenance` FLAG: API 503 `MAINTENANCE` for non-admin writes, web banner, admin exempt; Settings › Maintenance switch (HIGH).
- **A5.5 · Extension remote config: min version + per-ATS kill switch + Settings › Extension tab · M · API, extension, web · deps A5.4** — delivered on `/api/config/client`; engine refuses a paused adapter with "Filling on X is paused"; version bump ritual.
- **A10.2 · Scheduled-job registry, `job_run` ledger, run-now, pause with reason; System › Jobs panel · M · API, web · deps A5.1** — `observability-backup-incident.md` D2 + §3 registry; `JobRunner` wraps every `@Scheduled` method; `jobs.<key>.paused` settings; `GET /api/admin/jobs`, `POST /{key}/run`, `PUT /{key}`, `GET /{key}/runs`; the ingest job delegates to A6.2's ledger for its per-source rows.
- **A10.4 · Deployments record, `system_event` timeline, ERROR log ring view · M · API, web · deps A10.2** — `deployment` + `system_event` tables, `POST /api/admin/deployments` (bearer `DEPLOY_HOOK_TOKEN` from `deploy.yml`), BOOT rows, `GET /api/admin/system/{events,logs}`; System page panels return real.
- **A9.1 · `security_event` table written from every auth path · M · API · deps A0.2, A5.1** — `security-compliance-operations.md` D1; kinds, severity, `email_hash` for unknown logins; `security.event_retention_days`.
- **A9.2 · Security page real: overview tiles, events tab with filters, sessions tab, blocked IPs tab, policies from the tables · M · API, web · deps A9.1, E2E-A9.0** — size reduced to M by E2E-A9.0 having built the page skeleton; adds `ip_block` (automatic, temporary, lift/extend), `GET /api/admin/security/{overview,events,ip-blocks}`; the failed-login tile and MFA adoption (staff with email MFA now, TOTP after A0.4).
- **A6.3 · Per-source sync, test, retry with a polite retry policy · M · API, web · deps A6.2** — `POST /api/admin/job-sources/{id}/{sync,test,retry}`, `HttpJobBoardClient` backoff 2 s / 8 s / 30 s on 5xx + timeouts, 404/410 → `GONE`, 429 honours `Retry-After`; row kebab gains the three actions with toasts and the source's run history sheet.
- **A6.4 · Pause/resume with reason, rename, tags, archive, bulk actions · M · API, web · deps A6.3** (dep A0.5 removed; archive = HIGH with reason + typed confirm) — `job_source` columns per the design §2; bulk `POST /api/admin/job-sources/bulk {ids[≤50], action}` audited once with the id list.
- **A6.5 · Real ingestion charts, error grouping, discovery strip · M · API, web · deps A6.2** — sync history and source performance from `ingest_source_daily` / `ingest_run`; errors grouped by `error` prefix; "new from users this week" strip with approve/pause; the dead `components/admin/JobSourcesPanel.tsx` deleted.
- **A1.4 · Account fixes: resend verification, change email (verified), clear rate-limit lock, extension connections · M · API, web · deps A0.2, A1.9** (dep A0.3 removed) — unchanged AC; buttons join the user page's action bar.
- **A4.2 · Ledger `feature`/`org_id` columns, `ai_daily_rollup` job (00:10 UTC + hourly today), `GET /api/admin/ai/overview`, AI page series from the rollup · M · API, web · deps A10.2, A4.1** — the series source swaps from the live ledger to the rollup; stale-rollup chip; `UNPRICED_MODEL` alert row.
- **A4.3 · Platform daily/monthly AI caps enforced in the gateway; `AI_PAUSED`; free-parse reserved slice · M · API, web, extension · deps A5.1, A4.2** — keys `ai.daily_cost_cap_cents` / `ai.monthly_cost_cap_cents` / `ai.free_parse_reserved_pct` (declared in A5.1); gateway order `ai.enabled → ai.route.<task>.enabled → platform caps → user control → user budget`; AI usage page cap tiles real ("$12.40 of $40 today").
- **A2.3 · Refund and dispute notes: note kinds, policy text, webhook mirror of refunds/disputes · S · API, web · deps A2.1** — unchanged.
- **A11.2 · `product_event` table, server-side recorder, allow-listed client events endpoint · M · API, web, extension · deps —** — `analytics-event-pipeline.md` §2–§3 (shared with U18.1: this story *is* the pipeline's schema; `relates` U18.1).
- **A11.3 · `metric_daily` rollup job + generic metric endpoint; every tile delta from rollups · M · API, web · deps A11.2, A10.2** (dep U18.1 → A11.2) — `GET /api/admin/metrics?metric=&dimension=&from=&to=`; `AdminStatTiles` `previous` values on every page switch to rollups where a metric exists.
- **A3.1 · Catalog schema and seed · M · API · deps —** — unchanged (`catalog-margin-entitlements.md` §2; seed = today's CLAUDE.md prices, re-priced from admin afterwards).
- **A3.3 · Margin calculator and the guard API · M · API · deps A3.1, A5.1** — unchanged; the Stripe fee and the floors read the `catalog.*` settings declared in §2.1 (floors cannot go below 80/20).

**Wave 2 demo:** Settings › Flags: `flag.autopilot` on for `pct: 10` + allow `demo` → `/api/config/flags` as `demo`
says on, as a fresh user says off → Announcements: publish "Workday filling is degraded" for both audiences → the
web banner and the extension drawer show it within 15 min → Extension: `ext.ats.workday.enabled` off (HIGH, reason)
→ the engine refuses Workday with the paused message (jsdom test) → Maintenance on → a user's PUT gets 503, the
admin keeps working → System › Jobs: pause `inbox.poll` with a reason → the registry shows it paused → run
`jobs.ingest` now → `job_run` row + per-source rows + the chart moves → Security › Events lists the sign-ins of the
demo, a blocked IP appears after 20 failed logins in the IT → AI: the platform daily cap set to $5 in Settings → the
next draft call returns `AI_PAUSED` with a retry-after and the AI page tile goes red → Customers: a Stripe
`charge.refunded` fixture lands on the timeline with the REFUND_EXCEPTION note kind.

### Wave 3 — "Staff roles and re-auth · catalog · AI governance · privacy ops" (23 stories)

Goal: the admin can be handed to a second person safely (roles, TOTP, short sessions, re-auth on HIGH); prices and
entitlements run from the catalog behind the margin guard; AI anomalies are caught and contained; privacy requests
are a queue; analytics are real. L stories are split into two M stories each (the JSON carries the new ids).

- **A0.3** staff roles + `AdminPermissions` map + sidebar filtering (M) — turns Wave 1's `@AdminArea` markers into VIEW/ACT checks; SUPPORT/FINANCE/OPS/EXPERT_MANAGER seeded.
- **A0.4** TOTP API: `TotpService`, `admin_totp`, enrol/confirm/verify/recovery, replay guard (M, resized from L) → **A0.7** (new) TOTP web: enrolment wall, recovery code shown once, admin reset of a staff member's TOTP, email OTP kept as recovery (M).
- **A0.5** short admin sessions + 428 `REAUTH_REQUIRED` + `ReauthSheet` in `adminFetch` (M) — the HIGH actions of Waves 1–2 gain re-auth without code changes in their pages.
- **A0.6** staff list, access reviews, admin-wide search (`GET /api/admin/search?q=` typed hits; the shell search becomes real and works on phones) (M).
- **A3.2** `EntitlementService` over grants, highest wins, shadow comparison (M, resized) → **A3.6** (new) webhook writes `STRIPE_SUBSCRIPTION` grants, `features[]` on `GET /api/profile/version`, extension gates on features (M).
- **A3.4** Catalog page: products, prices with a debounced live margin bar, entitlements, override textarea below the floor (M, resized) → **A3.7** (new) publish to Stripe through `StripeGateway` (idempotency `price-{id}`), retire, `catalog_change` diff log, 390 px editor (M).
- **A3.5** re-home hard-coded config onto the catalog + `GET /api/catalog/public` → `/pricing` (M).
- **A5.7** feature registry: `FeatureDefinition` + `FeatureGate.require/limit` + `FeatureRegistryTest` (M, resized; the roadmap-parity test moves to A5.9) → **E2E-A5.1** (new) Settings › Features: per-plan matrix (catalog entitlements) + per-org overrides (`entitlement_grant`) + limits inline (M) → **A5.9** `GET /api/config/me` + `/api/config/public`, `useConfig()`, `JAF.config`, the `no-hardcoded-gate` lint + ArchUnit rule, `RoadmapSettingsParityTest` (M).
- **A2.4** comps: grant a plan for N days (`ADMIN_COMP`), role ceilings from `admin.comp_max_days.*`, HIGH above `admin.comp_reauth_days` (M; deps A3.2, A5.1, A0.5).
- **A2.2** Stripe reconcile job + webhook-failure strip with replay (M; deps A10.2).
- **A2.8** unit economics page: margin vs floor per product, cap-hit %, conversion, churn, alerts (M; deps A3.3, A4.2, A11.3, A5.1 — the B2.1/U18.1 deps are re-pointed to their admin twins).
- **A4.4** anomaly alerts with ack + digest delivery (M) · **A4.5** per-user AI controls throttle/pause/block (S; dep A0.5 kept — BLOCKED is HIGH).
- **A9.3** abuse controls: user flags, block, disposable-email blocklist setting (M; deps A9.2, A5.1 — A0.5 removed).
- **A9.4** privacy-request queue: table, intake (self-service rows written automatically), deadlines, verify/reject (M, resized) → **A9.9** (new) execute flows: EXPORT to S3 with a 7-day link, DELETE with the active-subscription 409 guard, both HIGH + typed confirm (M).
- **A11.4** Analytics page real: growth, DAU/WAU/MAU, feature engagement, cohorts, filters (M; deps A11.3) · **A11.5** Overview on rollups + attention counts in the bell (S; deps A11.3, E2E-A11.0; the A10.3 dep becomes `relates`).

**Wave 3 demo:** sign in as a new SUPPORT staff member → TOTP enrolment wall → recovery code → the sidebar shows only
Users / Customers / Bug reports / Inquiries / Audit (own) → try `DELETE` a user → 404 → an ADMIN deactivates a user
after 6 minutes → 428 → re-auth sheet → done → Catalog: edit Pro monthly to $19.00 → the margin bar turns red at
79.9 % → publish refused → override reason → HIGH audit → publish creates the Stripe test price → `/pricing` shows it
within 5 min → comp a user 14 days of Pro → `/api/profile/version` lists the features → AI: a fixture user spikes to
4× their median → `ai_alert` row → ack with THROTTLED → Privacy queue: an email-sourced DELETE → verify → execute →
the account is gone and the request row is COMPLETED.

### After Wave 3 (ordered, not sized here beyond the JSON)

A1.5 + A1.10 (new, web half) consented read-only view-as · A1.6 debug panel · A1.7 full timeline (needs A7.2) ·
A1.8 entitlement explainer + privacy summary · A2.5 promo codes · A2.6 cancellation reasons · A2.7 win-back · A2.9
CRM sync · A6.6 aggregator source type · A7.2 → A7.3 → A7.4 → A7.5 → A7.6 → A7.7 (mail log, deliverability,
templates, automations, campaigns read-only, notification etiquette) · A8.5 phone triage · A9.5 retention policies ·
A9.6 legal versions · A9.7 subprocessors · A9.8 (new) security policies tab from the tables · A10.3 backup/drill
status (after the human P0.1) · A10.5 incidents · A10.6 diagnostics · A12.4 flagged events + audit retention ·
A15.2 triage-first mobile home · A15.3 a11y/dark pass · A11.6 country/channel capture · A13.x experts · A14.x
organizations admin · A16.1 BI export.

### Wave sizes at a glance

| Wave | Stories | S / M | Lanes | Ends with |
|---|---|---|---|---|
| 1 | 18 | 2 / 16 | K, S, A, B | no sample on any admin page; Settings home v0; audit area/risk server-side; auth gaps closed |
| 2 | 20 | 2 / 18 | A, B, ext | flags, announcements, maintenance, ext remote config; security events; job + ops ledgers; AI caps; catalog schema |
| 3 | 23 | 2 / 21 | S, A, B, ext | staff roles + TOTP + re-auth; catalog page + grants; AI alerts; privacy queue; analytics real |

---

## 5. Decisions (recorded here so no session re-opens them)

| # | Decision | Why |
|---|---|---|
| D-1 | **Branch `admin-e2e` from `bddac23`**; PR into `develop` only when the user asks; one story = one commit (`admin-e2e: A12.2 …`), pushed on the branch. | Mirrors APP-E2E; both branches merge into `develop` independently (file ownership keeps them disjoint: APP-E2E owns `(app)`/`(org)`/`app-v3`/`org-v2`; this plan owns `(admin)`/`admin-v3`/`admin-shell`/`app/api/admin`/`Admin*` Java). |
| D-2 | **Settings home = one page `/admin/settings` with tabs** (Areas, Features, Flags, Announcements, Extension, Maintenance), not six pages. | One place to look; CLAUDE.md names "the app admin settings page" in the singular. |
| D-3 | **Reuse I1.9 as is**: `AdminSettingsWriter`, `app_setting_history`, `ResumeBuilderSettings` (renamed `SettingsService`, alias kept), `AiSettingKeys`; the audit action is `SETTING_CHANGE` for the generic endpoint, `AI_CONFIG_CHANGE` stays on the AI endpoints. | Nothing to migrate; the AI page and its tests keep working. |
| D-4 | **ROLE_ADMIN only until A0.3 (Wave 3)**; every new handler carries `@AdminArea` from Wave 1 so A0.3 is mechanical. No separate read-only support role before then. | Operator pages first; least privilege arrives before a second person is onboarded. |
| D-5 | **HIGH = reason required (and typed confirm when irreversible); re-auth arrives with A0.5** and changes nothing in the pages. | Lets Wave 1 ship audited HIGH actions without the TOTP platform. |
| D-6 | **No email masking in admin tables**; emails never in URLs; exports HIGH + audited; contents (resumes, bios, applications) never rendered in admin before A1.5. | Support needs the email to act; the risk is in exports and content, which are gated. |
| D-7 | **No decorative panels, not even labelled**: a panel without a source is removed and returns with its story (supersedes A15.4; `SampleTag` deleted end of Wave 1). | A labelled fake number is still a fake number on a production console. |
| D-8 | **Tile deltas come from `{value, previous}`** — previous-window queries in Wave 1, rollups (`metric_daily`) from A11.3 on; hidden when unknown. | Honest on day one; cheap enough at this size (a second count query per tile). |
| D-9 | **Mock API stays read-only for admin writes** (`403 DEMO_READ_ONLY`); Playwright intercepts writes; every GET has a fixture module. | Consistent with demo accounts being read-only everywhere; the `admin-ai.spec.ts` pattern already works. |
| D-10 | **List contract = APP-E2E's `ListPage<T>` + `useListQuery`** for every new admin list; legacy `x-total-count` arrays are kept until the page story moves them. | One hook renders every table; URL-synced filters for free. |
| D-11 | **Autosave everywhere on admin too**: triage fields, settings rows, log levels, AI budget = inline autosave with ✓ + undo; the only buttons are creators ("Add note", "Add source", "Declare incident") and HIGH confirmations. `InquiryFollowUp`, `BugTriageControl`, `AiQuotaControl` Save buttons go. | UX bar (memory: Gen Z / Notion-style). |
| D-12 | **Two kill-switch surfaces, one truth**: the AI page keeps its per-task switches; Settings › AI shows the same keys; both write the same `app_setting` row. | The operator who is on the AI page should not have to leave it; the Settings home must still be complete. |
| D-13 | **Platform AI caps default $40/day · $600/month**, free parsing keeps 10 % (PLAN-admin Q2's defaults become the setting defaults; the user changes them in Settings, not code). | Everything admin-configured. |
| D-14 | **Customers MRR = `AdminAnalyticsService.billing()`** (configured prices, 3-month ÷ 3) until A3.5 re-homes prices on the catalog; no second MRR formula. | One number on two pages. |
| D-15 | **Email page = Subscribers only** until `mail_log` exists; no campaign sender in admin, ever (Brevo runs campaigns, admin reads them). | `email-notification-operations.md` D4; 300/day Brevo cap. |
| D-16 | **Job sources: ATS public JSON only, never scraping**; "LinkedIn/Indeed/Workday" rows from the board are not built; the aggregator is a source type later (A6.6). | CLAUDE.md. |
| D-17 | **L stories split into two M stories** with new ids (A0.7, A3.6, A3.7, A9.9, A1.10) rather than suffixes, so the generator and the id scheme stay intact. | One Sonnet session per story. |
| D-18 | **15.1c backups (A10.1 / P0.1) stay a human runbook in the plat lane**; admin only *reads* the evidence (A10.3) and shows red "Not configured" until then. | Never green by default. |
| D-19 | **Security page honest v0 before `security_event`** (E2E-A9.0 in Wave 1): sessions across users, staff, policies are real today; events/blocked IPs arrive in Wave 2. | The nav "Soon" pill goes in Wave 1; operators get session revoke now. |
| D-20 | **Audit `area`/`risk` are stored at write time from the `AdminActions` enum**, never derived from the action string on the client. | The client regexes were a guess. |

## 6. Decisions for the user (defaults apply until you say otherwise)

| # | Question | Default | Blocks |
|---|---|---|---|
| Q-1 | **Platform AI caps**: $40/day and $600/month as the setting defaults, and a breach pauses *all* server AI except the reserved 10 % for free resume parsing (not just paid features)? | **Yes** — both are settings (`ai.daily_cost_cap_cents`, `ai.monthly_cost_cap_cents`, `ai.free_parse_reserved_pct`), change them in Settings › AI after A4.3. | nothing (A4.3 ships with the defaults) |
| Q-2 | **TOTP mandatory for all staff, email OTP only as recovery; the break-glass account is a separate login from your daily admin account?** | **Yes / separate login** (rbac doc D3, D7). | A0.4/A0.7 (Wave 3) |
| Q-3 | **Rate limiting on in production from A0.2** (keyed on the shared Caddy's `X-Real-IP`): defaults `authenticate` 30/h, `mfa` 10/h, `google` 30/h, `refresh` 120/h, `inquiries` 5/h, `bug_reports` 10/h, `newsletter` 10/h per IP? | **Yes, with those numbers** as the `ratelimit.*` setting defaults; tune in Settings › Rate limits after A5.2. | A0.2 (Wave 1) — ships with the defaults either way |
| Q-4 | **Privacy requests by email**: who verifies identity (you, or SUPPORT after A0.3), and is 30-day GDPR / 45-day CCPA the published deadline? | **ADMIN verifies until SUPPORT exists; 30/45 days** (`security-compliance-operations.md` D5). | A9.4 (Wave 3) |
| Q-5 | **Analytics country/channel charts**: capture `CF-IPCountry` + UTM at signup later (A11.6, P2) — until then the two panels are **removed**, not decorative? | **Remove** (D-7). | nothing |
| Q-6 | **Admin-wide search** (A0.6) returns users, customers, inquiries, bug reports — should it also search resumes by title? | **No** (contents never in admin; titles are metadata but not needed for support). | A0.6 (Wave 3) |
| Q-7 | **Demo admin in the mock stays read-only** (D-9) or should `dev:demo` accept admin writes in memory so the Settings home can be demoed without a real API? | **Read-only** — demoing a write = the real API locally (`api-local` launcher from I1.14). | nothing |
| Q-8 | **The Settings home shows the resume-builder keys (`resume.*`, `profile.*`, `tracker.*`) too** — they are already in the registry — or only "platform" areas? | **Show everything the registry declares**; the area rail keeps them findable. | A5.8 (Wave 1) |

## 7. Non-goals (not in these waves, by decision)

- No log-in-as / impersonation (ever); read-only consented view-as is A1.5/A1.10 after Wave 3.
- No in-admin email campaign sender, template HTML editor, or bulk sends.
- No Coach tier, no CRM UI (A2.9 pushes to the user's own CRM later), no packages/bundles UI (empty `bundle_item`).
- No editing of secrets, AI prompts, security rules, schema or adapter code from admin (ADMIN-PLAN 9.B "keep out").
- No separate admin subdomain or app; the `(admin)` route group stays.
- No ML anomaly detection; rules only (A4.4).
- No Prometheus/Grafana; host stats and request metrics are read by the API itself (A10.3/A10.4).
- No org/tenant admin (A14.x) before the O* org model and Wave 5 of APP-E2E.
- No scraping job sources; no permanent IP bans from the UI.

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | A page story removes a sample panel but the data source it names slips a wave → the page is honest but thin | Acceptable by D-7; the story's PR lists what returns with which story; the smoke spec asserts no sample imports, not panel counts |
| R-2 | `SettingsService` rename breaks the resume builder's 40 call sites | Alias type kept one wave; `ResumeBuilderSettingKeysParityTest` and the builder's tests must stay green in A5.1's AC |
| R-3 | `@AdminArea` marker forgotten on a handler | `AdminAreaCoverageTest` (reflection) fails the build from A12.2 on |
| R-4 | Audit backfill of `area`/`risk` for old rows mis-maps an action | the changeset maps by exact action name from the enum; unknown names get `area=other, risk=LOW` and the IT asserts the count of unmapped rows is 0 on the fixture |
| R-5 | Two branches (`app-e2e`, `admin-e2e`) touch `mock-api.mjs`, `AdminShell`, `packages/ui` | admin fixtures live in separate modules registered in one block; `AdminShell` is admin-owned; `packages/ui` changes are additive and named in E2E-A15.0 only |
| R-6 | Playwright a11y gate turns every admin page red on day one | A15.1's spec lists routes in wave order; a route is enabled in the spec by the story that fixes it; CI fails only on enabled routes |
| R-7 | Rate limiting on in prod (A0.2) locks the shared-box NAT users out | `security.failed_login_block_threshold` and `ratelimit.*` are settings; blocks are temporary (1 h) and liftable (A9.2); the Caddy `X-Real-IP` key is asserted by `RateLimitFilterIT` |
| R-8 | The platform AI cap (A4.3) pauses onboarding parsing | the reserved slice (`ai.free_parse_reserved_pct`, default 10) is asserted by `AiPlatformCapIT` |
| R-9 | Memory on the shared box (3.7 GB) with new jobs (rollups, retention, host stats) | daily rollups + minute buckets with short retention per the designs; every job is pausable from the registry |

## 9. UX bar — applies to every story in §4

APP-E2E-PLAN §7 applies verbatim (autosave, undo not confirm, tooltips + `aria-label`, honest empty states,
phone-first 390 px, optimistic UI with rollback, copy limits, every number from an endpoint, admin-configured
numbers). Admin specifics:

1. **Reason sheets, not modals with checkboxes**: a HIGH action opens `ReasonSheet` with one sentence of consequence
   and one required field; turning something *on* never asks.
2. **Tables collapse to cards** under `md` with the two columns that matter and a details sheet; every row action is
   reachable with a thumb.
3. **Dark mode and axe** are part of done from A15.1 on (`expectAccessible` in every admin spec).
4. **Delight, honestly**: the hero's handwritten note stays; a ✓ that fades, an undo toast that counts down, a
   "nothing needs you right now" empty state on queues — never a confetti burst for a deactivation.
5. **Numbers only when real**; zero is a number ("0 failed webhooks · last 24 h").
