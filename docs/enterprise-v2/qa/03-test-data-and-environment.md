# Test data and environment

> Status: 2026-10-14, branch `ent-integration-all`. For the QA lead and developers. Counts come from the seeders' Javadoc and the foundation docs (`talent-foundation.md`, `billing-data-foundation.md`, `ops-data-foundation.md`) and from reading `EnterpriseDemoSeeder`, `TalentDemoSeeder` and `EnterpriseDemoBootstrap`. **Nothing here was confirmed by booting the stack**; a count marked "random-driven" varies by a few between runs, a count marked "fixed" is set by the seeder. Items I could not confirm are marked **unverified**.

## 1. The two demo tenants

| | Acme Staffing | Beta Talent |
|---|---|---|
| Type | CONSULTANCY | COMPANY |
| Host (dev) | `http://acme.localhost:<port>` | `http://beta.localhost:<port>` |
| Org slug | `demo-acme` | `demo-beta` |
| Branding | published; seeder constants primary `#1d5bd8`, secondary `#f59e0b`; generated logo (the runbook says teal / amber, code wins); welcome title "Welcome to Acme Staffing"; support `support@acme.example.com` | primary `#4338ca`, secondary `#ec4899`; welcome "Welcome to Beta Talent"; support `help@beta.example.com` |
| One-click members (Demo accounts tab) | 11 | 1 |
| Purpose | the rich tenant for every story | proves isolation and different branding |

Logins are `demo-ent-{acme|beta}-{first name}`; there is **no password to know**. Each member gets a random password hash on every boot; the only way in is the **Demo accounts** tab on the tenant sign-in page (left edge of the screen), button `Sign in as <name>`. On a platform host (not a tenant) the list is `{"enabled":false,"accounts":[]}`.

### Members seeded by `EnterpriseDemoSeeder` (Acme, 11)

| Person | Roles | Status | Notes |
|---|---|---|---|
| Sarah Chen | ORG_ADMIN + MARKETING_MANAGER | ACTIVE | PRIMARY marketer of Anika (assignment) |
| Omar Haddad | MARKETING_SPECIALIST | ACTIVE | PRIMARY marketer of Ben |
| Anika Rao | CONSULTANT | ACTIVE | seat linked to a consultant profile |
| Ben Okafor | CONSULTANT | ACTIVE | seat linked to a consultant profile |
| Hana Petrov | HR_SPECIALIST | ACTIVE | |
| Felix Ng | FINANCE_SPECIALIST | ACTIVE | |
| Amara Silva | ACCOUNT_MANAGER | ACTIVE | |
| Tomas Berg | TALENT_ACQUISITION | ACTIVE | |
| Eve Lindqvist | EXECUTIVE_VIEWER | ACTIVE | |
| Sam Whitfield | CONSULTANT | SUSPENDED | listed, cannot be opened; seeded consultant profile status UNAVAILABLE |
| Nina Vogel | CONSULTANT | INVITED | no account yet; listed, cannot be opened |

Beta: Bea Turner (OWNER). Two org assignments exist: Sarah to Anika (PRIMARY), Omar to Ben. Names are invented, e-mails are on `example.com`, no date of birth, phone or numbers of any kind.

`web/scripts/fixtures/enterprise-demo.json` is the same roster for the mock API; `EnterpriseDemoSeederIT` fails when the two differ.

### Extra seats created by the talent seed (not on the Demo accounts tab)

Marketers with the Marketing Specialist role and real `demo-ent-<org>-<key>` logins, but **not** in the one-click list: Acme: Jessica Davis, Michael Park, Emily Lawson, David Kim, Samantha Lee, Ryan Thompson; Beta: Priya Nair, Leo Fischer. They exist so workload and performance pages look populated. Stories sign in only as the 11 base members.

## 2. What is seeded, per layer

Seeding order (`EnterpriseDemoBootstrap`, runs after Liquibase and the role-template seeder, only if `EnterpriseDemoSeeder.refusal()` allows it): `RoleTemplateSeeder` then `EnterpriseDemoSeeder` (tenants, branding, hostnames, members, roles, assignments, flags) then `TalentDemoSeeder` then `OpsDemoSeeder` then the consultant workspace seeders (`ConsultantWsDemoSeeder` plus 16 page seeders in dependency order) then `BillingDemoSeeder` then `ClientsDemoSeeder` then `PlacementDemoSeeder`. The marketing page seeders (`Mkt*DemoSeeder`, activity, followups, interviews, jobs, opportunities, performance, resumes, streams, submissions, tasks) run on `ApplicationReadyEvent`, i.e. after the bootstrap. A failure in one stage is logged and later stages continue where independent; a failed talent seed stops the dependent ones.

Every seeder is idempotent (a second boot changes nothing) and time-relative: dates are "now minus N days" at the moment of seeding, the random stream is seeded per organization (same story every time, with small run-to-run variation where noted).

### 2.1 Talent foundation (Admin pages: Consultants, Resumes, Jobs, Applications, Marketing Assignments, Dashboard tiles; shared with Marketing)

| Entity | Acme | Beta | Notes |
|---|---|---|---|
| Consultant profiles | 153 | 46 | Anika, Ben, Sam are linked to their seats; all others have no seat (`member_id` null) |
| Marketers (seats with capacity) | 8 | 3 | Acme workload / capacity: Jessica 28/30, Michael 29/30, Emily 23/25, David 16/25, Samantha 14/25, Ryan 12/20, Omar 10/20, Sarah 9/20 |
| Assigned / unassigned consultants | 141 / 12 | 42 / 4 | Overloaded (workload at least 90 percent of capacity): 3 / 2 |
| Clients (each with 2 contacts) | 8 | 3 | TechCorp, Global Media, FinTech Solutions, HealthPlus, InnovateLab, RetailCo, ACME Internal, Northwind Logistics (Acme) |
| Jobs (`client_requirement`) | 24 | 8 | Acme: 13 OPEN, 3 IN_REVIEW, 2 ON_HOLD, 4 FILLED, 2 CLOSED; 6 posted in the last 7 days |
| Matches (`requirement_match`) | about 275 | 41 | scores are seeded, no engine computes them |
| Applications | 120 | 36 | Acme stages: 14 ASSIGNED, 22 SUBMITTED, 24 UNDER_REVIEW, 26 INTERVIEWING, 10 OFFER, 24 CLOSED (10 HIRED, 8 REJECTED, 4 WITHDRAWN, 2 NO_RESPONSE); about 541 events, 143 notes (Acme) |
| Interviews | about 90 | about 28 | Acme: 28 SCHEDULED in the next 13 days, the rest COMPLETED (some CANCELLED) over 5 months (random-driven) |
| Placements | 108 | 33 | one ACTIVE per ON_PROJECT consultant, the rest ENDED |
| Resumes (`org_resume`) | 121 | 35 | about 14 percent PENDING, 12 percent PRIVATE, 28 percent PUBLIC; one primary per consultant at most; 303 experience rows (Acme) |
| Spend entries | 18 | 18 | 3 categories x 6 months |

### 2.2 Additional page seeders

| Seeder | Result |
|---|---|
| `ClientsDemoSeeder` | Clients directory grown to 24 (Acme) / 6 (Beta) with profile facts, contacts, relationship notes, requirements and ended placements; health badges (healthy / neutral / at risk) have all three values |
| `PlacementDemoSeeder` | every active placement gets an end date; upcoming placements, extension requests and recorded extensions, redeployment pool, one CREATED event per placement |
| `InterviewDemoEnricher` | interview mode, round, link, interviewers, events and feedback for the Interviews page |
| `MktJobsDemoSeeder` | source label, priority and visa label on every job; five saved searches per marketer seat |
| `MktOpportunityDemoSeeder` | consultant interest mix (32 percent very interested, 28 interested, 20 open, 12 not interested, 8 no response), owners, next actions, activity |
| `MktSubmissionsDemoSeeder` | one submission per application at SUBMITTED or later, a draft or open approval request for each ASSIGNED one, a few declined |
| `MktStreamsDemoSeeder` | six streams, one sync per stream per day for 14 days, alerts, four rules; **invented rows, nothing is fetched** |
| `MktTasksDemoSeeder` | 24 open + 16 completed tasks per marketer |
| Other `Mkt*` seeders | followups, interviews, activity, performance (goals, benchmarks), resumes |
| `ConsultantWs*DemoSeeder` (17) | tasks for Anika / Ben; profile, resumes, marketer card, matches, job discovery, interviews, interview prep sessions, submissions, assigned opportunities (responses), availability, offers, placement, settings, notifications, job source links (example source links on `jobs.example.com`, marked sample) |

### 2.3 Billing data layer (no pages yet; use for dashboard tiles and future stories)

Demo catalog data is clearly marked (`demo_data = true`, codes `DEMO_*`): 12 feature definitions, 17 products. Each demo org gets a `DEMO-<ORG>-2026` contract. Prices (Standard $79, Professional $149, Enterprise $199 per consultant per month; add-ons $9 to $45; org add-ons Advanced Analytics $500 and API Access $300) are **demo values living only in the seeder**; they are not product prices and the real catalog ships without prices.

| Entity | Acme | Beta |
|---|---|---|
| Consultants / live licences | 153 / 142 | 46 / 34 |
| Licence status mix | ACTIVE 118, CANCEL_AT_PERIOD_END 18, SUSPENDED 4, PENDING 2; ENDED history 9; unlicensed 11 | ACTIVE 27, expiring 5, SUSPENDED 1, PENDING 1; ENDED history 3; unlicensed 12 |
| Licensed capacity | 150 (142 of 150 = 95 percent) | 40 |
| Invoices | 12 monthly RECURRING (rising) + 1 proration + 1 OVERDUE = 14; latest monthly is OPEN | 6 monthly |
| Payment methods | Visa 4242 (default) + Mastercard 4444 (public test numbers; brand, last4, expiry only) | Visa 4242 |
| Usage | 12 features, counters for six months, events for current and previous month, 3 credits, 4 counters at 80 to 92 percent and one at 100 percent (alerts) | about 30 percent |

The billing seed rewrites `consultant_profile.license_status` / `license_valid_until` to follow the licence (so the Consultants page and dashboard alerts agree with the licence data). It skips an org with no consultants or one that already has a contract. Fixed headline numbers: 142 / 150, 18, 4, 2, 9, 11, the 12 monthly invoices, 12 features, one overdue invoice.

### 2.4 Ops data layer (HR, Finance, Reports; no pages yet)

| Entity | Acme | Beta |
|---|---|---|
| `hr_employee` | 167 (17 seats + 150 consultants without a seat) | 49 |
| Onboarding items / documents | 835 / 1002 | 245 / 294 |
| Finance placement terms / periods | 108 / 288 | 32 / 81 |
| Timesheets / invoices / payments | 203 / 193 / 390 | 53 / 57 / 113 |
| Report definitions | 12 | 5 |

Numbers are copied from the table in `ops-data-foundation.md` (it prints each row as Acme / Beta); random-driven rows vary by a few between runs, so assert only the fixed ones (employees, placement terms, report definitions). All record-only: no phone, DOB, identity document, tax id or bank values exist anywhere.

### 2.5 Roles, flags and settings seeded

- System role templates: OWNER, ORG_ADMIN, STAFF, MEMBER, CONSULTANT, MARKETING_SPECIALIST, MARKETING_MANAGER, HR_SPECIALIST, FINANCE_SPECIALIST, ACCOUNT_MANAGER, TALENT_ACQUISITION, EXECUTIVE_VIEWER.
- The seeder turns on, **for the two demo organizations only** (an allow list merged into the settings rows; an "on for everyone" flag is left alone): `flag.enterprise`, `flag.enterprise.domains`, `flag.enterprise.roles`, `flag.enterprise.marketing`, `flag.enterprise.consultant_jobs`. It also adds `localhost` to `enterprise.hosts.tenant_base_domains`. The billing, HR/Finance, extension-workspaces, integrations and analytics flags stay off (deferred), so their modules are hidden from the menus.
- Per-org settings with admin override (`org_setting`): for example `org.marketing.overload_pct`, `org.marketing.bulk_max`, `org.marketing.capacity_max`, `org.clients.healthy_days`, `org.clients.at_risk_days`, interview limits, `enterprise.jobs.detail_cap` (MINIMAL by default).

## 3. Switches and configuration

| Variable / property | Needed value for the story suite | Why |
|---|---|---|
| `DEMO_ENABLED` (`dossier.demo.enabled`) | `true` | the regular demo switch; with `false`, demo sign-in answers 403 `DEMO_DISABLED` |
| `ENT_DEMO_SEED` (`dossier.demo.enterprise-seed`) | `true` | seeds the two tenants and all demo layers at startup; default false |
| `DEMO_ALLOW_WRITES` (`dossier.demo.allow-writes`) | `true` for any story that writes | demo members are a sandbox: account, billing and similar shared-account writes are refused with 403 `DEMO_READ_ONLY` unless this global dev override is on. Never in production. Which page writes are blocked without it is **unverified** page by page; run with it on |
| `DOSSIER_TENANT_HOST_SECRET` | the same random value on API and web | the API only believes `X-Kiwiply-Host` from the web server |
| `APPLICATION_LIQUIBASE_ASYNC_START` | `false` | on a fresh database the startup seeders must not race the migrations |
| `DOSSIER_STORAGE_DRIVER` / `DOSSIER_STORAGE_LOCAL_ROOT` | `local` + a folder | the demo logo goes through the FileStorage seam; no S3 needed |
| `dossier.demo.create-accounts` | default `true` | when false the bootstrap does nothing |
| `dossier.tenant-host.allow-localhost-tenants` | `true` (already true in the `dev` profile) | makes `*.localhost` a tenant base domain; never in prod |
| `TRUST_PROXY_HOST` (web) | `false` | nothing sits in front of `next start` |
| `DOSSIER_API_URL` (web) | `http://localhost:18183` | where the web server finds the API |
| `E2E_REAL_PORT`, `PW_CHANNEL`, `STORY_SLOWMO`, `STORY_PAUSE_MS` | see `00-README.md` section 3.3 | story kit |
| `MOCK_DEMO_ENABLED`, `MOCK_ENTERPRISE_ENABLED` | mock API only | `npm run dev:demo -w web` serves the same two tenants and eleven members from `web/scripts/mock-api.mjs` on port 3100; the mock has no talent, billing or marketing data, so it cannot run most stories |

**Hard safety rules of the seeder:** it refuses to run under the `prod` profile; both switches default to off; nothing else (no request, no admin setting) turns it on. Seeded flags apply only to the two demo organizations, so any other organization on the same database stays dark.

**Windows-specific:** `JAVA_HOME` = JDK 17; `DOCKER_API_VERSION=1.44`; the web must be a production build (Next dev mode does not work in worktrees); never name a directory or package exactly `con` (reserved device name), the consultant code uses `consultant` folders and the HTTP namespace `/con/`.

## 4. How to reset

| Goal | Steps |
|---|---|
| Start from nothing | Stop the API (kill only your own PIDs). Drop and recreate the database (`DROP DATABASE dossier_ent_demo`; `CREATE DATABASE ... CHARACTER SET utf8mb4`). Boot the API again: Liquibase migrates (about a minute) and the seeders log `Enterprise demo seeded: 2 orgs, ...` |
| Keep data, drop story leftovers | There is no built-in per-story cleanup. Stories should create uniquely named records (timestamp suffix) and not depend on counts of records they created. Deleting only story data by SQL is **unverified** and not recommended |
| Fresh browser sign-in | delete `web/e2e/.auth-stories/` (global setup recreates it) |
| Fresh test output | delete `web/test-results-stories/` and `web/playwright-report-stories/` |
| Re-seed one layer | not supported: each seeder skips an org that already has its rows; reset the database instead |
| Use an isolated database per run | recommended: one database per branch or preview (`dossier_ent_<name>`); never reuse another preview's database |

Seed times are relative to the moment of seeding. A database that is a few days old shows "upcoming interviews" that have passed. For date-sensitive stories (upcoming, overdue, ending soon), reset the database the same day.

## 5. Known gaps in the environment (read before filing a defect)

1. **Testcontainers ITs.** About 179 `*IT.java` files use Testcontainers MySQL 9.2. Many of the page ITs (for example `MktJobsIT`, `MktMatchesIT`, the Marketing performance / tasks / activity ITs, Billing / Ops schema ITs) are logged as "written, not run (no Docker)" in `progress-tracker.md`. Until someone runs `./gradlew test` with Docker, treat their coverage as unproven. The `OrgIsolationIT` full route sweep also needed a raised timeout on a loaded machine (`-Djunit.jupiter.execution.timeout.mode=disabled`).
2. **Pixel-exactness against the design boards is not signed off for any page.** The boards live in `design/enterprise-*`. Built screenshots are in `design/**/built/`. A visual story can assert structure and key elements, not pixel parity.
3. **Real-stack journeys cover a subset.** `web/playwright.real.config.ts` runs eight journeys (employees, dashboard v2, invitations, consultants, jobs, marketing assignments, resumes, applications); other journey files (interviews, clients, placements, groups, roles, shell, consultant pages, unknown host) exist but are not in that config's `testMatch` (they may be run with their own config; unverified).
4. **No external services.** E-mail delivery (Brevo), Stripe, DNS and certificates, the packed browser extension against live job sites, S3 and AI providers are not part of the demo stack. Stories needing them are `BLOCKED`.
5. **The mock API has no talent / billing / marketing data**; use the real stack for stories.
6. **Sample data is labelled.** Consultant workspace blocks marked "Sample" (My Features allowances, Messages from My Marketer, interview mode, derived priority and due date, demo offers, demo submission rows) are stand-ins; do not assert them as product behaviour.
7. **Seeded stage and dashboard figures are time-relative and partly random-driven** (interviews, events, notes, usage counters). Assert shape and fixed headline numbers only.
8. **Unbuilt pages show a placeholder.** HR, Finance, Reports (admin), Subscription / Licenses / Billing / Usage, Domains, Integrations, Audit Logs, Settings, all of Marketing Management and Executive, and most of Accounts, HR and Finance render "This page is on the way". The Dashboard's "Configure Licenses" quick action leads to such a placeholder.
9. **Demo accounts list is rate-limited**: global setup signs in once per persona; do not click the tab repeatedly in a loop.
10. **Two Assigned Opportunities implementations** (see `01`, doubts item 1): the list URL is served by the board-driven page; the Release 1 page opens only via `/w/consultant/opportunities/{id}`. Whether a job assigned through the extension API appears in the board page list is **unverified**.
11. **Tracker lag.** `progress-tracker.md` still lists many built pages as Not Started; trust the code and the page docs.
12. **Story kit uncommitted.** `web/e2e/stories/` and `web/playwright.stories.config.ts` were untracked when this was written, and `web/.gitignore` does not yet ignore `test-results-stories/`, `playwright-report-stories/` or `e2e/.auth-stories/`.
13. **Stack ports are conventions, not requirements**: the runbook uses API 18183 and web 3200; other previews use other ports. Set `E2E_REAL_PORT` to match.

## 6. Quick pre-flight checklist before a suite run

1. Docker is up; MySQL container reachable on `127.0.0.1:33511`; a fresh database exists.
2. API log shows `Enterprise demo seeded: 2 orgs, ...` and no `... demo seed failed` errors (those lines name which demo layer is missing).
3. `GET /api/public/tenant/demo` with `X-Kiwiply-Host: acme.localhost` and the host secret lists eleven members.
4. Web is a production build running with the same host secret; `http://acme.localhost:<port>/login` shows Acme branding and the Demo accounts tab; `http://beta.localhost:<port>/login` shows Beta's.
5. Signing in as Sarah lands on `/w/admin` with the dashboard populated (counts near the figures in section 2.1).
6. The API runs with `DEMO_ALLOW_WRITES=true` if write stories are in scope.
7. `.gitignore` entries for the story output exist (section 5 item 12).
