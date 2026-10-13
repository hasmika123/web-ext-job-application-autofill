# 07 — Backlog: epics for every phase, fully specified stories for Phase 1

> Status: plan, 2026-10-12. Source of truth for ids and statuses is `docs/roadmap/areas/ent.json`
> (area `ent`, prefix `X`), rendered in `docs/roadmap/master-roadmap.html`. Change a status with
> `node docs/roadmap/build-master-roadmap.mjs --set X1.1=in_progress`. This file is generated from the
> same spec as the JSON; edit the spec, not both. Story format: requirements §30. Status flow:
> Not Started → In Progress → Code Complete → Testing → Completed / Blocked (`progress-tracker.md`).
>
> Supersedes/relates: X stories carry `supersedes` for prior-art org stories they replace; the org/admin
> stories carry `relates` back-links. Nothing was deleted from `org.json`/`admin.json`.

## 1. Epics (one per phase)

| Epic | Phase | Priority | Goal |
|---|---|---|---|
| X0 | Phase 0 | P0 | The design set under docs/enterprise-v2 that every later phase builds from; 23 ADRs; escalations for the user. |
| X1 | Phase 1 | P0 | Hostname → tenant resolution the client can never influence, tenant-bound sessions, roles as data, the invitation framework, and the negative-test gate — before any protected feature. |
| X2 | Phase 2 | P0 | Runtime branding, one branded login, one enterprise shell with permission-driven workspaces, Org Admin lands on the Org Admin Dashboard, basic profile from the avatar menu, the Kiwiply character used compactly. |
| X3 | Phase 3 | P0 | careers.acme.com: registration, ownership verification, on-demand certificates through the shared edge, activation, primary/redirect, suspension, removal, monitoring. |
| X4 | Phase 4 | P0 | Configurable role templates with a ceiling rule, employee lifecycle with bulk actions and audit, departments/teams, auditable consultant–marketer assignments. |
| X5 | Phase 5 | P0 | Catalog (shared with personal plans), feature definitions and dependencies, base license + add-ons, pricing engine with contracts, entitlement evaluation, usage ledger, personal-subscription regression suite. |
| X6 | Phase 6 | P0 | Subscription Overview, Consultant Licenses, Configure License with backend quotes, Billing & Invoices, Feature Usage, Platform Pricing Admin; one Stripe subscription per org; reconciliation. |
| X7 | Phase 7 | P1 | Consultant directory and profile overlay, org-managed resume links with approval and visibility, readiness, per-feature consent. |
| X8 | Phase 8 | P1 | Assigned talent, job discovery and AI matching for a consultant, opportunity assignment and authorization, follow-ups, activities, duplicate guard — the marketer prepares, never submits. |
| X9 | Phase 9 | P1 | Consultant workspace, assigned jobs, application link via submit-detect, interview coordination, AI interview prep (licensed), offers, extension workspace selector. |
| X10 | Phase 10 | P1 | Client accounts, contacts, vendor relationships, requirements, candidate submissions (records), offers, placements, extensions and redeployment, Account Manager workspace. |
| X11 | Phase 11 | P1 | Lifecycle records, compliance checklists and policy acknowledgements without identity documents; finance records over the Timesheets product; reports. |
| X12 | Phase 12 | P2 | Org analytics with k-anonymity, Autopilot prepare for assigned jobs, integrations, SSO, second-instance readiness, Cloudflare-for-SaaS evaluation. |

## 2. Phase 1 — Enterprise tenant foundation (fully specified)

Build order (dependencies first): X1.1 → X1.2 → X1.3 → X1.4 → X1.5 → X1.6 → X1.7 → X1.8 → X1.9 → X1.10 → X1.11 → X1.12.
X1.6/X1.7 (roles, scopes) can run in parallel with X1.3–X1.5 (tenancy) after X1.2; X1.9 closes the phase.

### X1.1 — Enterprise feature flags in the settings registry + EnterpriseEnabledFilter (second 404 wall)
- **Epic:** X1 · **Size/Complexity:** S/S · **Owners:** API · **Deps:** X0.1
- **Persona:** Platform admin
- **Objective:** Turn the whole enterprise surface on per org from admin settings, failing closed.
- **Story:** As a platform admin, I want flag.enterprise and its sub-flags in the typed settings registry so that enterprise routes do not exist until I allow them for an org.

**Functional requirements**
- Keys per 06-phase-plan.md §3 registered in SettingDefinitions (via a new EnterpriseSettingKeys class) with risk levels and reason rules.
- EnterpriseFeatureFlag.isEnabled(orgId?) resolves the FLAG JSON {on,pct,allow,deny}: deny wins, then allow list, then on/pct; fails closed on any exception (OrgFeatureFlag pattern).
- EnterpriseEnabledFilter answers 404 problem+json (same body as OrgsEnabledFilter) for /api/public/tenant, /api/orgs/*/enterprise/**, /api/ent/** when the master flag is off; per-org checks happen in the interceptor once the org is known.

**UI requirements**
- None (admin Settings page lists the keys automatically from the registry).

**Backend requirements**
- service/settings/EnterpriseSettingKeys.java
- service/ent/EnterpriseFeatureFlag.java
- config/EnterpriseEnabledFilter.java registered in WebConfigurer next to OrgsEnabledFilter

**Database changes**
- None (app_setting rows).

**APIs**
- Existing /api/admin/settings lists and edits the keys.

**Permissions**
- ROLE_ADMIN for edits (existing).

**Feature entitlements**
- —

**Acceptance criteria**
- With flag.enterprise off, GET /api/public/tenant and every /api/ent/** path return 404 with code NOT_FOUND and message error.org, before authentication.
- With {"on":true,"allow":[<acmeId>]}, acme resolves; beta (not in allow) behaves as if the flag were off for its routes.
- SettingDefinitionsTest proves no duplicate keys and that every flag.enterprise.* key has risk HIGH or MEDIUM and type JSON.
- Reading settings throws → isEnabled() returns false (fail closed) — unit test with a throwing SettingsService.

**Test cases**
- EnterpriseFeatureFlagTest (allow/deny/pct/fail-closed).
- EnterpriseEnabledFilterIT (404 body shape, path normalisation incl. ;matrix and ..).
- SettingDefinitionsTest extension.

- **Tech notes:** Mirror OrgFeatureFlag/OrgsEnabledFilter exactly; keys in 06-phase-plan.md §3; flag JSON shape from AdminSettingKeys.FLAG_OFF.
- **Definition of Done:** Keys visible in admin settings; CI green; progress-tracker row Code Complete → Testing → Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X1.2 — Tenancy schema: org_hostname, org_branding, org_setting, organization subdomain/config_version, audit columns, OrgType STAFFING/PROFESSIONAL_SERVICES
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X1.1
- **Persona:** The API
- **Objective:** Give tenancy its tables additively so resolution, branding and per-org settings have a home.
- **Story:** As the API, I want the tenancy tables so that a hostname can name exactly one organization and an organization can carry published branding and per-org setting overrides.

**Functional requirements**
- Liquibase 20261015010000_ent_tenancy.xml: createTable org_hostname, org_branding, org_setting; addColumn organization.subdomain (varchar 63, unique), subdomain_enabled (bool default false), config_version (int default 0), display_name (varchar 120); addColumn org_audit_event.hostname_id, beneficiary_login, risk (varchar 10 default LOW).
- Entities + repositories under domain/ent and repository/ent; every repository method takes orgId first except OrgHostnameRepository.findActiveByHostname(hostname) and findBySubdomain(label) (allow-listed in the contract test).
- OrgType gains STAFFING, PROFESSIONAL_SERVICES (additive; COACH stays reserved).
- Reserved subdomain labels extend OrgSlugs.isReserved (list in 04 §2.2); hostnames are lower-cased and punycoded on write; a generated active key enforces one is_primary per org.

**UI requirements**
- —

**Backend requirements**
- domain/ent/OrgHostname, OrgBranding, OrgSetting; repository/ent/*; OrgSlugs reserved list

**Database changes**
- Additive changelog as above; preconditions tableExists false.

**APIs**
- —

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Changelog runs clean on an empty DB and on a DB at the last existing changelog (20261013050000_job_posting_search.xml).
- Two ACTIVE org_hostname rows with the same hostname are refused by the unique index; two is_primary rows for one org are refused by the generated key.
- organization.subdomain accepts [a-z0-9-]{3,63}, rejects reserved labels (www, app, api, admin, edge, …) at the service layer with 422 RESERVED_VALUE.
- TenantRepositoryContractTest (X1.9) passes for repository/ent.

**Test cases**
- Liquibase migration test (existing pattern).
- OrgSlugsTest reserved labels.
- Entity round-trip ITs for unique/generated keys.

- **Tech notes:** Column list: 03-domain-model.md §2.1. Mirror org_core.xml style (${datetimeType}, generated STORED keys via <sql>).
- **Definition of Done:** CI green; 03-domain-model.md updated if a column changed. Plus the common DoD in `06-phase-plan.md` §5.

### X1.3 — TenantResolver + TenantContext in the API, GET /api/public/tenant, internal tenant-hosts/check (ask) endpoint
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X1.2
- **Persona:** Any visitor of a tenant host
- **Objective:** The API decides the tenant from the host alone, never from a client-supplied id, and fails closed.
- **Story:** As the API, I want to resolve X-Kiwiply-Host to exactly one tenant (or none) on every request so that every later check starts from a trustworthy tenant context.

**Functional requirements**
- TenantResolverFilter (OncePerRequestFilter, before the JWT filter) reads X-Kiwiply-Host, normalises, resolves per 04 §2.2, stores TenantContext in a request attribute + ThreadLocal holder (cleared in finally) + MDC tenant/host.
- Resolution cache: Caffeine, key host, TTL 60 s (setting enterprise.tenant.cache_seconds), evicted when organization.config_version changes (bumped by any hostname/branding/status write through OrgTenancyService).
- GET /api/public/tenant (permitAll, rate-limited per host+IP) returns PublicTenantDTO per 04 §2.4 for TENANT; 404 for UNKNOWN; for PLATFORM returns {kind:"PLATFORM"} only.
- GET /api/internal/tenant-hosts/check?domain= (X-Internal-Token, internal network) returns 200 for ACTIVE org_hostname rows of orgs ACTIVE/PAST_DUE and for {label}.kiwiply.com when subdomain_enabled; 404 otherwise; CUSTOM rows only when flag.enterprise.domains allows the org.
- OrgPermissionInterceptor: if context is TENANT, path {orgId} must equal context.orgId else 404; if UNKNOWN, every /api/orgs/**, /api/me/orgs/**, /api/join/** → 404.

**UI requirements**
- —

**Backend requirements**
- config/TenantResolverFilter, service/ent/TenantResolver, service/ent/TenantContext(+Holder), web/rest/PublicTenantResource, web/rest/InternalTenantHostResource, OrgPermissionInterceptor change

**Database changes**
- None.

**APIs**
- GET /api/public/tenant → PublicTenantDTO | 404
- GET /api/internal/tenant-hosts/check?domain= → 200 | 404 | 401

**Permissions**
- public; internal token

**Feature entitlements**
- —

**Acceptance criteria**
- Host acme.kiwiply.com with acme ACTIVE and subdomain_enabled → TENANT(acme); same host with subdomain_enabled=false → UNKNOWN.
- Host careers.acme.com with an ACTIVE row → TENANT; PENDING/VERIFIED/SUSPENDED/REMOVED → UNKNOWN; org SUSPENDED → UNKNOWN.
- kiwiply.com, www., app., api., localhost → PLATFORM; nobody.example → UNKNOWN; missing header → UNKNOWN for tenant routes but PLATFORM-compatible for existing personal routes (no behaviour change for today's clients: the extension sends no header and keeps working).
- A member of beta forging X-Kiwiply-Host: acme.kiwiply.com gets 200 on /api/public/tenant (public branding) and 404 on /api/orgs/{acme}/*.
- config_version bump evicts the cache within one request.
- The ask endpoint answers within 50 ms from cache and never 200s for a non-ACTIVE row (AskEndpointIT).

**Test cases**
- TenantResolverTest (table-driven hosts).
- PublicTenantResourceIT, InternalTenantHostResourceIT (AskEndpointIT).
- OrgPermissionInterceptor ITs extended: tenant mismatch → 404.

- **Tech notes:** Algorithm and DTO: 04-tenancy-and-security.md §2–3. Never read tenant ids from headers. Keep OrgsEnabledFilter first.
- **Definition of Done:** openapi.json regenerated; CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X1.4 — Web host resolution: proxy.ts carries the host, serverApiFetch forwards X-Kiwiply-Host, getTenant(), (tenant) route group skeleton, tenant-404 page
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** Web · **Deps:** X1.3
- **Persona:** A visitor of acme.localhost / careers.acme.com
- **Objective:** The web app renders the tenant or a safe 404, never another tenant or the public site.
- **Story:** As a visitor on a tenant host, I want the site to know it is Acme's portal (or honestly say the workspace isn't available) so that I never land on the wrong company or the public marketing site.

**Functional requirements**
- web/src/proxy.ts: compute host (x-forwarded-host ?? host, lower-case, strip port), set internal request header x-kiwiply-host; unchanged refresh logic.
- web/src/lib/api.ts serverApiFetch forwards X-Kiwiply-Host from the incoming request (headers()); tracker/resume proxies inherit it.
- web/src/lib/tenant.ts: getTenant() cached per request → {kind, tenant?: PublicTenantDTO}; PLATFORM for reserved hosts without calling the API when the master flag is off (public-config orgs/enterprise flags).
- Route group web/src/app/(tenant)/ with layout.tsx: UNKNOWN → render TenantUnavailable (404 status, no branding, no links, no cookies, noindex); TENANT → children; PLATFORM → notFound() for tenant-only paths.
- Reserved hosts keep today's (marketing)/(app)/(admin)/(org) behaviour untouched.
- Dev: next dev accepts acme.localhost:3100; mock-api resolves hosts (X1.12).

**UI requirements**
- TenantUnavailable page: packages/ui EmptyState + mascot warn pose (compact), copy "This workspace isn't available"; no Kiwiply marketing links; 16 px gutters at 390 px.

**Backend requirements**
- —

**Database changes**
- —

**APIs**
- Consumes GET /api/public/tenant

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Request with Host: nobody.localhost renders TenantUnavailable with HTTP 404 and no Set-Cookie.
- Request with Host: acme.localhost (mock ACTIVE) renders the (tenant) layout with Acme's display name in <title>.
- Request with Host: localhost:3100 renders the existing marketing home unchanged (snapshot of status + title).
- X-Kiwiply-Host reaches the mock on every BFF call (mock asserts and the route test checks the header).
- public-config fails closed → UNKNOWN for non-reserved hosts.

**Test cases**
- tenant.test.ts (host normalisation, reserved hosts).
- app/(tenant)/layout.test.tsx (three branches).
- api.test.ts header forwarding.
- Playwright tenant-unknown.spec.ts with extraHTTPHeaders Host.

- **Tech notes:** Next 16 proxy (web/src/proxy.ts), React cache() per request as in branch A org.ts; keep SITE_URL for the platform only.
- **Definition of Done:** npm test + build green; Playwright green over mock. Plus the common DoD in `06-phase-plan.md` §5.

### X1.5 — Tenant-bound sessions: tid/hid claims on tenant-host login, decoder validation, refresh keeps tid, interceptor enforces tid = path org
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X1.3, X1.4
- **Persona:** Acme employee signing in on careers.acme.com
- **Objective:** A session from one tenant is useless on another, even if a token leaks.
- **Story:** As a security architect, I want tokens minted on a tenant host to be bound to that tenant so that replaying them against another tenant or the platform org console fails.

**Functional requirements**
- POST /api/authenticate (+/mfa, /auth/google, /refresh) on a TENANT context adds claims tid=<orgId>, hid=<hostnameId> to both tokens; requires the user to be an ACTIVE, non-reserved member of that org — otherwise 403 NOT_A_MEMBER (the only non-404 here, the login page needs it) with no org data.
- JwtDecoder validator: tid present and context TENANT → tid must equal context.orgId (else 401 TOKEN_TENANT_MISMATCH); tid present and context PLATFORM → token accepted for user-scoped routes only, 404 on /api/orgs/{any}; tid absent and context TENANT → unauthenticated on tenant routes except /api/account (login-first hand-off).
- Refresh rotation preserves tid/hid; /api/logout unchanged; /api/extension/session never adds tid.
- Web login route handlers forward X-Kiwiply-Host (already by X1.4); cookies unchanged (host-only).

**UI requirements**
- Login page on tenant hosts (unbranded placeholder until X2.3): NOT_A_MEMBER renders "You're not a member of this workspace" with no data and a sign-out link.

**Backend requirements**
- AuthenticateController, GoogleAuthController, SecurityJwtConfiguration validator, SecurityUtils (TENANT_CLAIM = "tid"), OrgPermissionInterceptor

**Database changes**
- None.

**APIs**
- Existing auth endpoints; new 403 NOT_A_MEMBER on tenant hosts

**Permissions**
- membership ACTIVE

**Feature entitlements**
- —

**Acceptance criteria**
- Token minted on acme host decodes with tid=acme; used on beta host → 401; used on kiwiply.com /api/orgs/{acme} → 404; used on kiwiply.com /api/account → 200.
- Personal token (no tid) on acme host → GET /api/orgs/{acme}/… 401 (not 404) so the web redirects to the tenant login; GET /api/account → 200.
- Refresh on acme host returns tokens with the same tid; the old family revocation still applies.
- Extension tokens carry no tid before and after.
- Non-member login on acme host → 403 NOT_A_MEMBER, no Set-Cookie, audit row LOGIN_DENIED_NOT_MEMBER in acme's org_audit_event with hostname_id.

**Test cases**
- AuthenticateControllerIT extended (HostMismatchIT cases).
- SecurityJwtConfigurationTest validator table.
- Web auth route tests forward the host.

- **Tech notes:** Claims next to USER_ID_CLAIM in SecurityUtils; keep tokens stateless; 04 §3.
- **Definition of Done:** openapi regenerated; CI green; 04 §3 matches code. Plus the common DoD in `06-phase-plan.md` §5.

### X1.6 — Roles as data: org_role, org_role_permission, org_member_role; system templates seeded from the enum; backfill; OrgAccessService reads the join table; dual-write of org_member.role
- **Epic:** X1 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X1.2
- **Persona:** The API
- **Objective:** Stop building on the fixed enum without breaking anything that uses it.
- **Story:** As the API, I want roles and their permissions stored as data and a member able to hold several roles so that enterprise roles are configurable and multi-role, while the existing enum callers keep working.

**Functional requirements**
- Liquibase 20261015020000_ent_roles.xml: org_role, org_role_permission, org_member_role (03 §2.1) + organization-independent system rows (org_id NULL) for OWNER, ORG_ADMIN, STAFF, MEMBER, CONSULTANT, MARKETING_SPECIALIST, MARKETING_MANAGER, HR_SPECIALIST, FINANCE_SPECIALIST, ACCOUNT_MANAGER, TALENT_ACQUISITION, EXECUTIVE_VIEWER with permission rows per 05 §3; backfill changeset: one org_member_role (is_primary) per live org_member from role (OWNER→OWNER, ADMIN→ORG_ADMIN, STAFF→STAFF, MEMBER→MEMBER, MARKETER→MARKETING_SPECIALIST, FINANCE→FINANCE_SPECIALIST), set org_member.primary_role_id.
- RoleTemplateSeeder (idempotent, runs at startup, doc-sync test against 05 §3 like ShareMatrixTest) keeps system rows equal to code; org clones are untouched.
- OrgMembership gains roles[] and permissions Map<String permissionKey, PermissionScope>; can(OrgPermission) and scopeOf() keep their signatures (mapped); permissionKeys() returns the union.
- OrgAccessService.resolve builds the membership from org_member_role (fallback to the enum column when the member has no role rows — transitional), cached per request.
- OrgRoleService: list templates/org roles, clone(templateKey), update permissions with the ceiling rule (every (key, scope) ⊆ actor's effective set), assign/revoke member roles with is_primary handling and the last-OWNER/ADMIN guard; every write dual-writes org_member.role = primary template's legacy enum (ORG_ADMIN→ADMIN, MARKETING_*→MARKETER, HR/ACCOUNT/TALENT/EXEC→STAFF, CONSULTANT→MEMBER, FINANCE_SPECIALIST→FINANCE).

**UI requirements**
- —

**Backend requirements**
- domain/ent/OrgRole*, repository/ent/*, service/ent/OrgRoleService, RoleTemplateSeeder, EntPermissions registry; OrgMembership/OrgAccessService changes

**Database changes**
- Additive tables + backfill with preconditions.

**APIs**
- GET /api/orgs/{orgId}/roles (MEMBER_VIEW_SUMMARY)
- POST /api/orgs/{orgId}/roles (roles.manage) {templateKey, name}
- PATCH /api/orgs/{orgId}/roles/{roleId} (roles.manage) {name, permissions:[{key, scope}]}
- PUT /api/orgs/{orgId}/members/{memberId}/roles (members.role.set) {roleIds[], primaryRoleId}

**Permissions**
- roles.manage (new), members.role.set (exists)

**Feature entitlements**
- —

**Acceptance criteria**
- After backfill every live member has exactly one is_primary role row and OrgIsolationIT passes unchanged.
- A member with ORG_ADMIN + MARKETING_MANAGER has the union of permissions and TEAM scope for assignments.manage widened to ORG (widest wins).
- Ceiling rule: an ORG_ADMIN cannot add org.close to a cloned role (422 ROLE_CEILING {key}); OWNER system rows are read-only (409 ROLE_SYSTEM).
- Removing the last OWNER/ORG_ADMIN role is refused (409 LAST_ADMIN).
- Every role write produces one org_audit_event (ROLE_CREATE/ROLE_UPDATE/ROLE_ASSIGN/ROLE_REVOKE, risk HIGH for permission changes) and org_member.role mirrors the primary role.
- RoleTemplateDocSyncTest fails if 05 §3 and the seeder disagree.

**Test cases**
- OrgRoleServiceTest (ceiling, last-admin, primary rules).
- OrgRoleResourceIT (+ OrgIsolationIT coverage registry entries).
- RoleTemplateDocSyncTest.
- Backfill IT: seed enum members → run changeset → assert rows.

- **Tech notes:** Keep OrgRole enum as the legacy mirror; map in one class LegacyRoleMirror; 05-permission-model.md §3, §6.
- **Definition of Done:** Behind flag.enterprise.roles for the write endpoints; reads always on; CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X1.7 — Scope model: PermissionScope {OWN, ASSIGNED, TEAM, DEPARTMENT, ORG}, ScopeEvaluator, legacy OrgScope mapping, EntPermissions registry + AuthorizationService skeleton with the 11-step order
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X1.6
- **Persona:** The API
- **Objective:** One authorization function with a fixed order that every later phase calls.
- **Story:** As the API, I want AuthorizationService.authorize(AuthzRequest) with the evaluation order from 05 §2 so that permissions, scopes, assignments and (later) entitlements are checked in one place.

**Functional requirements**
- PermissionScope enum (ordered) + mapping from legacy OrgScope (05 §4) used by the seeder and OrgMembership.
- ScopeEvaluator.inScope(actorMembership, scope, targetMemberId) implementing OWN/ASSIGNED (reads org_assignment — table created here as an empty shell with the final columns, populated in X4.7)/TEAM/DEPARTMENT/ORG using org_member.team_group_id/department_group_id and org_group.lead_member_id.
- AuthorizationService.authorize(AuthzRequest) performs steps 1–5 and 9 (tenant, membership, org status via OrgStateRules, permission, scope, assignment) and leaves hooks (step interfaces) for 6–8, 10–11 to be filled by X5.6/X7.6; returns AuthzDecision with reasonCode; one ReasonToHttp mapper.
- OrgPermissionInterceptor builds AuthzRequest from @OrgPermissionRequired (new attributes beneficiary = NONE|PATH_MEMBER|SELF, scopeTarget) and calls authorize; stores the decision.
- EntPermissions registry class (constants + family, description, defaultScope, dangerous) and a doc-sync test against 05 §3.

**UI requirements**
- —

**Backend requirements**
- service/ent/PermissionScope, ScopeEvaluator, AuthorizationService, AuthzRequest/Decision, OrgStateRules, EntPermissions; interceptor change

**Database changes**
- org_assignment table (empty shell, 03 §2.3).

**APIs**
- —

**Permissions**
- all

**Feature entitlements**
- —

**Acceptance criteria**
- Table-driven unit test covers every (scope × relationship) cell for inScope.
- A MARKETING_SPECIALIST with ASSIGNED scope reading a consultant with no open assignment → 404 NOT_ASSIGNED; with an open PRIMARY → allowed; with ended assignment → 404.
- ORG_INACTIVE: a SUSPENDED org refuses writes with 404 on org routes and 409 ORG_STATE on explicit state actions; PAST_DUE allows reads.
- Existing OrgIsolationIT and OrgHandlerGuardIT pass unchanged (behavioural equivalence for existing roles).

**Test cases**
- ScopeEvaluatorTest.
- AuthorizationServiceTest (order + first-failure).
- EntPermissionsDocSyncTest.
- Interceptor ITs.

- **Tech notes:** 05-permission-model.md §2, §4, §6; keep 404 semantics.
- **Definition of Done:** CI green; 05 §2 table matches reason codes in code. Plus the common DoD in `06-phase-plan.md` §5.

### X1.8 — Invitation framework: adopt branch B (a6a9a62) invites + join API, re-verify, add multi-role/department/team, email-match setting, tenant-aware links
- **Epic:** X1 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X1.6, X1.3 · **Supersedes:** O2.2
- **Persona:** Org Admin / HR inviting an employee
- **Objective:** Invite people with the right roles and placement, from the tenant's own host, safely.
- **Story:** As an org admin, I want to invite employees with roles, department and team so that they land in the right workspace on first sign-in, and I want invites to bind only to the invited email.

**Functional requirements**
- Cherry-pick a6a9a62 onto enterprise-v2 (changeset 20261014010000_org_invites.xml, InviteTokens, OrgInviteService, OrgMemberResource invite/resend, JoinResource previews/accepts, JoinRateLimiter, settings org.invite.*/org.join.*, orgInviteEmail.html, tests); resolve conflicts; run the full API suite.
- Extend OrgInviteRequest with roleIds[] (default: CONSULTANT for consultancies, MEMBER otherwise), departmentGroupId, teamGroupId, managerMemberId; the ceiling rule applies to roleIds; accepting creates org_member_role rows and group columns.
- Setting org.invite.require_email_match (BOOL, default true, org-overridable via org_setting): when true, accept requires the signed-in account's email to equal invite_email (case-insensitive) else 409 INVITE_EMAIL_MISMATCH {invitedEmailMasked}.
- TenantUrls.joinLink(org, token): the email link uses the org's primary ACTIVE hostname when one exists (https://{host}/join/t/{token}), else https://kiwiply.com/join/t/{token}; mail template takes tenant branding name/logo (placeholder until X2.5).
- Join accept on a TENANT host requires the invite's org to equal the tenant (else 404); on PLATFORM any org (today's behaviour).

**UI requirements**
- —

**Backend requirements**
- service/org/OrgInviteService, OrgJoinService (extended), service/ent/TenantUrls, MailService template param

**Database changes**
- Branch B changeset (additive) + no new tables.

**APIs**
- POST /api/orgs/{orgId}/members/invite (members.invite) — body gains roleIds[], departmentGroupId, teamGroupId, managerMemberId
- POST /api/orgs/{orgId}/members/{memberId}/resend
- GET /api/join/{token}, GET /api/join/code/{code}, POST /api/join/{token}/accept, POST /api/join/code/{code} (branch B)

**Permissions**
- members.invite; roleIds within ceiling

**Feature entitlements**
- —

**Acceptance criteria**
- Full API suite green after the cherry-pick (JoinResourceIT, OrgInviteServiceTest, OrgInviteEmailIT, OrgIsolationIT, OrgHandlerGuardIT).
- Invite with roleIds [MARKETING_SPECIALIST] by an HR_SPECIALIST (who lacks marketing permissions) → 422 ROLE_CEILING.
- Accept with a different email when require_email_match=true → 409 INVITE_EMAIL_MISMATCH and the seat stays INVITED; with the setting false → accepted (audited with flag).
- Email link uses careers.acme.com when acme has an ACTIVE primary hostname, otherwise kiwiply.com (unit test on TenantUrls).
- Accepting an acme invite while on beta.localhost → 404.

**Test cases**
- Branch B suites + OrgInviteServiceTest extensions + TenantUrlsTest + JoinResourceIT tenant cases.

- **Tech notes:** git cherry-pick a6a9a62; keep 01 §5 security note; settings via EnterpriseSettingKeys/org_setting.
- **Definition of Done:** openapi regenerated; CI green; 01 §5 row for a6a9a62 marked adopted. Plus the common DoD in `06-phase-plan.md` §5.

### X1.9 — Isolation test gate: HostUnknownIT, HostMismatchIT, ForgedHostHeaderIT, SuspendedHostnameIT, AskEndpointIT, TenantRepositoryContractTest, CrossTenantSweepIT, Playwright tenant-isolation.spec.ts
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** API, Web, QA · **Deps:** X1.3, X1.4, X1.5, X1.12
- **Persona:** QA architect
- **Objective:** Scenario F is a CI gate before any protected feature ships.
- **Story:** As QA, I want the negative cross-tenant tests from 04 §5 in CI so that no later story can regress tenant isolation unnoticed.

**Functional requirements**
- New IT classes under api/src/test/java/com/dossier/api/web/rest/ent/ per 04 §5 items 1–7, using OrgFixtures extended with two tenants (acme, beta) and hostnames.
- OrgIsolationIT coverage registry includes every new route (fails otherwise, existing pattern).
- TenantRepositoryContractTest: reflection over repository.org and repository.ent; allow-list file for the few host/subdomain lookups.
- Playwright web/e2e/journeys/tenant-isolation.spec.ts over the mock with Host emulation: different branding per host, non-member sees not-a-member, unknown host 404, /admin on a tenant host 404.

**UI requirements**
- —

**Backend requirements**
- tests only

**Database changes**
- —

**APIs**
- —

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- All classes exist, run in the CI api-tests job and pass.
- Deliberately removing the tid check (mutation) fails HostMismatchIT; deliberately adding a findById to an ent repository fails the contract test (documented in the test javadoc).
- ci.yml needs no change (tests discovered by pattern).

**Test cases**
- Themselves.

- **Tech notes:** 04-tenancy-and-security.md §5; OrgIsolationIT patterns; Playwright extraHTTPHeaders.
- **Definition of Done:** CI green; 04 §5 lists the class names as built. Plus the common DoD in `06-phase-plan.md` §5.

### X1.10 — Tenant context in logs, audit and async work: MDC tenant/host/member, TenantScoped helper, OrgAuditService hostname/beneficiary/risk
- **Epic:** X1 · **Size/Complexity:** S/S · **Owners:** API · **Deps:** X1.3
- **Persona:** Operator / org admin reading the audit log
- **Objective:** Every log line and audit row says which tenant it belongs to; background work never inherits a tenant by accident.
- **Story:** As an operator, I want tenant ids in logs and audit rows and an explicit way to run background work for one org so that incidents are attributable and jobs cannot leak context across tenants.

**Functional requirements**
- TenantResolverFilter puts tenant, host into MDC; OrgPermissionInterceptor adds member; cleared after the request.
- TenantScoped.run(orgId, Runnable/Callable) sets the holder + MDC for the scope and clears in finally; @Async methods receive orgId explicitly (lint: a ArchUnit/TechnicalStructureTest rule forbids TenantContextHolder reads inside service.*Scheduler/*Job classes).
- OrgAuditService.record(...) overloads accept hostnameId, beneficiaryLogin, risk; existing calls default to LOW/none.
- ErrorDigest lines include tenant.

**UI requirements**
- —

**Backend requirements**
- TenantResolverFilter, TenantScoped, OrgAuditService, TechnicalStructureTest rule

**Database changes**
- Columns from X1.2.

**APIs**
- —

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- A request on acme host logs tenant=<acmeId> host=acme.localhost member=<id> on every line emitted by the request (log capture test).
- A scheduler iterating orgs logs each org id and never a stale one (unit test with two orgs).
- TechnicalStructureTest fails if a *Scheduler class references TenantContextHolder.

**Test cases**
- LogCaptureIT.
- TenantScopedTest.
- TechnicalStructureTest rule.

- **Tech notes:** logback MDC via CRLFLogConverter-safe keys; AsyncConfiguration unchanged.
- **Definition of Done:** CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X1.11 — Platform admin: Organizations & hostnames — list, tenant detail, provision subdomain, enterprise allow-list toggle, reason-sheet audited
- **Epic:** X1 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X1.3, X1.1 · **Supersedes:** O14.4 · **Relates:** A14.1, A14.3
- **Persona:** Kiwiply platform admin
- **Objective:** Provision a tenant and watch it, with the admin page kit.
- **Story:** As a platform admin, I want an Organizations page with hostnames and an enterprise switch per org so that I can provision Acme's subdomain and turn enterprise on for it without touching the database.

**Functional requirements**
- API: GET /api/admin/orgs (search, status, type, enterprise filters; AdminTable paging headers), GET /api/admin/orgs/{id} (org, members count, hostnames, flags, audit tail — no member PII beyond counts), POST /api/admin/orgs/{id}/hostnames/subdomain {label} (creates SUBDOMAIN row ACTIVE + subdomain_enabled, bumps config_version; reserved/duplicate → 422/409), POST /api/admin/orgs/{id}/enterprise {on, reason} (edits the allow list of flag.enterprise through SettingsService with reason), POST /api/admin/orgs/{id}/hostnames/{hid}/suspend|resume {reason}. All ROLE_ADMIN, every mutation an AdminAuditEvent and an OrgAuditEvent (ADMIN_* actions, risk HIGH) in the tenant's log.
- Web: /admin/organizations (list, filters, table→cards) and /admin/organizations/[id] (detail, hostnames panel, enterprise switch with ReasonSheet, provision subdomain dialog with live reserved/taken check) using admin-v3/common kit and admin-client.ts; BFF routes under web/src/app/api/admin/orgs/**.

**UI requirements**
- AdminHero → AdminStatTiles (orgs, enterprise-on, hostnames active, pending) → AdminFilterBar + AdminTable; detail uses AdminPanel, HistoryDrawer for the org audit tail; sample-lint applies (no sample data).

**Backend requirements**
- web/rest/AdminOrgResource, service/ent/OrgTenancyService (provision/suspend/resume + config_version), DTOs

**Database changes**
- None beyond X1.2.

**APIs**
- GET /api/admin/orgs
- GET /api/admin/orgs/{id}
- POST /api/admin/orgs/{id}/hostnames/subdomain
- POST /api/admin/orgs/{id}/enterprise
- POST /api/admin/orgs/{id}/hostnames/{hid}/suspend
- POST /api/admin/orgs/{id}/hostnames/{hid}/resume

**Permissions**
- ROLE_ADMIN (+ admin MFA session as today)

**Feature entitlements**
- —

**Acceptance criteria**
- Provisioning acme → acme.localhost resolves within one request (cache evicted); provisioning "api" → 422 RESERVED_VALUE; provisioning a taken label → 409 SLUG_TAKEN with suggestion.
- Enterprise switch on → flag.enterprise allow list contains the org id; AppSettingHistory has the reason; off removes it.
- Suspending a hostname makes the host UNKNOWN immediately; resume restores.
- Every mutation writes one AdminAuditEvent and one OrgAuditEvent in the tenant's log with actor_login = the admin and risk HIGH.
- Playwright admin-organizations.spec.ts: list → open → provision → switch (ReasonSheet) at 390 px and desktop.

**Test cases**
- AdminOrgResourceIT.
- OrgTenancyServiceTest.
- Web route tests + component tests + Playwright.

- **Tech notes:** Admin page kit (5e12f6a) and admin-client/admin-proxy; tenancy service also serves X3 later.
- **Definition of Done:** openapi regenerated; CI green; A14.1 marked related. Plus the common DoD in `06-phase-plan.md` §5.

### X1.12 — Mock API tenants + fixtures: acme (CONSULTANCY) and beta, host emulation, dev host mapping, DemoOrgSeeder enterprise variant
- **Epic:** X1 · **Size/Complexity:** S/S · **Owners:** Web, API · **Deps:** X1.3
- **Persona:** Developer / Playwright
- **Objective:** Two tenants to test against locally and in CI without Docker.
- **Story:** As a developer, I want the mock API and the demo seeder to know two enterprise tenants so that every tenant story can be exercised at acme.localhost and beta.localhost.

**Functional requirements**
- web/scripts/mock-api.mjs: GET /api/public/tenant by X-Kiwiply-Host (acme.localhost → Acme branding; beta.localhost → Beta; others 404); accounts acme-admin, acme-marketer, acme-consultant (Anika), acme-hr, acme-finance, beta-admin with memberships/roles; fixtures web/scripts/fixtures/enterprise.mjs; MOCK_ENTERPRISE_ENABLED env.
- Playwright: helper withHost(page, host) setting extraHTTPHeaders Host/X-Forwarded-Host; auth.setup adds the new accounts (storage state per account).
- API DemoOrgSeeder: optional enterprise demo orgs behind dossier.demo.enterprise=true (dev/CI only, E16): acme CONSULTANCY with subdomain acme, beta COMPANY with subdomain beta, roles per 05 §3, one assignment Sarah→Anika.
- Dev docs: how next dev serves acme.localhost:3100 (no hosts-file change needed; *.localhost resolves to loopback in Chromium).

**UI requirements**
- —

**Backend requirements**
- DemoOrgSeeder extension

**Database changes**
- None.

**APIs**
- mock only

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Playwright can sign in as acme-admin on acme.localhost and sees Acme's display name; the same storage state on beta.localhost gets not-a-member.
- DemoOrgSeederIT seeds both orgs idempotently and only when the property is on.
- The mock refuses to start in production (existing guard).

**Test cases**
- mock self-test in web/scripts (existing pattern), DemoOrgSeederIT, auth.setup run.

- **Tech notes:** Mirror demo-org.json shape; keep Playwright accounts in e2e/fixtures/accounts.ts.
- **Definition of Done:** CI green; HANDOFF lists the accounts. Plus the common DoD in `06-phase-plan.md` §5.

## 3. Phases 2–12 — epic-level entries with story titles

Each title becomes a fully specified story in the owning follow-up session (README: B owns X2/X3,
C owns X5/X6, D owns X7–X11, E owns the API/test/deploy specs and reviews every story). Sizes are
first estimates.

### X2 — Phase 2 — Branded login and dashboard shell
_Runtime branding, one branded login, one enterprise shell with permission-driven workspaces, Org Admin lands on the Org Admin Dashboard, basic profile from the avatar menu, the Kiwiply character used compactly._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X2.1 | Consolidate the two parked web helper sets (org-types/org-api vs org-client/org-join/org-proxy, mock-orgs vs mock-org) into web/src/lib/ent/* | M | O1.6 |
| X2.2 | EnterpriseShell: tenant theme tokens, permission-driven nav from workspace definitions, switcher only when >1 workspace, avatar menu with basic profile | L | O1.7 |
| X2.3 | BrandedLogin component: runtime branding from GET /api/public/tenant, password + verification, NOT_A_MEMBER state, "Powered by Kiwiply" mark, mascot welcome pose | M | — |
| X2.4 | Org Admin Dashboard on real data: tiles (consultants, licensed, available, activity, applications, interviews, placements, pending approvals), subscription summary, alerts, quick actions, activation checklist (reworked from 18f2123) | L | O2.7, O7.4 |
| X2.5 | Organization Branding page: logo/favicon/banner upload (S3 org/{id}/…), colours with contrast validation, welcome copy, terminology and nav prefs (allow-listed), draft → publish, config_version bump | L | O13.1 |
| X2.6 | Login-first routing on tenant hosts: unauthenticated → BrandedLogin, authenticated member → primary workspace home, join pages branded (from 2672733, re-verified) | M | O2.3 |
| X2.7 | Basic user profile surface (avatar menu): photo, name, work email, phone, title, timezone, language, notification prefs, security, memberships and roles (read-only) | M | — |
| X2.8 | MascotPose wrapper in packages/ui with the enterprise pose map; empty states and celebrations use it compactly | S | — |
| X2.9 | Organization Settings page (separate from the basic profile): name/display name, contact, addresses, timezone, policies (org_setting overrides), subdomain display | M | — |
| X2.10 | Tenant-aware URL building (TenantUrls) for mail, notifications and redirects; notification kinds for org events | S | — |
| X2.11 | E2E-A (to dashboard) and E2E-B (multi-role switcher) Playwright journeys over the mock at 390 px and desktop | M | — |

### X3 — Phase 3 — Custom domains
_careers.acme.com: registration, ownership verification, on-demand certificates through the shared edge, activation, primary/redirect, suspension, removal, monitoring._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X3.1 | Domains page + API: add custom hostname (PENDING), DNS instructions (TXT ownership token + CNAME to edge.kiwiply.com), verify now, status timeline | M | O2.6 |
| X3.2 | Ownership verification job: TXT + CNAME checks, VERIFYING → VERIFIED, re-check every enterprise.domains.recheck_hours, grace then SUSPENDED, audit | M | — |
| X3.3 | Activation and certificates: VERIFIED → ACTIVE enables the ask endpoint for the host; cert_state from ask hits; troubleshooting panel (last check, reason, LE rate-limit hints) | M | — |
| X3.4 | Primary domain and redirects: one primary per org; non-primary ACTIVE hosts 301 to primary (configurable); subdomain stays reachable or redirects per org setting | S | — |
| X3.5 | Suspension and removal lifecycle with typed confirmation; sessions on a removed host invalidated (tid/hid check); audit | S | — |
| X3.6 | Edge snippet and runbook (on_demand_tls ask + catch-all block + DNS records) for the user to apply; staging rehearsal on a *.localhost Caddy; monitoring alert when ask 404 rate spikes | M | — |
| X3.7 | Google sign-in per tenant host (opt-in after origin registration) and security headers on tenant hosts (CSP, frame-deny, noindex) | M | — |
| X3.8 | E2E-A custom-domain segment and SuspendedHostnameIT/AskEndpointIT hardening; Playwright domains journey | M | — |

### X4 — Phase 4 — Roles, employees, departments, teams, assignments
_Configurable role templates with a ceiling rule, employee lifecycle with bulk actions and audit, departments/teams, auditable consultant–marketer assignments._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X4.1 | Roles & Permissions page: templates, clone, edit permission/scope grid with ceiling rule, diff and history | L | — |
| X4.2 | Workspace definitions as data (workspace_key → nav → needs) with per-org nav preferences; primary role → landing | M | — |
| X4.3 | Employees page on real data: list/filters/search, roles, department, team, manager, status, bulk actions (assign roles, move team, suspend) | L | O5.1 |
| X4.4 | Employee lifecycle: activate, suspend, deactivate, reinstate, offboard (records kept), transfer ownership, last-admin guards, audit history | M | O5.2 |
| X4.5 | Departments and teams: parent/child groups, leads, move members, counts | M | O5.3 |
| X4.6 | Employee detail sheet: seat, roles, groups, manager, consent scope summary, audit of org actions on them | M | O5.8 |
| X4.7 | Consultant–marketer assignments: org_assignment CRUD (primary/backup/manager/delegate), effective dates, history, reassignment with consent re-point prompt | L | O10.1 |
| X4.8 | Workload balancing view for Marketing Managers: open assignments per marketer, caps from entitlement, drag/reassign with undo | M | — |
| X4.9 | Org audit log viewer (filters, risk, CSV export audited) for OWNER/ORG_ADMIN/FINANCE | M | O13.4 |
| X4.10 | org_member_role becomes authoritative; legacy enum fallback removed from OrgAccessService; flag.enterprise.roles on by default for enterprise orgs | S | — |

### X5 — Phase 5 — Subscription foundation (fully specified, Session C)
_Catalog (shared with personal plans), feature definitions and dependencies, base license + add-ons, pricing engine with contracts, entitlement evaluation, usage ledger, org modules, bulk operations, personal-subscription regression suite. Design: docs 20–25, 27, 29._

Build order (dependencies first): X5.1 → X5.2 → X5.3 → X5.5 → X5.4 → X5.7 → X5.6 → X5.11 → X5.8 → X5.12 → X5.9 → X5.10.

### X5.1 — Catalog tables (product, product_price, product_entitlement, bundle_item, catalog_publish) with effective dates, catalog_version and the new kinds; admin Catalog page read/write for platform admins
- **Epic:** X5 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X1.1, X1.11 · **Relates:** A3.1, A3.5, A3.7
- **Persona:** Platform admin
- **Objective:** One catalog for personal plans and enterprise licenses, with immutable effective-dated prices and a monotonic version, editable from admin.
- **Story:** As a platform admin, I want products and prices to live in the database with effective dates and versions so that enterprise licenses and personal plans share one priced catalog that never changes under a contract.

**Functional requirements**
- Create the Phase 18 tables (product, product_price, product_entitlement, bundle_item, entitlement_grant, promo_code, catalog_change) per docs/design/admin/catalog-margin-entitlements.md §2 with the enterprise additions from 21 §2: product.kind gains BASE_LICENSE|FEATURE|ORG_MODULE, product.feature_key, quantity_basis, role_key; product_price uses amount_minor BIGINT, effective_from, effective_until, catalog_version; catalog_publish table.
- Prices are immutable: publish = new row + catalog_publish row in one transaction; retire sets active=false, retired_at, effective_until; ORG + QUARTER refused (E17); one active row per (product, audience, interval, currency).
- Publishing creates the Stripe Price through StripeGateway with idempotency key price-{id}; with Stripe off, publish is refused 503 BILLING_DISABLED except in LOCAL mode (dossier.catalog.local-publish=true for dev/CI) where stripe_price_id = "local_{id}".
- Seed: FREE/PRO/AUTOPILOT personal products from today's config (A3.5 behaviour), ORG_SETUP_FEE, ORG_BASE_LICENSE, one FEATURE product per 21 §3 key, MOD_TALENT_MARKETING — all enterprise rows WITHOUT prices (E3 answered: nothing is sellable until admin publishes).
- Admin Catalog page (admin page kit, A3.4 layout) lists products/prices/versions; price editor with the live margin guard (Phase 18 §10) for SUBSCRIPTION/SERVICE/FEE kinds; ORG kinds get their formulas in X5.3.

**UI requirements**
- web/src/app/(admin)/admin/pricing/page.tsx with AdminHero + AdminTabs (Catalog, Publish, Change history); AdminTable rows with margin column; ReasonSheet on publish/retire; ConfirmTypedSheet typing the version number on publish.
- 390: tabs scroll, tables become card lists (useNarrow).

**Backend requirements**
- service/catalog/CatalogService (products, prices, publish, retire, versions)
- service/catalog/CatalogVersioning (catalog_publish, effective windows)
- web/rest/admin/AdminCatalogResource
- repository/* for the new tables
- config/CatalogProperties (local-publish)

**Database changes**
- Liquibase 202611010100_ent_catalog.xml: product, product_price, product_entitlement, bundle_item, entitlement_grant, promo_code, catalog_change, catalog_publish; seeds with preconditions; indexes per 03 §6.

**APIs**
- GET /api/admin/catalog
- POST /api/admin/catalog/products
- PUT /api/admin/catalog/products/{id}
- POST /api/admin/catalog/prices
- POST /api/admin/catalog/prices/{id}/publish
- POST /api/admin/catalog/prices/{id}/retire
- GET /api/admin/catalog/versions, GET /versions/{n}
- GET /api/catalog/public (personal, unchanged shape)

**Permissions**
- ROLE_ADMIN; publish/retire/override are HIGH (reason sheet + re-auth).

**Feature entitlements**
- —

**Acceptance criteria**
- Publishing a price inserts catalog_publish N+1 and stamps the row; the previous active row for the same key is retired with effective_until = new effective_from; both rows readable by id.
- A retired price remains referenced and readable; GET /api/catalog/public never returns drafts or retired rows.
- Two concurrent publishes of the same (product, audience, interval, currency) → the second gets 409.
- ORG audience + QUARTER → 422 INTERVAL_NOT_ALLOWED.
- Enterprise seed rows exist with zero price rows; GET /api/orgs/{id}/licenses/catalog (X5.4) shows them as sellable=false.
- Stripe off + local-publish off → 503 BILLING_DISABLED; LOCAL mode publishes with local_{id}.

**Test cases**
- CatalogVersioningTest
- CatalogResourceIT (reason sheet, 409, 422, drafts hidden)
- CatalogSeedTest (isPro behaviour for fixture users identical before/after seed — A3.5 migration test)
- PublicCatalogIT (unchanged)
- web: pricing page render + guard debounce test

- **Tech notes:** Do not fork the Phase 18 design; X5.1 supersedes A3.1 (A3.5/A3.7 remain admin stories that reuse these tables). amount_minor not amount_cents. Keep StripeGateway the only com.stripe importer.
- **Definition of Done:** Catalog page lists seeded products with no enterprise prices; CI green; progress-tracker row updated. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.2 — feature_definition, feature_definition_limit, feature_dependency, license_preset, volume_tier tables + admin editors; initial feature keys, dependencies and presets seeded inactive with no prices
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X5.1 · **Relates:** O3.1 · **Supersedes:** O3.1
- **Persona:** Platform admin
- **Objective:** Feature definitions separate from prices, with typed dependencies, allowances, AI budgets, eligibility and presets, all admin-editable.
- **Story:** As a platform admin, I want to define features, their allowances, dependencies and presets separately from prices so that org admins can mix features per consultant and never get a paid feature added silently.

**Functional requirements**
- Tables per 21 §2.4–2.7; FeatureKeys constants class mirrors the seeded keys (21 §3) and a doc-sync test keeps them equal.
- Dependency editor refuses cycles (DFS) and validates kinds TECHNICAL|COMMERCIAL|INTEGRATION|CONSENT; non-purchasable keys (integration.*, consent.*) exist as MODULE-category definitions without products.
- Preset editor: ordered feature keys, mirrors_product_code, active; applying a preset is a UI shortcut (X5.4 expands it).
- Volume tiers: non-overlapping ranges per product scope; ships empty (ADR-015).
- Seed: 12 feature definitions (21 §3 table with allowances, units, ai_budget_cents, pool_mode PER_CONSULTANT, periods), feature_definition_limit for automation.approved_apply (operations.per_day=30), dependency rows of 21 §3.4, five presets of 21 §3.5 — all active=false.

**UI requirements**
- Pricing admin tabs Features, Presets, Volume tiers (admin kit); dependency kind selector with inline explanation of each kind; cycle error inline; preset editor shows the live sum of current effective prices and the mirror check result (X5.3).

**Backend requirements**
- service/catalog/FeatureCatalogService (definitions, limits, dependencies with cycle check, presets, tiers)
- domain/FeatureDefinition, FeatureDefinitionLimit, FeatureDependency, LicensePreset, VolumeTier
- service/catalog/FeatureKeys
- web/rest/admin/AdminFeatureCatalogResource

**Database changes**
- Same changelog file as X5.1 (second changeset): feature_definition, feature_definition_limit, feature_dependency, license_preset, volume_tier; seeds inactive.

**APIs**
- GET/POST /api/admin/catalog/features, PUT /{key}
- PUT /api/admin/catalog/features/{key}/dependencies
- PUT /api/admin/catalog/features/{key}/limits
- GET/POST/PUT /api/admin/catalog/presets
- GET/POST/PUT /api/admin/catalog/volume-tiers

**Permissions**
- ROLE_ADMIN; dependency/preset/tier writes are MEDIUM (reason), allowance decreases HIGH.

**Feature entitlements**
- —

**Acceptance criteria**
- Saving a dependency that creates a cycle → 422 DEPENDENCY_CYCLE with the path.
- A NULL default_allowance is refused unless usage_unit = none.
- Seeded keys equal FeatureKeys constants (doc-sync test) and all are inactive.
- Overlapping volume tiers for the same scope → 422 TIER_OVERLAP.
- Allowance change creates a catalog_change row and does not alter usage_event.allowance_snapshot of existing rows.

**Test cases**
- FeatureDependencyTest (cycle, anyOf rule marker)
- FeatureCatalogServiceTest
- FeatureKeysSyncTest
- VolumeTierTest
- AdminFeatureCatalogResourceIT
- web: features tab + preset editor tests

- **Tech notes:** Category MODULE definitions are what org_module_license (X5.11) and INTEGRATION/CONSENT deps point at. Keep eligibility_json schema-validated (orgTypes, requiresBaseCodes, minOrgAgeDays).
- **Definition of Done:** Editors work in admin; seeds present and inactive. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.3 — MarginCalculator for BASE_LICENSE/FEATURE/ORG_MODULE (fee_base/fee_feature, invoicing bp), preset checks ("above individual" hard when mirrored, whole-preset margin, deepest-tier worst case); publish refused below floor without typed reason
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X5.2 · **Relates:** O3.6 · **Supersedes:** O3.6
- **Persona:** Platform admin
- **Objective:** The ≥ 80 % worst-case margin floor holds for every enterprise price, preset and tier, with the exact formulas of 21 §5.
- **Story:** As a platform admin, I want the guard to tell me the worst-case margin of every base, feature, module, preset and tier before I publish so that no enterprise price can undercut the locked floor silently.

**Functional requirements**
- Extend MarginCalculator (pure) with kinds BASE_LICENSE (fee_base), FEATURE/ORG_MODULE (fee_feature, ai_budget_cents × quantity), FEE (informational); basis-point maths via Minor.mulDivHalfEven; settings catalog.stripe.invoicing_bp (40), catalog.org_above_individual_pct (25), catalog.org_min_invoice_lines (1) registered in AdminSettingKeys.
- Preset checks on preset save and on every publish touching a preset feature: above-individual (hard when mirrors_product_code set, warning otherwise), whole-preset margin with fee_base, deepest active tier worst case; 422 PRESET_BELOW_INDIVIDUAL / MARGIN_BELOW_FLOOR / TIER_BELOW_FLOOR.
- Tier save re-evaluates every active ORG price at the tier; contract overrides (X5.5) reuse the same calculator.
- Live calculator endpoint for the forms; worst-case table of 21 §6 pinned by a test.

**UI requirements**
- Price editor shows the margin bar with floor tick for ORG kinds; preset editor shows sum, required minimum and pass/fail; publish diff table lists each affected preset/tier result.

**Backend requirements**
- service/catalog/MarginCalculator (extend)
- service/catalog/PresetGuard
- service/settings/AdminSettingKeys (+3 keys)

**Database changes**
- None (settings rows).

**APIs**
- GET /api/admin/catalog/margin?kind=&amountMinor=&aiBudgetCents=&quantity=
- POST /api/admin/catalog/presets/{key}/check

**Permissions**
- ROLE_ADMIN; override reason ≥ 20 chars → HIGH audit CATALOG_MARGIN_OVERRIDE.

**Feature entitlements**
- —

**Acceptance criteria**
- Table 21 §6 reproduced exactly (margins in basis points) by MarginCalculatorTest; 7999 bp fails, 8000 bp passes.
- FEAT_INTERVIEW_AI_PREP at 999 with ai 150 passes (81.7 %); at 949 fails and needs a reason.
- Preset RESUME_AI_SUPPORT mirrored to PRO with sum 2896 passes against Pro 1999 × 1.25 = 2499; sum 2400 → 422 PRESET_BELOW_INDIVIDUAL.
- A 2000 bp tier that pushes FEAT_AI_RESUME_TAILORING under the floor → 422 TIER_BELOW_FLOOR.

**Test cases**
- MarginCalculatorTest (table-driven)
- PresetGuardTest
- AdminSettingKeys duplicate-key test extension
- CatalogResourceIT override path

- **Tech notes:** No floating point: percentages are basis points; margins returned as bp integers and formatted in the web.
- **Definition of Done:** Guard visible in all three editors; override audited. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.5 — PricingEngine (list → contract → one discount → volume tier → effective, half-even per unit), org_contract/org_contract_price/contract_event/org_discount tables, ContractService, QuoteService with inputs_hash and 15-min expiry, golden and property tests
- **Epic:** X5 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X5.3 · **Relates:** E2E-A5.1
- **Persona:** Platform admin / Org admin
- **Objective:** One pure pricing function with exact precedence and rounding, contracts and discounts as data, and authoritative quotes that cannot go stale.
- **Story:** As an org admin, I want every price I see to be computed by the backend from the catalog, my contract and any discount in a fixed order so that the number on the quote is the number on the invoice.

**Functional requirements**
- Minor.mulDivHalfEven and the per-unit precedence of 22 §3 (contract REPLACES/REDUCES; promo only if no non-stackable contract; tier only if volume_applies or uncontracted org; clamp ≥ 0).
- Totals per 22 §4; proration per 22 §6 (Kiwiply authority; confirm ≤ quote); inputs_hash per 22 §7; LicenseQuoteDTO with every field of 22 §8; license_quote persistence (20 §2.3) with status OPEN/APPLIED/EXPIRED/SUPERSEDED and QuotePurgeJob.
- Contracts and discounts per 23 (one ACTIVE per org, versions, two-person rule, floor + reason, ContractLifecycleJob, org_discount best-of selection with tie-break).
- Golden tables G1–G14 and property tests 1–7 of 22 §9–10 as code.

**UI requirements**
- None (platform admin contract pages are X6.9).

**Backend requirements**
- service/ent/pricing/Minor, PricingEngine, PricingInputs, PricingInputsLoader, QuoteHasher
- service/ent/pricing/QuoteService
- service/ent/contracts/ContractService, ContractLifecycleJob, OrgDiscountService
- web/rest/admin/AdminContractResource (API only; UI in X6.9)

**Database changes**
- Liquibase 202611010200_ent_contracts.xml: org_contract, org_contract_price, contract_event, org_discount, org_discount_redemption; license_quote lives in X5.4's changelog (QuoteService writes it once X5.4 lands; until then the engine returns DTOs only — X5.5 tests run in memory).

**APIs**
- GET/POST/PUT /api/admin/contracts, POST /{id}/approve|activate|end|cancel, GET /{id}/events
- GET/POST/PUT /api/admin/org-discounts, POST /{id}/archive
- GET /api/admin/orgs/{orgId}/pricing-preview

**Permissions**
- ROLE_ADMIN + contracts.manage; every write HIGH with reason; org side read-only (no write endpoints under /api/orgs/** — asserted).

**Feature entitlements**
- —

**Acceptance criteria**
- PricingEngineGoldenTest reproduces every value in 22 §9 (G1 7992; G2 7392/600; G3 7192/800; G4 7467/525; G5 = G2; G6 6867/1125; G7 7592/400; G8 7094; G9 6835 and 7192; G10 rounding rows; G11 386/1062/1448/11437 and confirm 380/1044; G12 currency cases; G13 4294 and 425 ¢; G14 dependency outcomes).
- Property tests 22 §10 pass (1 000 random inputs each).
- Confirm with a changed catalog_version/contract_version/inputs → 409 QUOTE_STALE with reason; after 15 minutes → 410 QUOTE_EXPIRED.
- A second ACTIVE contract overlapping → 409 CONTRACT_OVERLAP; a row with both overrides → 422; currency mismatch → 422.

**Test cases**
- MinorTest
- PricingEngineGoldenTest
- PricingEnginePropertyTest
- QuoteHasherTest
- ContractServiceTest
- ContractLifecycleJobTest
- OrgDiscountTest
- AdminContractResourceIT

- **Tech notes:** PricingEngine takes a PricingInputs value object; no repositories inside. Basis points everywhere; never BigDecimal/double. Promo "best" = largest reduction on the org's current recurring total, tie → lowest id.
- **Definition of Done:** Golden tests green and checked in with the exact tables. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.4 — consultant_license + license_feature + license_quote + license_change tables and LicenseService (quote → confirm; assign, add/remove features, upgrade, schedule downgrade, suspend, cancel, reactivate; presets; dependencies) — API only, Stripe off (LocalBillingApplier)
- **Epic:** X5 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X5.5, X1.7, X1.8 · **Relates:** O3.2 · **Supersedes:** O3.2
- **Persona:** Org admin
- **Objective:** Per-consultant base + feature licenses tied to the membership, every change through a quote and a change row, with effective dates and no silent paid additions.
- **Story:** As an org admin, I want to give each consultant a base license and exactly the features they need, see the price before I confirm, and schedule removals for period end so that nobody pays for time they did not use or gets a feature they did not agree to.

**Functional requirements**
- Tables per 20 §2.1–2.4 with the one-live-license and one-live-feature rules; LicenseService per 20 §4 rules 1–11 (org state, membership PENDING for INVITED, eligibility, dependency semantics 21 §4, stackable caps, currency, freshness, idempotent confirm, atomic change rows, audit, notifications).
- Lifecycle per 27 §2–§3 implemented in Kiwiply rows; LicenseLifecycleJob (PENDING promotion, period-end flips, SUSPENDED expiry).
- LocalBillingApplier (26 §11) applies batches immediately when Stripe is off and writes org_subscription/org_subscription_item mirror rows with source=LOCAL and calendar-month periods; paid_through_at = period end.
- Shortcut endpoints suspend/reactivate/cancel create + confirm a one-line quote.
- Org-effective catalog endpoint (sellable flags, effective unit prices with applied markers, presets, dependencies, contract name).

**UI requirements**
- None (pages in X6.1–X6.3).

**Backend requirements**
- service/ent/licenses/LicenseService, LicenseChangeApplier (interface) + LocalBillingApplier, LicenseLifecycleJob, LicenseRules
- domain/ConsultantLicense, LicenseFeature, LicenseQuote, LicenseChange
- web/rest/org/OrgLicenseResource
- service/ent/OrgStateRules

**Database changes**
- Liquibase 202611010300_ent_licenses.xml: consultant_license (generated active_key), license_feature (live + live_seq unique), license_quote, license_change, org_subscription, org_subscription_item (mirror tables created here so LOCAL mode can write them; X6.6 adds the Stripe columns if missing); indexes per 20 §2.

**APIs**
- GET /api/orgs/{orgId}/licenses
- GET /api/orgs/{orgId}/licenses/{id}
- GET /api/orgs/{orgId}/licenses/{id}/history
- GET /api/orgs/{orgId}/licenses/catalog
- POST /api/orgs/{orgId}/licenses/quotes
- POST /api/orgs/{orgId}/licenses/quotes/{quoteId}/confirm (Idempotency-Key)
- DELETE /api/orgs/{orgId}/licenses/changes/{changeId}
- POST /api/orgs/{orgId}/licenses/{id}/suspend|reactivate|cancel
- GET /api/orgs/{orgId}/members/{memberId}/entitlements

**Permissions**
- licenses.view (ORG_ADMIN, FINANCE_SPECIALIST; MARKETING_MANAGER at TEAM read-only), licenses.manage (ORG_ADMIN), features.view (CONSULTANT, OWN). All routes in the OrgIsolationIT registry.

**Feature entitlements**
- Writes the rows that step 7 of check() reads; consumes nothing itself.

**Acceptance criteria**
- E2E-C API path: base + ai.job_matching + ai.resume_tailoring for a member → quote shows 2797 at draft prices → confirm → license ACTIVE with two live features; a second confirm with the same Idempotency-Key returns the same batch and creates nothing.
- Removing a feature sets ends_at = period end and the feature row stays live until then; cancelling the pending change restores it; after the job runs at ends_at the row is not live.
- A quote with a paid TECHNICAL dependency missing → 422 DEPENDENCY_REQUIRED; a COMMERCIAL dependency → requiresConfirmation[] and confirm without confirmedCommercialDeps → 422 DEPENDENCY_UNCONFIRMED.
- INVITED member → license PENDING; accepting the invite promotes it to ACTIVE.
- Member leaves → license ENDED(MEMBER_LEFT) now and features off now.
- Org PAST_DUE → quotes may only remove/cancel (PAST_DUE_REMOVE_ONLY); SUSPENDED → 409 ORG_STATE.
- Every route returns 404 to a member of another org (OrgIsolationIT) and 402 bodies never name another tenant.

**Test cases**
- LicenseServiceTest (20 §9 list)
- LicenseLifecycleJobTest
- LocalBillingApplierTest
- LicenseResourceIT + OrgIsolationIT registry rows + CrossTenantSweepIT rows
- QuoteConfirmIT (stale/expired/idempotent)

- **Tech notes:** license_feature liveness is service-maintained (live BOOLEAN + live_seq) because MySQL generated columns cannot use NOW(). Confirm writes Kiwiply rows first, then calls the applier (26 §4 step 6 rationale). Entitlement is effective at commit.
- **Definition of Done:** E2E-C API scenario passes with Stripe off. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.7 — usage_event ledger + usage_counter: reserve/commit/release with idempotency keys, TTL and extension, UsageSweeperJob, allowance resolution (per-consultant / ORG_POOL, contract overrides, DAY and PERIOD limits), period keys, overage hooks, admin credits
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X5.4
- **Persona:** Org admin / Consultant
- **Objective:** An auditable, idempotent usage ledger that reserves before async work, never double-consumes on retries, and resolves allowances per consultant or per org pool.
- **Story:** As an org admin, I want every metered use recorded with who did it, for whom, which feature and which period, and I want retries never to count twice, so that allowances and future overages are exact.

**Functional requirements**
- Table and indexes per 25 §1; idempotency rules §2; allowance resolution §3 with the FOR UPDATE counter; lifecycle §4 with TTL per feature, extend() cap 3, partial commit; period keys §5; overage hooks §7 (opt-in column, overage flag; no billing); admin credit rows; UsageEventPurgeJob with enterprise.usage.retention_months.
- Usage read model: by consultant/feature/team/history with consent projection (25 §8).

**UI requirements**
- None (Feature Usage page is X6.5).

**Backend requirements**
- service/ent/usage/UsageLedgerService, AllowanceResolver, UsageSweeperJob, UsageCounterReconcileJob, UsageEventPurgeJob, UsageReadService
- domain/UsageEvent, UsageCounter
- web/rest/org/OrgUsageResource
- web/rest/admin/AdminOrgUsageResource (credits)

**Database changes**
- Liquibase 202611010400_ent_usage.xml: usage_event, usage_counter; feature_definition.overage_product_id; org_billing_account.overage_opt_in (if X6.12 not yet present, added there instead — additive either way).

**APIs**
- GET /api/orgs/{orgId}/usage?by=&period=
- GET /api/orgs/{orgId}/usage/history
- GET /api/orgs/{orgId}/usage/events
- GET /api/orgs/{orgId}/members/{memberId}/usage
- GET /api/admin/orgs/{id}/usage
- POST /api/admin/orgs/{id}/usage/credits

**Permissions**
- usage.view (ORG_ADMIN, FINANCE, MARKETING_MANAGER at TEAM), self OWN; admin credits HIGH with reason.

**Feature entitlements**
- Provides step 8 of check().

**Acceptance criteria**
- Same idempotency key twice → one row; a RELEASED key → ALREADY_RELEASED.
- Two threads reserving the last unit → exactly one succeeds.
- ORG_POOL maths: 3 licensed × 40 = 120 pool; member X commits 50 → remaining 70 for all.
- DAY and PERIOD limits both enforced for automation.approved_apply (30/day, 300/period).
- RESERVED past expires_at → RELEASED(TIMEOUT) within 60 s by the sweeper.
- Partial commit (reserved 3, actual 1) returns 2 units.
- Counter drift injected → reconcile job rebuilds the counter and logs; ledger rows untouched.
- Consent NONE members appear in by=consultant as counts only.

**Test cases**
- UsageLedgerServiceTest (25 §9)
- UsageSweeperJobTest
- UsageCounterReconcileJobTest
- UsageResourceIT
- CrossTenantSweepIT rows

- **Tech notes:** Reservation runs REQUIRES_NEW; the handler's advice commits/releases; async workers use the job id as attempt id. Never un-commit; corrections are credit rows.
- **Definition of Done:** Ledger invariants proven by tests; purge job registered. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.6 — EntitlementService.check/require with EntitlementContext (PERSONAL | ORG) and the 11-step order composed over AuthorizationService; @RequiresFeature + interceptor + UsageCommitAdvice; EntitlementException → 402/403/404/409 reason codes; AuthzCoverageTest
- **Epic:** X5 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X5.7, X1.7, X4.7 · **Relates:** O3.3, O3.5, A3.2 · **Supersedes:** O3.3
- **Persona:** Consultant / Marketer
- **Objective:** One server-side entitlement check with a fixed evaluation order, actor/beneficiary recording and workspace-scoped resolution that never stacks personal and org benefits.
- **Story:** As a marketer acting for a consultant, I want the server to decide in one place whether I may use a licensed feature for them — permission, assignment, license, allowance, consent, subscription state — so that the UI only reflects decisions and nothing leaks across tenants.

**Functional requirements**
- Contexts and resolution per 24 §1; request/decision records §2; the order and contracts §3 (delegating 1–6, 9–10 to AuthorizationService); reason codes and HTTP mapping §4; annotation, interceptor extension and UsageCommitAdvice §5; service shape §6 (no decision cache; 60 s catalog cache keyed by catalog_version); entitlement_decision_log sampled; entitlementsOf() for "My Available Features"; has() for menus/extension.
- AuthzCoverageTest reflection gate.

**UI requirements**
- None (402/403 handling cards are in X6.3/X6.5 and the consultant workspace X9.1).

**Backend requirements**
- service/EntitlementService (extend; existing methods untouched)
- service/ent/entitlement/EntitlementContext, EntitlementRequest, EntitlementDecision, ReasonCode, EntitlementException, EntitlementRequests
- web/rest/org/RequiresFeature, config/OrgPermissionInterceptor (extend), aop/UsageCommitAdvice
- web/rest/errors/ExceptionTranslator (reason codes)
- test/AuthzCoverageTest

**Database changes**
- Optional entitlement_decision_log (90-day purge) in the usage changelog.

**APIs**
- No new routes; GET /api/orgs/{orgId}/members/{memberId}/entitlements (X5.4) now served by entitlementsOf().

**Permissions**
- Composes 05 §2 steps; nothing new.

**Feature entitlements**
- This story is the entitlement engine.

**Acceptance criteria**
- One test per step proves the reason code and that no later repository is touched.
- A refusal at step 9/10 releases the reservation made at 8.
- PERSONAL context never reads license tables; ORG context never reads subscription (statement inspector).
- PAST_DUE before paid_through_at → allowed; after → 402 SUBSCRIPTION_STATE{PAST_DUE_LAPSED}.
- CANCEL_AT_PERIOD_END keeps the feature until ends_at.
- INTEGRATION dependency unsatisfied → 409 INTEGRATION_REQUIRED.
- Missing Idempotency-Key on a consuming handler → 400 IDEMPOTENCY_KEY_REQUIRED.
- AuthzCoverageTest fails for a handler under /api/orgs/** that names a feature key without @RequiresFeature or an explicit-check listing.
- The worked example of 24 §8 passes end to end (with X7.6 consent stubbed as data_share FULL until X7.6 lands).

**Test cases**
- EntitlementServiceCheckTest
- RequiresFeatureInterceptorIT
- AuthzCoverageTest
- ExceptionTranslatorTest additions
- existing EntitlementServiceTest unchanged and green

- **Tech notes:** Step 10 reads org_feature_consent only when the table exists (X7.6, Session D) — until then data_share FULL naming the actor is the whole consent check; keep the call behind a ConsentGate interface so X7.6 plugs in without touching check().
- **Definition of Done:** check() is the only gate for every feature named in 24 §7; coverage test in CI. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.11 — Org modules: org_module_license (FLAT / PER_ROLE quantity), the marketer seat as module.talent_marketing per MARKETING_SPECIALIST, quantity follows role grants through a quote, step 6 MODULE_OFF reads it
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X5.4, X1.6
- **Persona:** Org admin
- **Objective:** Commercially restricted org-level modules (the locked Marketer seat, Consultancy Ops later) licensed at org level without consuming consultant licenses.
- **Story:** As an org admin, I want marketer seats to be priced per marketing specialist and shown before I grant the role so that employees never silently become paid seats.

**Functional requirements**
- Table per 20 §2.5; PER_ROLE quantity recomputed on every role grant/revoke via a CHANGE_QUANTITY quote line (Roles page gets the delta first); FLAT modules; included modules need no row (flag allow-list).
- check() step 6 consults live rows for restricted modules; employee actions behind module.talent_marketing (submissions.prepare etc.) return MODULE_OFF (404) without it.
- Seed product MOD_TALENT_MARKETING (no price), module.consultancy_ops definition inactive.

**UI requirements**
- None here; Roles page (X4.1) consumes POST /modules/quotes to show "adding this role adds a paid seat: $X/mo" (Session B aligns).

**Backend requirements**
- service/ent/licenses/OrgModuleService (+ hook in role grant/revoke path)
- domain/OrgModuleLicense
- web/rest/org/OrgModuleResource

**Database changes**
- org_module_license in the licenses changelog (additive changeset).

**APIs**
- GET /api/orgs/{orgId}/modules
- POST /api/orgs/{orgId}/modules/quotes
- confirm via POST /api/orgs/{orgId}/licenses/quotes/{id}/confirm (module lines allowed)

**Permissions**
- billing.view / billing.manage; role grant path additionally requires roles.manage.

**Feature entitlements**
- Provides step 6 data for restricted modules.

**Acceptance criteria**
- Granting MARKETING_SPECIALIST to a 4th member with a live PER_ROLE module → quote shows +1 × unit; confirm updates quantity; revoking → quantity −1 at period end rule (removal semantics).
- Without the module, a marketer calling submissions.prepare gets 404 MODULE_OFF; with it, the permission path continues.
- Included modules (clients_placements, hr_finance) pass step 6 purely by flag.

**Test cases**
- OrgModuleLicenseTest
- OrgModuleResourceIT
- EntitlementServiceCheckTest step-6 cases

- **Tech notes:** Quantity maintenance must be transactional with the role grant; if the quote/confirm is skipped (e.g. OWNER grants without the UI), the role grant is refused 409 MODULE_QUOTE_REQUIRED.
- **Definition of Done:** Marketer seat billable per role; nothing granted silently. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.8 — Migrate the eight isPro callers to EntitlementService.require with context-aware feature keys (PersonalFeatureMap keeps PRO_REQUIRED byte-identical); ai_call gains org_id/beneficiary_login/feature_key/usage_event_id; AiBudgetService.decide(AiBudgetWindow) for the beneficiary's org window (feature AI budgets + extra credits, admin override)
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X5.6
- **Persona:** Consultant / Marketer
- **Objective:** Every protected feature goes through one check; the AI cost budget is a second guard keyed by beneficiary and org; personal behaviour unchanged to the byte.
- **Story:** As a consultant using an org feature, I want my org AI budget and allowances to apply in the org workspace and my own plan in my personal workspace, never mixed, so that billing stays separate.

**Functional requirements**
- Replace requirePro in AiBudgetService, AiDraftService (MODULE_OFF on tenant hosts), ResumeAiService, FieldCacheSyncService (personal-only), JobFitService, JobMatchService, ResumeMatchService, ResumeTailorService per 24 §7; inbox connect gated by inbox.monitoring in ORG context.
- AiBudgetWindow per 25 §6 (sum of feature ai_budget_cents × quantity, period = org billing period, override), economy/soft-cap logic reused; ai_call columns written on the org path; usage_event_id back-link.
- Feature Usage AI percent per consultant; platform admins see cents.

**UI requirements**
- None.

**Backend requirements**
- service/AiBudgetService (overload)
- service/ai/* callers
- domain/AiCall (+4 columns)
- service/ent/entitlement/PersonalFeatureMap

**Database changes**
- Liquibase: ai_call add org_id, beneficiary_login, feature_key, usage_event_id (nullable) + index (org_id, beneficiary_login, created_at).

**APIs**
- No new routes; existing AI routes gain @RequiresFeature in ORG context.

**Permissions**
- Unchanged.

**Feature entitlements**
- ai.job_matching, ai.resume_tailoring, resume.optimization, inbox.monitoring (ORG); personal keys map to isPro.

**Acceptance criteria**
- For a personal user every migrated endpoint returns the identical ProblemDetail (PRO_REQUIRED, same message) and identical AiBudgetService.Decision as before (fixture table).
- For an org beneficiary the ai_call row carries org_id/beneficiary_login/feature_key/usage_event_id; the personal window is untouched (E3/E4 of 29 §2).
- Org window = Σ feature budgets (G13: 425 ¢ with 3 extra credits); override replaces the sum.
- Soft cap switches to the economy model at 80 % of the org window.

**Test cases**
- AiBudgetServiceTest (extend)
- per-caller migration tests
- PersonalFeatureMapTest
- AiCallOrgColumnsIT

- **Tech notes:** Do not change decide(login, task); add the overload. Keep ai_call writes additive. The eight callers are the grep list in 01 §2.1.
- **Definition of Done:** No personal regression (29 invariants 2, 7); org path recorded with beneficiary. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.12 — Bulk license operations API: one BULK quote for many members (ids or team/department/role/unlicensed filters resolved at quote time), preset assign/modify/remove/suspend/cancel/reactivate, line errors, per-line idempotency, 500-line cap, CSV import
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X5.4, X4.5
- **Persona:** Org admin
- **Objective:** Bulk assign and modify licenses with a single authoritative quote and safe partial-failure semantics.
- **Story:** As an org admin onboarding a bench of 40 consultants, I want to apply a preset to all of them in one go, see the total, and confirm once, so that licensing does not take an afternoon.

**Functional requirements**
- 20 §5: filters resolved into explicit member ids and listed; all-or-nothing validation with line_errors[]; all-or-nothing Kiwiply confirm; per-line Stripe keys (consumed by X6.7); enterprise.license.bulk_max_lines (500); CSV email→preset import reusing the invite CSV parser (unknown emails reported).
- Quote DTO lists per-member lines; totals for the batch; licensedCountAfter drives the tier warning.

**UI requirements**
- None (bulk bar in X6.2).

**Backend requirements**
- service/ent/licenses/BulkLicenseService, LicenseFilterResolver, LicenseCsvImporter
- web/rest/org/OrgLicenseBulkResource

**Database changes**
- None beyond X5.4 (license_quote.kind=BULK).

**APIs**
- POST /api/orgs/{orgId}/licenses/bulk/quotes {filter|memberIds, op, presetKey|featureKey, confirmedCommercialDeps}
- POST /api/orgs/{orgId}/licenses/bulk/import (multipart CSV) → quote
- confirm via the standard confirm endpoint

**Permissions**
- licenses.manage; members.import for CSV.

**Feature entitlements**
- —

**Acceptance criteria**
- Filter team=Bench, unlicensed=true resolves to the explicit ids at quote time and the confirm does not re-evaluate the filter.
- One ineligible member → 422 with line_errors[] and nothing applied.
- 501 lines → 422 BULK_LIMIT.
- CSV with 3 known + 1 unknown email → quote for 3, report lists the unknown.
- G7 crossing: bulk-licensing the 3rd consultant warns VOLUME_TIER_CHANGES when a tier exists.

**Test cases**
- BulkLicenseTest
- LicenseFilterResolverTest
- LicenseCsvImporterTest (SensitivePatterns on free-text columns)
- OrgLicenseBulkResourceIT

- **Tech notes:** Reuse the X1.8 invite CSV parser; never invite from this path.
- **Definition of Done:** Bulk quote + confirm for 40 fixture consultants under 2 s in IT. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.9 — PersonalSubscriptionUnchangedIT (scenario E, 12 steps) + WriterRegistryTest + LiquibaseAdditiveTest + billing regression CI job; dev/CI billing-off path (dossier.orgs.dev-activate, LOCAL mode) for enterprise orgs
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X5.8 · **Relates:** E2E-O4.0
- **Persona:** Personal user who is also a consultant
- **Objective:** Prove, on every PR, that personal subscriptions are untouched by enterprise licensing and that the whole enterprise billing path runs without Stripe.
- **Story:** As a Kiwiply Pro user who joins an agency, I want my own plan to stay exactly as it is while the agency licenses me so that billing ownership never mixes.

**Functional requirements**
- 29 §1 invariants as tests; §2 IT table E0–E12; §3 web/extension checks; §4 data guards; CI job personal-billing-regression required for merge.
- Adopt the branch-A dossier.orgs.dev-activate flag (25bae76) for setup-fee skipping in dev/CI; BillingConfigIT refuses it with a live key.

**UI requirements**
- web/e2e/personal-billing-unchanged.spec.ts over the mock.

**Backend requirements**
- test: PersonalSubscriptionUnchangedIT, WriterRegistryTest, LiquibaseAdditiveTest, BillingConfigIT
- config/OrgDevActivateProperties

**Database changes**
- None.

**APIs**
- POST /api/orgs/{id}/billing/activate (dev-only, existing branch-A shape) when dev-activate is on.

**Permissions**
- Unchanged.

**Feature entitlements**
- —

**Acceptance criteria**
- All 12 steps of 29 §2 pass; subscription row byte-identical at every step.
- WriterRegistryTest lists exactly BillingWebhookService + erasure as subscription writers.
- LiquibaseAdditiveTest refuses drop/rename/modifyDataType in ent_* changelogs.
- Existing BillingResourceIT/BillingWebhookIT/EntitlementServiceTest unchanged and green in the same job.
- With Stripe off and dev-activate on, an org can be activated and licensed end to end; with a live key present dev-activate=true fails startup checks.

**Test cases**
- the story is tests

- **Tech notes:** Statement inspector for "FROM subscription" assertions via Hibernate StatementInspector in the IT profile.
- **Definition of Done:** CI job wired as required; progress-tracker updated. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X5.10 — E2E-C API-level scenario test (activate base → add two features → quote → confirm → entitlements effective, others unavailable) + Phase 5 exit gate (flag.enterprise.billing API-on)
- **Epic:** X5 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X5.9, X5.12, X5.11
- **Persona:** QA
- **Objective:** Close Phase 5 with the full §32-C scenario at API level and every billing gate green with Stripe off.
- **Story:** As QA, I want one scenario test that walks E2E-C through the API so that Phase 6 can build the UI on a proven backend.

**Functional requirements**
- ScenarioC_IT: acme admin selects Anika → quote base → add ai.job_matching → add ai.resume_tailoring → prices per line equal the org-effective catalog → total 2797 → confirm → check() allows both features for Anika (self) and for Sarah (assigned, consented) → interview.ai_prep → 402 FEATURE_NOT_LICENSED → Beta cannot see any of it (404).
- Phase 5 exit checklist in progress-tracker: golden tests, check order tests, ledger idempotency, PersonalSubscriptionUnchangedIT, Stripe-off path, OrgIsolationIT registry complete.

**UI requirements**
- None.

**Backend requirements**
- test/e2e/ScenarioC_IT

**Database changes**
- None.

**APIs**
- None new.

**Permissions**
- —

**Feature entitlements**
- ai.job_matching, ai.resume_tailoring, interview.ai_prep

**Acceptance criteria**
- ScenarioC_IT green in CI with Stripe off.
- progress-tracker Phase 5 rows all Completed with evidence paths.

**Test cases**
- ScenarioC_IT

- **Tech notes:** Uses the acme/beta fixtures from X1.12 and draft prices published in LOCAL mode by the test.
- **Definition of Done:** Phase 5 gate passed. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6 — Phase 6 — Billing and license UI, Stripe org billing (fully specified, Session C)
_Setup fee and billing account, StripeGateway growth, webhook mirrors, change applier with Kiwiply prorations and coupons, reconciler and dunning, the six billing pages, Platform Pricing Admin, admin billing operations, test-clock runbook. Design: docs 26–28._

Build order (dependencies first): X6.12 → X6.6 → X6.7 → X6.8 → X6.1 → X6.2 → X6.3 → X6.4 → X6.5 → X6.9 → X6.10 → X6.11.

### X6.12 — org_billing_account + Stripe org customer + setup fee (one-time Checkout or send_invoice Stripe Invoice) for enterprise orgs — adopts the O4.1/O4.2 design; currency fixed at account creation
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X5.4 · **Relates:** O4.1, O4.2
- **Persona:** Org owner
- **Objective:** A billing account per org with one Stripe customer, the setup fee as the activation gate, and a fixed currency, before any license is billed.
- **Story:** As an org owner, I want to pay the one-time setup fee by card or bank transfer and have my organisation activate on payment so that licensing can begin.

**Functional requirements**
- org_billing_account per 26 §2 (dual-write with organization.stripe_customer_id/billing_email); currency from enterprise.billing.default_currency or the platform admin's choice; immutable once a license exists.
- Setup fee flow per docs/design/org/billing.md §2 (Checkout payment mode; or Stripe Invoice send_invoice 15 days), webhook activation (X6.6 handles events; until then LOCAL mode + dev-activate), 14-day abandonment job.
- StripeGateway: createOrgCustomer, createOneTimeCheckout, createInvoiceForPrices with idempotency keys; tax per escalation C3 default (automatic tax off unless stripe.automatic-tax=true).

**UI requirements**
- Billing & Invoices setup-fee card (28 §4): [Pay by card] [Request an invoice]; status while pending; invoice link when requested. 390/1440.

**Backend requirements**
- domain/OrgBillingAccount
- service/ent/billing/OrgBillingAccountService, SetupFeeService, SetupFeeAbandonJob
- service/billing/StripeGateway (+3 methods) + Impl
- web/rest/org/OrgBillingResource (GET /billing, POST /billing/setup-fee)

**Database changes**
- Liquibase 202611020100_ent_org_billing.xml: org_billing_account (+paid_through_at, billing_mode, test_clock_id), stripe_event.org_id, org_invoice, org_invoice_line, org_stripe_discount, billing_drift.

**APIs**
- GET /api/orgs/{orgId}/billing
- POST /api/orgs/{orgId}/billing/setup-fee {method: CARD|INVOICE}
- PUT /api/admin/orgs/{id}/billing/currency (before first license only)

**Permissions**
- billing.view / billing.manage (OWNER, ORG_ADMIN, FINANCE); currency change platform admin HIGH.

**Feature entitlements**
- —

**Acceptance criteria**
- Creating the account creates exactly one Stripe customer with metadata app=kiwiply, kiwiply_scope=org, org_id (idempotency key orgcust-{orgId}; a retry creates none).
- Setup fee by card → Checkout URL with client_reference_id org:{id}; by invoice → hosted invoice URL emailed.
- Currency change after a license exists → 409 CURRENCY_LOCKED.
- Stripe off → dev-activate path only; prod config with dev-activate fails BillingConfigIT.

**Test cases**
- OrgBillingAccountServiceTest
- SetupFeeServiceTest (gateway stub, keys asserted)
- OrgBillingResourceIT (+ isolation registry)
- StripeGatewayImplIT fixtures for the 3 methods

- **Tech notes:** Never reuse the OWNER's personal customer. Stripe Tax ID collection stays off (locked).
- **Definition of Done:** An enterprise org can be activated by paying the fee in Stripe test mode. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.6 — StripeGateway extension (org subscription with items, setItemQuantities proration none, cancel-at-period-end, amount-off coupons, invoice items, create+finalize invoice, upcoming preview, invoices list, refund, credit, test clocks) + StripeWebhookEvent org fields + OrgBillingWebhookHandler writing org_subscription/items/invoice/lines/discount mirrors with scope routing
- **Epic:** X6 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X6.12 · **Relates:** O4.3 · **Supersedes:** O4.3
- **Persona:** Finance
- **Objective:** Grow the one Stripe seam for org billing and route org webhooks to a handler that is the only writer of the org mirrors, leaving the personal path untouched.
- **Story:** As Finance, I want invoices, items and subscription state mirrored from Stripe so that the billing pages show what Stripe will charge, never what we guessed.

**Functional requirements**
- 26 §3 methods with IdempotencyKey on every write; live-key refusal for test clocks; StripeWebhookEvent new fields (personal fields unchanged).
- 26 §7 routing (scope metadata or customer lookup → org handler; else personal path verbatim), event table effects, stale-event ordering, taggedForAnotherApp kept.
- Mirrors: org_subscription (+ Stripe columns), org_subscription_item, org_invoice, org_invoice_line snapshots, org_stripe_discount.

**UI requirements**
- None.

**Backend requirements**
- service/billing/StripeGateway + StripeGatewayImpl (grow)
- service/billing/StripeWebhookEvent (grow)
- service/billing/BillingWebhookService (route)
- service/ent/billing/OrgBillingWebhookHandler
- domain/OrgSubscription, OrgSubscriptionItem, OrgInvoice, OrgInvoiceLine, OrgStripeDiscount

**Database changes**
- Additive columns on org_subscription/org_subscription_item (stripe ids, source STRIPE|LOCAL, discount) if not present from X5.4.

**APIs**
- POST /api/billing/webhook (existing endpoint; new routing)

**Permissions**
- Webhook permitAll + signature (existing).

**Feature entitlements**
- —

**Acceptance criteria**
- Every §7 row of 26 behaves as specified in OrgBillingWebhookHandlerTest; a personal event never touches org_* and an org event never touches subscription (PersonalSubscriptionUnchangedIT E9/E10).
- invoice.paid sets paid_through_at = period_end and flips PAST_DUE → ACTIVE; unpaid/canceled → SUSPENDED and licenses ENDED(ORG_SUSPENDED).
- Every gateway write passes its idempotency key (recorded-fixture IT).
- createTestClock with sk_live_ → StripeGatewayException before any call.

**Test cases**
- OrgBillingWebhookHandlerTest
- BillingWebhookRoutingTest
- StripeGatewayImplIT (fixtures)
- OrgBillingWebhookIT

- **Tech notes:** StripeGatewayImpl remains the only com.stripe importer; one update call for all item quantity changes; percent_off never used.
- **Definition of Done:** Mirrors written only by the handler (WriterRegistryTest extended to org_* tables). Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.7 — LicenseChangeApplier (Stripe mode): target item set → one update with proration none, Kiwiply proration invoice items, amount-off coupon re-size, last-item cancel-at-period-end, failure → FAILED + LicenseChangeRetryJob with the same keys; COMPUTED_INVOICE mode (OrgInvoiceComposer) + BillingModeGuard; STRIPE_ITEM_LIMIT and REPRICE
- **Epic:** X6 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X6.6 · **Relates:** O4.4 · **Supersedes:** O4.4
- **Persona:** Org admin
- **Objective:** Confirmed license changes reach Stripe exactly once, with Kiwiply-computed prorations and discounts that reproduce the quote to the minor unit, and a fallback when the 20-item cap bites.
- **Story:** As an org admin, I want the amount I confirmed to be the amount Stripe invoices, with additions prorated today and removals at period end, so that the quote is the truth.

**Functional requirements**
- 26 §4 steps 1–6; §5 coupon rules; §6 item limit (quote warning ≥ 18, 409 > 20, REPRICE lines, admin mode switch, OrgInvoiceComposer per period with send_invoice, BillingModeGuard alert); §8 keys; 27 §2 Stripe column implemented row by row.
- Invariant checks after every batch (Σ qty × list = Σ list lines; coupon = discount_total).

**UI requirements**
- None (errors surfaced by X6.3).

**Backend requirements**
- service/ent/billing/StripeLicenseChangeApplier, LicenseChangeRetryJob, OrgDiscountSync, OrgPeriodRolloverJob, OrgInvoiceComposer, BillingModeGuard
- web/rest/admin/AdminOrgBillingResource (mode switch)

**Database changes**
- license_change.stripe_ref/stripe_idempotency_key used; org_billing_account.billing_mode.

**APIs**
- PUT /api/admin/orgs/{id}/billing/mode {mode, reason}

**Permissions**
- Applier runs as the confirm actor; mode switch platform admin HIGH.

**Feature entitlements**
- —

**Acceptance criteria**
- G1 confirm → subscription with 6 items and quantities per 22 §9 G1; G2 contract → coupon amount_off 600; G11 batch → RT/preset proration invoice items 380/1044 at confirm time, INT item deleted, 7 items.
- Gateway failure at step 3 → batch FAILED, Kiwiply rows applied, retry job replays with identical keys and converges (recorded fixture proves no duplicate invoice item).
- Last license cancelled → cancel_at_period_end=true; new license before period end → cancel flag cleared + item added.
- 21 items would result → 409 STRIPE_ITEM_LIMIT listing retired prices; REPRICE line moves them; admin switch to COMPUTED_INVOICE → next period invoice composed with lines equal to PricingEngine output.
- Coupon re-sized at invoice.upcoming when a tier/contract changes for the next period.

**Test cases**
- LicenseChangeApplierTest
- LicenseChangeRetryJobTest
- OrgDiscountSyncTest
- OrgInvoiceComposerTest
- BillingModeGuardTest
- ApplierInvariantsPropertyTest

- **Tech notes:** proration_behavior=none on every Stripe call; Kiwiply is the proration authority (22 §6). Refinement of ADR-017 ordering recorded in 26 §4 step 6.
- **Definition of Done:** Test-clock scenario in 26 §10 steps 1–2 reproducible in Stripe test mode. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.8 — OrgSeatReconciler nightly + billing_drift + admin attention; dunning (PAST_DUE banner, DunningReminderJob, paid_through lapse → SUBSCRIPTION_STATE, SUSPENDED → licenses end, reactivation on payment with new rows); notifications and emails
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X6.7 · **Relates:** O4.8 · **Supersedes:** O4.8
- **Persona:** Finance / Platform admin
- **Objective:** Detect drift between Kiwiply and Stripe without ever auto-fixing money, and run the grace/dunning rules exactly.
- **Story:** As Finance, I want a clear warning when an invoice fails and nothing switched off until the period I paid for ends, and as a platform admin I want to know when Stripe and Kiwiply disagree.

**Functional requirements**
- 26 §9 reconciler and drift kinds; 27 §5 dunning steps 1–5 with settings; 27 §1 re-activation from SUSPENDED creating new license rows; notification kinds ORG_PAYMENT_FAILED, ORG_PLAN_PAUSED, ORG_PLAN_RESUMED; email templates orgPaymentFailed.html, orgPlanPaused.html (billing contacts only, never consultants for money).

**UI requirements**
- Overview/Billing banners consume status (X6.1/X6.4); admin drift list in X6.10.

**Backend requirements**
- service/ent/billing/OrgSeatReconciler, DunningReminderJob, OrgReactivationService
- domain/BillingDrift
- mail templates

**Database changes**
- billing_drift (from X6.12 changelog) used.

**APIs**
- GET /api/admin/billing/drift, POST /api/admin/billing/drift/{id}/resolve {reason}

**Permissions**
- Platform admin for drift; emails to billing contacts.

**Feature entitlements**
- —

**Acceptance criteria**
- Quantity/coupon/period/stuck-change drift each produce one billing_drift row and an attention badge; nothing is written to Stripe.
- DunningIT: payment_failed → PAST_DUE + email; features work until paid_through_at; after → 402; unpaid → SUSPENDED + licenses ENDED; invoice.paid → ACTIVE + new license rows with the same feature set (prices re-pinned to current rows, org notified if changed).
- Reminder days [3,7,12] send exactly once each per invoice.

**Test cases**
- OrgSeatReconcilerTest
- DunningIT
- OrgReactivationTest
- DunningReminderJobTest
- mail template ITs

- **Tech notes:** ShedLock-ready job names; MDC tenant per org iteration (X1.10).
- **Definition of Done:** Drift visible in admin; dunning path proven with the LOCAL and Stripe fixtures. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.1 — Subscription Overview page: consultants/licensed/unlicensed tiles, monthly recurring, estimated next invoice (prorations, tax note), billing status + PAST_DUE banner, pending changes with undo, feature-usage top 5, contract summary — 390 and 1440
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** Web, API · **Deps:** X6.7, X2.2, X2.4
- **Persona:** Org admin / Finance
- **Objective:** One honest page for what the org pays, what changes next, and where usage stands.
- **Story:** As an org admin, I want to see how many consultants are licensed, what we pay monthly and what the next invoice will be so that I can manage cost without opening Stripe.

**Functional requirements**
- 28 §1 layouts and states; data from GET /api/orgs/{orgId}/subscription (new aggregate endpoint: counts, currentRecurringMinor, nextInvoiceEstimateMinor from the upcoming preview when Stripe is on else PricingEngine, pendingChanges[], usageTop[], contract, status, paidThroughAt).
- Undo on a pending removal calls DELETE /licenses/changes/{id}.

**UI requirements**
- web/src/app/(tenant)/admin/subscription/page.tsx; packages/ui additions MoneyText, PriceDelta, StatusPill map (28 §0); AnimatedNumber tiles; HBarList-equivalent from packages/ui (ask Session B before lifting admin-kit pieces).

**Backend requirements**
- web/rest/org/OrgSubscriptionResource (GET /subscription)
- service/ent/billing/OrgSubscriptionOverviewService

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/subscription

**Permissions**
- billing.view (ORG_ADMIN, FINANCE, EXECUTIVE_VIEWER totals only).

**Feature entitlements**
- —

**Acceptance criteria**
- Fixture acme (A/B/C/D) shows 4 consultants, 3 licensed, 1 unlicensed, $79.92/mo; after the G11 batch: $99.89/mo, next invoice ~$114.37 on Dec 5 with the proration tooltip.
- PAST_DUE fixture shows the banner with the paid-through date and Pay-now link.
- Pending removal row → Undo → row disappears, toast with the restored feature.
- Empty, loading, error, billing-off states render per 28 §8 at 390 and 1440 (Playwright snapshots).
- EXECUTIVE_VIEWER sees totals without pending-change details.

**Test cases**
- OrgSubscriptionResourceIT
- web unit tests for formatting (never arithmetic)
- Playwright overview.spec at 390/1440

- **Tech notes:** The page never adds two amounts; every number is a DTO field.
- **Definition of Done:** Page live behind flag.enterprise.billing UI-on for acme. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.2 — Consultant Licenses page: cards (390) / table (1440), filters, search, sort, status and pending-change chips, per-row actions, bulk bar → one BULK quote, unlicensed consultants with a License CTA
- **Epic:** X6 · **Size/Complexity:** L/L · **Owners:** Web · **Deps:** X6.1, X5.12 · **Relates:** O5.5 · **Supersedes:** O5.5
- **Persona:** Org admin
- **Objective:** Find any consultant's license state and change many at once, with next effective change visible.
- **Story:** As an org admin, I want a list of consultants with their features, price and next change, filterable by team and feature, with bulk actions, so that managing 50 licenses is quick.

**Functional requirements**
- 28 §2 layouts, filters, sort, search (300 ms), row actions by state (27 §3), bulk selection bar producing a BULK quote and opening the confirm flow (X6.3 bulk mode), pending chips (dashed removal / dotted add).

**UI requirements**
- web/src/app/(tenant)/admin/licenses/page.tsx; FeatureChip, StatusPill from packages/ui; MemberAvatar from Session B.

**Backend requirements**
- Uses X5.4/X5.12 endpoints; list endpoint gains sort/filter params if missing.

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/licenses (filters/sort), POST …/licenses/bulk/quotes

**Permissions**
- licenses.view for the list; actions hidden without licenses.manage (server still enforces).

**Feature entitlements**
- —

**Acceptance criteria**
- Fixture rows render exactly as 28 §2 (Anika $27.97 ACTIVE, Priya with "−Interview Dec 5", Dev $14.99, Lin no license).
- Filter feature=Interview Prep + status=pending → Priya only.
- Selecting 3 + Apply preset → one quote with 3 member lines → confirm flow.
- 390 cards and 1440 table snapshots; keyboard navigation of row actions.
- A member of beta opening acme's URL sees the shell's not-part-of-your-role state (404), no redirect.

**Test cases**
- Playwright licenses.spec
- component tests for chips/filters

- **Tech notes:** Server-side pagination (page size 50); never load all licenses client-side.
- **Definition of Done:** Page live for acme behind the flag. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.3 — Configure Consultant License: summary, base, feature picker with prices/allowances/dependency hints, presets, stackable quantity, debounced backend quotes, QuoteSummary impact preview, cost-confirmation sheet for COMMERCIAL deps, confirm with countdown, error handling (stale, item limit, unconfirmed deps), bulk mode
- **Epic:** X6 · **Size/Complexity:** L/L · **Owners:** Web · **Deps:** X6.2
- **Persona:** Org admin
- **Objective:** The E2E-C surface: pick features, see the authoritative impact preview, confirm — never a silently added paid feature.
- **Story:** As an org admin configuring Anika, I want to tick features and see the exact new monthly price, today's prorated charge and the next invoice before I confirm, and be asked explicitly when a feature needs another paid one.

**Functional requirements**
- 28 §3, §7, §9; quote on every change (400 ms debounce) rendering LicenseQuoteDTO fields only; countdown + auto re-quote; confirm sheet with final numbers; success toast with undo for removals; errors per 28 §3; bulk mode with per-member accordion.
- Consultant-side 402 cards reuse the same chip components (X9.1 consumes).

**UI requirements**
- web/src/app/(tenant)/admin/licenses/[memberId]/page.tsx; packages/ui QuoteSummary, CostConfirmSheet, AllowanceMeter, FeatureChip; Stepper on 390, two-pane on 1440; useBottomBar sticky bar.

**Backend requirements**
- None new (X5.4/X5.5/X5.12).

**Database changes**
- None.

**APIs**
- POST …/licenses/quotes, POST …/quotes/{id}/confirm, DELETE …/changes/{id}

**Permissions**
- licenses.manage.

**Feature entitlements**
- —

**Acceptance criteria**
- E2E-C UI journey: base → AI Job Matching → AI Resume Tailoring → per-line prices shown → preview totals equal the mock quote ($27.97) → confirm → consultant page shows the two chips → Interview Prep unavailable (402 card).
- Ticking Autopilot prepare opens the cost-confirmation sheet naming AI Job Matching and the combined amount; Cancel leaves both unticked; Accept re-quotes with both.
- Unticking an active feature shows "works until Dec 5 · no refund".
- QUOTE_STALE → inline refresh; STRIPE_ITEM_LIMIT → retired-prices card with Refresh prices.
- Quote expiry → countdown hits 0 → automatic re-quote; confirm disabled while pending.
- No client-side arithmetic (lint rule: no `+`/`*` on *Minor fields; test asserts the formatter is the only consumer).

**Test cases**
- Playwright configure.spec (390/1440, bulk mode)
- component tests for QuoteSummary and CostConfirmSheet with every DTO field

- **Tech notes:** Debounce + cancel in-flight quote requests; render only the latest inputsHash.
- **Definition of Done:** E2E-C UI green over the mock. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.4 — Billing & Invoices page: Account (status, currency, payment method via Stripe portal, tax status), Invoices with line snapshots and PDF links, Contract summary (+ server-generated PDF), Billing contacts (autosave), credits rows; setup-fee card when unpaid
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** Web, API · **Deps:** X6.6, X6.12 · **Relates:** O4.6 · **Supersedes:** O4.6
- **Persona:** Finance
- **Objective:** Everything Finance needs about the account, contract and invoices without Stripe access.
- **Story:** As Finance, I want to see and download every invoice with its lines, our contract terms and the payment method, so that I can reconcile without asking anyone.

**Functional requirements**
- 28 §4 tabs; data from GET /api/orgs/{orgId}/billing (account, contract view 23 §4, invoices + lines, contacts, paymentMethod from Stripe at read time, credits) and POST /billing/portal; contract summary PDF generated server-side from rows (no uploads).

**UI requirements**
- web/src/app/(tenant)/admin/billing/page.tsx; Tabs; ChipInput for contacts with autosave + undo toast.

**Backend requirements**
- web/rest/org/OrgBillingResource (extend GET; POST /portal; GET /contract/summary.pdf)
- service/ent/billing/ContractSummaryPdf

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/billing
- POST /api/orgs/{orgId}/billing/portal
- PUT /api/orgs/{orgId}/billing/contacts
- GET /api/orgs/{orgId}/billing/contract/summary.pdf

**Permissions**
- billing.view; portal/contacts billing.manage.

**Feature entitlements**
- —

**Acceptance criteria**
- Invoice rows from org_invoice with lines (incl. "Prorated: …" items and the discount line) render; PDF button opens invoice_pdf_url.
- Portal session is created on the org customer, never a personal one.
- Unpaid setup fee → the page is the setup-fee card.
- Contacts autosave with inline tick and undo; money is never autosaved anywhere on the page.
- 390/1440 snapshots; empty/loading/error states.

**Test cases**
- OrgBillingResourceIT
- Playwright billing.spec
- ContractSummaryPdfTest

- **Tech notes:** Payment method brand/last4 fetched live, never stored.
- **Definition of Done:** Finance can reconcile from this page alone. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.5 — Feature Usage page (by consultant / feature / team / history, remaining allowances, AI budget as percent, consent projection, k≥3 team suppression) + consultant "My Available Features" with meters, ask-admin cards, consent toggles and integration cards
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** Web · **Deps:** X5.7, X6.1
- **Persona:** Org admin / Consultant
- **Objective:** Usage transparency for the org and for each consultant, without exposing money or private content.
- **Story:** As an org admin, I want to see who uses what and how much allowance remains; as a consultant, I want to see my own features and meters and ask for what I lack.

**Functional requirements**
- 28 §5 tabs with AllowanceMeter rows, HBarList, BarLineChart history; consultant page at /{tenant}/me/features from entitlementsOf + usage; 402 FEATURE_NOT_LICENSED card wiring; consent toggles (X7.6 when present; hidden before) and integration cards (Connect Gmail; extension in Phase 9).

**UI requirements**
- web/src/app/(tenant)/admin/usage/page.tsx, web/src/app/(tenant)/me/features/page.tsx; AllowanceMeter in packages/ui.

**Backend requirements**
- Uses X5.7/X5.6 endpoints.

**Database changes**
- None.

**APIs**
- GET …/usage, …/usage/history, …/members/{id}/entitlements, …/members/{id}/usage

**Permissions**
- usage.view; features.view OWN.

**Feature entitlements**
- —

**Acceptance criteria**
- Fixture: Anika 13/40 tailorings, AI 72 % — meters and aria-valuetext match.
- A team of 2 shows "not enough members to show" (k≥3).
- Consent NONE member appears with counts only.
- Consultant page: licensed chips with meters; unlicensed show Ask-your-admin; integration card for Email Monitoring when not connected.
- 390/1440 snapshots; empty/loading/error.

**Test cases**
- Playwright usage.spec + my-features.spec
- meter component tests

- **Tech notes:** Never show dollars to org users for AI; percent only.
- **Definition of Done:** Both pages live behind the flag. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.9 — Platform Pricing Admin (admin page kit): Catalog, Features, Presets, Volume tiers, Discounts, Contracts (rows editor + history), Publish (diff + margin re-check + typed version confirm), Change history
- **Epic:** X6 · **Size/Complexity:** L/L · **Owners:** Web, API · **Deps:** X5.2, X5.5, X1.11 · **Relates:** A3.4
- **Persona:** Platform admin
- **Objective:** Every commercial knob — prices, allowances, dependencies, presets, tiers, discounts, contracts, publication — editable from admin with the guard and audit in front of it.
- **Story:** As a platform admin, I want one pricing console where I publish versions, negotiate contracts and see every change, so that nothing commercial is ever a code change.

**Functional requirements**
- 28 §6; every tab over X5.1/X5.2/X5.3/X5.5 endpoints; ReasonSheet on every write; ConfirmTypedSheet typing the version on publish; HistoryDrawer from catalog_change/contract_event; 390 behaviour via useNarrow.

**UI requirements**
- web/src/app/(admin)/admin/pricing/** (extends X5.1 page) and /admin/contracts/**; admin kit only.

**Backend requirements**
- None new beyond X5.* (contract approve/activate endpoints exist).

**Database changes**
- None.

**APIs**
- the /api/admin/catalog/** and /api/admin/contracts/** set

**Permissions**
- ROLE_ADMIN; contracts.manage; HIGH re-auth on publish/override/contract activation.

**Feature entitlements**
- —

**Acceptance criteria**
- Publishing a draft set shows the diff with each affected preset/tier margin result and requires typing "v18"; the publish creates catalog_publish 18.
- Contract editor refuses a second active contract, shows the floor result per row and records the approver (two-person rule).
- Discounts tab requires ends_at ≤ 12 months.
- Change history lists before/after JSON with the actor and reason.
- 390 and 1440 kit snapshots.

**Test cases**
- Playwright pricing-admin.spec
- component tests with kit-test-utils

- **Tech notes:** Reuse AdminTable/AdminFilterBar/ReasonSheet; no new admin primitives without adding them to the kit first.
- **Definition of Done:** Admin can take the enterprise catalog from "no prices" to a published version without engineering. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.10 — Platform admin org billing operations: setup-fee status, invoices, items vs licenses with drift resolution, billing mode switch, suspend/reactivate with reason, AI budget override per license, credits (flag enterprise.billing.credits, two-person rule), duplicate-setup-fee refund, test-clock controls in test mode
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** Web, API · **Deps:** X6.8, X6.9 · **Relates:** A14.2
- **Persona:** Platform admin
- **Objective:** Support tooling for enterprise billing without touching money automatically.
- **Story:** As a platform admin handling a support ticket, I want to see an org's billing state next to its licenses and resolve drift or apply an approved credit with a reason, so that every money action is deliberate and audited.

**Functional requirements**
- /admin/orgs/{id}/billing per 28 §6 last paragraph; endpoints for drift resolve (X6.8), mode (X6.7), suspend/reactivate license with reason, ai_budget_override_cents, credits behind the flag with approver, refund only for duplicate setup fee (billing.md §8), test clock create/advance when stripe.test-clock.enabled.

**UI requirements**
- admin kit pages under the existing admin customers area.

**Backend requirements**
- web/rest/admin/AdminOrgBillingResource (extend)
- service/ent/billing/AdminBillingOpsService

**Database changes**
- None (columns exist).

**APIs**
- GET /api/admin/orgs/{id}/billing
- POST …/licenses/{licenseId}/suspend|reactivate {reason}
- PUT …/licenses/{licenseId}/ai-budget-override {cents, reason}
- POST …/credits {amountMinor, reason} (flag)
- POST …/refund-duplicate-setup {reason}
- POST …/test-clock/advance {to}

**Permissions**
- ROLE_ADMIN; credits/refund/override HIGH + two-person; every write audited into the tenant's own audit log too (E8 pattern).

**Feature entitlements**
- —

**Acceptance criteria**
- Credits endpoint 404 when the flag is off; with the flag, creator ≠ approver enforced; credit appears on the org's invoices page with the reason.
- Refund refuses anything but a duplicate setup fee.
- Test-clock controls hidden/refused with a live key.
- Drift resolve requires a reason and marks the row; nothing calls Stripe.

**Test cases**
- AdminBillingOpsServiceTest
- AdminOrgBillingResourceIT
- Playwright admin-org-billing.spec

- **Tech notes:** No refunds for subscriptions, ever (locked); credits only via escalation C1's flag.
- **Definition of Done:** Support can handle the enterprise billing scenarios of 26 §9 and 27 §7 from admin. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X6.11 — Stripe test-clock QA runbook (scenario C through dunning with recorded object ids) + E2E-C Playwright journey over the mock at 390/1440 + Phase 6 exit gate
- **Epic:** X6 · **Size/Complexity:** M/M · **Owners:** QA, Web · **Deps:** X6.3, X6.4, X6.5, X6.8, X6.10
- **Persona:** QA
- **Objective:** Prove the Stripe path in test mode end to end and the UI journey over the mock, then close Phase 6.
- **Story:** As QA, I want a repeatable test-clock script and a Playwright journey so that every release can re-prove billing without a real charge.

**Functional requirements**
- 26 §10 runbook written as docs/enterprise-v2/runbooks/stripe-test-clock-C.md with real test-mode ids; 28 §11 Playwright journey incl. COMMERCIAL dialog, pending removal undo, PAST_DUE banner, billing-off state; Phase 6 exit checklist in progress-tracker.

**UI requirements**
- web/e2e/ent-billing.spec.ts

**Backend requirements**
- None.

**Database changes**
- None.

**APIs**
- None.

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Runbook executed once in Stripe test mode with ids recorded; the mirrors match at every step.
- Playwright green at 390 and 1440 over the mock.
- progress-tracker Phase 6 rows Completed with evidence.

**Test cases**
- ent-billing.spec.ts; runbook checklist

- **Tech notes:** Test mode only; the runbook starts with a key check that refuses sk_live_.
- **Definition of Done:** Phase 6 gate passed. Plus the common DoD in 06-phase-plan.md §5 and the billing DoD (money in minor units, idempotent changes, valid price versions, invoice traceability, reconciliation, PersonalSubscriptionUnchangedIT green).

### X7 — Phase 7 — Consultant and resume management
_Consultant directory and profile overlay, org-managed resume links with approval and visibility, readiness, per-feature consent._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X7.1 | Consultant directory: photo, skills, experience summary (consented), availability, marketing status, assigned marketer, license status, resume completeness | L | — |
| X7.2 | Consultant profile overlay (consultant_profile): availability, bench date, marketing status, preferences, self-declared work-auth category; consultant edits own, marketer proposes | M | O10.12 |
| X7.3 | Resumes page for the org: org_resume links, named/primary per org, versions, approval status, visibility, view/download/print by permission, audit | L | O8.4 |
| X7.4 | Resume approval workflow: marketer proposes (ORG_MANAGED or edit of shared), consultant approves/rejects with diff, approved_version pin | M | — |
| X7.5 | Marketer-made resumes via the builder in act-for mode (FULL consent + resumes.edit_for), versions with reason, AI tailoring charged to the consultant's entitlement (or org pool) | L | O10.4 |
| X7.6 | org_feature_consent: per-feature act-for consent with cooldown-limited requests; CONSENT_REQUIRED 403 card; immediate revoke | M | — |
| X7.7 | Marketing readiness checklist per consultant (profile, approved resume, availability, license, consent) feeding the dashboard | S | — |

### X8 — Phase 8 — Talent marketing
_Assigned talent, job discovery and AI matching for a consultant, opportunity assignment and authorization, follow-ups, activities, duplicate guard — the marketer prepares, never submits._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X8.1 | Marketing workspace shell: My Assigned Talent, consultant switcher, consent/license chips | M | O10.3 |
| X8.2 | Job discovery for a consultant (JobSearchService with beneficiary) and org-curated job banks | M | — |
| X8.3 | AI matching for a consultant (opportunity_match with score/reason, beneficiary entitlement ai.job_matching, actor recorded) | L | — |
| X8.4 | Opportunity assignment: assign/withdraw, batch assign with default/override approved resume, one notification, duplicate guard | L | O10.5 |
| X8.5 | Authorization requests: consultant accepts/declines and authorizes a submission; marketer sees state; approvals for Marketing Managers | M | — |
| X8.6 | Follow-ups and tasks: due dates, reminders, activity feed, status updates on matches/submissions | M | — |
| X8.7 | Marketer performance view (counts, response rates; k-anonymity rules not needed for own rows) | S | — |
| X8.8 | Duplicate-submission guard across consultants and vendors; same-employer window setting | S | O10.11 |
| X8.9 | NoSubmitSurfaceTest + MarketerScopeTest kept green; E2E-D up to authorization in Playwright | M | — |

### X9 — Phase 9 — Consultant applications, interviews, extension workspace
_Consultant workspace, assigned jobs, application link via submit-detect, interview coordination, AI interview prep (licensed), offers, extension workspace selector._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X9.1 | Consultant workspace: Home, My Profile, My Resumes, Job Matches, Assigned Opportunities, Applications, Interviews, Offers, Placements, My Available Features, Notifications | L | — |
| X9.2 | Assigned jobs list for the consultant and application link via submit-detect (pipeline_application_link); marketer sees APPLIED live | M | O10.6 |
| X9.3 | Application tracking for the org: consented stage view, timeline merge of application_event and pipeline_event | M | — |
| X9.4 | Applications page (org side) consent-scoped on real data | M | O8.1 |
| X9.5 | Interview coordination: interview_slot propose/confirm, consultant accepts into own calendar (interview row), ICS, reminders | M | — |
| X9.6 | Interviews page (org side) and calendar of consented interviews | M | O8.3 |
| X9.7 | AI Interview Preparation for consultants gated by interview.ai_prep entitlement; mascot encouragement | M | — |
| X9.8 | Offers: extend/record, consultant responds, feedback capture | M | — |
| X9.9 | Extension workspace selector: GET /api/profile/version workspaces[], X-Kiwiply-Workspace header, per-workspace mirror partition, "Pro via Acme" only inside the org workspace | L | O3.4 |
| X9.10 | E2E-D completion (submit in own session → interview → outcome) and E2E-E personal-compatibility Playwright journeys | M | — |

### X10 — Phase 10 — Clients and placements
_Client accounts, contacts, vendor relationships, requirements, candidate submissions (records), offers, placements, extensions and redeployment, Account Manager workspace._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X10.1 | Client accounts, contacts, relationships (vendor chains) CRUD with PII scanner | L | — |
| X10.2 | Client requirements: intake (manual/email paste/import), status, owner, dedupe | M | — |
| X10.3 | Candidate submissions as records: authorize → submitted → shortlisted/rejected; unique per requirement+consultant; channel label and external reference | M | — |
| X10.4 | Offers → placements lifecycle: pending start, active, extension, redeployment, ended/terminated; bill-to account | L | — |
| X10.5 | Account Manager workspace: Clients, Contacts, Requirements, Submissions, Interviews, Offers, Placements | M | — |
| X10.6 | Placement declaration from the consultant side and org celebration (mascot), feeding Timesheets (H) | S | — |
| X10.7 | Pipeline reports: requirement fill rate, time-to-place, submissions per consultant (consent-scoped) | M | — |

### X11 — Phase 11 — HR and Finance
_Lifecycle records, compliance checklists and policy acknowledgements without identity documents; finance records over the Timesheets product; reports._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X11.1 | HR lifecycle records (employment_record): onboarding → active → leave → offboarding → ended; manager, department, team; history | M | — |
| X11.2 | Compliance checklists (hr_task) and policy acknowledgements (policy_ack) with org-authored policy PDFs; no identity documents; PII scanner on uploads | M | — |
| X11.3 | HR workspace: Employees, Onboarding, Documents (policies only), Compliance, Lifecycle, Offboarding, Reports | L | — |
| X11.4 | Finance workspace over product H: Consultant Subscriptions (read), Billing, Invoices, Placements (rates), Timesheets, Approvals, Payments (status records), Reports | L | — |
| X11.5 | Finance records for placements: bill/pay rate labels, invoice_record and payment_record links to H6; profit view (H5.15) | M | — |
| X11.6 | HR/Finance reports and CSV exports (audited); retention per settings | M | — |

### X12 — Phase 12 — Advanced analytics and enterprise features
_Org analytics with k-anonymity, Autopilot prepare for assigned jobs, integrations, SSO, second-instance readiness, Cloudflare-for-SaaS evaluation._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X12.1 | Org analytics with k-anonymity (from docs/design/org/analytics.md) across pipeline and licenses; Executive/Viewer workspace | L | — |
| X12.2 | Autopilot prepare for assigned jobs (automation.approved_apply) — stops before submit, attestation untouched | L | — |
| X12.3 | Integrations: outbound webhooks, Slack digests, ICS feeds (from O12) scoped per tenant | M | — |
| X12.4 | SSO: SAML/OIDC per org with JIT membership mapping to role templates | L | — |
| X12.5 | Second-instance readiness: ShedLock, shared rate limits, cache invalidation across instances | M | — |
| X12.6 | Cloudflare for SaaS evaluation and migration runbook (if custom-host volume or DDoS exposure requires it) | S | — |
| X12.7 | Advanced reporting and scheduled report emails per workspace | M | — |

## 4. Story-id discipline
- Ids are permanent; a dropped story keeps its id with status `blocked` and a note.
- A story may not span two bounded contexts (03 §1); split it.
- Every story that consumes a feature names the feature key and the beneficiary rule.
- Every story that touches an org-owned table adds a case to `CrossTenantSweepIT` (via the coverage registry).
