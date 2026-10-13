# Enterprise V2 — implementation progress tracker

> Statuses: **Not Started → In Progress → Code Complete → Testing → Completed / Blocked.**
> Every Completed row must reference real code and tests (file paths or a commit). Keep this table
> and `docs/roadmap/areas/ent.json` in sync: `node docs/roadmap/build-master-roadmap.mjs --set X1.1=in_progress`
> (roadmap statuses: not_started / in_progress / in_review (= Code Complete) / partial (= Testing) /
> done / blocked). One story = one commit = one PR into `develop`. Rows are in the **global build
> order** (`06-phase-plan.md` §7, Session E Task 5); the tables are regenerated from `ent.json` with
> the Notes column preserved — add notes here, ids only in `ent.json`.

## Phase 0 — Audit, debate, foundation design, plan

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X0.1 Phase 0 deliverables | Completed | Fable | `docs/enterprise-v2/*`, `docs/enterprise-v2/adr/ADR-001…023`, `docs/roadmap/areas/ent.json`, `docs/HANDOFF-ENTERPRISE-V2.md` | Design only; Sessions B–E wrote docs 09–45 and every story (154 total, all §30, 0 dangling) |

## Phase 1 — Enterprise tenant foundation (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X1.1 Enterprise feature flags in the settings registry + EnterpriseEnabledFilter (second… | Not Started | Sonnet (API) | — | deps X0.1; first task; see HANDOFF START HERE |
| X1.2 Tenancy schema: org_hostname, org_branding, org_setting, organization… | Not Started | Sonnet (API) | — | deps X1.1; additive changelog `*_ent_tenancy.xml` |
| X1.3 TenantResolver + TenantContext in the API, GET /api/public/tenant, internal… | Not Started | Sonnet (API) | — | deps X1.2 |
| X1.4 Web host resolution: proxy.ts carries the host and rewrites tenant hosts to /_t… | Not Started | Sonnet (Web) | — | deps X1.3; **amended by Session E (09 row 15)** — build the `_t` tree + rewrite from the start |
| X1.5 Tenant-bound sessions: tid/hid claims on tenant-host login, decoder validation… | Not Started | Sonnet (API+Web) | — | deps X1.3, X1.4 |
| X1.6 Roles as data (read side): org_role, org_role_permission, org_member_role; system… | Not Started | Sonnet (API) | — | deps X1.2; parallel with X1.3–X1.5 after X1.2 |
| X1.7 Scope model: PermissionScope {OWN, ASSIGNED, TEAM, DEPARTMENT, ORG}, ScopeEvaluator… | Not Started | Sonnet (API) | — | deps X1.6 |
| X1.14 Role writes: OrgRoleService clone/update with the ceiling rule, member role… | Not Started | Sonnet (API) | — | deps X1.6, X1.7 — split (Session E) |
| X1.8 Invitation framework: adopt branch B (a6a9a62) invites + join API, re-verify… | Not Started | Sonnet (API) | — | deps X1.6, X1.3; cherry-pick + re-verify first |
| X1.15 Multi-role invites with department/team/manager, org.invite.require_email_match… | Not Started | Sonnet (API) | — | deps X1.8, X1.14 — split (Session E) |
| X1.10 Tenant context in logs, audit and async work: MDC tenant/host/member, TenantScoped… | Not Started | Sonnet (API) | — | deps X1.3 |
| X1.11 Platform admin: Organizations & hostnames — list, tenant detail, provision subdomain… | Not Started | Sonnet (API+Web) | — | deps X1.3, X1.1; admin page kit |
| X1.12 Mock API tenants + fixtures: acme (CONSULTANCY) and beta, host emulation, dev host… | Not Started | Sonnet (Web+API) | — | deps X1.3; needed by X1.9 Playwright |
| X1.9 Isolation test gate: HostUnknownIT, HostMismatchIT, ForgedHostHeaderIT… | Not Started | Sonnet (API+Web+QA) | — | deps X1.3, X1.4, X1.5, X1.12; closes the phase |
| X1.13 Ops endpoints off the public host: prometheus behind admin-or-scrape-token… | Not Started | Sonnet (API) | — | no deps; new (Session E, 09 row 19); any time after X1.3 |

## Phase 2 — Branded login and dashboard shell (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X2.1 Consolidate the two parked web helper sets (org-types/org-api vs… | Not Started | Sonnet (Web) | — | deps X1.4, X1.8; first; no feature work |
| X2.8 MascotPose wrapper in packages/ui with the enterprise pose map; empty states and… | Not Started | Sonnet (UI) | — | no deps; parallel after X2.1 |
| X2.15 Enterprise UI kit in packages/ui: FilterBar, DataTable, ReasonSheet… | Not Started | Sonnet (UI) | — | deps X2.1, X2.8; new (Session E, 09 row 14); before X2.2 and every C/D UI story |
| X2.12 Contrast-safe tenant theme derivation (BrandingTheme) in the public DTO… | Not Started | Sonnet (API+UI) | — | deps X1.3; parallel after X2.1 |
| X2.13 Public tenant assets (logo, favicon, banner) served by host with caching; per-tenant… | Not Started | Sonnet (API+Web) | — | deps X1.3, X1.4; parallel after X2.1 |
| X2.2 Tenant session contract: GET /api/me/tenant, workspace definitions as data, workspace… | Not Started | Sonnet (Web+API+UI) | — | deps X2.1, X1.5, X1.6, X2.15; promotes the admin kit to packages/ui |
| X2.16 EnterpriseShell UI: sidebar (viewport-height, independently scrollable, collapsible)… | Not Started | Sonnet (Web+UI) | — | deps X2.2, X2.15, X2.8, X2.12 — split (Session E) |
| X2.10 Tenant-aware URL building (TenantUrls) for mail, notifications and redirects… | Not Started | Sonnet (API) | — | deps X1.2, X1.3; parallel with X2.2 |
| X2.3 BrandedLogin component: runtime branding from GET /api/public/tenant, password +… | Not Started | Sonnet (Web) | — | deps X2.1, X1.5, X2.8 |
| X2.6 Login-first routing on tenant hosts: proxy rewrite to the tenant route tree… | Not Started | Sonnet (Web+API) | — | deps X2.3, X1.8, X2.2, X1.4, X1.15; B2 (rewrite) applies |
| X2.7 Basic user profile surface (avatar menu): photo, name, work email, phone, title… | Not Started | Sonnet (API+Web) | — | deps X2.2 |
| X2.9 Organization Settings page (separate from the basic profile): name/display name… | Not Started | Sonnet (API+Web) | — | deps X2.16, X1.2 |
| X2.4 Org Admin Dashboard API: GET …/dashboard with the DashboardWidgetProvider registry… | Not Started | Sonnet (API+Web) | — | deps X2.2, X1.6, X1.10; reworks 18f2123; re-verify |
| X2.17 Org Admin Dashboard page (/w/admin): stat tiles with real deltas, hero with the greet… | Not Started | Sonnet (Web) | — | deps X2.4, X2.16, X2.15, X2.8 — split (Session E) |
| X2.5 Organization Branding API: draft/publish/versions, asset uploads (raster only… | Not Started | Sonnet (API+Web) | — | deps X1.2, X2.2, X2.12, X2.13; needs X2.12/X2.13 |
| X2.18 Organization Branding page (/w/admin/branding): identity, logo/favicon/banner drop… | Not Started | Sonnet (Web) | — | deps X2.5, X2.16, X2.15, X2.12, X2.13 — split (Session E) |
| X2.14 Org-enforced sign-in code (email MFA) on tenant hosts via org.security.mfa_required… | Not Started | Sonnet (API+Web) | — | deps X2.3, X2.9; escalation B3 default |
| X2.11 E2E-A (to dashboard) and E2E-B (multi-role switcher) Playwright journeys over the mock… | Not Started | Sonnet (QA+Web) | — | deps X2.3, X2.17, X2.6, X2.7, X2.9, X1.12, X2.16, X2.18; closes the phase |

## Phase 3 — Custom domains (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X3.1 Domains page + API: add custom hostname (PENDING), DNS instructions (TXT ownership… | Not Started | Sonnet (API+Web) | — | deps X1.2, X1.11, X2.16, X2.9 |
| X3.2 Ownership verification job: TXT + CNAME/A checks (dnsjava), VERIFYING → VERIFIED… | Not Started | Sonnet (API) | — | deps X3.1, X1.10; B7 dependency |
| X3.3 Activation and certificates: ACTIVE enables the ask endpoint for the host; cert_state… | Not Started | Sonnet (API+Web) | — | deps X3.2, X1.3, X1.11; B1 (query token) |
| X3.4 Primary domain and redirects: one primary per org; non-primary ACTIVE hosts 308 to the… | Not Started | Sonnet (API+Web) | — | deps X3.3, X2.6, X2.10; B6 defaults |
| X3.5 Suspension and removal lifecycle with typed confirmation; sessions on a… | Not Started | Sonnet (API+Web) | — | deps X3.3, X1.5 |
| X3.6 Edge snippet and runbook (on_demand_tls ask + catch-all block + DNS records) for the… | Not Started | Sonnet (API+Ops+QA) | — | deps X3.3; **user applies the edge change after X3.3 deploys (E5 answered)** |
| X3.7 Google sign-in per tenant host (opt-in after origin registration) and security headers… | Not Started | Sonnet (API+Web) | — | deps X2.6, X3.3; E14 default |
| X3.8 E2E-A custom-domain segment and SuspendedHostnameIT/AskEndpointIT hardening… | Not Started | Sonnet (QA) | — | deps X3.1, X3.2, X3.3, X3.4, X3.5, X3.7, X2.11; closes the phase |

## Phase 4 — Roles, employees, departments, teams, assignments (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X4.1 Roles & Permissions API: role detail with template diff, delete when unused, resync… | Not Started | Sonnet (API+Web) | — | deps X1.14, X1.7 |
| X4.11 Roles & Permissions page (/w/admin/roles): templates and org roles list… | Not Started | Sonnet (Web) | — | deps X4.1, X2.16, X2.15 — split (Session E) |
| X4.2 Workspace definitions as data (workspace_key → nav → needs) with per-org nav… | Not Started | Sonnet (API+Web) | — | deps X2.16, X2.18, X4.1 |
| X4.5 Departments and teams: parent/child groups, leads, move members, counts, drag/undo | Not Started | Sonnet (API+Web) | — | deps X1.2, X2.16; before X4.3 |
| X4.3 Members API on real data: list with filters/search/scope, bulk… | Not Started | Sonnet (API+Web) | — | deps X1.6, X1.15, X2.2, X4.5; B8 (last active) |
| X4.12 Employees page (/w/admin/employees + /w/hr/employees + /w/marketing-mgmt/team… | Not Started | Sonnet (Web) | — | deps X4.3, X2.16, X2.15, X4.5 — split (Session E) |
| X4.6 Employee detail sheet: seat, roles (ceiling-aware), groups, manager, consent scope… | Not Started | Sonnet (API+Web) | — | deps X4.12, X4.11 |
| X4.4 Employee lifecycle: suspend, reinstate, offboard wizard (records kept, scheduled last… | Not Started | Sonnet (API+Web) | — | deps X4.12, X4.6, X4.3; hooks for D (assignments) and C (licenses) |
| X4.9 Org audit log viewer (filters, risk, CSV export audited) for OWNER/ORG_ADMIN/FINANCE… | Not Started | Sonnet (API+Web) | — | deps X1.10, X2.16 |
| X4.7 Consultant–marketer assignments (foundation): org_assignment table, repository… | Not Started | Sonnet (API+Web) | — | deps X1.14, X1.7, X4.3; deps X1.6, X1.7, X4.3 |
| X4.13 Assignment lifecycle: reassign atomically with history chain, DELEGATE with max days +… | Not Started | Sonnet (API+Web) | — | deps X4.7, X4.12, X2.15 — split (Session E) |
| X4.8 Workload balancing view for Marketing Managers: open assignments per marketer, caps… | Not Started | Sonnet (API+Web) | — | deps X4.13; deps X4.7 |
| X4.10 org_member_role becomes authoritative; legacy enum fallback removed from… | Not Started | Sonnet (API) | — | deps X1.14, X4.1, X4.3; finalised by Session E (09 row 17); closes Phase 4 |

## Phase 5 — Subscription foundation (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X5.1 Catalog tables (product, product_price, product_entitlement, bundle_item… | Not Started | Sonnet (API+Web) | — | deps X1.1, X1.11; supersedes A3.1; enterprise rows seeded with no prices (E3) |
| X5.2 feature_definition, feature_definition_limit, feature_dependency, license_preset… | Not Started | Sonnet (API+Web) | — | deps X5.1; seeds inactive |
| X5.3 MarginCalculator for BASE_LICENSE/FEATURE/ORG_MODULE (fee_base/fee_feature, invoicing… | Not Started | Sonnet (API+Web) | — | deps X5.2; 21 §5–6 table pinned |
| X5.13 Admin Catalog page (admin page kit): products/prices/versions tabs, price editor with… | Not Started | Sonnet (Web) | — | deps X5.1, X5.3 — split (Session E) |
| X5.5 PricingEngine (list → contract → one discount → volume tier → effective, half-even per… | Not Started | Sonnet (API) | — | deps X5.3; 22 §9 G1–G14; before X5.4 |
| X5.15 Contracts and discounts: org_contract / org_contract_price (version_from/version_to) /… | Not Started | Sonnet (API) | — | deps X5.5, X1.11 — split (Session E) |
| X5.4 consultant_license + license_feature + license_quote + license_change tables and… | Not Started | Sonnet (API) | — | deps X5.5, X1.7, X1.8, X5.15; LocalBillingApplier |
| X5.14 License lifecycle: LicenseLifecycleJob (PENDING promotion on invite accept, period-end… | Not Started | Sonnet (API) | — | deps X5.4 — split (Session E) |
| X5.7 usage_event ledger + usage_counter: reserve/commit/release with idempotency keys, TTL… | Not Started | Sonnet (API) | — | deps X5.4 |
| X5.6 EntitlementService.check/require with EntitlementContext (PERSONAL | ORG) and the… | Not Started | Sonnet (API) | — | deps X5.7, X1.7, X4.7; needs X4.7 for step 9 |
| X5.16 @RequiresFeature(beneficiary = NONE|SELF|PATH_MEMBER|BODY_MEMBER|QUERY_MEMBER) +… | Not Started | Sonnet (API) | — | deps X5.6, X1.7 — split (Session E) |
| X5.11 Org modules: org_module_license (FLAT / PER_ROLE quantity), the marketer seat as… | Not Started | Sonnet (API) | — | deps X5.4, X1.14; Roles page alignment (B) |
| X5.8 Migrate the eight isPro callers to EntitlementService.require with context-aware… | Not Started | Sonnet (API) | — | deps X5.16; personal path byte-identical |
| X5.12 Bulk license operations API: one BULK quote for many members (ids or… | Not Started | Sonnet (API) | — | deps X5.4, X4.5 |
| X5.9 PersonalSubscriptionUnchangedIT (scenario E, 12 steps) + WriterRegistryTest +… | Not Started | Sonnet (API+Web) | — | deps X5.8; required CI job |
| X5.10 E2E-C API-level scenario test (activate base → add two features → quote → confirm →… | Not Started | Sonnet (API) | — | deps X5.9, X5.12, X5.11, X5.14; closes the phase |

## Phase 6 — Billing & license UI, Stripe org billing (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X6.12 org_billing_account + Stripe org customer + setup fee (one-time Checkout or… | Not Started | Sonnet (API+Web) | — | deps X5.4, X5.14; adopts O4.1/O4.2; first in Phase 6 |
| X6.6 StripeGateway extension for org billing: subscription with items, setItemQuantities… | Not Started | Sonnet (API) | — | deps X6.12 |
| X6.14 Org webhook routing + OrgBillingWebhookHandler writing… | Not Started | Sonnet (API) | — | deps X6.6, X5.4 — split (Session E) |
| X6.7 LicenseChangeApplier (Stripe mode): target item set → one update with proration none… | Not Started | Sonnet (API) | — | deps X6.14; Kiwiply prorates (C10) |
| X6.15 OrgPeriodRolloverJob (coupon re-size at invoice.upcoming, scheduled removals), Stripe… | Not Started | Sonnet (API) | — | deps X6.7, X6.14 — split (Session E) |
| X6.8 OrgSeatReconciler nightly + billing_drift + admin attention; dunning (PAST_DUE banner… | Not Started | Sonnet (API) | — | deps X6.15 |
| X6.1 Subscription Overview page: consultants/licensed/unlicensed tiles, monthly recurring… | Not Started | Sonnet (Web+API) | — | deps X6.7, X2.16, X2.17, X2.15; needs X2.2 shell |
| X6.2 Consultant Licenses page: cards (390) / table (1440), filters, search, sort, status… | Not Started | Sonnet (Web) | — | deps X6.1, X5.12, X2.15 |
| X6.3 Configure Consultant License: summary, base, feature picker with… | Not Started | Sonnet (Web) | — | deps X6.2, X2.15; E2E-C UI |
| X6.13 Cost-confirmation sheet for COMMERCIAL dependencies (full cost impact, explicit… | Not Started | Sonnet (Web) | — | deps X6.2, X6.3, X5.12, X2.15 — split (Session E) |
| X6.4 Billing & Invoices page: Account (status, currency, payment method via Stripe portal… | Not Started | Sonnet (Web+API) | — | deps X6.14, X6.12, X2.15 |
| X6.5 Feature Usage page (by consultant / feature / team / history, remaining allowances, AI… | Not Started | Sonnet (Web) | — | deps X5.7, X6.1, X2.15 |
| X6.9 Platform Pricing Admin (admin page kit): Features, Presets, Volume tiers tabs +… | Not Started | Sonnet (Web+API) | — | deps X5.13, X5.2, X5.3; admin page kit |
| X6.16 Platform Pricing Admin — Discounts and Contracts tabs (Commercial Agreements)… | Not Started | Sonnet (Web) | — | deps X6.9, X5.15 — split (Session E) |
| X6.10 Platform admin org billing operations: setup-fee status, invoices, items vs licenses… | Not Started | Sonnet (Web+API) | — | deps X6.8, X6.9, X6.16; credits behind flag (C1) |
| X6.17 Platform admin break-glass (E8): POST /api/admin/orgs/{id}/break-glass {reason, mfa} →… | Not Started | Sonnet (API+Web) | — | deps X1.11, X1.10, X4.9 — new (coverage audit, doc 45) |
| X6.11 Stripe test-clock QA runbook (scenario C through dunning with recorded object ids) +… | Not Started | Sonnet (QA+Web) | — | deps X6.3, X6.4, X6.5, X6.8, X6.10, X6.13; closes the phase |

## Phase 7 — Consultant & resume management (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X7.2 Consultant profile overlay (consultant_profile): availability, bench date, marketing… | Not Started | Sonnet (API+Web) | — | deps X4.7, X1.7; deps X4.7, X1.7 |
| X7.1 Consultant directory API: org_member × consultant_profile × consent projection × open… | Not Started | Sonnet (API+Web) | — | deps X7.2, X4.7; deps X7.2, X4.7 |
| X7.8 Consultants page (/w/admin/consultants, /w/marketing/talent, /w/hr/consultants… | Not Started | Sonnet (Web) | — | deps X7.1, X2.16, X2.15 — split (Session E) |
| X7.3 Org resume links API: org_resume table, PERSONAL_SHARED sync from consent… | Not Started | Sonnet (API+Web) | — | deps X7.1; deps X7.1 |
| X7.9 Org Resumes page (/w/admin/resumes, /w/marketing/resumes) + consultant Resumes tab +… | Not Started | Sonnet (Web) | — | deps X7.3, X7.8, X2.15 — split (Session E) |
| X7.6 org_feature_consent: per-feature act-for consent with cooldown-limited requests… | Not Started | Sonnet (API+Web) | — | deps X7.3, X5; deps X7.3, X5 |
| X7.4 Resume approval workflow: marketer proposes (ORG_MANAGED or edit of shared)… | Not Started | Sonnet (API+Web) | — | deps X7.3, X7.6, X7.9; deps X7.3, X7.6 |
| X7.5 Marketer-made resumes via the builder in act-for mode (FULL consent +… | Not Started | Sonnet (API+Web) | — | deps X7.4, X5; deps X7.4, X5 |
| X7.10 Act-for AI in the builder: rewrite/summary/suggest/tailor with… | Not Started | Sonnet (API+Web) | — | deps X7.5, X5.16, X5.8, X7.6 — split (Session E) |
| X7.7 Marketing readiness checklist per consultant (profile, approved resume, availability… | Not Started | Sonnet (API+Web) | — | deps X7.4, X7.2; deps X7.4, X7.2 |

## Phase 8 — Talent marketing (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X8.10 Pipeline schema: 20261022010000_ent_pipeline.xml (job_opportunity, opportunity_match… | Not Started | Sonnet (API) | — | deps X7.4, X4.7; deps X7.4, X4.7 |
| X8.13 Pipeline engine: PipelineTransitions registry (data) +… | Not Started | Sonnet (API) | — | deps X8.10, X1.7, X4.7 — split (Session E) |
| X11.7 PII scanner on every path: @NoSensitiveText coverage test, PdfTextScanner refusal… | Not Started | Sonnet (API+Web) | — | deps X8.10, X2.15; deps X8.10 |
| X8.1 Marketing workspace shell: My Assigned Talent, consultant switcher, consent/license chips | Not Started | Sonnet (Web+API) | — | deps X8.10, X7.1, X2, X2.15, X7.8, X8.13; deps X8.10, X7.1, X2 |
| X8.2 Job discovery for a consultant (JobSearchService with beneficiary) and org-curated job… | Not Started | Sonnet (API+Web) | — | deps X8.1; deps X8.1 |
| X8.3 AI matching for a consultant (on demand): OrgMatchService.matchOne with AiCallContext… | Not Started | Sonnet (API+Web) | — | deps X8.2, X5.16, X5.8, X8.13; deps X8.2, X5 |
| X8.11 OrgMatchJob nightly (consultants with marketing_status ACTIVE and the feature… | Not Started | Sonnet (API+Web) | — | deps X8.3, X8.1 — split (Session E) |
| X8.4 Opportunity assignment API: SUGGESTED/—→ASSIGNED and →WITHDRAWN transitions with… | Not Started | Sonnet (API+Web) | — | deps X8.3, X7.4, X8.11; deps X8.3, X7.4 |
| X8.12 Assign bar (useBottomBar) with APPROVED-only resume picker, overrides and note… | Not Started | Sonnet (Web) | — | deps X8.4, X8.11, X2.15 — split (Session E) |
| X8.5 Authorization requests: consultant accepts/declines and authorizes a submission… | Not Started | Sonnet (API+Web) | — | deps X8.4, X8.12; deps X8.4 |
| X8.8 Duplicate-submission guard across consultants and vendors; same-employer window setting | Not Started | Sonnet (API) | — | deps X8.4; deps X8.4 |
| X8.6 Follow-ups, tasks and escalations: due dates, reminders, activity feed, status updates… | Not Started | Sonnet (API+Web) | — | deps X8.5; deps X8.5 |
| X8.7 Marketer performance view (counts, response rates; k-anonymity rules not needed for… | Not Started | Sonnet (API+Web) | — | deps X8.6; deps X8.6 |
| X8.9 NoSubmitSurfaceTest + MarketerScopeTest kept green; E2E-D up to authorization in… | Not Started | Sonnet (API+Web+QA) | — | deps X8.5, X8.8; deps X8.5, X8.8 |

## Phase 9 — Consultant applications, interviews, extension workspace (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X9.1 Consultant workspace shell: nav per 38 §3; My Profile, My Resumes, Job Matches… | Not Started | Sonnet (Web+API) | — | deps X8.5, X2, X2.15; deps X8.5, X2 |
| X9.11 Consultant Home (/w/consultant): needs-you (resume approvals, slot confirmations… | Not Started | Sonnet (Web+API) | — | deps X9.1, X2.8, X2.15 — split (Session E) |
| X9.2 Assigned jobs list for the consultant and application link via submit-detect… | Not Started | Sonnet (API+Web+Ext) | — | deps X9.1, X9.11; deps X9.1 |
| X9.3 Application tracking for the org: consented stage view, timeline merge of… | Not Started | Sonnet (API) | — | deps X9.2; deps X9.2 |
| X9.4 Applications page (org side) consent-scoped on real data | Not Started | Sonnet (Web) | — | deps X9.3; deps X9.3 |
| X9.5 Interview coordination: interview_slot propose/confirm, consultant accepts into own… | Not Started | Sonnet (API+Web) | — | deps X9.2, X8.10, X8.13; deps X9.2, X8.10 |
| X9.6 Interviews page (org side) and calendar of consented interviews | Not Started | Sonnet (Web+API) | — | deps X9.5; deps X9.5 |
| X9.7 AI Interview Preparation for consultants gated by interview.ai_prep entitlement… | Not Started | Sonnet (API+Web) | — | deps X9.5, X5; deps X9.5, X5 |
| X9.8 Offers: extend/record, consultant responds, feedback capture | Not Started | Sonnet (API+Web) | — | deps X9.5; deps X9.5 |
| X9.9 Extension workspace API: GET /api/profile/version workspaces[] + hints… | Not Started | Sonnet (Ext+API) | — | deps X9.2, X5; deps X9.2, X5 |
| X9.12 Extension side: workspace chip in the drawer, storage partition per workspace… | Not Started | Sonnet (Ext) | — | deps X9.9 — split (Session E) |
| X9.10 E2E-D completion (submit in own session → interview → outcome) and E2E-E… | Not Started | Sonnet (QA+Web) | — | deps X9.9, X9.8, X9.12; deps X9.9, X9.8 |

## Phase 10 — Clients & placements (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X10.1 Client model API: client_account / client_contact / client_relationship (vendor… | Not Started | Sonnet (API+Web) | — | deps X8.10, X11.7, X8.13; deps X8.10, X11.7 |
| X10.9 Clients pages (/w/accounts/clients, /w/admin/clients): list with filters, account page… | Not Started | Sonnet (Web) | — | deps X10.1, X2.16, X2.15 — split (Session E) |
| X10.2 Client requirements: intake (manual/email paste/import), status, owner, dedupe | Not Started | Sonnet (API+Web) | — | deps X10.1, X10.9; deps X10.1 |
| X10.3 Candidate submissions as records: authorize → submitted → shortlisted/rejected; unique… | Not Started | Sonnet (API+Web) | — | deps X10.2, X8.5; deps X10.2, X8.5 |
| X10.4 Placement lifecycle API: PENDING_START/ACTIVE/ON_HOLD/EXTENDED/ENDED/TERMINATED… | Not Started | Sonnet (API+Web) | — | deps X9.8, X10.3; deps X9.8, X10.3 |
| X10.10 Placements board (1440) and list (390) with Extend / End / Terminate SideSheets… | Not Started | Sonnet (Web) | — | deps X10.4, X10.9, X2.15 — split (Session E) |
| X10.8 Timesheets bridge: placement ACTIVE →… | Not Started | Sonnet (API) | — | deps X10.4, H1.1; deps X10.4, H1.1 |
| X10.6 Placement declaration from the consultant side and org celebration (mascot), feeding… | Not Started | Sonnet (Web+API) | — | deps X10.4, X10.10; deps X10.4 |
| X10.5 Account Manager workspace: Clients, Contacts, Requirements, Submissions, Interviews… | Not Started | Sonnet (Web) | — | deps X10.4, X10.6, X2.15, X10.9, X10.10; deps X10.4, X10.6 |
| X10.7 Pipeline reports: requirement fill rate, time-to-place, submissions per consultant… | Not Started | Sonnet (API+Web) | — | deps X10.5; deps X10.5 |

## Phase 11 — HR & Finance (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X11.1 HR lifecycle records (employment_record): onboarding → active → leave → offboarding →… | Not Started | Sonnet (API+Web) | — | deps X11.7, X4.4; deps X11.7, X4.4 |
| X11.2 Compliance checklists (hr_task) and policy acknowledgements (policy_ack) with… | Not Started | Sonnet (API+Web) | — | deps X11.1; deps X11.1 |
| X11.3 HR workspace: Home tiles, Employees (HR columns), Onboarding board, Policies (the… | Not Started | Sonnet (Web+API) | — | deps X11.2, X2.15; deps X11.2 |
| X11.8 Talent Acquisition: talent_pool / talent_pool_member tables (members or invites only… | Not Started | Sonnet (API+Web) | — | deps X11.3, X4.12, X1.15 — split (Session E) |
| X11.5 Finance records for placements: bill/pay rate labels, invoice_record and… | Not Started | Sonnet (API+Web) | — | deps X10.8, X11.7; deps X10.8, X11.7 |
| X11.4 Finance workspace: Home tiles (AnimatedNumber) deep-linking into the billing pages… | Not Started | Sonnet (Web+API) | — | deps X11.5, X6, X2.15; deps X11.5, X6 |
| X11.9 Product H embedding in the Finance workspace: Timesheets (week view), Approvals… | Not Started | Sonnet (Web+API) | — | deps X11.4, X10.8 — split (Session E) |
| X11.6 HR/Finance reports and CSV exports (audited); retention per settings | Not Started | Sonnet (API+Web) | — | deps X11.3, X11.4, X11.9, X11.8; deps X11.3, X11.4 |

## Phase 12 — Advanced analytics & enterprise features (global build order)

| Story | Status | Owner | Evidence | Notes |
|---|---|---|---|---|
| X12.5 Second-instance readiness: ShedLock on every @Scheduled job, DB-backed shared rate… | Not Started | Sonnet (API+Ops) | — | deps X3.2, X5.7, X1.3 |
| X12.1 Org analytics API with k-anonymity: pipeline, licenses and usage metrics over the O7… | Not Started | Sonnet (API) | — | deps X8.13, X5.7, X10.4, X4.9 |
| X12.8 Executive / Viewer workspace (/w/exec): Home with counts-only tiles and k-anonymous… | Not Started | Sonnet (Web) | — | deps X12.1, X2.16, X2.15 — split (Session E) |
| X12.7 Advanced reporting: ReportsPage family filter across ADMIN / MARKETING_MGMT / HR /… | Not Started | Sonnet (API+Web) | — | deps X12.1, X4.9, X10.7, X11.6 |
| X12.3 Integrations module (flag.enterprise.integrations): outbound webhooks (org_webhook… | Not Started | Sonnet (API+Web) | — | deps X8.13, X2.16, X9.5, X2.9 |
| X12.12 Platform Analytics page (/admin/analytics): cross-tenant aggregates for Kiwiply only… | Not Started | Sonnet (API+Web) | — | deps X6.14, X3.3, X5.7, X1.11 — new (coverage audit, doc 45) |
| X12.11 TOTP and passkeys (WebAuthn) as second factors for every user; org.security.mfa_method… | Not Started | Sonnet (API+Web) | — | deps X2.14, X2.7 — split (Session E) |
| X12.4 SSO per org (flag.enterprise.sso): org_sso_connection (SAML 2.0 or OIDC) with per-org… | Not Started | Sonnet (API+Web) | — | deps X2.3, X2.9, X3.2, X1.5, X2.14 |
| X12.10 SSO JIT membership mapping: org_sso_jit_rule (IdP attribute/group → role template ≤… | Not Started | Sonnet (API+Web) | — | deps X12.4, X1.15 — split (Session E) |
| X12.2 Autopilot prepare for assigned jobs — API side: assigned-items feed for the… | Not Started | Sonnet (API+Web) | — | deps X9.9, X5.16, X8.4, X9.11 |
| X12.9 Extension side of Autopilot for assigned items: queue consumes org items with match_id… | Not Started | Sonnet (Ext) | — | deps X12.2, X9.12 — split (Session E) |
| X12.6 Cloudflare for SaaS evaluation and migration runbook: trigger criteria (custom hosts… | Not Started | Sonnet (Ops) | — | deps X3.6 |

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
- 2026-10-12 — Session E (Fable, `ev2-design-e`) Tasks 2–5: doc 45 coverage audit (4 missing, 9 partial fixed; 8 deliberate deviations); Task 3 corrections (%5Ft dir, X1.13 = 42 §5, ask token, contract price versions, job_opportunity, SSO pointers, 42 §6.2 ACs); ⚑ reviews written into 41 §13 / 42 §9 / 44 §14 with E21–E28 escalations; every story in §30 format, X12.* specified, 27 L stories split, new X6.17/X11.8/X12.8–X12.12; global build order in 06 §7 and this file. 154 stories, 0 dangling ids.
