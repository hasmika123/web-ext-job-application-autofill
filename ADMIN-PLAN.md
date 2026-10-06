# ADMIN-PLAN.md — Admin console, ops & comms (Phase 9)

> Standalone plan for the Kiwiply admin side. Companion to `ROADMAP.md` (architecture),
> `PROGRESS.md` (task tracker), `CLAUDE.md` (conventions). Build in the one-task-per-commit
> loop; prefix commits `phase9.<n>: …`.

## Locked decisions (2026-06-28, user-confirmed)
- **PII access = metadata + reason-gated.** Admins see metadata (labels, counts, status) by
  default; viewing actual resume/bio **contents** requires a logged reason. (GDPR data
  minimization + accountability.)
- **Location = in-app `/admin` route group** in the existing Next app (not a separate app
  yet). Distinct admin shell. Subdomain split (`admin.kiwiply.com`) is a later option.
- **Order = A0 security fix first, then A1**, then A2→A5.
- Two near-term user-facing features ride alongside: **Email Subscription (A4)** and **Bug
  report (A5)**.

## What already exists (leverage — do NOT rebuild)
- **Roles**: `ROLE_ADMIN` / `ROLE_USER` (`AuthoritiesConstants`). `SecurityConfiguration`
  already locks `/api/admin/**`, the generated entity CRUD, `/v3/api-docs`, and
  `/management/**` to ADMIN.
- **User management API**: `UserResource` → paginated list + create/update/delete at
  `/api/admin/users` (ADMIN-gated).
- **Role detection in web**: `GET /api/account` returns `authorities` → the web can gate an
  admin UI on `ROLE_ADMIN`.
- **Ops endpoints**: actuator `health` / `info` / `jhimetrics` / `prometheus` / `loggers`.
- **Reusable services**: `AccountDeletionService` (GDPR erase), `RefreshTokenService`
  (revoke a session/family), `MailService` (Brevo — reuse for subscription + bug mail),
  `AiUsage` table (per-user usage), `ProfileService`.

## 🔴 A0 — Critical security gate (do before anything else)
`config/liquibase/data/user.csv` + `user_authority.csv` load in the **initial changeset
with no `context`**, so the default **`admin` / `admin`** account (JHipster's publicly known
bcrypt hash) exists in **production**. An admin console on top of this is wide open.

**Fix:**
- Gate the seed `loadData` to `dev`/`faker` context (or add a migration that deletes/rotates
  the default `admin` + `user` rows in prod).
- Bootstrap the real admin via **env-driven credentials** (e.g. a startup `ApplicationRunner`
  that creates/updates the admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`, or a one-off
  documented migration). Never ship a known password.
- Verify on the live VPS that no `admin/admin` login works after deploy.

## Architecture & placement
- `(admin)` **route group** in the Next app with a layout that reads `/api/account`
  authorities and **404s non-admins** (UX). Real enforcement stays server-side: Spring's
  existing `/api/admin/**` ADMIN rule.
- Data path unchanged: browser → Next `/api/admin/*` BFF → Spring `/api/admin/*`.
- New Spring controllers under `/api/admin/*` are **auto-gated** by the existing rule.
  DTOs only; Spring `Pageable` for lists (JHipster pattern).

## Functionality by domain
| Area | Functionality | Leverage |
|---|---|---|
| Users & accounts | search/paginate; detail: activate/deactivate, resend activation, trigger reset, grant/revoke admin, force-logout (revoke refresh families), delete (GDPR), **export user data (DSAR)** | `UserResource`, `RefreshTokenService`, `AccountDeletionService` |
| Data/content (PII) | per-user resume **metadata**, app counts by status, bio strength — contents only via reason-prompted, audited action; orphan-S3-blob cleanup | `ProfileService`, S3 layer |
| AI usage & cost | `ai_usage` per user/period, totals, top users, trend, per-user quota override | `AiUsage`, `AiDraftService` |
| Security & sessions | active refresh-token families + revoke; reuse/anomaly events; rate-limit counters; failed logins | `RefreshTokenService` |
| System & ops | health, metrics, runtime log-level, Liquibase status, build info (read-only) | actuator |
| Business analytics | signups, activation rate, DAU/WAU, funnel (signup→activate→profile→first fill→applied), resumes saved, apps created | DB aggregates + GA |
| Email subscription | subscribers, consent, export, Brevo sync, campaigns | A4 |
| Bug reports | triage queue | A5 |
| Audit log | every admin action + PII access (who/what/when/target/**reason**), viewable + exportable | new, required |

## UI
- Admin shell reusing `ui/` primitives + the `AppShell` pattern, **visually differentiated**
  (Admin badge / distinct chrome). Sidebar: Overview · Users · AI · Security · Email · Bug
  reports · System · Audit.
- Reuse: server-paginated tables w/ search/filter, detail slide-overs, **type-to-confirm**
  destructive actions, `Skeleton`/`EmptyState`, toasts. Add: CSV export, and a **"reason for
  access" modal** before any PII view. Desktop-first.

## Backend logic
- Controllers: `AdminOverviewResource` (aggregates), user-detail/actions, `AdminAiUsageResource`,
  `AdminSessionResource`, `AdminSubscriberResource`, `AdminBugReportResource`,
  `AdminAuditResource`.
- **Audit**: `AdminAuditEvent` entity written on every admin mutation + PII read (or adopt
  JHipster `PersistentAuditEvent`). Immutable + retained.
- Light `@Scheduled` rollups / Brevo sync.

## Legalities & security
- **A0 default-admin fix** (above) — prerequisite.
- **Admin auth hardening**: strong sign-in, **MFA for admins**, optional IP allowlist,
  rate-limited admin login, short sessions, **re-auth for sensitive actions**; consider tiered
  roles (super-admin vs support).
- **PII minimization (Art. 5)** + **accountability (Art. 30/32)**: metadata default,
  reason-logged contents access, immutable audit trail with retention.
- **Purpose limitation + disclosure**: admin processing limited to operating/supporting the
  service; **update `/privacy` and `/terms`** ("who can access your data and why").
- **DSAR**: add export-a-user's-data (delete already exists) within statutory windows.
- **Impersonation/"view as"**: defer, or read-only + heavily audited.
- **Processors**: ensure DPAs for Brevo + AWS S3.

## A4 — Email Subscription
- **Model** `email_subscriber` (email, status PENDING/CONFIRMED/UNSUBSCRIBED, consent_source,
  consent_at, confirm_token, confirmed_at, unsubscribed_at) = source of truth, synced to a
  **Brevo list** for sending.
- **Flow**: public opt-in (footer form + a *separate, unticked* checkbox at signup) →
  **double opt-in** confirm email → tokenized one-click unsubscribe (no login).
- **Endpoints**: `POST /api/newsletter/subscribe` (public, rate-limited), confirm, unsubscribe;
  admin list/export/segment.
- **Legal**: explicit opt-in recorded (timestamp/source), unsubscribe in every email,
  suppression list, sender identity + **physical postal address** (CAN-SPAM / ePrivacy),
  marketing consent kept **separate** from the service account.

## A5 — Bug report
- **Model** `bug_report` (user_login nullable, email, message, category/severity, url,
  app_version, user_agent, optional console excerpt + screenshot_key, status
  NEW→TRIAGED→IN_PROGRESS→RESOLVED/WONTFIX, admin_notes).
- **Capture**: "Report a bug" in the web (help menu/footer) **and** the extension popup;
  auto-attach context (URL, app/ext version, browser) **with consent**; optional screenshot
  (type/size-capped → S3).
- **Submit**: `POST /api/bug-reports` (auth optional, rate-limited, spam-guarded), optional
  Brevo notification to support@. Admin triage queue with status/notes.
- **Legal/security**: reports can contain PII/secrets → access-controlled, retention-limited,
  sanitize captured data, disclosed in privacy policy.

## Phasing (each = its own commit, `phase9.<n>:`)
- **A0** — kill default admin seed + env-bootstrap real admin. *(security gate)*
- **A1** — admin gate + shell + Users list/detail (reuse `/api/admin/users`) + **audit-log foundation**.
- **A2** — AI usage + sessions/security + system/ops dashboards.
- **A3** — business-analytics overview.
- **A4** — Email subscription (public + admin).
- **A5** — Bug reports (capture + triage).
- **Cross-cutting** — MFA for admins, privacy/terms updates, DSAR export.

## Phase 9.B — Admin expansion (brainstorm 2026-10-05)

> **Rule of thumb:** if it's a number, a switch or some wording we may want to change without a
> deploy, it belongs in admin. If it's a secret, security logic, a prompt or code, it stays in
> code or env. Phase 9 (A0–A5) built users, AI usage, analytics, audit, bug reports, subscribers,
> system and job sources. Phase 18.4 adds the product catalog with its margin guard. This section
> covers what is still hard-coded or missing.

**The mechanism (built once in 9.B1, reused by everything below):**
- An `app_setting` table holds: key, typed value, default, **min/max bounds**, description, and
  who changed it and when. Values are cached in memory for about a minute.
- **Env values stay as the defaults.** An admin value overrides its env default, and every change
  is written to the audit log.
- Bounds stop a typo from becoming an outage or a cost spike. For example, the soft cap must stay
  between 50 and 95 %, and the poll interval can't go below 5 minutes.

| # | Area | What goes in admin | Why | When |
|---|---|---|---|---|
| **9.B1** | **Runtime settings** | AI: model per task, economy model, soft-cap %, per-feature kill switches, free parse quota, output-token caps. Job matching: score threshold (60), candidates per user (50), posting age (48 h), daily target. Inbox: poll interval, retention, backfill. Rate limits. Error-digest recipient and interval | Today these are env vars: each change means editing `.env` and restarting the API. The next Gemini model retirement then becomes a 30-second admin change | After Launch 1, alongside 18 |
| **9.B2** | **Feature flags + announcements + extension remote config** | Flags (on/off, per % of users, or per user for beta testers), so Autopilot can launch as a beta. A site-wide **banner** on the web and in the extension drawer (e.g. "Workday filling is degraded"). Extension **minimum version** with an update prompt. **Per-ATS kill switch**: switch off one adapter remotely when an ATS changes its markup (data only, no remote code: CWS rule) | Turn things off and tell users without a release or a store review | After Launch 1, before 19 |
| **9.B3** | **Support toolkit** | On a user's page: resolved entitlements with "why does this user have X" (which grant from which source), and subscription status with a Stripe link. Actions: **comp** a plan for N days (`ADMIN_COMP` grant), reset or extend an AI budget, resend emails. **Promo codes** (Stripe coupons) created from admin | Most support tickets are "fix my access" or "give them a month" | With 18 |
| **9.B4** | **Unit economics + cost alerts** | Live revenue, AI cost and margin per product **against the 80 % floor**. **% of users hitting their AI cap** (the expansion plan's watch metric). Conversion, churn. Email alerts when a product's actual margin falls below the floor, a user's daily spend spikes, or total daily AI cost passes a threshold | Turns "costs can't run away" into something we watch, not hope for | With 18 |
| **9.B5** | **Scheduled jobs + health** | Every scheduled job (job fetch, matching, inbox poll, error digest, backups) with last run, result, **run now** and **pause**. Last backup and last restore-drill result. Brevo daily send count vs quota, bounces and complaints | One screen answers "is everything running?" | Soon after Launch 1 |
| **9.B6** | **Legal versions + acceptance** | Publish a new Terms / Privacy version from admin. Record **which version each user accepted, and when**; material changes prompt re-acceptance | Evidence for billing disputes and org contracts; standard practice | Before 20 |
| **9.B7** | **Admin roles** | Split `ROLE_ADMIN` into super-admin / support / finance / expert manager, each seeing only its own pages | Needed once experts (20) and orgs (21) exist; least privilege | Before 20 |
| **9.B8** | **Abuse controls** | Block or flag a user; disposable-email blocklist at signup; Autopilot misuse flags (e.g. hitting the daily cap every day) | Protects ATS reputation and our cost floor | With 19 |
| later | Email template editor (subject/body with preview) · help/FAQ + video-tutorial CMS | Nice to have; Brevo templates cover it for now | Later |

**Keep out of admin (decided):** secrets and API keys (env only), AI **prompts** (code + tests,
because a bad edit silently breaks output quality), security rules, DB schema, and adapter code.

## Open questions (revisit before A1)
- MFA mechanism for admins (TOTP vs email OTP) — and now vs A2.
- Audit storage: new entity vs JHipster `PersistentAuditEvent`.
- Subscriber sending: campaigns via Brevo UI initially vs in-admin send.
