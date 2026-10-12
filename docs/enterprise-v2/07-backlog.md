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

### X5 — Phase 5 — Subscription foundation
_Catalog (shared with personal plans), feature definitions and dependencies, base license + add-ons, pricing engine with contracts, entitlement evaluation, usage ledger, personal-subscription regression suite._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X5.1 | Catalog tables (product, product_price, product_entitlement, bundle_item) from the Phase 18 design + effective dates and catalog_version; admin Catalog page read/write for platform admins | L | A3.1, A3.5, A3.7 |
| X5.2 | feature_definition, feature_dependency, license_preset, volume_tier tables + admin editors; initial feature keys seeded inactive with no prices | M | O3.1 |
| X5.3 | MarginCalculator for BASE_LICENSE/FEATURE/ORG_MODULE incl. "above individual" check at preset level; publish refused below floor without typed reason | M | O3.6 |
| X5.4 | consultant_license + license_feature + license_change + license_quote tables and LicenseService (assign, add/remove features, upgrade, schedule downgrade, suspend, cancel, reactivate, bulk) — API only, Stripe off | L | O3.2 |
| X5.5 | PricingEngine: list → contract → one discount → volume tier → effective; org_contract(+price) tables; golden-table tests; quote generation with inputs_hash and expiry | L | E2E-A5.1 |
| X5.6 | EntitlementService.check with EntitlementContext (PERSONAL | ORG) and the 11-step order; @RequiresFeature; FEATURE_NOT_LICENSED/ALLOWANCE 402 codes; AuthzCoverageTest | L | O3.3, O3.5, A3.2 |
| X5.7 | usage_event ledger: reserve/commit/release, idempotency, period keys, sweeper job, allowance resolution (per-consultant / org pool) | M | — |
| X5.8 | Migrate the eight isPro callers to EntitlementService.check behind the flag; ai_call gains org_id/beneficiary/feature_key/usage_event_id; AiBudgetService keyed by beneficiary + org | M | — |
| X5.9 | PersonalSubscriptionUnchangedIT + billing regression suite; dev/CI billing-off path (from 25bae76) for licenses | M | E2E-O4.0 |
| X5.10 | E2E-C API-level scenario test (activate base → add two features → quote → confirm → entitlements effective, others unavailable) | M | — |

### X6 — Phase 6 — Billing and license UI, Stripe org billing
_Subscription Overview, Consultant Licenses, Configure License with backend quotes, Billing & Invoices, Feature Usage, Platform Pricing Admin; one Stripe subscription per org; reconciliation._

| Id | Story | Size | Relates / supersedes |
|---|---|---|---|
| X6.1 | Subscription Overview page: totals, MRR, next invoice estimate, status, usage summary, pending changes | M | — |
| X6.2 | Consultant Licenses page: table/cards, filters, search, sorting, bulk assign/modify, next effective change | L | O5.5 |
| X6.3 | Configure Consultant License: base, feature picker with prices/dependencies/allowances, cost-impact confirmation for COMMERCIAL deps, quote preview, confirm | L | — |
| X6.4 | Billing & Invoices page: billing account, contracts, payment method via Stripe Portal, invoices/credits/history mirrors | M | O4.6 |
| X6.5 | Feature Usage page: by consultant, feature, team; remaining allowances; history | M | — |
| X6.6 | StripeGateway extension (org customer, subscription with items, quantities with proration, upcoming invoice preview, invoices, coupons, invoice items, refund) + org webhook routing writing the mirrors | L | O4.3 |
| X6.7 | Apply license changes to Stripe: add now (create_prorations), remove at period end (none), discounts as coupons; COMPUTED_INVOICE fallback per org | L | O4.4 |
| X6.8 | OrgSeatReconciler nightly + drift alerts; dunning PAST_DUE/SUSPENDED → license effects; notifications | M | O4.8 |
| X6.9 | Platform Pricing Admin: catalog, base/feature prices, versions, presets, discounts, contracts, publication, change history | L | A3.4 |
| X6.10 | Platform admin org billing operations (setup fee, invoices, seats, dunning, disputes) and comps for enterprise orgs | M | A14.2 |
| X6.11 | Stripe test-clock QA runbook + E2E-C Playwright journey over mock | M | — |

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
