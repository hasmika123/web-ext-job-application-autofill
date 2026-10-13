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
| X1.4 Web host resolution + (tenant) group + tenant-404 | Not Started | Sonnet (Web) | — | |
| X1.5 Tenant-bound sessions (tid) | Not Started | Sonnet (API+Web) | — | |
| X1.6 Roles as data + backfill + dual-write | Not Started | Sonnet (API) | — | parallel with X1.3–X1.5 after X1.2 |
| X1.7 Scope model + AuthorizationService skeleton | Not Started | Sonnet (API) | — | |
| X1.8 Invitation framework (adopt a6a9a62) | Not Started | Sonnet (API) | — | cherry-pick + re-verify first |
| X1.9 Isolation test gate | Not Started | Sonnet (API+Web+QA) | — | closes the phase |
| X1.10 Tenant context in logs/audit/async | Not Started | Sonnet (API) | — | |
| X1.11 Platform admin Organizations & hostnames | Not Started | Sonnet (API+Web) | — | admin page kit |
| X1.12 Mock tenants + fixtures + demo seeder | Not Started | Sonnet (Web+API) | — | needed by X1.9 Playwright |

## Phases 2–12
Epic-level only until the owning follow-up session writes the stories (see `README.md`). Add rows
here when a story is specified; never add a row without an id in `ent.json`.

| Epic | Status | Design session | Notes |
|---|---|---|---|
| X2 Branded login & shell | Not Started | B | needs branding/login spec |
| X3 Custom domains | Not Started | B | needs edge change (E5) for public hosts |
| X4 Roles, employees, assignments | Not Started | B (UX) + D (assignments) | X4.7–X4.8 specified (D) — rows below |
| X5 Subscription foundation | Not Started | C | |
| X6 Billing & license UI | Not Started | C | |
| X7 Consultant & resume mgmt | Not Started | D | stories specified (D) — rows below |
| X8 Talent marketing | Not Started | D | stories specified (D) — rows below |
| X9 Applications, interviews, extension workspace | Not Started | D (+ ext) | stories specified (D) — rows below |
| X10 Clients & placements | Not Started | D | stories specified (D) — rows below |
| X11 HR & Finance | Not Started | D | product H integration; stories specified (D) — rows below |
| X12 Advanced | Not Started | E | |


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
| E5 edge Caddy change (on-demand TLS) — **answered 2026-10-12: the user applies it at Phase 3** | 2026-10-12 | public tenant hosts (X3) until applied | develop on `*.localhost` |
| E4, E7–E11, E13–E20 | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |
| D1–D7 (Session D) | 2026-10-12 | nothing (defaults applied; D2 keeps X12.2 not started, D4 keeps the marketer inbox out of X8) | see `08-decisions-for-user.md` "Session D additions" |

## Log
- 2026-10-12 — Phase 0 complete on `enterprise-v2` (Fable). Roadmap area `ent` registered, 109 stories, 0 dangling ids.
- 2026-10-12 — Session D (Fable): assignments, org resumes, talent-marketing state machines, applications, interviews, clients, placements, HR & finance designed (`17`, `30`–`38`); 44 stories specified (X4.7–4.8, X7–X11 incl. new X8.10, X10.8, X11.7); escalations D1–D7; E1/E2/E3/E5 recorded answered. Roadmap: 112 stories, 0 dangling ids.
