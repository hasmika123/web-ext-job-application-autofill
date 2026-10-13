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
| X1.1 Enterprise flags + EnterpriseEnabledFilter | Completed | Sonnet (API) | `service/settings/EnterpriseSettingKeys`, `service/ent/EnterpriseFeatureFlag`, `config/EnterpriseEnabledFilter` (+ `OrgWebConfiguration`, per-org wall in `OrgPermissionInterceptor`); tests `EnterpriseFeatureFlagTest` (12), `EnterpriseEnabledFilterTest` (6), `EnterpriseEnabledFilterIT` (4), `OrgPermissionInterceptorTest` (+4), `SettingDefinitionsTest` (+3); commit `ev2-x1.1` | allow list is exclusive and `on:false` is a kill switch (Log) |
| X1.2 Tenancy schema | Completed | Sonnet (API) | `changelog/20261015010000_ent_tenancy.xml`; `domain/ent/{OrgHostname,OrgBranding,OrgSetting,HostNames}`, `repository/ent/*`, `service/ent/{OrgSubdomains,OrgTenancyService}`; tests `EntTenancyMigrationIT` (upgrade from the previous changelog), `EntTenancySchemaIT` (14), `EntRepositoryContractTest` (4), `OrgTenancyServiceIT` (5), `HostNamesTest`, `OrgSubdomainsTest`; commit `ev2-x1.2` | `organization.type` widened to VARCHAR(40) (the one non-additive-in-form change; Log) |
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
| E5 edge Caddy change (on-demand TLS) | 2026-10-12 | public tenant hosts (X3) | develop on `*.localhost` |
| E1–E4, E7–E11, E13–E20 | 2026-10-12 | nothing (defaults applied) | see `08-decisions-for-user.md` |

## Log
- 2026-10-12 — Phase 0 complete on `enterprise-v2` (Fable). Roadmap area `ent` registered, 109 stories, 0 dangling ids.
- 2026-10-12 — X1.1 Completed on `ev2-build-p1` (Sonnet). `flag.enterprise` + six sub-flags + hosts/domains/billing keys in the registry (`EnterpriseSettingKeys`); `EnterpriseFeatureFlag` (`on:false` kills > deny > exclusive allow list > pct > on; fails closed); `EnterpriseEnabledFilter` (404 for `/api/public/tenant`, `/api/ent/**`, `/api/orgs/*/enterprise/**`); per-org wall in `OrgPermissionInterceptor`.
- 2026-10-12 — X1.2 Completed on `ev2-build-p1` (Sonnet). Tables `org_hostname` (generated unique `live_hostname_key` / `primary_org_key`), `org_branding`, `org_setting`; `organization` +subdomain/subdomain_enabled/config_version/display_name; `org_audit_event` +hostname_id/beneficiary_login/risk; `OrgType` +STAFFING/PROFESSIONAL_SERVICES (needed `organization.type` widened 20 -> 40, a deliberate exception to ADR-023's "no column type changes"); reserved subdomain labels added to `OrgSlugs`; `OrgTenancyService.setSubdomain` is the single writer. No backfill was needed. `api/openapi.json` regenerated (OrgType enum).
