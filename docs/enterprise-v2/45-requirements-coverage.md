# 45 — Requirements coverage audit (Session E, Task 2, 2026-10-12)

> Source of intent: the user's 33-section prompt (`docs/ENTERPRISE-V2-REQUIREMENTS.md`, verbatim).
> Method: every section, role, page, feature, lifecycle stage, scenario and DoD line was checked for
> (1) a design doc that specifies it and (2) at least one story in `docs/roadmap/areas/ent.json`
> that builds it. Status: **Covered** · **Partial** (doc or story thin — fixed below) · **Missing**
> (no story — fixed below) · **Deviation** (deliberate, with the reason and the escalation id).
> `CLAUDE.md` locked decisions win on conflict; every deviation is listed in `08-decisions-for-user.md`.
> Every Partial/Missing row names the fix applied in this session (Task 5 stories).

## 0. Summary

| Status | Rows | Notes |
|---|---|---|
| Covered | 118 | doc + story present before this audit |
| Partial → fixed | 9 | thin story or page not named — amended/split in Task 5 (rows marked ⟶) |
| Missing → fixed | 4 | no story owned it — new stories X6.17, X11.8, X12.8, X12.12 |
| Deviation (deliberate) | 8 | E1, E2/D7, E3, E17, C1, C3, D4, D5 — locked rules or user answers |

Gaps found and fixed (detail in the tables): **break-glass / platform Security page** (E8 had a
default but no story) → **X6.17**; **Talent Acquisition pages** (candidates, talent pools; 16 §5.5
said "hidden until built") → **X11.8**; **Executive/Viewer workspace** (only a title in X12.1) →
**X12.8**; **Platform Analytics + platform Integrations pages** (§25 platform admin, no owner) →
**X12.12** (+ X12.3 for the integrations page); **Marketing Manager "Escalations" page** (16 §5.3
pointed at X8.6, which did not mention it) → X8.6 amended; **Org Admin "Invitations" nav item**
(preset filter, badge) → X4.12; **Consultant "Settings" page** → X9.11; **§9 activate/deactivate
verbs** → mapped explicitly in X4.4; **§30 story format** → Task 5 (every story now carries the 17
fields; X12.* fully specified; L stories split).

## 1. §1–§5 — mission, vision, confirmed architecture, audit, tenant security

| Prompt item | Doc(s) | Story ids | Status |
|---|---|---|---|
| §1 inspect first, reuse, debate, risks, docs, stories, incremental, tracker, preserve personal + subscriptions, isolation, one deployment, no disconnected dashboards | 01, 02, adr/*, 06, 07, progress-tracker | X0.1 | Covered |
| §1 escalate security/financial/destructive/contract decisions, safe defaults | 08 | — (process) | Covered |
| §2 personal capabilities verified before reuse | 01 §1 reuse matrix | X0.1 | Covered |
| §2 org accounts, employees/consultants, roles, departments/teams, assignments, resumes/profiles, discovery/matching, applications, interviews, clients, placements, HR/Finance, licenses, per-consultant features, monitor ops + costs, branded experience | 00, 03, 05, 14–17, 20, 30–36 | X1.11/X1.8, X4.3, X4.1, X4.5, X4.7, X7.*, X8.2–X8.4, X9.*, X10.*, X11.*, X5.4, X6.3, X2.4 + X6.1, X2.5 | Covered |
| §2 flexible for other org types | 03 (`OrgType` additive, roles as data) | X1.2 (E15), X1.6 | Covered |
| §3.1 one shared frontend/backend, tenant-aware access, runtime branding, no per-customer deployment; debate physical isolation | ADR-001, 02 topic 1, 04 | X1.3, X1.4 | Covered |
| §3.2 subdomains + custom domains: registration, uniqueness, DNS instructions, ownership verification, HTTPS, activation, primary, redirects, suspension, removal, monitoring/troubleshooting; provider evaluation | 10 (all), ADR-002, 44 §6–7 | X1.11 (subdomain), X3.1 (register/instructions), X3.2 (verify), X3.3 (certs, troubleshooting, monitoring), X3.4 (primary/redirect), X3.5 (suspend/remove), X3.6 (edge), X12.6 (Cloudflare eval) | Covered |
| §3.3 login-first steps 1–8, direct entry with a valid session, no fallback to another portal or kiwiply.com | 12 §4, 11 §3, 16 §2.3 | X1.3, X1.4 (UNKNOWN → tenant 404), X1.5, X2.3 (EXISTING_SESSION), X2.6 | Covered |
| §3.4 branding fields (name, logo, favicon, 3 colours, banner, welcome, theme, nav prefs, terminology); one login component + one shell; no redeploy | 11 §1–§2, 16 §2 | X2.5, X2.12, X2.13, X2.3, X2.2 | Covered |
| §3.5 shared character: login welcome, dashboard greeting, empty states, interview encouragement, placement/application celebration, warning/error; compact | 11 §6 pose map (8 poses), 09 row 5 | X2.8 (map), X2.3 welcome, X2.4 greet, X1.4 warn, X9.7 encourage, X10.6/X2.6 celebrate, X2.15 empty states | Covered |
| §3.6 V2 branch, inspect git, flags, incremental migrations, tests | 06 §3–§4, HANDOFF | X1.1 | Covered |
| §4 audit list (router, backend, auth, roles, entities, orgs, resume builder, profiles, discovery, matching, applications, interviews, notifications, email/calendar, AI, subscriptions, pricing, Stripe, gates, limits, storage, jobs, hosting, CI/CD, tests) + reuse matrix | 01 §1–§3 | X0.1 | Covered |
| §5 tenant model (org, membership, config, domain, branding, roles, permissions, feature settings, license entitlements, billing account) | 03 §2, 41 | X1.2, X1.6, X3.1, X2.5, X5.4, X6.12 | Covered |
| §5 isolation per layer: APIs, queries, files, resumes, applications, interviews, placements, subscriptions, billing, notifications, AI, search indexes, jobs, logs/audit, integration credentials | 04 §4 (per-layer table), 41 R1–R10, 42 | X1.3, X1.7, X1.9 (gate), X1.10 (jobs/logs), X2.13 (assets), X5.8 (AI), X12.3 (`SecretBox` credentials) | Covered — no search index exists (01); 04 §4 rule applies if one is added |
| §5 never trust client tenant ids; unknown domains fail safely; negative cross-tenant tests | ADR-003, 04 §2, 43 N1–N24 | X1.3, X1.4, X1.9, X1.13 | Covered |

## 2. §6–§8 — roles, profile vs dashboard, permissions

| Prompt item | Doc(s) | Story ids | Status |
|---|---|---|---|
| §6 default templates + configurable permissions + multiple roles per user | 05 §3, ADR-005 | X1.6, X4.1 | Covered |
| §6 Platform Super Admin (orgs, catalog, pricing, subscriptions, domains, integrations, health, security); privileged customer-data access separately restricted and audited | 05 §2, 16 §5.9, 42 §3.9 (E8) | X1.11, X3.3, X6.9, X6.10, X12.3, X12.12; **break-glass had no story** | **Missing → fixed: X6.17** (break-glass grant, platform Security page, tenant-visible audit) |
| §6 Organization Admin responsibilities (setup, branding, domain, employees, invitations, groups, roles, assignments, marketing supervision, subscription, reports, integrations, config) | 14, 15, 16 §5.1 | X2.9, X2.5, X3.1, X4.3, X1.8, X4.5, X4.1, X4.7, X4.8, X6.1, X4.9, X12.3, X2.9 | Covered |
| §6 Consultant / Talent | 13, 30, 32, 33, 38 §3 | X7.2, X7.4, X9.1, X9.2, X9.5, X9.7, X9.8, X10.6, X6.5 | Covered |
| §6 Talent Marketing Specialist (roster, resume review, authorized edits, discovery, AI matching, assignment, submission coordination, follow-ups, interviews, status, placements) | 17, 30, 31, 38 §2 | X8.1, X7.4, X7.5, X8.2, X8.3, X8.4, X10.3, X8.6, X9.5, X10.4 | Covered — "submission coordination" = request + record (E1) |
| §6 Talent Marketing Manager (teams, assignments, performance, approvals, escalations, workload) | 17, 31 §12, 16 §5.3, 38 §2 | X4.7, X4.8, X8.5, X8.7, X8.6 (escalations) | **Partial → fixed:** X8.6 ⟶ gains the Escalations page + `ESCALATION` task kind |
| §6 HR Specialist (onboarding, records, lifecycle, documents, policies, compliance, offboarding) | 36 §2–§3 | X11.1, X11.2, X11.3, X4.4 | Covered (documents = policies, D7) |
| §6 Finance Specialist (subscriptions, billing, invoices, placement financials, timesheets, payments, reports) | 36 §4, 28 | X11.4, X11.5, X11.6, X6.4 | Covered — record-only (E2) |
| §6 Account Manager (clients, contacts, requirements, offers, placements) | 34, 35, 38 §5 | X10.1, X10.2, X10.5, X9.8, X10.4 | Covered |
| §6 Talent Acquisition Specialist (sourcing, screening, talent pools, onboarding coordination) | 36 §3 (TA paragraph), 05 §3 template, 16 §5.5 ("hidden until built") | X11.3 mentions `talent_pool` in one bullet only | **Partial → fixed: X11.8** (Candidates + Talent pools pages, `candidates.manage`, D5 rule) |
| §6 Executive / Viewer (org-wide analytics, read-only visibility) | 05 §3 `EXECUTIVE_VIEWER`, 16 §5.8, docs/design/org/analytics.md | X12.1 title only | **Missing → fixed: X12.8** (EXEC workspace Home/Reports with k-anonymity) + X12.1 specified |
| §7 one basic profile per member (photo, names, work email, phone, title, timezone, language, notification prefs, security, MFA, memberships, roles read-only); avatar menu; not the default page | 13, 12 §3 | X2.7, X2.2 (AccountMenu), X2.6 (landing ≠ /me) | Covered |
| §7 Organization Profile separate (name, logo, contact, addresses, branding, domains, policies, teams, integrations, subscription) | 14 §4 | X2.9 | Covered |
| §7 Org Admin lands on the Org Admin Dashboard; widgets (totals, licensed, available, activity, applications, interviews, placements, approvals, team performance, subscription, finance, activity, alerts, quick actions) | 14 §2 | X2.4 (+ provider beans in X6.1, X7.2, X8.5, X8.6, X10.4, X11.5, X12.1) | Covered |
| §7 multiple roles: primary role dashboard, optional workspace switcher, no separate accounts | ADR-007, 16 §3–§4 | X2.2, X4.2 | Covered |
| §8 separation (system role, org role, title, team, department, manager, permission, scope, assignment, entitlement); scopes Own/Assigned/Team/Department/Organization; 8-step evaluation; backend-enforced | 05 (11-step order), ADR-005/021 | X1.7, X5.6, X5.16 | Covered |

## 3. §9–§13 — employees, assignments, resumes, lifecycle, clients

| Prompt item | Doc(s) | Story ids | Status |
|---|---|---|---|
| §9 lifecycle invite → accept → roles → department → team → manager → activate → suspend → deactivate → reinstate → offboard | 15 §2 (seat states) | X1.8, X4.3, X4.4 | **Partial → fixed:** X4.4 ⟶ maps the prompt's verbs explicitly (activate = invite accepted/reinstated; deactivate = suspend or offboard with an immediate last day) |
| §9 bulk operations, audit history, records never destroyed, multiple memberships per identity | 15 §3.2, 12 §6, ADR-023 | X4.3, X4.9, X4.4, X1.5 | Covered |
| §10 primary/backup/manager/team ownership, effective dates, history, reassignment, temporary delegation, workload; auditable entity | 17, ADR-008 | X4.7, X4.8, X4.13 | Covered |
| §11 reuse the resume builder; directory fields (photo, skills, experience, availability, marketing status, marketer, license, completeness); named resumes, dates, primary, visibility, ownership, versions, approval, sharing, view/download/print, audit; personal vs org-managed; consent; no duplicate builder | 30, ADR-009, 13 | X7.1, X7.2, X7.3, X7.4, X7.5, X7.6, X7.7 | Covered |
| §12 lifecycle stages (onboarding → … → extension/redeployment) and the separated entities (opportunity, requirement, match, submission, application, interview, offer, placement) with transitions, ownership, approvals, history, notifications | 31 §2–§6 state machines, 03 §2.4, 41 | X8.10 (schema + transitions), X8.3–X8.6, X10.2, X10.3, X9.2, X9.5, X9.8, X10.4 | Covered |
| §12 marketer workflow "submit through authorized supported channels" | ADR-010, 31 §5 | X8.5, X10.3 | **Deviation (E1, answered):** the consultant submits; the marketer prepares, requests authorization and records the submission; Kiwiply never submits |
| §12 consultant workflow (review, accept/decline, approve, apply, track, prepare, attend, feedback, offers, placements) | 32, 33, 35, 38 §3 | X9.1, X8.5, X9.2, X9.7, X9.5, X9.8, X10.6 | Covered |
| §12 duplicate-submission prevention; external board terms | 31 §8–§9 | X8.8, X8.4, X8.5 (`APPLY_SELF` only for postings) | Covered |
| §13 clients, end clients, vendors, contacts, requirements, submissions, interviews, offers, placements, extensions, redeployment; placement ≠ application | 34, 35, ADR-011 | X10.1–X10.8, X9.8 | Covered (MSA/SOW documents = labels only, D3) |

## 4. §14–§24 — subscriptions, catalog, pricing, licenses, entitlements, metering, billing, pages

| Prompt item | Doc(s) | Story ids | Status |
|---|---|---|---|
| §14 consultant-based subscriptions; staff do not consume licenses; org-level entitlements for admin modules; price formula; per-consultant configs A–D; no fixed packages | 20, ADR-012, 21 §3.5 | X5.4, X5.11 (org modules), X5.5 | Covered — **Deviation E3 (answered):** replaces CLAUDE.md's per-person items |
| §15 catalog fields (key, name, description, category, price, currency, period, allowance, unit, dependencies, eligibility, effective dates, version, status); feature ≠ price; immutable price versions; never change contracted prices | 21 §2, 41 §3.3, ADR-013 | X5.1, X5.2, X5.5 (contract price versions) | Covered |
| §15 features: AI Job Matching, AI Resume Tailoring, Resume Optimization, Advanced Resume Versions, Email Monitoring, Marketing-Assisted Applications, AI Interview Prep, Advanced Job Alerts, Application Analytics, Approved Automation, Additional AI Credits | 21 §3 (12 definitions), 37 | X5.2 (seed), hooks X7.5, X7.10, X8.3, X8.11, X9.7, X9.9, X12.2/X12.9 | Covered |
| §16 required base license; presets as shortcuts; dependency kinds (technical, commercial, integration, consent); cost impact + confirmation; never silently add | 21 §3.4–3.5, ADR-012, 28 §4 | X5.2, X5.4, X6.3 (cost-confirm sheet), X6.13 | Covered |
| §17 platform admin manages base/feature prices, versions, currencies, intervals, promotions, discounts, contracts, negotiated rates, volume discounts, presets, allowances; precedence; no double discounts; money types; history + invoice snapshots; org admins cannot change prices | 22 §3 (precedence), 23, ADR-014/015, 28 §6 | X5.3, X5.5, X5.15, X6.9, X6.16 | Covered — **Deviations:** E17 (monthly only for orgs), C4 (USD only at launch) |
| §18 assign, select/remove features, upgrade, schedule downgrade, suspend, cancel, reactivate, bulk assign/modify, history, pricing impact; license on membership; effective dates; isolation across orgs | 20 §2–§4, 27 | X5.4, X5.14, X5.12, X6.2, X6.3 | Covered |
| §19 impact preview fields; backend-authoritative totals; price-version validation / expiring quotes | 22 §8 (quote DTO), ADR-019 | X5.5 (QuoteService), X6.3 (QuoteSummary) | Covered — taxes: **Deviation C3** (automatic tax off until registrations exist; `taxEstimate` null with the note) |
| §20 entitlement service steps 1–10; actor/beneficiary record; usage charged to the beneficiary unless shared org allowance | 24, 05 §7, ADR-021 | X5.6, X5.16, X5.8 (`AiCallContext`) | Covered |
| §21 metering: allowances, overages, ledger fields, idempotency, reservations for async with release on failure, individual vs pooled | 25, ADR-016 | X5.7 | Covered |
| §22 personal subscriptions preserved; workspace-scoped entitlements; never combined; never cancelled; regression tests | 29, ADR-018 | X5.9, X9.9, X9.10 (E2E-E) | Covered |
| §23 billing engine: org billing account, license charges, feature charges, aggregation, discounts, contracts, invoices, renewals, prorations, credits, refunds, cancellation, failures, grace, webhooks, reconciliation; one org-level Stripe relationship; aggregate identical charges; precision; idempotency | 26, 27, ADR-017/019/020 | X6.12, X6.6, X6.14, X6.7, X6.15, X6.8 | Covered — **Deviation C1:** no refunds (locked); credits behind `enterprise.billing.credits` |
| §24 Subscription Overview · Consultant Licenses · Configure Consultant License · Billing & Invoices · Feature Usage · Platform Pricing Admin (every listed field) | 28 §1–§6 | X6.1, X6.2, X6.3, X6.4, X6.5, X6.9 | Covered |

## 5. §25 — page inventory per role (every item)

| Role · pages | Doc | Story ids | Status |
|---|---|---|---|
| Org Admin: Home, Employees, Invitations, Teams, Departments, Roles & Permissions, Consultants, Resumes, Marketing Assignments, Jobs, Applications, Interviews, Clients, Placements, Subscription Overview, Consultant Licenses, Billing, Feature Usage, HR, Finance, Reports, Branding, Domains, Integrations, Audit Logs, Settings; default home; My Profile via avatar | 16 §5.1 (row per page) | X2.4, X4.3, **Invitations** (preset + badge), X4.5 (×2), X4.1, X7.1, X7.3, X4.7, X8.2, X9.4, X9.6, X10.1, X10.4, X6.1, X6.2, X6.4, X6.5, X11.3, X11.4, X4.9 + X12.7, X2.5, X3.1, X12.3, X4.9, X2.9, X2.6, X2.7 | **Partial → fixed:** Invitations nav item + INVITED badge ⟶ X4.12 |
| Talent Marketing Specialist: Home, My Assigned Talent, Resumes, Job Discovery, Job Matches, Opportunities, Submissions, Applications, Interviews, Follow-ups, Tasks, Activities, Performance | 16 §5.2, 38 §2 | X8.1, X8.1, X7.3, X8.2, X8.3, X8.4, X10.3, X9.4, X9.6, X8.6 (×3), X8.7 | Covered |
| Marketing Manager: Home, Team, Consultant Assignments, Pipeline, Approvals, Workload, Escalations, Reports | 16 §5.3 | X8.1, X4.3 (preset), X4.7, X8.4, X8.5, X4.8, **X8.6 ⟶ Escalations**, X8.7 | **Partial → fixed** (X8.6) |
| Consultant: Home, My Profile, My Resumes, Job Matches, Assigned Opportunities, Applications, Interviews, AI Interview Preparation, Offers, Placements, My Available Features, Notifications, Settings; career profile ≠ basic identity | 16 §5.4, 38 §3, 13 | X9.1/X9.11, X7.2, X7.3, X8.3, X9.2, X9.2, X9.6, X9.7, X9.8, X10.6, X6.5, X9.11 | **Partial → fixed:** Settings page (org-scoped prefs: calendar `include_company`, Autopilot opt-in later, notification kinds) ⟶ X9.11 |
| HR: Home, Employees, Onboarding, Documents, Compliance, Lifecycle, Offboarding, Reports | 16 §5.5, 36 §3 | X11.3, X4.3, X11.1, X11.2 (Policies), X11.2, X11.1, X4.4, X11.6 | Covered — **Deviation D7:** "Documents" is labelled Policies (E2) |
| Finance: Home, Consultant Subscriptions, Billing, Invoices, Placements, Timesheets, Approvals, Payments, Reports | 16 §5.6, 36 §4 | X11.4, X6.1 (read), X6.4, X6.4, X11.5, X10.8/X11.9 (H), X11.9, X11.5, X11.6 | Covered (record-only) |
| Account Manager: Home, Clients, Contacts, Requirements, Submissions, Interviews, Offers, Placements | 16 §5.7, 34 §5 | X10.5, X10.1, X10.1, X10.2, X10.3, X9.6, X9.8, X10.4 | Covered |
| Platform Admin: Platform Home, Organizations, Tenant Provisioning, Domains, Subscriptions, Feature Catalog, Pricing, Commercial Agreements, Integrations, Platform Analytics, Security, Tenant Health, Settings | 16 §5.9 | existing, X1.11, X1.11, X3.3, X6.10, X5.1/X6.9, X6.9, X6.9, **X12.3** (platform integrations view), **X12.12**, **X6.17** (Security: break-glass log), X3.3, A5.1 (existing registry) | **Missing → fixed:** X12.12 (Platform Analytics), X6.17 (Security), X12.3 ⟶ platform-side delivery view |

## 6. §26–§33 — UX, debate, docs, phases, stories, DoD, scenarios, execution

| Prompt item | Doc(s) | Story ids | Status |
|---|---|---|---|
| §26 UX standards (identity preserved, Gen Z/Alpha, enterprise-grade, responsive, accessible, consistent; compact actions, icons, small character, badges, search/filters, grid/list, spacing, scrolling, consistent header/sidebar; no oversized edit buttons; no single-viewport dashboards; viewport-height independently scrollable sidebars; reuse) | 16 §1 checklist, 38, 28 §0 | X2.2 (sidebar AC), X2.15, every page story carries the checklist | Covered |
| §27 debate, 23 topics, 7 perspectives, per-topic structure, final decisions | 02, adr/ADR-001…023 | X0.1 | Covered |
| §28 documentation set under `docs/enterprise-v2/` (37 named docs) | README index: 00–09, 10–17, 20–38, 40–45, adr/, progress-tracker | X0.1 | Covered (§28 names mapped in README) |
| §29 phases 0–12 as vertical slices; adjust for dependencies; isolation + entitlements before protected features | 06 (reordering facts §0, flags, migration) | epics X0–X12 | Covered |
| §30 story fields (id, epic, title, persona, objective, functional, UI, backend, DB, APIs, permissions, entitlements, deps, AC, tests, complexity, DoD); statuses; tracker; evidence | 07, progress-tracker, build-master-roadmap `--set` | all 154 stories | **Partial → fixed (Task 5, verified):** 7 X12 stories had titles only; now 154/154 carry every field (`node` check: none missing); sizes S 15 · M 138 · L 1 (X0.1, done) |
| §31 DoD (functionality, permissions, isolation, entitlements, design standards, states, tests, safe migrations, docs, no regression) + billing additions | 06 §5, every story's DoD line | all | Covered |
| §32 A Org Admin journey | 43 §E2E-A | X2.11, X3.8 | Covered |
| §32 B multi-role | 43 | X2.11 | Covered |
| §32 C consultant license | 43 | X5.10 (API), X6.11 (UI) | Covered |
| §32 D marketing specialist (Sarah/Anika through placement) | 43 | X8.9 (to authorization), X9.10 (through outcome), X10.4 (placement recorded) | Covered — submission step is Anika's (E1) |
| §32 E personal-subscription compatibility | 29, 43 | X5.9, X9.10 | Covered |
| §32 F tenant security (branding, subscriptions, resumes, billing, unknown routes, direct API) | 43 N-matrix, 42 | X1.9, X5.9, X1.4 | Covered |
| §33 execution order audit → debate → design → plan → implement → verify → document; no prod deploy / real charges / irreversible migrations without authorization | HANDOFF, 44 §12, 06 §4 | — (process); X5.9 billing-off path | Covered |

## 7. Deliberate deviations (all recorded in `08-decisions-for-user.md`)

| # | Prompt | Deviation | Why |
|---|---|---|---|
| E1 | §12 marketer submits through authorized channels | consultant submits; marketer prepares/requests/records | CLAUDE.md locked (Consultancy Marketer never submits); answered 2026-10-12 |
| E2 / D7 | §6/§25 HR documents, Finance payments | record-only, no identity documents, no money movement; "Policies" label | CLAUDE.md no-sensitive-PII + record-only; answered |
| E3 | §14 vs CLAUDE.md per-person items | base license + add-ons | answered 2026-10-12; CLAUDE.md amended |
| E17 | §17 billing intervals | monthly only for org prices | locked org prices are monthly; QUARTER refused for `sold_to=ORG` |
| C1 | §23 refunds | no refunds; credits behind a flag, two-person rule | CLAUDE.md "no refunds, cancel anytime" |
| C3 | §19 taxes where supported | automatic tax off until registrations exist | tax-ID collection stays off (locked) |
| D4 | §12 follow-ups via marketer inbox | manual status updates in X8; inbox attribution deferred to X12 | second person's mailbox feeding org records — escalated |
| D5 | §6 TA sourcing/screening | candidates are invited members; no external CV store | person-owned resume model; no consent record for non-users |

## 8. Items this audit added or changed (applied in Task 5)

| Fix | Story | Phase |
|---|---|---|
| Break-glass read grant + platform Security page (E8) | **X6.17** new | 6 |
| Talent Acquisition: Candidates + Talent pools | **X11.8** new (split of X11.3) | 11 |
| Executive/Viewer workspace | **X12.8** new (split of X12.1) | 12 |
| Platform Analytics page (cross-tenant aggregates for Kiwiply) | **X12.12** new | 12 |
| Escalations page + task kind | X8.6 amended | 8 |
| Invitations nav item + badge | X4.12 (split of X4.3) | 4 |
| Consultant Settings page (+ Home) | X9.11 (split of X9.1) | 9 |
| Platform Security page (break-glass log) | X6.17 | 6 |
| §9 verbs activate/deactivate mapped | X4.4 amended | 4 |
| §30 format on every story; X12.1–X12.7 specified; X12.9–X12.11 splits; 27 L → S/M splits | Task 5 | all |
