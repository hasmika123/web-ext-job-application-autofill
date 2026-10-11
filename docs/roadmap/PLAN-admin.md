# PLAN — area `admin` (platform admin dashboard and business operations)

Machine-readable plan: `docs/roadmap/areas/admin.json` (17 epics, 94 stories: 7 done, 7 partial, 80 not started).
Audit: `docs/roadmap/AUDIT-admin.md`. Designs: `docs/design/admin/*.md` (8 docs).

## 1. Where we are

The admin console exists on thirteen boards and twelve routes, and the honest state is: **the plumbing for users, customers, bug
reports, inquiries, subscribers, AI usage, job sources and the audit trail is real; every time series, delta, donut and
"health" list on every page is sample; Security is entirely sample; and the business-critical operations (backups,
catalog, kill switches, privacy queue, staff roles) do not exist yet.** The audit also found real security gaps that sit
underneath any new admin feature (Google sign-in skips admin MFA, revoked admin roles survive on refresh, API rate
limiting is off, `UserResource` mutations bypass audit and guards) and the most important operational fact in the repo:
**no database backup has ever run and no restore drill has ever been performed** (15.1c), on the same box that lost its
previous database.

## 2. The epics, why, and in what order

| Order | Epic | Priority | Why now |
|---|---|---|---|
| 1 | **A10 Observability, backups, incidents** | P0 | 15.1c first. Everything else is reversible; losing the DB again is not. Then a job registry so every later job (rollups, retention, reconcile) has a ledger. |
| 2 | **A0 Admin platform: roles, TOTP, re-auth** | P0 | Closes the auth gaps and creates SUPPORT/FINANCE/OPS so the user can hand pages to other people safely. Every HIGH action in later epics assumes re-auth exists. |
| 3 | **A12 Audit log** | P0 | Columns + server filters + the unaudited mutations closed; the "reason" modal that PII views and view-as need. |
| 4 | **A4 AI cost governance** | P0 | Hard platform caps and kill switches are the only thing standing between a bug and a bill; the rollup makes the AI page real. |
| 5 | **A9 Security and compliance operations** | P0 | Security page from sample to real, privacy-request queue (legal exposure today), retention policies, legal versions. |
| 6 | **A1 Users and support toolkit** / **A2 Customers and billing ops** | P0 | The daily support work. 9.C1 exists; comps, account fixes, the timeline, view-as and Stripe reconcile finish it. A2.8 unit economics is the owner's weekly screen. |
| 7 | **A5 Runtime settings and flags** | P1 | Pulled early because A4 caps, A6 pauses, A7 send caps and A9 thresholds all live on it; the per-ATS kill switch is the extension's safety valve. |
| 8 | **A3 Catalog and margin guard** | P1 | Phase 18. Needed before Autopilot (19) sells and before orgs (21). |
| 9 | **A11 Analytics and event pipeline** | P1 | The one epic that retires the sample data everywhere (tile deltas, growth, engagement, cohorts, queues' charts). |
| 10 | **A6 Job-source operations** / **A7 Email and notification ops** / **A8 Support queues** | P1 | Operational depth once the P0 floor is in. A7.2 (mail log + suppression) is small and legally valuable; do it early inside the P1 band. |
| 11 | **A15 Mobile admin, accessibility, QA/CI** | P1 | Runs alongside: A15.1 (web test harness) should land before the P1 band so every later story ships with a test. |
| 12 | **A13 Experts/services**, **A14 Organizations admin**, **A16 BI export** | P2 | Follow Phases 20/21 and the O* org model. |

## 3. Recommended build order — the first 10 stories (walking skeleton)

1. **A10.1** backups live + restore drill + uptime (mostly human; the agent prepares the checklist and verifies).
2. **A0.2** close the auth gaps (Google MFA bypass, stale roles on refresh, rate limiting on, `/management/info`).
3. **A12.2** audit columns, server filters, audited CSV export.
4. **A0.3** staff roles + permission map + sidebar filtering.
5. **A10.2** scheduled-job registry + run ledger + run-now/pause (System page's jobs panel real).
6. **A5.1** runtime settings registry (revives the dead `app_setting`).
7. **A4.3** platform AI caps + kill switches in the gateway (depends on A5.1 and A4.2's columns; A4.2 can be split so the columns land first).
8. **A0.4 + A0.5** TOTP enrolment, short sessions, re-auth sheet.
9. **A9.1 + A9.2** security events + the Security page real.
10. **A11.2 + A11.3** product events + daily rollups + real tile deltas (the one change that touches every page).

After these ten, the admin is safe to hand to a second person, the money and AI exposure are bounded, and the pages stop lying.
Next band: A12.3, A9.4 (privacy queue), A1.4/A1.5 (fixes, view-as), A2.2 (Stripe reconcile), A2.8 (economics), A7.2.

## 4. What stays sample forever (decorative, labelled, hidden in prod) vs must become real

| Page | Stays decorative | Must become real (story) |
|---|---|---|
| Overview | nothing | health list, growth, deltas, bell (A11.5, A10.3) |
| Users | nothing | segments, roles, recent actions, pending/suspended tiles (A1.3) |
| Customers | board's B2B companies/seats layout (that is A14 later) | MRR, deltas, churn-risk rules, pagination (A2.1, A2.6) |
| AI usage | nothing | trend, tokens, limits, alerts (A4.2–A4.4) |
| Job sources | LinkedIn/Indeed/Workday rows (no scraping; Workday has no public board API) | performance, sync history, errors, per-source actions (A6.2–A6.5) |
| Security | nothing | everything (A9.1–A9.3) |
| Analytics | users-by-country and acquisition channels **until A11.6 (P2)**; engagement categories that don't exist are replaced | growth, DAU, engagement, cohorts, filters, deltas (A11.3–A11.4) |
| Email | open/click rates for transactional mail (tracking stays off) | sends vs cap, bounces, suppressions, log, templates, automations, campaigns read-only (A7.2–A7.6) |
| Bug reports | nothing | severity, crash trend, recurring, assignee (A8.2) |
| Inquiries | nothing | SLA, category mix, escalations, priority/assignee (A8.4) |
| System | nothing | uptime/latency/error tiles, jobs, deployments, events, resources, four toasts (A10.2–A10.6) |
| Audit | nothing | tiles, risk/area, compliance strip, flagged (A12.2, A12.4) |

Rule (A15.4): every remaining sample panel is wrapped in `SampleTag` and rendered only when `NEXT_PUBLIC_ADMIN_SHOW_SAMPLE=true`; production hides them. A lint rule stops new sample imports.

## 5. Mobile admin stance

Admins are on phones between meetings; they triage, they don't analyse. So:
- **Triage-first home** (A15.2, A11.5): an "admin inbox" of things that need a human (unacked AI alerts, overdue privacy requests, failed jobs/webhooks, HIGH bugs, failing sources) as cards with one-tap actions; KPI tiles come second.
- **Bottom tab bar** below `lg` (Home, Users, Queues, System, More) replaces the drawer for the five top destinations; search opens a full-screen sheet (today it is hidden on phones).
- **Every action is a bottom sheet**, every HIGH action gets the re-auth sheet, destructive actions are type-to-confirm; 44 px targets, checked by the Playwright smoke.
- **Queues swipe** (A8.5): take / resolve with undo; long-press to multi-select.
- **Tables collapse to cards** with the two columns that matter and a details sheet; charts become one-per-card swipe decks (analytics doc §8).
- Deep analysis (catalog editing, cohort tables, CSV exports) stays desktop-first but must not break on a phone.
- Dark mode and accessibility are part of the definition of done for every admin story once A15.1/A15.3 land.

## 6. Risks

1. **Backups** — until A10.1 is done every other story is building on sand. It needs the user's AWS/Healthchecks/UptimeRobot accounts and a `develop` → `main` promotion.
2. **Auth gaps** are exploitable today (Google bypass of admin MFA; 90-day stale roles). A0.2 is a one-session fix; do it before adding any staff.
3. **The margin guard and AI caps interact**: raising a budget in the catalog can push a price under the floor; the catalog page must re-run the guard when entitlements change (A3.4 AC).
4. **Shared box memory** (3.7 GB with BeeCompete): rollup jobs and request-metric writes must be cheap; the designs use daily rollups and minute buckets with short retention for that reason.
5. **Org admin depends on the O\* model** — A14 stories reference O* schema stories by intent; their IDs must be filled in once the org plan lands.
6. **No web tests exist**; without A15.1 early, every "sample removed" story is verified by eye.

## 7. Open questions for the user

1. **TOTP mandatory for all staff, email OTP only as recovery** — confirm (the plan assumes yes). And: should the break-glass account be a separate login from your daily admin account?
2. **Platform AI caps**: default $40/day and $600/month — set the real numbers, and whether a cap breach should pause server AI for everyone or only for paid features (the plan reserves 10 % for free resume parsing).
3. **Privacy requests by email**: who verifies identity (you? support?) and is a 30-day GDPR / 45-day CCPA deadline the policy we publish?
4. **Email tracking**: keep open/click tracking off for transactional mail (plan's default) and on only for Brevo marketing campaigns?
5. **Subprocessor page public?** The plan publishes `/legal/subprocessors` and tracks the still-unsigned Brevo/AWS DPAs — confirm you want that visible before the DPAs are signed.
6. **Country/channel analytics (A11.6, P2)**: capture `CF-IPCountry` and UTM at signup, or leave those two board charts decorative permanently?
