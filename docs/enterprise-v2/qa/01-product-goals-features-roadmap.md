# Kiwiply Enterprise V2: product goals, features and roadmap

> Status: 2026-10-14, branch `ent-integration-all`. Written for a product stakeholder and the QA lead.
> Sources read: `CLAUDE.md`, `api/src/main/resources/config/ent/workspaces.json`, `web/src/components/ent/**`, `web/src/app/(tenant)/_t/w/**`, `docs/enterprise-v2/{00,05,08,59,60,61}*.md`, ADR-010/011/012/024, the `page-*.md` specs, `progress-tracker.md`, the Liquibase changelogs and REST resources under `api/`.
> Legend used in every table below: **BUILT** = code, API and a web page exist on this branch. **BUILT (sample)** = built, but part of the content is a labelled stand-in. **BUILT (shared)** = one page file serves several workspaces. **DESIGNED** = specified in docs and backlog, not implemented (the menu item shows "This page is on the way"). **PHASE 2** = deliberately deferred by owner decision. Anything I could not confirm in code is marked **unverified**.

## 1. Vision and goals

**One sentence (from `00-product-vision.md`).** Every organization feels it is using its own professional talent platform (its domain, logo, roles, pipeline and invoice) while Kiwiply runs one shared deployment, keeps every person's data their own, and never submits an application for anyone.

**Product family.** Kiwiply (working name Dossier) began as a consumer job-application autofill browser extension plus a web app (resumes, profile, board, inbox, billing). Enterprise V2 adds a multi-tenant organization product on top of the same account system, for staffing agencies and IT consultancies first, then professional-services firms, outplacement providers, universities and bootcamps.

**Goals**

1. **Give a consultancy one place to run its bench-to-placement pipeline.** Consultants, marketers, account managers, HR, finance and the owner each get a workspace sized to their job, with one shell and one sign-in.
2. **Make the daily job loop fast and trackable.** A marketer finds a job on any site, captures its important details with the browser extension, assigns it to a consultant; the consultant applies on the source site with their own extension; progress is tracked back (Release 1, section 6).
3. **Keep people's data theirs.** Resumes, applications, inbox and answers belong to the person. The organization sees consent-scoped views and approvals, not copies.
4. **Be safe by construction.** Tenant isolation by hostname and token, permissions evaluated on the server, no auto-submit, no sensitive PII, honest UI with no invented numbers.
5. **Be commercially configurable, not hard-coded.** Prices, limits, flags and defaults are admin data; the org buys a one-time setup fee, a base licence per consultant and priced feature add-ons under a margin guard.
6. **Stay additive.** No destructive migration; every new capability is new tables or defaulted columns behind a flag; personal subscriptions are untouched.

**Success measures (from `00-product-vision.md`, first 90 days after the licensing phase).** Branded custom-domain onboarding in under one working day; zero cross-tenant findings in `OrgIsolationIT` and the negative Playwright suite on every CI run; every invoice line traceable to a price version and licence change; a consultant can always answer "what did my org's marketer do with my data?" from the timeline. Several of these depend on unbuilt work (custom domains, billing), so today only the isolation measure is checkable.

## 2. The problem each role solves

| Role (template key) | Problem today | What Kiwiply gives them |
|---|---|---|
| Owner / Organization Admin (`OWNER`, `ORG_ADMIN`) | Spreadsheets and inboxes for who works for whom, who is licensed, what is in the pipeline. No single view. | Dashboard, employee and invitation management, teams and departments, roles and permissions as data, branding, assignments of consultants to marketers, org-wide views of jobs, applications, interviews, clients, placements. |
| Marketing Specialist (`MARKETING_SPECIALIST`) | Finding and tracking roles for several consultants across many job boards; asking "did they apply yet?" | An assigned-talent workspace: job discovery, matches, opportunities, job streams, submissions (as records), interviews coordination, follow-ups, tasks, activity and performance. Captures jobs with the extension and assigns them. |
| Marketing Manager (`MARKETING_MANAGER`) | Uneven marketer workload, approvals scattered. | Designed: team, assignments, pipeline, approvals, workload, escalations, reports (DESIGNED). Workload and assignment management exist today on the Admin side (Marketing Assignments). |
| Consultant (`CONSULTANT`) | Hears about jobs by e-mail and chat, applies in many places, loses track of status, wants control over what the org sees. | A personal workspace inside the org: career profile, resumes, my marketer, assigned opportunities with an "Open job link" button, applications, submissions and approvals, interviews and prep, offers, placement, availability, tasks, timeline, features, notifications, settings, and a consent control over what is shared. |
| Account Manager (`ACCOUNT_MANAGER`) | Client relationships and requirements live in personal notes. | Clients, contacts, requirements, submissions, interviews, offers, placements (Clients and Placements pages are built and shared; the rest is DESIGNED). |
| HR Specialist / Talent Acquisition (`HR_SPECIALIST`, `TALENT_ACQUISITION`) | Onboarding, policies and lifecycle records are ad hoc. | Employees (built, shared); onboarding, policies, compliance, lifecycle, offboarding, candidates and talent pools are DESIGNED and record-only (no identity documents, no DOB, no bank data). |
| Finance Specialist (`FINANCE_SPECIALIST`) | Who is licensed, what do we owe, placement rates. | Designed: subscriptions, billing, invoices, placement rates as labels, timesheets bridge, payments as records. Placements page is built and shared. Money is recorded, never moved. |
| Executive Viewer (`EXECUTIVE_VIEWER`) | No safe read-only view. | Designed: counts-only tiles and k-anonymous reports. Not built. |
| Kiwiply platform admin | Operating many tenants. | Existing consumer-era `/admin/**` console (users, customers, AI, analytics, audit, security, system and others) is built. Tenant provisioning, org billing operations and break-glass are DESIGNED. |

## 3. Roles, workspaces and how access works

**Workspaces** are menu sets defined as data in `workspaces.json` (version 1). A member sees a workspace if their roles hold at least one of its nav permissions; each nav item needs permission keys and optionally a module flag. A person with two roles gets a workspace switcher. The shell is one `EnterpriseShell` (sidebar, search, bell, account menu, mascot help card); mobile uses bottom tabs.

| Workspace (slug) | Primary for | Nav items | Pages built | Pages DESIGNED (placeholder) |
|---|---|---|---|---|
| Administration (`admin`) | OWNER, ORG_ADMIN | 26 | 15: Dashboard, Employees, Invitations, Teams, Departments, Roles & Permissions, Consultants, Resumes, Marketing Assignments, Jobs, Applications, Interviews, Clients, Placements, Organization Branding | 11: Subscription Overview, Consultant Licenses, Billing, Feature Usage, HR, Finance, Reports, Domains, Integrations, Audit Logs, Settings |
| Marketing (`marketing`) | MARKETING_SPECIALIST | 14 | 14: Home, My Assigned Talent, Resumes, Job Discovery, Job Matches, Opportunities, Job Streams, Submissions, Applications, Interviews, Follow-ups, Tasks, Activity, Performance | none |
| Marketing Management (`marketing-mgmt`) | MARKETING_MANAGER | 8 | 0 | Home, Team, Assignments, Pipeline, Approvals, Workload, Escalations, Reports |
| Consultant (`consultant`) | CONSULTANT | 19 | 19: Home, My Career Profile, My Resumes, My Marketer, Job Discovery, Job Matches, Assigned Opportunities, My Applications, Submissions & Approvals, Interviews, Interview Prep, Offers, My Placement, Availability, Tasks & Follow-ups, Activity Timeline, My Features, Notifications, Settings (some content is labelled sample) | none |
| HR (`hr`) | HR_SPECIALIST, TALENT_ACQUISITION | 10 | Employees (shared page); Home is the placeholder | Home, Onboarding, Documents (to be named Policies, decision D7), Compliance, Lifecycle, Offboarding, Candidates, Talent Pools, Reports |
| Finance (`finance`) | FINANCE_SPECIALIST | 9 | Placements (shared page) | Home, Subscriptions, Billing, Invoices, Timesheets, Approvals, Payments, Reports |
| Accounts (`accounts`) | ACCOUNT_MANAGER | 8 | Clients, Interviews, Placements (shared pages) | Home, Contacts, Requirements, Submissions, Offers |
| Executive (`exec`) | EXECUTIVE_VIEWER | 2 | 0 | Home, Reports |

Counts above come from `workspaces.json` and the route files; whether each shared page works inside a non-admin workspace with that role's scope is **unverified** (the pages read the member's permission keys and scope; the shared-page code paths are described in the route comments, but no non-admin real-stack journey for them was found).

**Module flags** gate nav items (`TenantModule`): `domains`, `roles`, `billing`, `marketing`, `hrFinance`, `extensionWorkspaces`, `integrations`, `analytics`, each backed by a `flag.enterprise.*` setting that defaults OFF. LIVE today: master `flag.enterprise`, `domains` (flag exists, feature not built), `roles`, `marketing`, and `consultant_jobs`. DEFERRED (declared, not enforced): `billing`, `hr_finance`, `extension_workspaces`, `integrations`, `analytics`. The demo seeder switches the five LIVE flags on for the two demo organizations only.

**Permissions model (docs 05, ADR-005).** Roles are data (`org_role`, `org_role_permission`, `org_member_role`), several per person. Twelve system templates ship: OWNER, ORG_ADMIN, STAFF, MEMBER, CONSULTANT, MARKETING_SPECIALIST, MARKETING_MANAGER, HR_SPECIALIST, FINANCE_SPECIALIST, ACCOUNT_MANAGER, TALENT_ACQUISITION, EXECUTIVE_VIEWER. Each permission row carries one of five scopes: OWN, ASSIGNED, TEAM, DEPARTMENT, ORG. Evaluation order on every protected call (server side): tenant, membership, org state, permission, resource scope, entitlement, consent. A **ceiling rule** stops an editor granting what they do not hold; admin-level roles are protected from non-owners. Refusals outside the caller's tenant, role or scope are a generic **404** (no information leak); the one non-404 refusal is `CONSENT_REQUIRED` (403) so a consultant can see a request.

## 4. Feature catalogue by role and page

Status column: BUILT unless stated. "Tests" lists what exists; "ITs written, not run" means a Testcontainers test exists but its author had no Docker (see `03-test-data-and-environment.md`).

### 4.1 Platform and shell (all roles)

| Feature | Status | Notes |
|---|---|---|
| Tenant resolution by host (`acme.localhost`, later `acme.kiwiply.com` and custom domains); unknown host fails safe | BUILT (subdomain / `*.localhost` only) | Web `proxy.ts` rewrites tenant hosts into the `(tenant)/_t` route tree; the API is authoritative about the host (ADR-003) and believes `X-Kiwiply-Host` only with `DOSSIER_TENANT_HOST_SECRET`. |
| Branded login (logo, colours, welcome text), password sign-in, Demo accounts tab (dev only) | BUILT | Contrast-safe theme derivation; no Kiwiply branding on a tenant's page title. |
| Tenant-bound sessions (`tid` claim); non-member refused on the wrong tenant (`NOT_A_MEMBER`) | BUILT | ADR-004. |
| Enterprise shell: sidebar, collapse, search, notifications bell, account menu, workspace switcher, mobile bottom tabs, mascot help cards | BUILT | One shell for every workspace; unbuilt items grey out and lead to "This page is on the way". |
| `GET /api/me/tenant` contract (org, person, roles, permissions with scope, workspaces, modules) | BUILT | Single source for the web menu. |
| Org-enforced e-mail MFA, TOTP / passkeys, SSO | DESIGNED (X2.14, X12.4, X12.11) | Not built. |
| User profile surface (avatar menu) and Organization Settings page | DESIGNED (X2.7, X2.9) | `/w/admin/settings` is a placeholder. |
| Custom domains (add hostname, DNS verification, certificates via Caddy on-demand TLS, primary domain, suspension) | DESIGNED (X3.*, ADR-002) | The edge Caddy change is applied by the user (E5), not by code. |
| Platform admin: Organizations and hostnames (X1.11), break-glass (X6.17), Platform analytics (X12.12) | DESIGNED | Existing `/admin/**` pages are the consumer-era console. |

### 4.2 Administration workspace (Sarah, Bea)

| Page | What it does today | Status and notes |
|---|---|---|
| Dashboard (`/w/admin`) | One call `GET /api/orgs/{orgId}/dashboard`: tiles for consultants, employees, open applications, upcoming interviews, active placements, monthly spend, team performance, pipeline donut, quick actions, alerts (dismissible 7 days, with Undo), recent activity, range select, dismissible mascot card. Honest empty / unavailable states, no invented deltas. | BUILT. Alerts "License usage at 85 %" is deliberately not shown (no data). |
| Employees | Directory with filters, search, KPI tiles with weekly sparklines, bulk actions, detail sheet (seat, roles with ceiling, groups, manager, activity), suspend / reinstate / offboard wizard. Also serves HR (`/w/hr/employees`). | BUILT (shared). Real-stack journey `tenant-employees.spec.ts`. |
| Invitations | Invite one or many with roles, department, team and manager; resend, revoke, expiry, e-mail-match rule; activity feed. Invitee accepts on the tenant host. | BUILT. Real e-mail delivery is outside the demo stack (**unverified**; Brevo SMTP in production). |
| Teams, Departments | Group tree, leads, move members, counts. | BUILT. |
| Roles & Permissions | Templates and org roles, permission and scope editor with change list and confirm dialog, clone / update with ceiling rule, If-Match concurrency, resync, delete when unused. | BUILT. Needs the `roles` flag (on for demo). |
| Consultants | Directory over `consultant_profile` (153 in Acme demo): four tiles with deltas, drawer (Assignments / Applications / Activity), edits with If-Match, assign marketer, deactivate, create application, bulk actions. | BUILT. |
| Resumes | Org resume list with tabs, filters, KPI tiles, drawer with structured preview, set primary (approved only), visibility, approve / reject / reopen (no self-decision), upload (metadata only, no file stored), bulk with Undo, generated export. | BUILT. Resume files are not stored by this page (**by design for now**). |
| Marketing Assignments | Marketers with workload and capacity, consultants table, assign / reassign / unassign / restore with capacity check and audited override, workload report, promote a member to marketer. | BUILT. |
| Jobs | Org job board: list, KPI summary with sparklines, drawer, create with Idempotency-Key, autosave edit with If-Match, bulk status, assign a top match, dismiss / restore a match. | BUILT (admin workspace only; `/w/<other>/jobs` shows "Job Discovery" placeholder). |
| Applications | List and pipeline board and analytics tabs, detail drawer with stepper, notes and activity, Add Application, stage move with Undo (append-only `STAGE_REVERT`). Every stage move is a RECORD. | BUILT (shared with Marketing). No bulk actions; marking Hired does not create a placement. |
| Interviews | KPI tiles, table, calendar month view, pipeline by status, analytics, drawer with rounds, mode, link, interviewers, feedback; Schedule / Reschedule / Send Reminder / Add Feedback are RECORDS (nothing is sent or booked). | BUILT (shared). |
| Clients | Directory (24 clients Acme demo), tiles, health badge (healthy / neutral / at risk from settings `org.clients.healthy_days`, `org.clients.at_risk_days`), drawer with Contacts / Requirements / Activity, contacts with work e-mail only, relationship notes. | BUILT (shared; Account Manager workspace uses it). |
| Placements | Board and list, Extend / End / Terminate side sheets, upcoming placements, extension requests, redeployment pool, events. No bill rate shown to consultants. | BUILT (shared; Finance and Accounts use it). |
| Organization Branding | Draft / publish, versions, logo / favicon / banner (raster only), login preview. | BUILT. |
| Subscription Overview, Consultant Licenses, Billing & Invoices, Feature Usage | Data layer built (21 tables, seeded demo data); no REST resources and no pages. | DESIGNED for UI/API (X5.*, X6.*). See section 7. |
| HR, Finance, Reports (admin menu) | Data layer built (19 `ops_*` tables, seeded); no pages. | DESIGNED. |
| Domains, Integrations, Audit Logs, Settings | Placeholders. Job-data lineage API exists (`GET /api/orgs/{orgId}/audit/job-data`) but no page. | DESIGNED. |

### 4.3 Marketing workspace (Omar; Sarah as manager)

All 14 pages read and write real tables through `/api/orgs/{orgId}/mkt/**` (scope: only consultants the marketer is assigned to, via `MktScope`). Each page has its own demo seeder.

| Page | What it does | Notes / gaps (from the page specs) |
|---|---|---|
| Home | Marketing overview for the caller's assigned talent. | Uses `/mkt/home`. |
| My Assigned Talent | Consultant list, saved views, profile drawer, readiness chips. | |
| Resumes | Resumes of assigned consultants, approval state, drawer. | Marketer-made resumes (act-for builder, X7.5) are DESIGNED. |
| Job Discovery | Org jobs with source label, priority, visa label, saved searches, assign. | Searches the org's own jobs, not external boards (external discovery is Phase 2). |
| Job Matches | Matches (`requirement_match`, stored score), high-confidence rule, compare, assign, dismiss. | The AI/rule matching engine (X8.3, X8.11) is DESIGNED: scores are seeded, no job computes them. |
| Opportunities | Assigned opportunities board: interest, owner, next action, activity, requests. | Write endpoints do not use Idempotency-Key (duplicate guard instead). |
| Job Streams | Six demo streams, syncs, alerts, rules. | Nothing syncs: no connector exists (Phase 2); demo rows are invented. |
| Submissions | Submission records with approval requests; "Record submission" only. | The consultant-side approval of vendor submissions is Phase 1b / DESIGNED. |
| Applications | Tracker over the assigned consultants' applications. | Consent-scoped; a marketer cannot set a consultant's application status. |
| Interviews | Coordination (records) and calendar. | Nothing is sent or booked. |
| Follow-ups, Tasks | Due dates, status updates, escalations; tasks with calendar and deadlines (24 open + 16 completed per marketer in demo). | |
| Activity | Unified feed over the event tables plus record-only "Log Activity". | |
| Performance | Tiles, funnel, readiness donut, goals (`PUT /goals`), benchmarks. | |

**Extension: capture and assign (Release 1).** In the browser extension's org workspace a marketer sees only "Save for consultant...": the page's title, company, location, work mode, employment type, pay label, link, external job id and ATS are captured, the job description is dropped before sending, the marketer types key info (up to 1000 characters), picks up to 20 consultants, priority and due date, and the extension calls `POST /api/orgs/{orgId}/mkt/opportunities/from-extension` with an `Idempotency-Key`. Server rules: unknown fields rejected (400), sensitive text refused (422), job and match find-or-create by URL key / ATS id, one live opportunity per consultant and job, no URL fetch. Status: BUILT (API `MktFromExtensionResource`, extension `SaveJobDialog`, `MarketerView`, `TrackingProvider.saveForConsultant`). Live use on real job boards is **unverified** here.

### 4.4 Consultant workspace (Anika, Ben)

All pages are real routes and real tables (dozens of `cws_*` tables; 32 at the first merge, more since). Rules: no endpoint takes a consultant id from the client; non-consultants and other tenants get a generic 404; money on Offers and Placement is record-only and a bill rate is never shown.

| Page | What it does | Real vs sample |
|---|---|---|
| Home | Tiles, recommended matches, assigned opportunities, applications, upcoming interviews, resume strength, today's focus, tasks. | "Submissions Pending Approval" tile and "Messages from My Marketer" are labelled sample; interview mode is sample. |
| My Career Profile | Profile, certifications, preferences, details with writes. | Real. |
| My Resumes | List, set primary, visibility, rename, duplicate, activity. | Real. |
| My Marketer | Who my marketer is; messages, action plan, collaboration notes. | Mostly sample until marketing messaging exists; Send Message / Schedule Call open an honest "not connected" dialog. |
| Job Discovery, Job Matches | Org jobs and matches with the marketer's quick info and **Open job link**; Express Interest only records interest. | Source link and note come from `cws_job_source`; demo rows point at `jobs.example.com` (sample). No in-app Apply (removed on purpose). |
| Assigned Opportunities | Table with state tabs, details side sheet, respond (interested, decline, ask a question). Two implementations exist, see doubts in section 11. | priority and due date are derived or sample unless a response row stores them. |
| My Applications | Read-only over the consultant's applications; marketer notes never shown. | Real. |
| Submissions & Approvals | Consultant approves or declines a submission package the marketer prepared. | Marketer-created rows are demo stand-ins. |
| Interviews, Interview Prep | Interviews with feedback; self-scored practice sessions, no AI backend. | Real; catalog and checklists are static defaults that should become admin config. |
| Offers, My Placement | Record-only offers (accept / decline / negotiate) and placement details. | Offers are demo stand-ins; accepting does not create a placement. |
| Availability, Tasks & Follow-ups, Activity Timeline, Notifications, Settings | Availability blocks and work preferences; tasks with undo; derived read-only timeline; a derived-and-persisted notification feed; consultant settings (no phone, password or 2FA state is faked). | Notifications have no external producers; SMS is not selectable. |
| My Features | Read-only list of features and allowances. | Allowances and statuses are SAMPLE until `EntitlementService` and the admin catalog supply them. |

**Extension: apply and track (Release 1).** The consultant's extension lists assigned jobs (Jobs tab, `AssignedJobs`) from `GET /api/orgs/{orgId}/con/opportunities`, shows an "Assigned by" chip on a matching page, autofills the consultant's own profile, and the consultant reviews and submits themselves. Submit-detect (where the extension fills: Workday, Greenhouse, Lever, Ashby, Workable, iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite, Indeed SmartApply) records the application and links it to the opportunity (`PipelineApplicationLinker`, server fallback). On LinkedIn Easy Apply and Dice native apply nothing is detected, so **"I applied"** is a first-class action. Status: BUILT in code (extension version 0.66.1, `con` API, linker); not exercised against live sites in this environment (**unverified**).

### 4.5 Features that exist only as a data layer or design

- **Billing and licensing UI/API**: 21 tables and a demo seeder exist (section 7); no REST resource, no pricing engine, no Stripe org billing.
- **HR and Finance**: 19 `ops_*` tables and a seeder exist; no pages.
- **Entitlements**: personal-plan `EntitlementService` exists; org context (`EntitlementContext.ORG`), usage metering and `@RequiresFeature` are DESIGNED.
- **Autopilot prepare for assigned jobs** (X12.2, X12.9), **integrations / webhooks** (X12.3), **SSO and JIT mapping** (X12.4, X12.10), **analytics with k-anonymity** (X12.1, X12.8, X12.12): DESIGNED.

## 5. Page-level cross-check of "built"

I read the route tree (`web/src/app/(tenant)/%5Ft/w/**`): shared page folders for applications, branding, clients, consultants, departments, employees, interviews, invitations, jobs, marketing-assignments, placements, resumes, roles, teams; a catch-all that renders the Dashboard, the 14 Marketing pages (via `marketingPage`) and the placeholder; and 19 sibling folders under `/w/consultant`. `progress-tracker.md` still lists most X8 / X9 / X10 / X7 / X11 stories as "Not Started": that table is **stale** relative to the code, because the pages were built by branch-per-page work (logged in the tracker's Log section) rather than story by story. Use this document and the code for status; use the tracker for the original story IDs.

## 6. Release 1 versus Phase 2

**Owner decision 2026-10-13 (doc 59, ADR-024 revision 2).** Job search and discovery, public pools, connectors and matching engines are Phase 2.

### Release 1 scope: Phase 1 job pipeline

1. Marketer captures a **trimmed** job with the extension and assigns it to one or more consultants (the full description is never sent or stored).
2. Consultant sees the opportunity (web and extension), can mark viewed, interested, decline (with reason), ask for info; opens the source link and applies with their own extension, or presses "I applied".
3. The application is tracked: the consultant's own application record is the source of truth; the organization sees a consent-scoped projection (SUMMARY: stage and dates; FULL: plus shared notes; NONE: no link, no projection).
4. Lifecycle (`mkt_opportunity.state`): ASSIGNED, VIEWED, INTERESTED / DECLINED / NEEDS_INFO, APPLIED, CLOSED. A marketer can never set APPLIED.
5. Provenance and audit for every captured job (section 9).

Build status of Release 1 (doc 60 work packages): database, URL identity, assignment service, `from-extension`, `con` API, linker, `JobDetailMapper` and display cap, provenance columns, `job_data_event` ledger and the per-job audit endpoint are in the code. Extension drawer chip, marketer capture and consultant assigned-jobs list are in the extension. `NoSubmitSurfaceTest` and `NoSubmitFromExtensionTest` exist. What remains unproven here: an end-to-end run on real job sites, and the Testcontainers ITs on a machine with Docker.

### Phase 2 (explicitly deferred)

| Item | Why deferred |
|---|---|
| Job search and discovery across external sources; saved jobs and searches; alerts | Needs source licensing and connectors. Today the Job Discovery pages search the org's own jobs. |
| Stream connectors and ingestion (`recordSync`) | No producer exists; Job Streams shows invented demo rows. |
| Matching engine (rule or AI scoring, nightly `OrgMatchJob`) | Scores in demo are seeded. |
| Licensed feeds and the **source terms / licence registry** (`job_source_terms`, `FULL` detail enrichment, retention purge, takedown handling) | Doc 61 sections 4 and 5. Until a licence exists, jobs are `MINIMAL`. |
| Vendor / client **submission authorization** by the consultant for client requirements (Phase 1b) | Recorded P0 deviation from ADR-010 until the consultant API exists. |
| Duplicate-submission guard across consultants and vendors, data-share direct-application opt-in, storage partition per workspace, SSE push | Listed as deferred in doc 60 section 0. |

## 7. Pricing and licensing model (E3, ADR-012 to ADR-021)

**Personal plans** (locked, unchanged): Free, Pro ($19.99 per month or $49.99 per 3 months at Launch 1, $24.99 / $54.99 at Launch 2), Autopilot ($39.99 / $99.99). No annual plan. Core autofill is free and identical in both tiers. Stripe Checkout and Portal; webhooks write the subscription mirror; refunds: none, cancel anytime. Joining an organization never cancels, merges or discounts a personal plan (ADR-018).

**Organization model (decided 2026-10-12, E3).**

| Part | Rule |
|---|---|
| One-time setup fee | Always charged, catalog item `ORG_SETUP_FEE`. |
| Base licence | Mandatory per consultant, tied to the org membership (`consultant_license`), one live licence per membership. Non-consultant seats (Admin, HR, Finance, Marketing, Account Manager) consume no consultant licence. |
| Feature add-ons | Priced individually per consultant (matching, tailoring, inbox, interview prep, Autopilot prepare, assisted applications, and others), each with an allowance. Presets are shortcuts that pick add-ons, never a price. |
| Org modules | Flat or per-role items, for example the marketer seat (`module.talent_marketing`). |
| Contracts and discounts | Per-org contract prices (effective-dated, immutable), volume tiers, one discount per line; precedence per ADR-014 and ADR-015. |
| Billing | One Stripe subscription per organization; add now, remove at period end; the backend quotes with an expiry; money is stored as minor units plus currency; invoices snapshot lines. |
| Margin guard | Every subscription keeps at least 80 percent gross margin in the worst case (AI budget fully spent plus Stripe); every service at least 20 percent. Base and feature prices are admin inputs that must pass the guard and an "above individual" check. |
| Catalog ships without prices | Nothing is sellable until an admin publishes. Draft defaults in doc 21 section 6 and `08-decisions-for-user.md` C8 (base $14.99, features $1.99 to $19.99, marketer module $29.99) are **proposals, not seeded**. |
| AI budgets | Per billing period: Pro $3 per month / $8 per quarter; Autopilot $6 / $16. Nothing is unlimited. |

**Build status.** Built: catalog and billing **tables**, entities, org-first repositories and a demo seeder (`BillingDemoSeeder`). The demo prices (Standard $79, Professional $149, Enterprise $199 per consultant per month; add-ons $9 to $45; org add-ons $500 and $300) live only in the seeder as clearly marked demo data and are not product prices. Not built: `PricingEngine`, `MarginCalculator`, org `EntitlementService.check`, usage ledger writes, Stripe org gateway, the four billing pages, admin catalog pages. Enforcement flag `flag.enterprise.billing` is DEFERRED.

## 8. Non-negotiables (these gate release; QA tests them)

| Rule | Where it comes from | How it shows in the product | Automated guard |
|---|---|---|---|
| **E1: the consultant submits; Kiwiply never submits.** Marketers prepare, request and record. No auto-submit, no CAPTCHA bypass, no ticking attestation boxes. | ADR-010, `08` E1, `CLAUDE.md` | Buttons say "Record as Submitted", "Record submission"; toasts say nothing is sent. Marketer extension session loads no consultant bio or answers. | `NoSubmitSurfaceTest` (no org route sets `Application.status` or transmits a submission), `NoSubmitFromExtensionTest`, extension `no_submit` test. |
| **E2: HR and Finance are record-only.** No identity documents, no DOB, no SSN / tax / bank numbers; never moves money. | ADR-011, `08` E2, `CLAUDE.md` | Documents page renamed Policies (D7); money fields are labels or minor-unit records; cards never touch us. | `SensitiveContent` scanner on free-text writes (X11.7 makes coverage a CI property: DESIGNED). |
| **No sensitive PII anywhere**, product-wide. | `CLAUDE.md` (2026-10-11) | Seeds contain no phone, DOB, document or bank numbers; Settings does not fake 2FA or connected tools. | Seeder tests, scanner. |
| **Tenant isolation.** Host decides the tenant; token carries `tid`; `org_id` first in every index and repository method; composite tenant FKs; generic 404. | ADR-001, 003, 004; docs 04, 42 | Beta cannot see Acme; unknown hosts expose nothing. | `OrgIsolationIT` (every `/api/orgs/**` route), `EntRepositoryContractTest`, `TenantResolutionIT`, `TenantBoundSessionIT`. |
| **Everything admin-configured.** Flags, prices, limits, caps and defaults are data. | `CLAUDE.md` (2026-10-11) | Settings registry, catalog, `org_setting` overrides (for example marketing overload percent, bulk max, client health days). | Setting definition tests. Known hard-coded defaults to migrate are listed in `consultant-workspace-merge-notes.md`. |
| **Server is the source of truth; extension is a read-only mirror** that creates resumes and learns answers. | `CLAUDE.md` | Edits happen on the web. | |
| **One design system** (`@kiwiply/ui`), no inline svg or hand-rolled primitives. | `CLAUDE.md` | Web ESLint enforces the svg rule. | ESLint. |
| **Additive migrations only**, flags default OFF, personal subscriptions untouched. | ADR-023, ADR-018 | | Migration ITs; `PersonalSubscriptionUnchangedIT` (DESIGNED, X5.9). |

## 9. Data collection and audit story (doc 61)

**Question an auditor asks:** what job data do you hold, where did it come from, who put it there, under what terms, who can see it, how long do you keep it, how do you remove it.

| Question | Answer in the product today |
|---|---|
| What do we hold? | Job facts (title, employer, location, work mode, employment type, pay label, posted date), source link and identity (`job_url`, `url_key` hash, `external_job_id`, `ats_platform`), the marketer's key-info note, assignment, response and applied state, consent-filtered application progress. **Not held in minimal mode:** the full job description, company contacts, recruiter names, applicant counts, any attachment. |
| Where from? | Marketer capture by an explicit click in the extension (trimmed on the client, then whitelisted on the server with unknown-field rejection) or typed by hand. The server never fetches the job URL. |
| Who put it there? | Provenance columns on every job: `capture_source`, `captured_by_member_id`, `captured_at`, `capture_method` (USER_CLICK / MANUAL_ENTRY / IMPORT / FEED), `extension_version`, `capture_payload_hash` (SHA-256 of the exact trimmed payload), `detail_level`. |
| What happened to it? | Append-only ledger `job_data_event` (CAPTURED, EDITED, ASSIGNED, UNASSIGNED, CAP_CHANGED and others), written in the same transaction as the change, no update or delete in the repository (tested). |
| Who can see it? | Marketers: only consultants they are assigned to. Consultants: only their own opportunities (forbidden-field DTO test). Admins: org-wide. A **display cap** `enterprise.jobs.detail_cap` (MINIMAL default, FULL later) is enforced in one server mapper, `JobDetailMapper`; the effective level is the lower of the row and the org cap. |
| Evidence an admin can pull | **BUILT:** `GET /api/orgs/{orgId}/audit/job-data?jobId=&from=&to=&page=&size=` (permission `audit.view`, ORG scope, generic 404 otherwise). **DESIGNED, not built:** summary endpoint, CSV export (audited as EXPORTED), a web page (the Audit Logs menu item is a placeholder), takedown recording. |
| Terms and licences | **PHASE 2:** `job_source_terms` registry, FULL enrichment, `max_retention_days` purge job, takedown SLA, capture allow-list derived from terms. Until then everything is MINIMAL and no job can be enriched. |
| Retention and removal | Minimal data lives with the org record; org offboarding removes job rows and ledger with the org; consultant erasure extension to the new tables is a backlog item (**unverified** whether built). |

Also existing: org audit log (`org_audit_event`) for who did what, written by admin writes (roles, invites, assignments, branding and others), and the per-stage event tables (`mkt_opportunity_event`, `talent_application_event`, `data_share_event`).

## 10. Architecture overview

| Layer | Technology | Key facts |
|---|---|---|
| API | Spring Boot (Java 17), Liquibase, MySQL 9.2, embedded Tomcat container | Shared schema, `org_id` on every tenant table (ADR-001). `TenantResolverFilter` resolves the host; `TenantTokenBindingFilter` enforces the `tid` claim; `OrgPermissionInterceptor` + `AuthorizationService` evaluate permission, scope, state, consent. Settings registry and feature flags. Repositories under `repository/ent/**` are bare `Repository` interfaces with org-first methods (contract-tested). About 63 Liquibase changelogs dated 20261015 onward for Enterprise, additive, one precondition-guarded changeSet per object. |
| Web | Next.js (`output: standalone`, `next start`), Tailwind, `@kiwiply/ui` | Tenant hosts are rewritten by `proxy.ts` to the `(tenant)/_t` tree; BFF routes under `web/src/app/api/orgs/[orgId]/**` forward to the API (the consultant BFF folder is `consultant`, the API namespace `con`, because `con` is a reserved Windows device name). Server-rendered session from `GET /api/me/tenant`. |
| Extension | WXT (Vite) MV3, vanilla-JS engine on `window.JAF`, React drawer | Toolbar icon injects the drawer; all backend calls go through the `TrackingProvider` seam; workspace chip (Personal / org), marketer "Save for consultant", consultant assigned-jobs list. Version 0.66.1. |
| Edge and hosting | Docker Compose on one self-managed box, shared Caddy (BeeCompete owns :80/:443), AWS S3 for files, Cloudflare DNS | CI/CD deploys on merge to `main`; `develop` is the integration branch. Custom-domain on-demand TLS needs a user-applied Caddy change (E5). |
| Identity | One Kiwiply account; org membership per tenant | A person can hold a personal plan and several org memberships; benefits never stack across workspaces. Tenant host sign-in; extension token pair minted by web-connect. |

**Tenancy rules in one place.** Tenant first, then membership, then permission, then scope, then entitlement, then consent, always on the server. Data belongs to people; orgs get links, views and approvals. Money is immutable history. Additive only. Honest UI. Reversible decisions (each ADR states how to back out).

## 11. Roadmap with honest statuses

Status key: **Done** = in code on this branch; **In progress** = partly built or built without proof; **Next** = the next build target by the docs; **Later** = designed, no near-term slot.

| Area | Item | Status | Evidence / note |
|---|---|---|---|
| Foundation | Flags, tenancy schema, host resolution, tenant-bound sessions, roles as data, scopes, role writes, invitations (multi-role), tenant context in logs | Done | X1.1 to X1.8, X1.10, X1.12, X1.14, X1.15 completed in the tracker |
| Foundation | Isolation test gate (HostUnknown / HostMismatch / ForgedHostHeader ITs), ops endpoints off the public host, platform admin Organizations page | Next | X1.9, X1.13, X1.11 Not Started |
| Shell and branding | Branded login, shell, dashboard, branding page, tenant assets | Done | X2.2 to X2.6, X2.8, X2.10, X2.12, X2.13, X2.15 to X2.18 |
| Shell and branding | User profile, Organization Settings, enforced MFA, E2E-A / E2E-B journeys | Next | X2.7, X2.9, X2.14, X2.11 |
| Custom domains | Domains page, DNS verification, certificates, primary domain, suspension, edge runbook | Later (blocked on the user applying the Caddy change after X3.3) | X3.* Not Started; E5 |
| Org admin | Roles page and API, employees page and lifecycle, groups, invitations | Done | X4.1 to X4.6, X4.11, X4.12 |
| Org admin | Audit viewer page, assignments foundation as designed (`org_assignment` is built and used by the Marketing Assignments page), workload view, `org_member_role` authoritative | In progress | X4.7, X4.8, X4.9, X4.10 listed Not Started although the assignments page exists |
| Talent pipeline (admin side) | Consultants, resumes, jobs, applications, interviews, clients, placements, marketing assignments pages | Done (visual exact-match to boards not signed off) | page branches merged on `ent-integration-all` |
| Release 1 | Marketer capture, assignment, consultant response, apply and track, provenance ledger, per-job audit API | Done in code; In progress for proof | Needs Docker IT run and a live-site run |
| Marketing workspace | 14 pages | Done | `page-mkt-*.md`; ITs written, several not run |
| Marketing management workspace | 8 pages incl. approvals, workload, escalations | Later | Not built |
| Consultant workspace | 19 pages | Done (sample content labelled) | `page-consultant-*.md` |
| Resume management | Org resume links API, approval workflow, act-for builder and AI, readiness checklist | In progress | Resumes page and approvals built; X7.4 to X7.10 act-for / AI not built |
| Billing and licences | Catalog tables and demo data | Done (data layer) | `billing-data-foundation.md` |
| Billing and licences | Catalog admin, PricingEngine, margin calculator, license lifecycle, entitlement service for orgs, usage ledger, Stripe org billing, four billing pages, platform pricing admin | Next (largest unbuilt block, X5 and X6) | All Not Started |
| HR and Finance | Data layer | Done | `ops-data-foundation.md` |
| HR and Finance | HR, Finance, Reports pages, PII scanner coverage, talent pools, timesheets bridge | Later | X11.* Not Started |
| Account manager workspace | Home, contacts, requirements, submissions, offers | Later | X10.* partly (Clients, Placements built) |
| Advanced | Org analytics with k-anonymity, executive workspace, integrations / webhooks, SSO, TOTP / passkeys, Autopilot prepare for assigned jobs, platform analytics, second-instance readiness | Later | X12.* Not Started |
| Phase 2 job intelligence | External job search, connectors, matching engine, licence registry and FULL detail, Phase 1b submission authorization | Later (owner-deferred) | doc 59 section 10, doc 61 |

### Doubts and unverified items worth a product decision

1. **RESOLVED on `ent-opp-unify` (one page, one record: the consultant answer is `mkt_opportunity`; see `videos-index.md` "One consultant answer").** Was: two consultant "Assigned Opportunities" implementations.** `/w/consultant/opportunities` is served by the board-driven page in `consultant-ws/OpportunitiesPage.tsx` (reads `/me-workspace/opportunities`, `cws_opportunity_response`). The Release 1 page in `consultant-ws/opportunities/*` (reads `/con/opportunities`, `mkt_opportunity.state`) is reachable only through the catch-all path `/w/consultant/opportunities/{id}` because the sibling folder wins the list URL. Whether the two share state (a job the marketer assigns with the extension appearing in the board page) is **unverified**. QA should walk Phase 1 story: extension assign, then check the consultant list and detail.
2. **Tracker is stale** for X7 to X11 page work (section 5).
3. **Demo branding colours differ between docs**: the runbook says Acme is teal / amber; the seeder constants are `#1d5bd8` (blue) and `#f59e0b` (amber). Code wins.
4. **Marketing Manager role** (Sarah's second role) has no built workspace; the Marketing workspace is primary for MARKETING_SPECIALIST. Whether Sarah's switcher shows Marketing is **unverified** (it depends on which nav permissions the manager template holds).
5. **Pixel-exactness against the boards** is not signed off for any page (coordinator handoff, "NONE is signed off as exact match").
