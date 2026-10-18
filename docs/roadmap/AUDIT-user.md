# AUDIT — area `user` (job-seeker dashboard, auth, account, web↔extension)

Written 2026-10-11 against branch `product-roadmap` (= `resume-builder` = `version2` + design docs).
Method: every route under `web/src/app/(app)/**`, the auth routes, `/connect`, `/billing/*`, and the
API/Liquibase surface they call. State legend: **real** = real data + API + tests · **partial** =
UI exists but some data is `SAMPLE` / client-only / endpoints missing · **missing** = board page with
no backing at all (or no page). Evidence paths are relative to the repo root.

Companion: `docs/roadmap/PLAN-user.md`, `docs/roadmap/areas/user.json`, `docs/design/user/*.md`.

## 0. What is real underneath (reusable foundation)

| Capability | Evidence | Notes |
|---|---|---|
| Session gate + silent refresh | `web/src/app/(app)/layout.tsx`, `web/src/proxy.ts`, `web/src/lib/cookies.ts` | 15-min access / 90-day rolling refresh, httpOnly cookies, gate = `/api/account` probe |
| Password + Google sign-in, admin email-OTP MFA, forgot/reset | `api/.../web/rest/AuthenticateController.java`, `GoogleAuthController.java`, `web/src/app/api/auth/*`, `web/src/components/auth/*` | Apple/LinkedIn buttons only toast "Not available yet" (`SocialRow.tsx`) |
| Signup → email activation (Brevo) | `AccountResource.register/activate`, `web/src/app/account/activate`, `ActivateSignInLink.tsx` | Activation is the gate (locked) |
| Account, change password, delete (GDPR), DSAR export | `AccountResource`, `AccountDeletionResource`, `AccountExportResource`, `web/src/app/api/account/*` | |
| Profile (`bio.payload` flat keys) + version fingerprint | `ProfileResource` (`GET/PUT /api/profile`, `/version`), `ProfileService`, `ProfileVersion` | Extension mirror reads this |
| Resumes (upload, parse, AI parse, file, ATS score, tailor, fit) | `ResumeResource`, `ResumeFileResource`, `AtsScoreResource`, `ResumeTailorResource`, `JobFitResource`, `ResumeMatchResource` | Resume Builder (R0–R7) sits on top |
| Applications CRUD + count + attachment + sync from extension | `ApplicationResource`, `ApplicationSyncResource`, `ApplicationAttachmentResource`, Liquibase `20260621022318_*Application*`, `20260630000000_application_attachment.xml`, `20260702…job_meta`, `20260703…salary` | Statuses: `DRAFT, SAVED, APPLIED, INTERVIEW, OFFER, REJECTED`; **no notes, no status history, no interview rows** |
| Learned answers → profile suggestions | `ProfileSuggestionResource`, `20260922010000_profile_suggestion.xml` | Dashboard "We learned N things" card |
| Billing (Stripe, webhook, portal, 402 gates, plan on version) | `BillingResource`, `BillingWebhookResource`, `EntitlementService`, `web/src/lib/billing.ts`, `components/billing/*` | Keyless in dev; 15.4 checklist pending |
| AI metering/budget/kill switches/usage meter | `AiBudgetService`, `AiMeteringService`, `service/ai/*`, `GET /api/ai/usage`, `components/settings/AiUsageMeter.tsx` | Per-billing-period budget; % not dollars |
| Job sources + nightly ingest (Greenhouse/Lever/Ashby) + nightly match | `service/jobs/*`, `JobMatchResource`, `20260922070000_job_sources.xml`, `20260922080000_job_matches.xml`, `config/job-sources.csv` (219 boards) | Opt-in, Pro only, ≤ 50 candidates, in-app only; no search endpoint, 7-day keep |
| Inbox over IMAP (connect, poll, classify, suggestions, per-application mail) | `service/inbox/*`, `InboxResource`, `InboxMailResource`, `20260922100000_inbox_connection.xml`, `20260923010000_inbox_messages.xml`, `20260923020000_inbox_parse.xml` | Pro only; bodies only for job mail; 12-month expiry |
| In-app notifications + bell + interview/offer email | `NotificationResource`, `NotificationService`, `20260923030000_notifications.xml`, `components/app-shell/NotificationBell.tsx` | One channel matrix hard-coded; no prefs, no push, no digest, no quiet hours |
| Web → extension signal, `/connect` handoff, extension token | `web/src/lib/extension-signal.ts`, `web/src/app/connect/page.tsx`, `web/src/app/api/extension/token/route.ts`, `POST /api/extension/session` | |
| GA4 helper (dark by default) | `web/src/lib/analytics.ts` | No first-party event pipeline; no product funnel for the user area |
| Rate limiting (auth BFF, per IP, in-memory) | `web/src/lib/rate-limit.ts` | Single-instance only |
| Demo accounts | `DemoResource`, `DemoGuard`, `web/src/lib/demo*.ts` | Read-only demo |
| Tests | web: `tsc + eslint` only (no unit/e2e); API: JUnit + Testcontainers ITs per resource | **No web component or e2e tests exist** |

Not present anywhere: PWA manifest / service worker / push subscriptions · passkeys · user-facing
sessions list · notification preferences · job search endpoint · saved searches/alerts · assistant
threads · interview rows · application notes/history · explore content · i18n · dark mode in the
signed-in app (`theme-v2` is light; `.dark` tokens exist in `globals.css` but unused here).

## 1. Page-by-page

| Route | Board | State | Real today | Sample / client-only / missing | Evidence | Gaps → stories |
|---|---|---|---|---|---|---|
| `/dashboard` | app-v3 1 | **partial** | first name + greeting; 4 stat tiles, activity bars, status donut, recent applications computed from `/api/profile/applications`; profile-strength checklist from bio + resumes; "We learned N things" from `/api/profile/suggestions`; recommended = Pro matches | upcoming interviews (no interview table), job alerts widget, AI-insights rows, sample fallback whenever the list is empty | `web/src/app/(app)/dashboard/page.tsx`, `components/app-v3/home/{DashboardPage,compute,Greeting,ActivityCard}.tsx`, `app-v3/sample-data.ts` | U3.1–U3.5 |
| `/jobs` (+ `?q=`, `?job=`) | app-v3 2 | **partial** | Pro: real nightly matches via `loadJobs()` → `/api/profile/job-matches` (score, reason, save/dismiss); detail panel opens employer URL | **no search backend**: query + filter rail + sort + pagination run client-side over `V3_JOBS` sample (30 rows standing in for "1,234 jobs found"); Free always sees sample; salary slider, experience level, company filter are decorative; "+" collection toast | `(app)/jobs/page.tsx`, `components/app-v2/jobs/data.ts`, `app-v3/jobs/{JobsPage,FilterRail,JobDetail,JobRow,filter}.tsx` | U4.* (critical) |
| `/jobs/[id]` | — | redirect → `/jobs?job=` | | | `web/src/lib/legacy-redirect.ts` | — |
| `/matches`, `/board`, `/ai-apply`, `/interviews`, `/resume`, `/ai-tools`, `/insights`, `/companies`, `/networking`, `/learning`, `/profile` | — | redirects | kept for extension/email links | | `lib/legacy-redirect.ts` | keep |
| `/applications` | app-v3 3 | **partial** | real list mapped (status chip, applied date, tab counts); PATCH status via `/api/applications/[id]`; per-application Emails + "From your inbox" suggestions exist as components (`components/board/ApplicationEmails.tsx`, `SuggestionsCard.tsx`) but are **not rendered on the v3 page** | sample rows when empty; "Next step" derived only from status; no notes, no status timeline, no interview scheduling, no attachments UI on v3, no bulk actions, no mobile swipe; `components/ApplicationBoard.tsx` dead weight | `(app)/applications/page.tsx`, `app-v3/applications/ApplicationsV3Page.tsx`, `app-v2/applications/mapping.ts` | U6.* (critical) |
| `/profiles` | app-v3 4 | **partial** | overview card from `/api/account` + `/api/profile` (name, email, location, links); completeness tiles derived in `profiles/derive.ts`; resume versions real when present | tabs Personal/Work/Education/Skills/Projects/Preferences show "Editing: coming soon"; "Multiple profiles" row is sample (design says **no profile variants** — a target is a resume); Linked Profiles "Connect" toasts; public profile preview is sample copy | `(app)/profiles/page.tsx`, `app-v3/profiles/{ProfilesPage,OverviewTab,derive}.tsx` | R1.1–R1.6 own the editors; U13.* only integration (visibility toggle, links, dashboard hook) |
| `/assistant` | app-v3 5 | **missing** | first name | chat is client state; reply is a canned string (`ASSISTANT_CANNED`); recent chats sample; no API, no persistence, no AI call | `(app)/assistant/page.tsx`, `app-v3/assistant/AssistantPage.tsx`, `sample-data.ts:403` | U8.* (critical) |
| `/alerts` | app-v3 6 | **missing** | — | all alerts, toggles, create/edit dialog, notification-settings tab are `useState` over `ALERTS` sample; nothing persists, nothing fires | `app-v3/alerts/AlertsPage.tsx` | U7.* (critical) |
| `/resume-builder` | app-v3 7 | **partial** → R-epics | real resume list for "versions"; Edit/Create open `ResumesWorkspace` (upload-first) | section editor text is sample; AI buttons toast; Save = session only; templates decorative | `(app)/resume-builder/page.tsx`, `app-v3/resume-builder/*` | R0–R7 (`docs/resume-builder/stories.json`) — not re-planned here |
| `/resumes` (legacy, not in nav) | — | **real** | upload/parse/AI parse, default, archive, ATS score, tailor | | `(app)/resumes/page.tsx`, `components/ResumesWorkspace.tsx` | R2.6 replaces the list |
| `/interview-prep` | app-v3 8 | **missing** | — | modes, question sets, popular questions, sessions, progress ring all sample; Start → "Coming soon" | `app-v3/interview-prep/InterviewPrepPage.tsx` | U9.* |
| `/messages` | app-v3 9 | **missing** | — | conversations + thread sample; send appends locally; note "Messaging launches with Inbox v2" | `app-v3/messages/MessagesPage.tsx` | U10.* (reads inbox threads) |
| `/saved` | app-v3 10 | **partial (data exists, not wired)** | API has `status=SAVED` applications and `POST /api/profile/job-matches/{id}/save` | page renders `V3_SAVED_JOBS` sample with local remove/override state; tabs To Apply/Applied/Not Interested not backed | `app-v3/saved/SavedV3Page.tsx` | U5.* |
| `/explore` | app-v3 (board-4) | **missing** | — | companies/roles/paths/resources sample; every click "Coming soon" | `app-v3/explore/ExplorePage.tsx` | U11.* |
| `/analytics` | app-v3 (board-4) | **partial** | counts, status breakdown, applications-over-time, response-by-company computed from applications (`analytics/compute.ts`) | sample numbers when no submitted applications; "Skills in demand" always sample; time-range selector toasts; no per-resume / per-ATS rates (needs inbox + fill events) | `(app)/analytics/page.tsx`, `app-v3/analytics/*` | U12.* |
| `/settings` | app-v3 (board-4) | **partial** | Account form (name/email/phone/location/tz via `/api/account` + `/api/profile`), AI usage meter, Billing card (plan, portal, upgrade), Inbox status, Autofill prefs, Delete account, Data export link | Notifications, Privacy, Job Preferences, Help & Support panels = "Coming soon" (`settings/panels.tsx`); no sessions/devices, no passkeys, no email change, no theme toggle | `(app)/settings/page.tsx`, `app-v3/settings/{SettingsV3Page,panels}.tsx` | U14.*, U1.*, U7.6 |
| `/settings/inbox` | — | **real** | guided Gmail app-password connect, test, disconnect, email on/off | | `(app)/settings/inbox/page.tsx`, `components/settings/InboxConnect.tsx` | U6.7 (mobile pass) |
| `/welcome` | — | **real** | six one-tap questions (Tier A) + EEO; writes `bio.payload`; dashboard sends new users once | not a full first-run (no "what are you looking for", no resume step, no extension install step, no instant jobs) | `(app)/welcome/page.tsx`, `components/onboarding/Onboarding.tsx` | U2.* (critical) |
| notifications bell | shell | **real** | list + read + read-all from `/api/notifications` | no preferences, no push, no digest | `components/app-shell/NotificationBell.tsx` | U7.* |
| top-bar search | shell | **partial** | routes to `/jobs?q=` | no backend | `AppShell.tsx` | U4.2 |
| sidebar plan card / Pro pill | shell | **real** | `getPlan()` once per layout | | `components/app-v2/common/PlanCard.tsx` | — |
| `/login` | app-v2 auth | **real** | password (username or email), MFA step (admins), Google GIS, demo card, `next=` | Apple + LinkedIn toast; no passkeys; no "remember this device" | `web/src/app/login/*`, `components/auth/*` | U1.1–U1.4 |
| `/signup` | app-v2 auth | **real** | full name → first/last, email, password, newsletter opt-in, activation "Almost there" | Apple/LinkedIn toast; no passkey-first signup; no disposable-email block; password strength UI minimal | `web/src/app/signup/*`, `web/src/app/api/auth/signup/route.ts` | U1.*, U2.1 |
| `/forgot-password`, `/reset-password` | — | **real** | | | `components/auth/{ForgotPasswordForm,ResetPasswordForm}.tsx` | — |
| `/account/activate` | — | **real** | activation + sign-in link | activation does not auto-sign-in on the same device | `web/src/app/account/activate`, `components/auth/ActivateSignInLink.tsx` | U2.2 |
| `/connect` | — | **real** | mints extension token pair and hands over via `externally_connectable` (Chrome) / relay (Firefox) | no "no extension found" phone path; depends on `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` at build | `web/src/app/connect/page.tsx` | U20.* |
| `/pricing`, `/billing/success` | — | **real** | catalog, checkout, poller | in-app upgrade sheet on 402 is a redirect to `/pricing` (leaves the app) | `components/pricing/*`, `components/billing/*` | U15.* |
| `/contact`, `/privacy`, `/terms` | marketing | real | | privacy page lacks a "what we store / who sees it" plain-language section for the app | `(marketing)/*` | U14.5 |

## 2. Cross-cutting gaps

| Topic | State | Evidence | Stories |
|---|---|---|---|
| Mobile shell (bottom nav, thumb-zone actions, bottom sheets) | missing — the sidebar becomes an off-canvas drawer below `lg`; no bottom tab bar; tables → cards only on some pages | `AppShell.tsx:146`, APP-V2-SPEC §1.6 | U0.1–U0.4 |
| Dark mode in the app | missing (light-only `theme-v2`) | `globals.css:6` | U0.5 |
| Accessibility (focus order, SR labels on icon buttons, 44 px targets) | unverified (HANDOFF-V2 "never verified") | `docs/HANDOFF-V2.md` §2 | U19.1–U19.2 |
| i18n readiness | missing (hard-coded strings, `langKey` on `User` unused) | `User.java:65` | U19.4 |
| Product analytics events | missing (GA4 helper only, dark) | `web/src/lib/analytics.ts` | U18.* |
| PWA / push / offline | missing | `web/public/` has no manifest or sw | U17.* |
| Performance budgets / Lighthouse CI | missing | `.github/workflows/ci.yml` (tsc/eslint/build only) | U17.5 |
| Web tests (unit/e2e) | missing | `web/package.json` scripts | U19.3 |
| Engagement (streaks, goals, weekly recap, referrals) | missing (ROADMAP 16.3/16.4 planned) | ROADMAP Phase 16 | U16.* |
| Feature flags / announcements for users | missing (ADMIN 9.B2 planned) | `ADMIN-PLAN.md` 9.B2 | A-area dep |
| User security: sessions list, passkeys, email change, new-device alerts | missing (admin has session revoke) | `AdminSessionService.java` | U1.* |

## 3. Honest status counts for the stories in `areas/user.json`

Counted after writing the plan (see `PLAN-user.md` §5): **done** = stories whose AC are already met
by real data + API + tests (welcome Tier-A, inbox connect, billing card, notifications bell, auth
basics); **partial** = board page exists on sample or client state; **not_started** = everything else.
