# Enterprise V2 — document index (`docs/enterprise-v2/`)

> Requirements §28 lists the full documentation set. Phase 0 (this session, Fable) wrote the
> foundation; the rest is split across four follow-up **design** sessions (B–E). Sonnet agents
> implement; Fable designs. New chat? Start at `docs/HANDOFF-ENTERPRISE-V2.md`.

## Written in Phase 0 (this folder)

| File | §28 name(s) | Status |
|---|---|---|
| `00-product-vision.md` | Product Vision | done |
| `01-existing-system-audit.md` | Existing Architecture Audit · Existing Subscription Audit (§2) · deployment/infra (§3) · Reuse Matrix (§1) | done |
| `02-architecture-debate.md` | Architecture Debate (23 topics) + CLAUDE.md reconciliation | done |
| `adr/ADR-001…023-*.md` | ADRs (one per final decision) | done |
| `03-domain-model.md` | Database Design (bounded contexts, entities, relationships, migration map, state machines at summary level) | done (foundation level) |
| `04-tenancy-and-security.md` | Multi-Tenant Design · Domain Routing (resolution) · Security & Threat Model (initial) | done (foundation level) |
| `05-permission-model.md` | Roles and Permissions · Identity (claims) · actor/beneficiary | done |
| `06-phase-plan.md` | Roadmap (phases 0–12, flags, migration strategy, DoD) | done |
| `07-backlog.md` | Agile Stories (Phase 1 full; epics + titles for 2–12) — generated with `docs/roadmap/areas/ent.json` | done |
| `08-decisions-for-user.md` | escalations with safe defaults | open |
| `progress-tracker.md` | Progress Tracker | live |

## Written by Session D (talent marketing, resumes, applications, clients, placements, HR, finance)

| File | §28 name(s) | Status |
|---|---|---|
| `17-consultant-assignments.md` | Consultant Assignments (`org_assignment`, delegation, workload, consent interaction) | done (X4.7–X4.8) |
| `30-resume-management.md` | Resume Management for orgs (directory, `org_resume`, consent-gated edits, approval, readiness) | done (X7.*) |
| `31-talent-marketing.md` | Talent Marketing lifecycle as state machines, submission rule under E1, duplicate guard, board terms, `NoSubmitSurfaceTest`, notifications | done (X8.*) |
| `32-applications.md` | Applications (consultant side, org consented view, inbox rules, extension workspace) | done (X9.1–X9.4, X9.9–X9.10) |
| `33-interviews.md` | Interviews (`interview_slot` over the person's `interview`, `.ics`, reminders, AI prep) | done (X9.5–X9.7) |
| `34-clients.md` | Clients, vendors, contacts, requirements, Account Manager workspace, reports | done (X10.1–X10.2, X10.5, X10.7) |
| `35-placements.md` | Offers → placements, extensions, redeployment, Timesheets bridge | done (X9.8, X10.3–X10.4, X10.6, X10.8) |
| `36-hr-and-finance.md` | HR & Finance record-only (E2), PII scanner on every path | done (X11.*) |
| `37-entitlement-hooks.md` | Entitlement hook map (feature × actor × beneficiary × call site) — alignment list for Session C | done |
| `38-ux-talent-workspaces.md` | UX for marketer, manager, consultant, AM, HR, finance pages (390/1440 wireframes, empty states, honest delight, new `@kiwiply/ui` primitives) | done |
| `08-decisions-for-user.md` → "Session D additions" | escalations D1–D7; E1/E2/E3/E5 recorded as answered 2026-10-12 | open |

## Owned by follow-up design sessions

| Session | Owns (§28 names → target files) | Inputs it must respect |
|---|---|---|
| **B — Domains, branding, login, identity, dashboards UX** | `10-domain-routing.md` (lifecycle, DNS instructions, verification job, edge snippet + runbook, monitoring) · `11-branding-and-login.md` (BrandedLogin, tenant theme tokens, mascot pose map, contrast rules) · `12-identity.md` (tid/hid claims, login-first flows, Google per host, MFA, SSO later) · `13-user-profiles.md` (basic profile) · `14-organization-administration.md` (org settings, admin dashboard spec) · `15-employees-and-teams.md` · `16-ui-ux-page-inventory.md` (every page per workspace, 390 px + desktop, empty/error/loading states) · stories X2.*, X3.*, X4.1–X4.6, X4.9 | ADR-002/003/004/005/007; `04-tenancy-and-security.md`; `05-permission-model.md` §3 templates; `@kiwiply/ui` only; branch A prior art (01 §5) |
| **C — Subscriptions, catalog, pricing, entitlements, metering, billing** | `20-consultant-license-model.md` · `21-feature-catalog.md` (feature keys, dependencies, presets) · `22-pricing-calculation.md` (engine, golden tables, rounding) · `23-contract-discounts.md` · `24-entitlements.md` (11-step order as code contracts, reason codes) · `25-usage-metering.md` · `26-billing-provider-integration.md` (StripeGateway growth, webhook routing, reconciler, test clocks) · `27-subscription-lifecycle.md` (org + license state machines, mid-cycle rules) · stories X5.*, X6.* | ADR-012…021; locked pricing rules (CLAUDE.md); Phase 18 catalog design; `docs/design/org/billing.md`; E3/E9/E11/E17/E18 defaults |
| **D — Talent marketing, resumes, applications, clients, placements, HR, finance** | `17-consultant-assignments.md` · `30-resume-management.md` · `31-talent-marketing.md` (pipeline state machines, approvals, notifications) · `32-applications.md` · `33-interviews.md` · `34-clients.md` · `35-placements.md` · `36-hr-and-finance.md` (record-only, PII rules) · stories X4.7–X4.8, X7.*–X11.* | ADR-006/008/009/010/011; `03-domain-model.md` §2.3–2.4; no-submit guarantee (`docs/design/org/marketer-workspace.md` §6); Timesheets product H; E1/E2 defaults |
| **E — API specs, test plan, deployment plan, full story set** | `40-api-specifications.md` (OpenAPI deltas per phase, DTOs, error codes) · `41-testing-plan.md` (unit/IT/Playwright matrix, negative suites, E2E A–F scripts, Stripe test clocks) · `42-deployment-plan.md` (flags rollout per org, edge runbook, backups/retention, second-instance readiness) · review and finalise every story in `ent.json` to §30 format · stories X12.* | everything above; CI gates (`OrgIsolationIT`, `TenantRepositoryContractTest`, `PersonalSubscriptionUnchangedIT`) |

Numbering gaps (09, 18–19, 28–29, 37–39) are reserved so each session can add a doc without renumbering.

## Conventions
- Design docs say *what exists* with file references and *what to build* with table/column/endpoint
  names; Sonnet never has to guess. Anything not decided goes to `08-decisions-for-user.md`.
- Re-opening an ADR requires a new ADR that supersedes it (`adr/ADR-0NN-*.md`, status Superseded on the old one).
- Keep `progress-tracker.md` and `ent.json` in sync on every story transition.
