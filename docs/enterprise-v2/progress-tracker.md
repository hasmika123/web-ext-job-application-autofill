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
| X4 Roles, employees, assignments | Not Started | B (UX) + D (assignments) | |
| X5 Subscription foundation | Not Started (stories specified, see below) | C | design docs 20–25, 27, 29 |
| X6 Billing & license UI | Not Started (stories specified, see below) | C | design docs 26–28 |
| X7 Consultant & resume mgmt | Not Started | D | |
| X8 Talent marketing | Not Started | D | |
| X9 Applications, interviews, extension workspace | Not Started | D (+ ext) | |
| X10 Clients & placements | Not Started | D | |
| X11 HR & Finance | Not Started | D | product H integration |
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

## Blocked / waiting on the user
| Item | Since | Blocks | Default in force |
|---|---|---|---|
| E5 edge Caddy change (on-demand TLS) — **answered 2026-10-12: user applies it** | 2026-10-12 | public tenant hosts (X3) until applied | develop on `*.localhost` |
| E4, E6–E20 (E1/E2/E3/E5 answered 2026-10-12) | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |
| C1–C10 (Session C: credits, suspension billing, Stripe Tax, currencies, preset pricing, min commitment, invite billing, draft prices, removal timing, proration authority) | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |

## Log
- 2026-10-12 — Phase 0 complete on `enterprise-v2` (Fable). Roadmap area `ent` registered, 109 stories, 0 dangling ids.
- 2026-10-12 — Session C (Fable, `ev2-design-c`): docs 20–29, stories X5.1–X5.12 and X6.1–X6.12 fully specified (+X5.11, X5.12, X6.12 new), escalations C1–C10, E1/E2/E3/E5 recorded as answered; 112 stories, 0 dangling ids.
