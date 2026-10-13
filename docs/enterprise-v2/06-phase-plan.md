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
| `flag.enterprise.analytics` | FLAG | off | MEDIUM | org-wide analytics (X12.1); `/api/me/tenant.modules.analytics` |
| `flag.enterprise.integrations` | FLAG | off | MEDIUM | integrations module (Phase 12) |
| `flag.enterprise.sso` | FLAG | off | HIGH | SSO (Phase 12) |
| `enterprise.matching.batch_size` | INT | 20 | LOW | `ai.job_matching` units reserved per run (37 #1) |
| `enterprise.pipeline.board_policies` | JSON | `{}` | MEDIUM | 31 §9 (was D's `pipeline.board_policies`) |
| `enterprise.pipeline.consumer_email_domains` | JSON list | gmail.com, … | LOW | 34 §2 (was D's `pipeline.consumer_email_domains`) |
| `org.pipeline.open_matches_max` | INT (org-overridable) | 25 | LOW | 17 (was D's `assignments.open_max`) |
| `org.ui.roles_reviewed_at` | DATETIME (org-overridable) | null | LOW | 14 §2.4 (was B's `ui.roles_reviewed_at`) |
| `catalog.org_above_individual_pct`, `catalog.stripe.invoicing_bp`, `catalog.org_min_invoice_lines` | INT | 25 / 40 / 1 | HIGH | 21 §5 (C) — registered under `EnterpriseSettingKeys.Catalog`, not `AdminSettingKeys` |

All flags fail closed (existing `OrgFeatureFlag` pattern). Per-org allow lists let one pilot org
(the demo `acme`) run each phase before general availability.

**One registration point (09 row 7).** Every key introduced by docs 10–38 registers in
`EnterpriseSettingKeys` as nested groups `Tenancy`, `Domains`, `Org`, `Billing`, `Catalog`, `Pipeline`,
`Hr` (the table above is not exhaustive — each doc's own keys follow the convention). Naming:
`enterprise.<area>.<name>` = platform-wide, `org.<area>.<name>` = org-overridable through
`OrgSettingsResource` (14 §4), `flag.enterprise.*` = flags. `SettingDefinitionsTest`'s duplicate-key
guard is the gate; a key that does not follow the convention fails `EnterpriseSettingKeysConventionTest`.

## 4. Migration strategy (ADR-023, applied per phase)
1. One Liquibase file per phase and context, each **additive only** (createTable / addColumn with
   default / createIndex / addForeignKey / insert seeds with preconditions). **Timestamps (09 row 16):**
   enterprise owns one "day" bucket per phase, `202610<13+P>NN0000_ent_<context>.xml`, `NN` = sequence
   within the phase — P1 `20261015`, P2 `20261016`, P3 `20261017`, P4 `20261018`, P5 `20261019`,
   P6 `20261020`, P7 `20261021`, P8 `20261022`, P9 `20261023`, P10 `20261024`, P11 `20261025`,
   P12 `20261026`. Assigned files: `20261015010000_ent_tenancy` (X1.2), `20261015020000_ent_roles` (X1.6),
   `20261015030000_ent_authz` (X1.7 `org_assignment` shell), `20261016010000_ent_profile` (X2.7),
   `20261017010000_ent_domains` (X3.3), `20261018010000_ent_assignments` (X4.7),
   `20261019010000_ent_catalog` (X5.1), `20261019020000_ent_contracts` (X5.5), `20261019030000_ent_licenses`
   (X5.4), `20261019040000_ent_usage` (X5.7, incl. the `ai_call` columns of X5.8), `20261020010000_ent_org_billing`
   (X6.12), `20261020020000_ent_org_billing_mirrors` (X6.6 if needed), `20261021010000_ent_talent` (X7.2/X7.3/X7.6),
   `20261022010000_ent_pipeline` (X8.10), `20261023010000_ent_applications` (X9.5, X9.8),
   `20261024010000_ent_placements` (X10.1–X10.8, incl. `ops_placement.pipeline_placement_id`),
   `20261025010000_ent_hr_finance` (X11.*). Product H keeps its own bucket (≥ `20261027`) and must move
   its planned `20261013*_ts_*` files there.
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

## 7. Global build order (Session E, Task 5 — 2026-10-12)

One sequence across phases, dependencies first; the same list drives the phase tables in
`progress-tracker.md`. Stories inside a phase may run in parallel where the per-phase notes in
`07-backlog.md` allow it; across phases the order is strict except where noted. Every story is
S/M (the 27 former L stories were split: the original id keeps the foundation/API half, the new id
carries the UI/lifecycle half). 154 stories including X0.1.

| Phase | Build order |
|---|---|
| **1** Enterprise tenant foundation | X1.1 → X1.2 → X1.3 → X1.4 → X1.5 → X1.6 → X1.7 → X1.14 → X1.8 → X1.15 → X1.10 → X1.11 → X1.12 → X1.9 → X1.13 |
| **2** Branded login and dashboard shell | X2.1 → X2.8 → X2.15 → X2.12 → X2.13 → X2.2 → X2.16 → X2.10 → X2.3 → X2.6 → X2.7 → X2.9 → X2.4 → X2.17 → X2.5 → X2.18 → X2.14 → X2.11 |
| **3** Custom domains | X3.1 → X3.2 → X3.3 → X3.4 → X3.5 → X3.6 → X3.7 → X3.8 |
| **4** Roles, employees, departments, teams, assignments | X4.1 → X4.11 → X4.2 → X4.5 → X4.3 → X4.12 → X4.6 → X4.4 → X4.9 → X4.7 → X4.13 → X4.8 → X4.10 |
| **5** Subscription foundation | X5.1 → X5.2 → X5.3 → X5.13 → X5.5 → X5.15 → X5.4 → X5.14 → X5.7 → X5.6 → X5.16 → X5.11 → X5.8 → X5.12 → X5.9 → X5.10 |
| **6** Billing & license UI, Stripe org billing | X6.12 → X6.6 → X6.14 → X6.7 → X6.15 → X6.8 → X6.1 → X6.2 → X6.3 → X6.13 → X6.4 → X6.5 → X6.9 → X6.16 → X6.10 → X6.17 → X6.11 |
| **7** Consultant & resume management | X7.2 → X7.1 → X7.8 → X7.3 → X7.9 → X7.6 → X7.4 → X7.5 → X7.10 → X7.7 |
| **8** Talent marketing | X8.10 → X8.13 → X11.7 → X8.1 → X8.2 → X8.3 → X8.11 → X8.4 → X8.12 → X8.5 → X8.8 → X8.6 → X8.7 → X8.9 |
| **9** Consultant applications, interviews, extension workspace | X9.1 → X9.11 → X9.2 → X9.3 → X9.4 → X9.5 → X9.6 → X9.7 → X9.8 → X9.9 → X9.12 → X9.10 |
| **10** Clients & placements | X10.1 → X10.9 → X10.2 → X10.3 → X10.4 → X10.10 → X10.8 → X10.6 → X10.5 → X10.7 |
| **11** HR & Finance | X11.1 → X11.2 → X11.3 → X11.8 → X11.5 → X11.4 → X11.9 → X11.6 |
| **12** Advanced analytics & enterprise features | X12.5 → X12.1 → X12.8 → X12.7 → X12.3 → X12.12 → X12.11 → X12.4 → X12.10 → X12.2 → X12.9 → X12.6 |

Notes: X1.13 is independent of the flags and can be built first. X11.7 (PII scanner) is built in the
Phase-8 slot because X10.1 depends on it. X3.* needs the user-applied edge change for public hosts
but develops on `*.localhost`. X12.2/X12.9 stay Not Started until escalation D2 is answered.
Phase gates (§1 exit criteria) are unchanged; `X1.9`, `X2.11`, `X3.8`, `X4.10`, `X5.10`, `X6.11`,
`X8.9`, `X9.10` close their phases.
