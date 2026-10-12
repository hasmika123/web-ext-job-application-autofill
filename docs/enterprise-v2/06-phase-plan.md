# 06 — Phase plan (0–12), adjusted to the repo's real dependencies

> Status: plan, 2026-10-12. Rule from the requirements: tenant isolation and entitlement enforcement
> ship **before** any protected feature. Rule from CLAUDE.md: one task = one commit; additive
> Liquibase only; flags fail closed; `OrgIsolationIT` green on every PR. Roadmap area `ent` (prefix
> `X`); epics `X0`–`X12` map one-to-one to the phases below. Story-level detail: `07-backlog.md`.

## 0. Dependency facts that reorder the requirements' phases
1. **Roles before billing.** Licenses are tied to *membership* and licensed features are gated by
   *permission + assignment + consent*; so the multi-role foundation (Phase 1) and assignments
   (Phase 4) precede the subscription foundation (Phase 5). The requirements had roles in Phase 4
   already; we only pull the **data model** of roles into Phase 1 (X1.6/X1.7) so nothing is built
   on the enum.
2. **Catalog before licenses.** The Phase 18 catalog tables do not exist; Phase 5 builds them first
   (shared with personal plans, admin stories A3.*), then the enterprise license model.
3. **Invites exist (branch B).** Phase 1 adopts and re-verifies them instead of rebuilding.
4. **Domains need an edge change outside the repo.** Phase 2 delivers subdomains in code and the
   `ask` endpoint; Phase 3 is custom-domain lifecycle; both run on `*.localhost` until the user
   applies the edge change (E5). Nothing else waits on it.
5. **The org shell exists as prior art (branch A).** Phase 2 rebuilds it as the enterprise shell
   rather than bolting branding on `org-v2` sample pages.
6. **The extension is untouched until Phase 9** (workspace awareness), because E2E-C/E only need the
   web to prove entitlements.
7. **Timesheets product H already owns the money records** HR/Finance need; Phase 11 integrates, it
   does not re-design.

## 1. Phases

| Phase | Name | Epic | Flag | Enters when | Exit criteria (gate) |
|---|---|---|---|---|---|
| **0** | Audit, debate, foundation design, plan | X0 | — | — | This doc set committed; 0 dangling roadmap ids; escalations listed |
| **1** | Enterprise tenant foundation | X1 | `flag.enterprise` (master, off) | Phase 0 accepted; follow-up sessions B/C/D/E may run in parallel with the build | `HostUnknownIT`, `HostMismatchIT`, `ForgedHostHeaderIT`, `TenantRepositoryContractTest`, `OrgIsolationIT` green; invites re-verified; roles backfilled; tenant context in logs |
| **2** | Branded login and dashboard shell | X2 | `flag.enterprise` + per-org allow | Phase 1 | E2E-A up to "lands on Org Admin Dashboard" on `acme.localhost`; E2E-B switcher; branding published at runtime; mascot pose map; basic profile via avatar |
| **3** | Custom domains | X3 | `flag.enterprise.domains` | Phase 2; edge change applied (E5) for real hosts | E2E-A "custom domain verified → careers.acme.com branded login"; `AskEndpointIT`, `SuspendedHostnameIT`; lifecycle (add → verify → activate → primary → suspend → remove) audited |
| **4** | Roles, employees, departments/teams, assignments | X4 | `flag.enterprise.roles` | Phase 1 | Roles & Permissions page (templates, clone, ceiling rule), Employees lifecycle (invite → … → offboard, bulk), Departments/Teams, `org_assignment` with history and workload; `org_member_role` authoritative |
| **5** | Subscription foundation (catalog, licenses, pricing, entitlements, metering) | X5 | `flag.enterprise.billing` (API only) | Phase 4 (assignments for act-for), A3.1 catalog tables | `PricingEngine` golden tests; `EntitlementService.check` with the 11-step order; `usage_event` ledger idempotency; `PersonalSubscriptionUnchangedIT`; Stripe disabled path works |
| **6** | Billing & license UI, Stripe org billing | X6 | `flag.enterprise.billing` (UI + Stripe) | Phase 5 | E2E-C full; Subscription Overview, Consultant Licenses, Configure License (quote → confirm), Billing & Invoices, Feature Usage, Platform Pricing Admin; webhook mirrors; reconciler; test-clock runbook |
| **7** | Consultant & resume management | X7 | `flag.enterprise.marketing` (part 1) | Phase 5 (entitlements), Phase 4 (assignments) | Consultant directory, consultant profile overlay, `org_resume` links, approval workflow, readiness; `ResumeAccessOrgIT`; per-feature consent |
| **8** | Talent marketing | X8 | `flag.enterprise.marketing` | Phase 7 | E2E-D up to "Anika approves": assigned talent, job discovery for a consultant, AI matching with beneficiary, opportunity assignment, authorization request, follow-ups, activities; `NoSubmitSurfaceTest`; duplicate guard |
| **9** | Consultant applications & interviews (+ extension workspace) | X9 | `flag.enterprise.extension_workspaces` | Phase 8 | E2E-D "Anika submits in her own session → both track → interview → outcome"; consultant workspace; application link via submit-detect; interview coordination; AI interview prep gated; offers; extension workspace selector |
| **10** | Clients & placements | X10 | `flag.enterprise.marketing` | Phase 8 | Client accounts/contacts/relationships, requirements, candidate submissions (record), offers → placements, extensions/redeployment; Account Manager workspace |
| **11** | HR & Finance | X11 | `flag.enterprise.hr_finance` | Phase 4 (lifecycle), product H (timesheets/money records) | HR lifecycle records, compliance checklists, policy acks (no identity documents); Finance records pages over H6 data + placement rates; reports; PII scanner on every path |
| **12** | Advanced analytics & enterprise features | X12 | per feature | Phases 6–11 | Org analytics (k-anonymity rules from `docs/design/org/analytics.md`), automation (Autopilot prepare for assigned jobs), integrations (webhooks/Slack/ICS from O12), SSO (SAML/OIDC), ShedLock + second instance readiness, Cloudflare-for-SaaS evaluation |

## 2. What runs in parallel
- Follow-up **design sessions** B (domains/branding/login/identity/dashboards UX), C (catalog/
  pricing/entitlements/metering/billing), D (talent marketing/resumes/applications/clients/
  placements/HR/finance), E (API specs, test plan, deployment plan, full story set) run while Sonnet
  builds Phase 1. Phase 2 build needs B's branding/login spec; Phase 5 needs C; Phase 7+ needs D;
  every phase's API contract comes from E.
- Platform admin stories (A14.*, A3.*) are built by the same Sonnet agents inside the matching X
  phase (the X story names the admin page it needs).

## 3. Feature flags (settings registry, `SettingDefinitions`)

| Key | Type | Default | Risk | Controls |
|---|---|---|---|---|
| `flag.enterprise` | FLAG `{on,pct,allow,deny}` | off | HIGH | master: tenant resolution, enterprise routes, `EnterpriseEnabledFilter` (404 like `OrgsEnabledFilter`) |
| `flag.enterprise.domains` | FLAG | off | HIGH | custom-domain lifecycle + `ask` endpoint answering for CUSTOM rows |
| `flag.enterprise.roles` | FLAG | off | MEDIUM | `org_member_role` authoritative + role editor |
| `flag.enterprise.billing` | FLAG | off | HIGH | license APIs, Stripe org billing; when off, licenses can be *configured* in dev (`dossier.orgs.dev-activate` pattern) but never charged |
| `flag.enterprise.marketing` | FLAG | off | MEDIUM | talent/pipeline modules |
| `flag.enterprise.hr_finance` | FLAG | off | MEDIUM | HR/Finance modules |
| `flag.enterprise.extension_workspaces` | FLAG | off | MEDIUM | `workspaces[]` on `/api/profile/version`, `X-Kiwiply-Workspace` |
| `enterprise.hosts.platform` | JSON list | `["kiwiply.com","www.kiwiply.com","app.kiwiply.com","api.kiwiply.com","localhost"]` | HIGH | reserved platform hosts |
| `enterprise.domains.subdomains_per_day` | INT | 20 | MEDIUM | provisioning throttle (LE rate limit) |
| `enterprise.domains.recheck_hours` | INT | 24 | LOW | ownership re-check cadence |
| `enterprise.domains.grace_hours_before_suspend` | INT | 72 | MEDIUM | failed re-check grace |
| `org.invite.require_email_match` | BOOL (org-overridable) | true | MEDIUM | T6 control |
| `org.consent.request_cooldown_days` | INT (org-overridable) | 7 | LOW | consent nags |
| `enterprise.billing.mode_default` | STRING | `SUBSCRIPTION_ITEMS` | HIGH | ADR-017/020 |
| `enterprise.quote.ttl_minutes` | INT | 15 | MEDIUM | ADR-019 |
| `enterprise.usage.retention_months` | INT | 24 | LOW | ledger purge |

All flags fail closed (existing `OrgFeatureFlag` pattern). Per-org allow lists let one pilot org
(the demo `acme`) run each phase before general availability.

## 4. Migration strategy (ADR-023, applied per phase)
1. One Liquibase file per phase and context: `202610xxxxxxxx_ent_tenancy.xml`,
   `_ent_roles.xml`, `_ent_catalog.xml`, `_ent_licenses.xml`, `_ent_usage.xml`,
   `_ent_talent.xml`, `_ent_pipeline.xml`, `_ent_hr_finance.xml`, each **additive only**
   (createTable / addColumn with default / createIndex / addForeignKey / insert seeds with
   preconditions).
2. Backfills are separate changesets, idempotent, with `<preCondition onFail="MARK_RAN">`:
   e.g. `ent_roles_backfill`: insert system `org_role` rows; insert one `org_member_role` per live
   `org_member` from `role`; set `primary_role_id`.
3. Dual-write: `org_member.role` ← primary template key on every role write until Phase 4's exit;
   `organization.stripe_customer_id` ↔ `org_billing_account` until Phase 6's exit.
4. No renames, no drops, no column type changes, no data moves between tables in this programme.
   The only destructive-looking action — removing `org_resume` links on departure — deletes *links*,
   not records, and is audited.
5. Every changeset runs clean on an empty DB and on a DB at the previous changelog (existing
   Liquibase test pattern); CI's Testcontainers job is the gate.
6. Rollback = flag off. Data created behind a flag is inert when the flag is off.

## 5. Definition of done (every story; from requirements §30–31 + CLAUDE.md)
Functionality works · backend validates permissions (step order §05) · tenant isolation enforced
and covered by a negative test · entitlement checks where a feature is consumed · UI follows
`@kiwiply/ui` with tenant tokens only (no hex) · error/loading/empty states · unit + IT + (where UI)
Playwright over the mock · additive migration · docs updated (`progress-tracker.md`, the owning
design doc) · no regression in personal flows (`PersonalSubscriptionUnchangedIT`, existing suites) ·
versions bumped if the extension changed · one commit, one push to the topic branch, PR into
`develop` (never `main`). Billing stories add: money in minor units, idempotency, valid price
version, invoice traceability, reconciliation, regression tests for the personal subscription.

## 6. Risks to the plan
| Risk | Mitigation |
|---|---|
| Edge change (E5) delayed | Phases 2–3 develop on `*.localhost`; Playwright emulates hosts; nothing else blocks |
| Catalog scope creep (personal + enterprise) | Phase 5 builds only what licenses need; personal plan migration onto the catalog (A3.5) stays an admin story |
| Branch A/B merge conflicts | X1.8 and X2.1 start by consolidating the duplicate web helpers in one commit before adding features |
| Stripe item cap | ADR-020 fallback designed up front; flag per org |
| Team bandwidth | Each phase is 8–14 stories sized S/M/L; no story spans two contexts |
