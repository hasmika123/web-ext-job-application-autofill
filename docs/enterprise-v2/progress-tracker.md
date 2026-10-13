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

## Phase 2 — Branded login and dashboard shell (Session B, specified 2026-10-12; build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X2.1 Consolidate parked web helpers into lib/ent | Not Started | Sonnet (Web) | — | first; no feature work |
| X2.8 MascotPose + pose map | Not Started | Sonnet (UI) | — | parallel after X2.1 |
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
| X4.10 | Not Started | E (finalise) | — | org_member_role authoritative |

## Phases 5–12
Epic-level only until the owning follow-up session writes the stories (see `README.md`). Add rows
here when a story is specified; never add a row without an id in `ent.json`.

| Epic | Status | Design session | Notes |
|---|---|---|---|
| X5 Subscription foundation | Not Started | C | |
| X6 Billing & license UI | Not Started | C | |
| X7 Consultant & resume mgmt | Not Started | D | |
| X8 Talent marketing | Not Started | D | |
| X9 Applications, interviews, extension workspace | Not Started | D (+ ext) | |
| X10 Clients & placements | Not Started | D | |
| X11 HR & Finance | Not Started | D | product H integration |
| X12 Advanced | Not Started | E | |

## Blocked / waiting on the user
| Item | Since | Blocks | Default in force |
|---|---|---|---|
| E5 edge Caddy change (on-demand TLS) — **answered 2026-10-12**: the user applies the snippet/runbook in `10-domain-routing.md` §5.3/§8 after X3.3 deploys | 2026-10-12 | public tenant hosts (X3) until applied | develop on `*.localhost`; dev edge rehearsal (X3.6) |
| E1, E2, E3 — **answered 2026-10-12** (consultant submits; HR/Finance record-only; base + add-ons) | 2026-10-12 | nothing | as answered |
| E4, E7–E11, E13–E20; Session B's B1–B8 | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |

## Log
- 2026-10-12 — Phase 0 complete on `enterprise-v2` (Fable). Roadmap area `ent` registered, 109 stories, 0 dangling ids.
- 2026-10-12 — Session B (Fable, branch `ev2-design-b`): docs 10–16, stories X2.1–X2.14 / X3.1–X3.8 / X4.1–X4.6 / X4.9 fully specified (112 stories, 0 dangling), escalations B1–B8, E1/E2/E3/E5 recorded as answered.
