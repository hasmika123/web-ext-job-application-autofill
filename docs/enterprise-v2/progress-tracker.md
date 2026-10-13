# Enterprise V2 — implementation progress tracker

> Statuses: **Not Started → In Progress → Code Complete → Testing → Completed / Blocked.**
> Every Completed row must reference real code and tests (file paths or a commit). Keep this table
> and `docs/roadmap/areas/ent.json` in sync: `node docs/roadmap/build-master-roadmap.mjs --set X1.1=in_progress`
> (roadmap statuses: not_started / in_progress / in_review (= Code Complete) / partial (= Testing) /
> done / blocked). One story = one commit = one PR into `develop`.

## Phase 0 — Audit, debate, foundation design, plan

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X0.1 Phase 0 deliverables | Completed | Fable | `docs/enterprise-v2/*`, `docs/enterprise-v2/adr/ADR-001…023`, `docs/roadmap/areas/ent.json`, `docs/HANDOFF-ENTERPRISE-V2.md` | Design only; follow-up sessions B–E own the remaining docs (README) |

## Phase 1 — Enterprise tenant foundation (build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X1.1 Enterprise flags + EnterpriseEnabledFilter | Not Started | Sonnet (API) | — | first task; see HANDOFF START HERE |
| X1.2 Tenancy schema | Not Started | Sonnet (API) | — | additive changelog `*_ent_tenancy.xml` |
| X1.3 TenantResolver + public tenant + ask endpoint | Not Started | Sonnet (API) | — | |
| X1.4 Web host resolution + (tenant)/_t group + proxy rewrite + tenant-404 | Not Started | Sonnet (Web) | — | **amended by Session E (09 row 15)** — build the `_t` tree + rewrite from the start |
| X1.5 Tenant-bound sessions (tid) | Not Started | Sonnet (API+Web) | — | |
| X1.6 Roles as data + backfill + dual-write | Not Started | Sonnet (API) | — | parallel with X1.3–X1.5 after X1.2 |
| X1.7 Scope model + AuthorizationService skeleton | Not Started | Sonnet (API) | — | |
| X1.8 Invitation framework (adopt a6a9a62) | Not Started | Sonnet (API) | — | cherry-pick + re-verify first |
| X1.9 Isolation test gate | Not Started | Sonnet (API+Web+QA) | — | closes the phase |
| X1.10 Tenant context in logs/audit/async | Not Started | Sonnet (API) | — | |
| X1.11 Platform admin Organizations & hostnames | Not Started | Sonnet (API+Web) | — | admin page kit |
| X1.12 Mock tenants + fixtures + demo seeder | Not Started | Sonnet (Web+API) | — | needed by X1.9 Playwright |
| X1.13 Ops endpoints hardening (E12) | Not Started | Sonnet (API) | — | new (Session E, 09 row 19); any time after X1.3 |

## Phase 2 — Branded login and dashboard shell (Session B, specified 2026-10-12; build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X2.1 Consolidate parked web helpers into lib/ent | Not Started | Sonnet (Web) | — | first; no feature work |
| X2.8 MascotPose + pose map | Not Started | Sonnet (UI) | — | parallel after X2.1 |
| X2.15 Enterprise UI kit in packages/ui | Not Started | Sonnet (UI) | — | new (Session E, 09 row 14); before X2.2 and every C/D UI story |
| X2.12 BrandingTheme + theme-tenant.css + hex lint | Not Started | Sonnet (API+UI) | — | parallel after X2.1 |
| X2.13 Public tenant assets + favicon/title | Not Started | Sonnet (API+Web) | — | parallel after X2.1 |
| X2.2 EnterpriseShell + /api/me/tenant + workspaces + switcher | Not Started | Sonnet (Web+API+UI) | — | promotes the admin kit to packages/ui |
| X2.10 TenantUrls + org notification kinds | Not Started | Sonnet (API) | — | parallel with X2.2 |
| X2.3 BrandedLogin | Not Started | Sonnet (Web) | — | |
| X2.6 Login-first routing + proxy rewrite + branded join | Not Started | Sonnet (Web+API) | — | B2 (rewrite) applies |
| X2.7 Basic user profile (/me) | Not Started | Sonnet (API+Web) | — | |
| X2.9 Organization Settings + OrgSettingsResource | Not Started | Sonnet (API+Web) | — | |
| X2.4 Org Admin Dashboard | Not Started | Sonnet (API+Web) | — | reworks 18f2123; re-verify |
| X2.5 Organization Branding page | Not Started | Sonnet (API+Web) | — | needs X2.12/X2.13 |
| X2.14 Org-enforced email MFA on tenant hosts | Not Started | Sonnet (API+Web) | — | escalation B3 default |
| X2.11 E2E-A / E2E-B Playwright | Not Started | Sonnet (QA+Web) | — | closes the phase |

## Phase 3 — Custom domains (Session B, specified 2026-10-12; build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X3.1 Domains page + API, instructions, verify now | Not Started | Sonnet (API+Web) | — | |
| X3.2 Verification job (dnsjava), auto-activate, grace → SUSPENDED | Not Started | Sonnet (API) | — | B7 dependency |
| X3.3 Activation, ask token, cert_state + probe, admin Domains, Tenant Health | Not Started | Sonnet (API+Web) | — | B1 (query token) |
| X3.4 Primary domain + redirects | Not Started | Sonnet (API+Web) | — | B6 defaults |
| X3.5 Suspend / resume / remove + hid session invalidation | Not Started | Sonnet (API+Web) | — | |
| X3.6 Edge snippet + runbook + dev edge rehearsal + ask-spike alert | Not Started | Sonnet (API+Ops+QA) | — | **user applies the edge change after X3.3 deploys (E5 answered)** |
| X3.7 Google per tenant host + security headers | Not Started | Sonnet (API+Web) | — | E14 default |
| X3.8 Domain lifecycle E2E + IT hardening | Not Started | Sonnet (QA) | — | closes the phase |

## Phase 4 — Roles, employees, departments, teams (Session B part, specified 2026-10-12; build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X4.1 Roles & Permissions page | Not Started | Sonnet (API+Web) | — | |
| X4.2 Workspace prefs + landing preference | Not Started | Sonnet (API+Web) | — | |
| X4.5 Departments & teams | Not Started | Sonnet (API+Web) | — | before X4.3 |
| X4.3 Employees page + bulk actions | Not Started | Sonnet (API+Web) | — | B8 (last active) |
| X4.6 Employee detail sheet | Not Started | Sonnet (API+Web) | — | |
| X4.4 Employee lifecycle + offboarding wizard | Not Started | Sonnet (API+Web) | — | hooks for D (assignments) and C (licenses) |
| X4.9 Org audit log viewer + exports hub | Not Started | Sonnet (API+Web) | — | |
| X4.7, X4.8 | Not Started | D (design pending) | — | assignments, workload |
| X4.10 org_member_role authoritative | Not Started | Sonnet (API) | — | finalised by Session E (09 row 17); closes Phase 4 |

## Phases 5–12
Epic-level only until the owning follow-up session writes the stories (see `README.md`). Add rows
here when a story is specified; never add a row without an id in `ent.json`.

| Epic | Status | Design session | Notes |
|---|---|---|---|
| X2 Branded login & shell | Not Started | B | needs branding/login spec |
| X3 Custom domains | Not Started | B | needs edge change (E5) for public hosts |
| X4 Roles, employees, assignments | Not Started | B (UX) + D (assignments) | X4.7–X4.8 specified (D) — rows below |
| X5 Subscription foundation | Not Started (stories specified, see below) | C | design docs 20–25, 27, 29 |
| X6 Billing & license UI | Not Started (stories specified, see below) | C | design docs 26–28 |
| X7 Consultant & resume mgmt | Not Started | D | stories specified (D) — rows below |
| X8 Talent marketing | Not Started | D | stories specified (D) — rows below |
| X9 Applications, interviews, extension workspace | Not Started | D (+ ext) | stories specified (D) — rows below |
| X10 Clients & placements | Not Started | D | stories specified (D) — rows below |
| X11 HR & Finance | Not Started | D | product H integration; stories specified (D) — rows below |
| X12 Advanced | Not Started | E | |
## Phase 5 — Subscription foundation (build order; Session C, specified 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X5.1 Catalog tables + versions + admin Catalog page | Not Started | Sonnet (API+Web) | — | supersedes A3.1; enterprise rows seeded with no prices (E3) |
| X5.2 Feature definitions, dependencies, presets, tiers | Not Started | Sonnet (API+Web) | — | seeds inactive |
| X5.3 Margin guard for ORG kinds + preset checks | Not Started | Sonnet (API+Web) | — | 21 §5–6 table pinned |
| X5.5 PricingEngine + contracts + quotes + golden tests | Not Started | Sonnet (API) | — | 22 §9 G1–G14; before X5.4 |
| X5.4 License tables + LicenseService (API only, Stripe off) | Not Started | Sonnet (API) | — | LocalBillingApplier |
| X5.7 usage_event ledger | Not Started | Sonnet (API) | — | |
| X5.6 EntitlementService.check + @RequiresFeature | Not Started | Sonnet (API) | — | needs X4.7 for step 9 |
| X5.11 Org modules (marketer seat) | Not Started | Sonnet (API) | — | Roles page alignment (B) |
| X5.8 Migrate isPro callers + ai_call columns + org AI window | Not Started | Sonnet (API) | — | personal path byte-identical |
| X5.12 Bulk license operations API | Not Started | Sonnet (API) | — | |
| X5.9 PersonalSubscriptionUnchangedIT + billing-off path | Not Started | Sonnet (API+Web) | — | required CI job |
| X5.10 E2E-C API scenario + Phase 5 gate | Not Started | Sonnet (API) | — | closes the phase |

## Phase 6 — Billing & license UI, Stripe org billing (build order; Session C, specified 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X6.12 Billing account + Stripe org customer + setup fee | Not Started | Sonnet (API+Web) | — | adopts O4.1/O4.2; first in Phase 6 |
| X6.6 StripeGateway growth + org webhook routing + mirrors | Not Started | Sonnet (API) | — | |
| X6.7 LicenseChangeApplier (Stripe) + coupons + COMPUTED_INVOICE | Not Started | Sonnet (API) | — | Kiwiply prorates (C10) |
| X6.8 Reconciler + dunning + reactivation | Not Started | Sonnet (API) | — | |
| X6.1 Subscription Overview page | Not Started | Sonnet (Web+API) | — | needs X2.2 shell |
| X6.2 Consultant Licenses page | Not Started | Sonnet (Web) | — | |
| X6.3 Configure Consultant License | Not Started | Sonnet (Web) | — | E2E-C UI |
| X6.4 Billing & Invoices page | Not Started | Sonnet (Web+API) | — | |
| X6.5 Feature Usage + My Available Features | Not Started | Sonnet (Web) | — | |
| X6.9 Platform Pricing Admin | Not Started | Sonnet (Web+API) | — | admin page kit |
| X6.10 Platform admin org billing operations | Not Started | Sonnet (Web+API) | — | credits behind flag (C1) |
| X6.11 Test-clock runbook + E2E-C Playwright + Phase 6 gate | Not Started | Sonnet (QA+Web) | — | closes the phase |
## Phase 4 (Session D part) — Assignments (build order as listed; stories specified by Session D 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X4.7 Consultant–marketer assignments | Not Started | Sonnet (API+Web) | — | deps X1.6, X1.7, X4.3 |
| X4.8 Workload balancing view for Marketing Managers | Not Started | Sonnet (API+Web) | — | deps X4.7 |

## Phase 7 — Consultant & resume management (build order as listed; stories specified by Session D 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X7.2 Consultant profile overlay | Not Started | Sonnet (API+Web) | — | deps X4.7, X1.7 |
| X7.1 Consultant directory | Not Started | Sonnet (API+Web) | — | deps X7.2, X4.7 |
| X7.3 Resumes page for the org | Not Started | Sonnet (API+Web) | — | deps X7.1 |
| X7.6 org_feature_consent | Not Started | Sonnet (API+Web) | — | deps X7.3, X5 |
| X7.4 Resume approval workflow | Not Started | Sonnet (API+Web) | — | deps X7.3, X7.6 |
| X7.5 Marketer-made resumes via the builder in act-for mode | Not Started | Sonnet (API+Web) | — | deps X7.4, X5 |
| X7.7 Marketing readiness checklist per consultant | Not Started | Sonnet (API+Web) | — | deps X7.4, X7.2 |

## Phase 8 — Talent marketing (build order as listed; stories specified by Session D 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X8.10 Pipeline schema | Not Started | Sonnet (API) | — | deps X7.4, X4.7 |
| X8.1 Marketing workspace shell | Not Started | Sonnet (Web+API) | — | deps X8.10, X7.1, X2 |
| X8.2 Job discovery for a consultant | Not Started | Sonnet (API+Web) | — | deps X8.1 |
| X8.3 AI matching for a consultant | Not Started | Sonnet (API+Web) | — | deps X8.2, X5 |
| X8.4 Opportunity assignment | Not Started | Sonnet (API+Web) | — | deps X8.3, X7.4 |
| X8.5 Authorization requests | Not Started | Sonnet (API+Web) | — | deps X8.4 |
| X8.8 Duplicate-submission guard across consultants and vendors; same-employer window setting | Not Started | Sonnet (API) | — | deps X8.4 |
| X8.6 Follow-ups and tasks | Not Started | Sonnet (API+Web) | — | deps X8.5 |
| X8.7 Marketer performance view | Not Started | Sonnet (API+Web) | — | deps X8.6 |
| X8.9 NoSubmitSurfaceTest + MarketerScopeTest kept green; E2E-D up to authorization in Playwright | Not Started | Sonnet (API+Web+QA) | — | deps X8.5, X8.8 |

## Phase 9 — Consultant applications, interviews, extension workspace (build order as listed; stories specified by Session D 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X9.1 Consultant workspace | Not Started | Sonnet (Web+API) | — | deps X8.5, X2 |
| X9.2 Assigned jobs list for the consultant and application link via submit-detect | Not Started | Sonnet (API+Web+Ext) | — | deps X9.1 |
| X9.3 Application tracking for the org | Not Started | Sonnet (API) | — | deps X9.2 |
| X9.4 Applications page | Not Started | Sonnet (Web) | — | deps X9.3 |
| X9.5 Interview coordination | Not Started | Sonnet (API+Web) | — | deps X9.2, X8.10 |
| X9.6 Interviews page | Not Started | Sonnet (Web+API) | — | deps X9.5 |
| X9.7 AI Interview Preparation for consultants gated by interview.ai_prep entitlement; mascot encouragement | Not Started | Sonnet (API+Web) | — | deps X9.5, X5 |
| X9.8 Offers | Not Started | Sonnet (API+Web) | — | deps X9.5 |
| X9.9 Extension workspace selector | Not Started | Sonnet (Ext+API) | — | deps X9.2, X5 |
| X9.10 E2E-D completion | Not Started | Sonnet (QA+Web) | — | deps X9.9, X9.8 |

## Phase 10 — Clients & placements (build order as listed; stories specified by Session D 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X10.1 Client accounts, contacts, relationships | Not Started | Sonnet (API+Web) | — | deps X8.10, X11.7 |
| X10.2 Client requirements | Not Started | Sonnet (API+Web) | — | deps X10.1 |
| X10.3 Candidate submissions as records | Not Started | Sonnet (API+Web) | — | deps X10.2, X8.5 |
| X10.4 Offers → placements lifecycle | Not Started | Sonnet (API+Web) | — | deps X9.8, X10.3 |
| X10.8 Timesheets bridge | Not Started | Sonnet (API) | — | deps X10.4, H1.1 |
| X10.6 Placement declaration from the consultant side and org celebration | Not Started | Sonnet (Web+API) | — | deps X10.4 |
| X10.5 Account Manager workspace | Not Started | Sonnet (Web) | — | deps X10.4, X10.6 |
| X10.7 Pipeline reports | Not Started | Sonnet (API+Web) | — | deps X10.5 |

## Phase 11 — HR & Finance (build order as listed; stories specified by Session D 2026-10-12)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X11.7 PII scanner on every path | Not Started | Sonnet (API+Web) | — | deps X8.10 |
| X11.1 HR lifecycle records | Not Started | Sonnet (API+Web) | — | deps X11.7, X4.4 |
| X11.2 Compliance checklists | Not Started | Sonnet (API+Web) | — | deps X11.1 |
| X11.3 HR workspace | Not Started | Sonnet (Web+API) | — | deps X11.2 |
| X11.5 Finance records for placements | Not Started | Sonnet (API+Web) | — | deps X10.8, X11.7 |
| X11.4 Finance workspace over product H | Not Started | Sonnet (Web+API) | — | deps X11.5, X6 |
| X11.6 HR/Finance reports and CSV exports | Not Started | Sonnet (API+Web) | — | deps X11.3, X11.4 |

## Blocked / waiting on the user
| Item | Since | Blocks | Default in force |
|---|---|---|---|
| E5 edge Caddy change (on-demand TLS) — **answered 2026-10-12**: the user applies the snippet/runbook in `10-domain-routing.md` §5.3/§8 after X3.3 deploys | 2026-10-12 | public tenant hosts (X3) until applied | develop on `*.localhost`; dev edge rehearsal (X3.6) |
| E1, E2, E3 — **answered 2026-10-12** (consultant submits; HR/Finance record-only; base + add-ons) | 2026-10-12 | nothing | as answered |
| E4, E6–E20 | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |
| B1–B8 (Session B: ask-token transport, `_t` rewrite, email MFA, apex domains, invite-only signup, redirects, two API deps, last-active) | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |
| C1–C10 (Session C: credits, suspension billing, Stripe Tax, currencies, preset pricing, min commitment, invite billing, draft prices, removal timing, proration authority) | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |
| D1–D7 (Session D: link checks, Autopilot feed, client documents, marketer inbox, TA CVs, rate visibility, HR Policies naming) | 2026-10-12 | nothing (defaults applied; D2 keeps X12.2 not started, D4 keeps the marketer inbox out of X8) | see `08-decisions-for-user.md` "Session D additions" |

## Log
- 2026-10-12 — Phase 0 complete on `enterprise-v2` (Fable). Roadmap area `ent` registered, 109 stories, 0 dangling ids.
- 2026-10-12 — Session B (Fable, branch `ev2-design-b`): docs 10–16, stories X2.1–X2.14 / X3.1–X3.8 / X4.1–X4.6 / X4.9 fully specified (112 stories, 0 dangling), escalations B1–B8, E1/E2/E3/E5 recorded as answered.
- 2026-10-12 — Session C (Fable, `ev2-design-c`): docs 20–29, stories X5.1–X5.12 and X6.1–X6.12 fully specified (+X5.11, X5.12, X6.12 new), escalations C1–C10, E1/E2/E3/E5 recorded as answered; 112 stories, 0 dangling ids.
- 2026-10-12 — Session E (Fable, `ev2-design-e`) Task 1+2: `09-consistency-decisions.md` applied row by row to docs 05/06/11/12/14–17/20/21/23–26/28/30–38 and to `ent.json`/`07-backlog.md` (X1.4 amended to `(tenant)/_t` + proxy rewrite; new X1.13, X2.15; X4.10 finalised; Liquibase buckets; `ORG_*` kinds up front in X2.10); CLAUDE.md E3 + Enterprise V2 bullet; ROADMAP.md org price note. 0 dangling ids.
- 2026-10-12 — Session D (Fable, `ev2-design-d`): assignments, org resumes, talent-marketing state machines, applications, interviews, clients, placements, HR & finance designed (`17`, `30`–`38`); 44 stories specified (X4.7–4.8, X7–X11 incl. new X8.10, X10.8, X11.7); escalations D1–D7; E1/E2/E3/E5 recorded answered. Roadmap: 112 stories, 0 dangling ids.
