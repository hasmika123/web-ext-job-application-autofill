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

## Written by Session B (domains, branding, login, identity, dashboards, UX) — 2026-10-12

| File | §28 name(s) | Status |
|---|---|---|
| `10-domain-routing.md` | Domain Routing (lifecycle, DNS instructions, verification job, edge snippet + runbook, monitoring, dev path) | done |
| `11-branding-and-login.md` | Branding and Login (model, draft/publish, runtime theme tokens, `BrandedLogin` states, contrast safety, favicon/title, mascot pose map, headers) | done |
| `12-identity.md` | Identity (tid/hid contract, `/api/me/tenant`, login-first steps, invite acceptance on a tenant host, session-per-host, personal user joins) | done |
| `13-user-profiles.md` | User Profiles (basic profile via the avatar menu; separation from career/org profiles) | done |
| `14-organization-administration.md` | Organization Administration (Org Admin Dashboard widgets → sources, alerts, quick actions, checklist, Organization Settings) | done |
| `15-employees-and-teams.md` | Employees and Teams (seat lifecycle, Employees page, bulk actions, detail sheet, offboarding wizard, departments/teams) | done |
| `16-ui-ux-page-inventory.md` | UI/UX Page Inventory (UX standards, enterprise shell, tenant route tree, workspaces, switcher, every page per role, wireframes) | done |
| `07-backlog.md` §3 X2/X3/X4 + `docs/roadmap/areas/ent.json` | Agile Stories X2.1–X2.14, X3.1–X3.8, X4.1–X4.6, X4.9 (§30 format) | done |
| `08-decisions-for-user.md` "Session B additions" | escalations B1–B8 with safe defaults; E1/E2/E3/E5 recorded as answered | open |

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

## Written by Session E (API, database, security, testing, deployment) — 2026-10-12

| File | §28 name(s) | Status |
|---|---|---|
| `09-consistency-decisions.md` | cross-doc consistency decisions (applied by the Session E consistency pass) | applied separately |
| `40-api-specs.md` | API Specifications — route families, headers and tenant-resolution behaviour, error model (402/403/404/409/412/428/429), idempotency, pagination/filters, rate limits, webhooks, OpenAPI + `OrgIsolationIT` registry rule, versioning, endpoint catalogue per bounded context, DTO appendix | done |
| `41-database-design.md` | Database Design — rules R1–R10 (tenant keys, composite tenant FKs, delete rules), changelog map per phase with backfill and rollback, structural inventory, effective-dated immutable prices, usage-ledger retention, migration map, JSON policy, PII hooks, erasure/lifecycle | done |
| `42-threat-model.md` | Security & Threat Model — STRIDE per surface (T1–T66), abuse cases, **E12 → story X1.13** fully specified, controls → stories, residual risk, security test list SEC-01…56 | done |
| `43-testing-plan.md` | Testing Plan — pyramid, cross-cutting suites, negative-test matrix N1–N24, contract tests, billing test clocks, E2E scenarios A–F scripted, Playwright projects on `*.localhost`, a11y/responsive, performance, fixtures, CI gates | done |
| `44-deployment-plan.md` | Deployment Plan — environments, flag rollout per phase, migration safety, BeeCompete shared-edge change (user-applied), custom-domain/on-demand-TLS ops, backups/restore, capacity on the 3.7 GB box, monitoring, incident runbooks RB-1…14, go-live checklist | done |

## Owned by follow-up design sessions

| Session | Owns (§28 names → target files) | Inputs it must respect |
|---|---|---|
| **B — Domains, branding, login, identity, dashboards UX** (**done 2026-10-12**, see above) | `10-domain-routing.md` (lifecycle, DNS instructions, verification job, edge snippet + runbook, monitoring) · `11-branding-and-login.md` (BrandedLogin, tenant theme tokens, mascot pose map, contrast rules) · `12-identity.md` (tid/hid claims, login-first flows, Google per host, MFA, SSO later) · `13-user-profiles.md` (basic profile) · `14-organization-administration.md` (org settings, admin dashboard spec) · `15-employees-and-teams.md` · `16-ui-ux-page-inventory.md` (every page per workspace, 390 px + desktop, empty/error/loading states) · stories X2.*, X3.*, X4.1–X4.6, X4.9 | ADR-002/003/004/005/007; `04-tenancy-and-security.md`; `05-permission-model.md` §3 templates; `@kiwiply/ui` only; branch A prior art (01 §5) |
| **C — Subscriptions, catalog, pricing, entitlements, metering, billing** — **done 2026-10-12** | `20-consultant-license-model.md` · `21-feature-catalog.md` (feature keys, base vs add-on split, dependencies, presets, draft prices) · `22-pricing-calculation.md` (engine, golden tables G1–G14, rounding, quote DTO = impact preview) · `23-contract-discounts.md` · `24-entitlements.md` (11-step order as code contracts, reason codes, contexts) · `25-usage-metering.md` · `26-billing-provider-integration.md` (StripeGateway growth, coupons, webhook routing, reconciler, fallback, test clocks) · `27-subscription-lifecycle.md` (org + license state machines, mid-cycle rules, dunning, refunds) · `28-billing-pages-ux.md` (six pages at 390/1440, empty states, cost-confirmation sheet) · `29-personal-subscription-regression.md` (`PersonalSubscriptionUnchangedIT`, scenario E) · stories X5.1–X5.12, X6.1–X6.12 (fully specified in `07-backlog.md`) · escalations C1–C10 in `08` | ADR-012…021; locked pricing rules (CLAUDE.md, with E3 answered 2026-10-12: base + add-ons replaces per-person items); Phase 18 catalog design; `docs/design/org/billing.md`; E9/E11/E17/E18 defaults |
| **D — Talent marketing, resumes, applications, clients, placements, HR, finance** | `17-consultant-assignments.md` · `30-resume-management.md` · `31-talent-marketing.md` (pipeline state machines, approvals, notifications) · `32-applications.md` · `33-interviews.md` · `34-clients.md` · `35-placements.md` · `36-hr-and-finance.md` (record-only, PII rules) · stories X4.7–X4.8, X7.*–X11.* | ADR-006/008/009/010/011; `03-domain-model.md` §2.3–2.4; no-submit guarantee (`docs/design/org/marketer-workspace.md` §6); Timesheets product H; E1/E2 defaults |
| **E — API specs, database, threat model, test plan, deployment plan, consistency, full story set** (docs 40–44 **written 2026-10-12**; consistency pass `09`, story review and X12.* in progress) | `40-api-specs.md` · `41-database-design.md` · `42-threat-model.md` · `43-testing-plan.md` · `44-deployment-plan.md` · review and finalise every story in `ent.json` to §30 format · stories X1.13, X2.15, X4.10, X12.* | everything above; CI gates (`OrgIsolationIT`, `TenantRepositoryContractTest`, `PersonalSubscriptionUnchangedIT`) |

Numbering gaps (18–19, 45+) are reserved so each session can add a doc without renumbering. (The Phase-0 plan named the Session E docs `40-api-specifications`, `41-testing-plan`, `42-deployment-plan`; they were renumbered to 40–44 when database design and the threat model got their own files.)

## Conventions
- Design docs say *what exists* with file references and *what to build* with table/column/endpoint
  names; Sonnet never has to guess. Anything not decided goes to `08-decisions-for-user.md`.
- Re-opening an ADR requires a new ADR that supersedes it (`adr/ADR-0NN-*.md`, status Superseded on the old one).
- Keep `progress-tracker.md` and `ent.json` in sync on every story transition.
