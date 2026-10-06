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
- **Impersonation/"view as"**: decided 2026-10-05: no log-in-as. Read-only "view as" that the
  user grants, time-limited and audited (9.C3).
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

## Phase 9.C — Customers, support & retention (planned 2026-10-05)

> **Why:** payments go live in 15.4, and today admin can't show *who* is paying, whose card
> failed, or what we've told them. The Revenue card only has totals. The user page has account
> actions (activate, password-reset email, admin role, force logout, delete) but nothing about
> billing. Bug reports and inquiries aren't tied to a person, and fill telemetry is anonymous.
> 9.C fixes that. **9.C1 must ship before 15.4 switches on live keys.**

**Decisions (recommended 2026-10-05):**
- **No "log in as the user."** Signing in as someone else would let an admin act, and possibly
  apply, in their name, which conflicts with our no-submit stance. It is also a common source
  of security and privacy-policy problems. Instead, **support access** works like this:
  - The *user* grants it from Settings ("let support see my account for 24 hours").
  - The admin then gets a **read-only "view as" mode**: the user's dashboard, board, resumes,
    matches and settings, exactly as they see them, under a banner. Nothing can be changed or
    submitted from it.
  - Every view is audited, with a reason. Access ends automatically, or when the user revokes it.
- **Admins never see or set passwords.** "Reset password" sends the user the normal reset
  email (already built). An admin can also resend the verification email, or change the
  account's email; the change only takes effect once the new address is verified.
- **Money moves in Stripe, not in admin.** Refunds and charge disputes happen in the Stripe
  dashboard (one click away). Admin records *why*, in a note on the customer's timeline.
- **Offers are admin-only.** Comps and promo codes are tools for support and campaigns. They
  are not a public free trial: the "no free trial" rule stands.
- **CRM: keep the operational part here, sync the relationship part out.**
  - Admin keeps everything that needs live product data or actions: the customer list, the
    timeline, support access, comps, debugging.
  - A **one-way sync** pushes contacts and key facts to the CRM the user already runs for their
    other businesses (9.C6): plan, MRR, status, lifecycle stage, and inquiries as leads. Admin
    stays the source of truth for product and billing data.
  - **The CRM is the user's own custom-built one (confirmed 2026-10-06),** so Kiwiply defines the
    contract (9.C6) rather than adapting to a vendor API. Still no two-way sync until there's a
    clear need.

| # | What | Details | When |
|---|---|---|---|
| **9.C1** | **Customers page + billing timeline** *(before 15.4)* | `/admin/customers`: everyone who has ever paid, with plan, status (active / past due / cancelling / lapsed), renewal date, total paid and a Stripe link. Filters: payment failed · cancelling · new this month. On each user page, a **timeline**: billing events (signed up, renewed, failed, cancelled, plan change) and **admin notes**. Needs an additive `stripe_event.customer_id` (+ the user it maps to), so events can be shown per person; `customer_note` table for notes. Audited. | **Before 15.4** |
| **9.C2** | **Full timeline** | Add every email Kiwiply sends a user (a `mail_log`: template, subject, sent time, delivery status from Brevo, never the body of anything sensitive), their bug reports and Contact us requests (matched by account or email), and plan/AI-allowance changes made by admins. | After Launch 1 |
| **9.C3** | **Support access ("view as")** | The user grants access for 24 h from Settings. The admin gets a read-only view-as session (banner, every page view audited with a reason, auto-expiry, revocable). The privacy policy says so. | After Launch 1 |
| **9.C4** | **Debug panel** | On the user page: extension version and browser, last sync and last version check, connected inbox health (last poll, last error), job-match switch, AI usage, recent server errors for this user. **"Capture a support session":** with the user's consent, their next few fills send *non-anonymous* fill telemetry (ATS, fields found / filled / failed, the failing field labels — never the answers). Support sees exactly where the fill broke. | After Launch 1 |
| **9.C5** | **Offers & retention** | **Comps:** give a plan for N days (an `ADMIN_COMP` grant; 9.B3). **Promo codes:** Stripe coupons created from admin with an expiry, a redemption cap and the plans they apply to. Each one's margin is shown against the floor (18.4). **Win-back:** pick a segment (e.g. cancelled in the last 60 days), attach a code and send through Brevo, **only to people with marketing consent** (A4). **Cancellation reasons:** turn on Stripe portal's cancellation survey, and show reasons in admin and on the customer's timeline. | With 18 |
| **9.C6** | **CRM sync (to the user's custom CRM)** | **Push:** Kiwiply sends **signed webhooks** (HMAC-SHA256 over the body, with a timestamp header so replays are rejected) to one CRM endpoint set in env, on: `customer.created`, `subscription.changed`, `subscription.canceled`, `payment.failed`, `inquiry.created` and, once Phase 21 exists, `organization.*`. Each event carries an id (the CRM dedupes), a type and a small canonical payload: contact (name, email, account id), plan, status, MRR, lifecycle stage, and for inquiries topic, company, team size and message. **No resumes, answers or inbox mail ever leave Kiwiply.** Failed deliveries are retried with backoff for 24 h, then listed in admin with a "resend" button. **Pull (reconcile):** a key-protected, read-only `GET /api/crm/export?since=` returns the same records, so the CRM can catch up after an outage or backfill on day one. Mapping: contact = user, company = organization, lead = inquiry. A short contract doc (`docs/crm-sync.md`) is written alongside, for building the CRM side. | After 9.C1 + 9.C2 |
| **9.C7** | **Account fixes** | Resend the verification email; change email (verified); clear a rate-limit lock; list and revoke the user's extension connections. | After Launch 1 |

**Already exists (don't rebuild):** activate / deactivate, password-reset email, grant / revoke
admin, force logout (refresh-token revoke), GDPR delete, self-serve data export, per-user AI
override, the Revenue card, bug-report triage, the Inquiries queue (15.6).

## Open questions (revisit before A1)
- MFA mechanism for admins (TOTP vs email OTP) — and now vs A2.
- Audit storage: new entity vs JHipster `PersistentAuditEvent`.
- Subscriber sending: campaigns via Brevo UI initially vs in-admin send.
