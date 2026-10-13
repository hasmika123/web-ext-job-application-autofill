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

## 3. Phases 2–12 — stories

X2, X3 and X4 (except X4.7/X4.8/X4.10) are fully specified by Session B below; the remaining epics
keep their title tables until the owning session (README: C owns X5/X6, D owns X7–X11, E owns the
API/test/deploy specs and reviews every story) writes them. Sizes of unspecified rows are first estimates.

### X2 — Phase 2 — Branded login and dashboard shell
_Runtime branding, one branded login, one enterprise shell with permission-driven workspaces, Org Admin lands on the Org Admin Dashboard, basic profile from the avatar menu, the Kiwiply character used compactly._

**Session B (fully specified).** Build order: X2.1 → X2.8 → X2.12 → X2.13 → X2.2 → X2.10 → X2.3 → X2.6 → X2.7 → X2.9 → X2.4 → X2.5 → X2.14 → X2.11. X2.8/X2.12/X2.13 (UI + API foundations) can run in parallel after X2.1; X2.10 in parallel with X2.2; X2.4/X2.5 after X2.2; X2.11 closes the phase.

### X2.1 — Consolidate the two parked web helper sets (org-types/org-api vs org-client/org-join/org-proxy, mock-orgs vs mock-org) into web/src/lib/ent/*
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** Web · **Deps:** X1.4, X1.8 · **Relates:** O1.6
- **Persona:** Web developer building Phase 2
- **Objective:** One typed client, one BFF forwarder, one mock fixture set for every enterprise page, before any page is built on them.
- **Story:** As a web developer, I want one `lib/ent` module set (types, client, BFF forward, join helpers, mock fixtures) so that every tenant page imports the same verified helpers instead of one of two conflicting parked copies.

**Functional requirements**
- Create web/src/lib/ent/{types.ts, client.ts, proxy.ts, join.ts, tenant.ts (from X1.4), workspaces.ts (empty shell filled by X2.2)}; port the verified logic of branch A `org-types.ts`/`org-api.ts` (decideOrgGate, can/canAny, problem mapping) and branch B `org-client.ts`/`org-join.ts`/`org-proxy.ts` (join previews/accept, consent payloads).
- Keep the kiwiply.com `(org)` console importing from the new module (one re-export shim `lib/org-types.ts` → `lib/ent/types.ts` until O-stories move).
- Merge `web/scripts/mock-orgs.mjs` and `mock-org.mjs` into `web/scripts/fixtures/enterprise.mjs` (X1.12 shape): acme/beta tenants, accounts, memberships, roles, hostnames, branding; `MOCK_ENTERPRISE_ENABLED`.
- Resolve the known conflicts (e2e/auth.setup.ts, e2e/fixtures/accounts.ts, scripts/mock-api.mjs) in this commit; no feature work.

**UI requirements**
- —

**Backend requirements**
- —

**Database changes**
- —

**APIs**
- No new API; the client covers GET /api/public/tenant, GET /api/me/tenant (X2.2), GET /api/orgs/{id}, /mine, /members, /groups, join endpoints.

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Every import of the old helper paths in web/src resolves through lib/ent (grep shows no duplicate implementations).
- Branch A and branch B unit tests (org-types.test, org-slug.test, join helpers) pass against the merged module.
- `npm run build`, `npm test`, Playwright smoke + existing org-console spec green over the merged mock.
- mock-api serves acme.localhost / beta.localhost tenants and all enterprise accounts from one fixture file.

**Test cases**
- lib/ent/*.test.ts (ported + merged)
- scripts mock self-test
- Playwright smoke.spec.ts + org-console.spec.ts

- **Tech notes:** 01-existing-system-audit.md §5 (which commit is verified); keep `decideOrgGate` for the kiwiply.com chooser only; tenant resolution never reads the kiwiply_org cookie.
- **Definition of Done:** No behaviour change on kiwiply.com; CI green; 01 §5 rows marked consolidated. Plus the common DoD in `06-phase-plan.md` §5.

### X2.2 — EnterpriseShell: tenant theme tokens, permission-driven nav from workspace definitions, switcher only when >1 workspace, avatar menu with basic profile
- **Epic:** X2 · **Size/Complexity:** L/L · **Owners:** Web, API, UI · **Deps:** X2.1, X1.5, X1.6 · **Relates:** O1.7
- **Persona:** Any member on a tenant host (Sarah: Org Admin + Marketing Manager)
- **Objective:** One shell for every role: viewport-height independently scrolling sidebar, nav derived from permissions and modules, a switcher only when it matters, the basic profile in the avatar menu.
- **Story:** As a member, I want one consistent shell whose navigation shows only what I may open, lands me in my primary workspace and lets me switch when I hold several roles, so that every organization feels like one coherent app without ever hiding a permission check in a menu.

**Functional requirements**
- API: GET /api/me/tenant (tenant hosts only; tid token) per 12 §3 → org, member, roles, permissions map, modules, workspaces[], landing, consent; ETag = hash(roles, permissions, modules); 403 MEMBER_SUSPENDED; 404 non-member.
- Web: web/src/lib/ent/workspaces.ts = the data in 16 §3/§5 (workspace_key → ordered NavItem{needs[], module?}); `workspacesFor(me)` = workspaces whose home is openable; `landingFor(me)`.
- EnterpriseShell (web/src/components/ent/shell/EnterpriseShell.tsx): sidebar 236px sticky h-dvh overflow-y-auto scroll-slim, collapsible 64px (localStorage, try/catch), org logo/name header, switcher (16 §4) only when workspaces.length > 1 else static eyebrow, nav groups, Need-help MascotCard, optional Powered-by footer; top bar 64px (quick-search slot hidden until a provider exists, NotificationBell, AccountMenu with "My profile" first); banners (PAST_DUE, draft branding, domain failing, access-changed) by permission; mobile: 56px top bar, nav BottomSheet, bottom tab bar = first four items + More with useBottomBar inset.
- Workspace layout web/src/app/(tenant)/_t/w/[workspace]/layout.tsx per 16 §2.4 (getTenant → getMeTenant → validate workspace → shell); not-part-of-your-role EmptyState (no redirect); re-validate /api/me/tenant on focus every 5 min and show the reload banner when the ETag changed.
- Promote the generic admin kit pieces to packages/ui: FilterBar, DataTable (table→cards), ReasonSheet, ConfirmTypedSheet, HistoryDrawer, PersonCell, StatusDot, QuickActionTiles (admin-v3 re-exports them; sample-lint unchanged); add web/src/lib/ent/use-save.ts (useAdminSaveEngine with the /api fetcher).
- Tenant theme: the shell wrapper applies `.theme-v2 .theme-tenant` with inline --tenant-* variables from the public DTO (X2.12 provides the derivation; until merged, the wrapper applies the Kiwiply defaults).

**UI requirements**
- Geometry and states per 16 §2.1/§2.5; switcher per 16 §4 (Menu ≥ md, BottomSheet < md, ⌘⇧W, "Open … first" preference with undo toast).
- AccountMenu entries: My profile · Notifications · Security · (Switch workspace ▸ when >1) · Sign out; header "{org} · {primary role}".
- 390 px: 16 px gutters, 44 px targets, no horizontal scroll; 1440: sidebar + content; reduced-motion safe.

**Backend requirements**
- web/rest/ent/MeTenantResource, service/ent/WorkspaceService (definitions mirrored from 16 §3 as a Java map with a doc-sync test), DTOs

**Database changes**
- org_member.landing_workspace VARCHAR(20) NULL (additive; written by X4.2, read here)

**APIs**
- GET /api/me/tenant → MeTenantDTO | 401 | 403 MEMBER_SUSPENDED | 404

**Permissions**
- membership ACTIVE; nav any-of needs; API re-checks per page

**Feature entitlements**
- modules[] from EnterpriseFlags per org (domains, roles, billing, marketing, hrFinance)

**Acceptance criteria**
- acme-admin on acme.localhost lands on /w/admin; the sidebar lists exactly the ADMIN items whose needs ∩ permissions ≠ ∅ and whose module is on (table-driven test against 16 §5.1).
- Sarah (ORG_ADMIN + MARKETING_MANAGER) sees the switcher with two rows; a single-workspace member sees no switcher (E2E-B half).
- Visiting /w/hr as Sarah renders "This isn't part of your role" with HTTP 200 inside the shell and no redirect; the API answers 404 for /api/orgs/{acme}/hr/*.
- The sidebar scrolls independently of the page (Playwright: scroll the page 2000 px, the sidebar scrollTop is unchanged; scroll inside the sidebar, the page does not move).
- Role change on the server → within 5 min of focus the shell shows "Your access changed — reload" (ETag test).
- MEMBER_SUSPENDED renders the paused panel with sign-out only; no org data in the DOM.
- Every promoted kit component keeps its admin-v3 tests green via the re-exports.

**Test cases**
- MeTenantResourceIT (workspaces ∩ permissions ∩ modules, ETag, suspended, non-member, PLATFORM 404)
- WorkspaceDocSyncTest (Java map = 16 §3)
- web workspaces.test.ts (doc-sync with 16 §5), EnterpriseShell.test.tsx (16 §8 list), use-save.test.ts
- Playwright tenant-shell.spec.ts at 390/1440

- **Tech notes:** Branch A OrgShell/OrgSwitcher/org-nav as the base; ADR-007; 16 §2–§4; keep pages as server components; the URL is the only workspace state.
- **Definition of Done:** npm test + build green; Playwright green over the mock; 16 §5 tables and workspaces.ts in sync; 05 §7 behaviour verified. Plus the common DoD in `06-phase-plan.md` §5.

### X2.3 — BrandedLogin component: runtime branding from GET /api/public/tenant, password + verification, NOT_A_MEMBER state, "Powered by Kiwiply" mark, mascot welcome pose
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** Web, UI · **Deps:** X2.1, X1.5, X2.8
- **Persona:** An Acme employee visiting careers.acme.com (or acme.localhost) signed out
- **Objective:** One login component every tenant reuses, rendered from published branding at runtime, with every state honest and no fallback to another org or the public site.
- **Story:** As an employee, I want to see my organization's branded sign-in and clear messages when I'm not a member or need a code, so that I always know where I am and what to do next.

**Functional requirements**
- web/src/components/ent/login/BrandedLogin.tsx per 11 §3.1 (reuses AuthCardShell/AuthField/SocialRow/GoogleSignIn; tenant tokens; MascotPose welcome lg/sm; Powered-by mark; Report-this-page mailto; no signup link, no demo card).
- States per 11 §3.2: SIGNED_OUT, STALE_SESSION (BFF clears cookies on tid mismatch), WRONG_ORG_ACCOUNT (403 NOT_A_MEMBER panel), INVITED_NOT_ACCEPTED (pending panel + resend-for-me), MFA_REQUIRED (code step, resend after 30 s), EMAIL_UNVERIFIED, PAST_DUE (login proceeds), GOOGLE_UNAVAILABLE (button hidden), DRAFT_PREVIEW (branding.manage only), ERROR.
- Page web/src/app/(tenant)/_t/login/page.tsx: EXISTING_SESSION probe (/api/account + /api/me/tenant) → redirect to landing; else BrandedLogin; title "Sign in · {displayName}"; ?next= same-host only.
- BFF /api/auth/login on tenant hosts: rate-limit key tenant:{host}:{ip}; maps 403 NOT_A_MEMBER {pending?, suspended?} and 401 USER_NOT_ACTIVATED to typed responses; after success calls /api/me/tenant and returns {ok, landing}.

**UI requirements**
- Wireframes 11 §3.1 (390/1440); copy table 11 §3.2; tenant tokens only; AA contrast via X2.12 derived set; focus order: email → password → submit.

**Backend requirements**
- None new (X1.5 provides NOT_A_MEMBER; pending/suspended flags added to that 403 body in this story on the API side: AuthenticateController)

**Database changes**
- —

**APIs**
- POST /api/auth/login (BFF) → {ok, landing} | {mfaRequired, mfaToken} | 403 {code: NOT_A_MEMBER, pending?, suspended?} | 401
- POST /api/join/resend-for-me (API, tenant host, rate-limited 1/10 min per email) → 204

**Permissions**
- public page; membership decides after credentials

**Feature entitlements**
- —

**Acceptance criteria**
- acme.localhost/login renders Acme's logo, welcome title/message, primary colour on the button; beta.localhost renders Beta's; nobody.localhost renders TenantUnavailable (tenant-isolation spec).
- beta-admin signing in on acme.localhost sees "You're not a member of Acme Talent" with no org data and no Set-Cookie; an INVITED user sees the pending panel; a SUSPENDED member sees the paused panel.
- An existing acme session visiting /login is redirected to /w/admin before any login DOM renders.
- Admin MFA on a tenant host completes through the code step and lands on the dashboard.
- The Powered-by mark and Report link are present in every tenant login snapshot; no link to the marketing site exists on the page.
- Lighthouse a11y ≥ 95 on the login at 390; axe has no violations.

**Test cases**
- BrandedLogin.test.tsx (every state renders the specified copy/controls)
- login route test (BFF mapping, rate-limit key)
- AuthenticateControllerIT pending/suspended flags
- Playwright tenant-login.spec.ts (states over the mock, 390/1440 screenshots)

- **Tech notes:** 11 §3; branch `2672733` join/consent screens are reused later (X2.6); never render branding for a non-ACTIVE host.
- **Definition of Done:** npm test + build green; Playwright green; 11 §3.2 table matches the component's state union (type-level exhaustiveness). Plus the common DoD in `06-phase-plan.md` §5.

### X2.4 — Org Admin Dashboard on real data: tiles (consultants, licensed, available, activity, applications, interviews, placements, pending approvals), subscription summary, alerts, quick actions, activation checklist (reworked from 18f2123)
- **Epic:** X2 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X2.2, X1.6, X1.10 · **Relates:** O2.7, O7.4
- **Persona:** Org Admin (Priya) after sign-in
- **Objective:** The landing page for administrators, every widget wired to a real source or an honest empty/unavailable state, never a fake number.
- **Story:** As an org admin, I want to land on a dashboard that shows my organization's real state and the next things to do, so that I never have to visit a generic employee page first.

**Functional requirements**
- API: GET /api/orgs/{orgId}/dashboard (OrgDashboardService) returning per-widget {state: ok|empty|unavailable|error, data, reason} per 14 §2.2; module-gated widgets omitted; deltas computed from the previous 30 days; alerts per 14 §2.3 with per-member dismissal (org_setting-like table org_member_dismissal(org_id, member_id, key, until) additive); GET …/onboarding reworked per 14 §2.4 (new rows branding/roles/teams/domain/licenses; `available` flags).
- Rework 18f2123: re-verify OrgOverviewRepository consent-scoped counts (SUMMARY+ only), keep its OrgDashboardIT cases, drop sample data; dual-serve `/overview` for the kiwiply.com console until it is retired.
- Web: web/src/components/ent/dashboard/{OrgAdminDashboard.tsx, widgets.ts (registry), Alerts.tsx, Checklist.tsx}; page /w/admin; hero with MascotPose greet (first visit of the day, dismissable, localStorage try/catch); quick actions per 14 §2.5 shown by permission with "soon" chips for modules not yet built.
- Add `dashboard.view_org` to OWNER/ORG_ADMIN templates (RoleTemplateSeeder + 05 §3 doc) — doc-sync test updated.

**UI requirements**
- Layout 14 §2.1 at 390/1440; AdminStatTiles (promoted) with real deltas only; per-widget skeleton/empty/error; natural page scroll; one mascot max.

**Backend requirements**
- service/ent/OrgDashboardService, OrgAlertsService, OrgOnboardingService (reworked), web/rest/ent/OrgDashboardResource; OrgIsolationIT coverage

**Database changes**
- org_member_dismissal (org_id, member_id, key, until, PK (org_id, member_id, key)) additive

**APIs**
- GET /api/orgs/{orgId}/dashboard (dashboard.view_org)
- GET /api/orgs/{orgId}/onboarding (admin templates)
- POST /api/orgs/{orgId}/dashboard/alerts/{key}/dismiss (self)

**Permissions**
- dashboard.view_org; each widget additionally its own key (14 §2.2); EXECUTIVE_VIEWER gets counts only

**Feature entitlements**
- widgets licensed/available/activity/finance appear only when their module flag allows the org

**Acceptance criteria**
- E2E-A: acme-admin signs in on acme.localhost and the first rendered page is /w/admin with real tile values from the fixtures (42 consultants etc.); no /me, no generic home in between.
- With flag.enterprise.billing off for acme, the licensed tile and subscription MRR are absent from the API response and the page shows the status-only subscription card; turning the flag on (allow list) makes the widget appear without a deploy.
- A consultant who shares NONE is not counted in applications/interviews (consent test from 18f2123 kept).
- Alerts: a SUSPENDED hostname produces DOMAIN_SUSPENDED linking to /w/admin/domains; dismissing hides it for 7 days for that member only.
- Checklist hides when complete and the celebrate toast fires exactly once (session dedupe).
- EXECUTIVE_VIEWER calling the endpoint gets counts-only payloads (no names in recent activity).

**Test cases**
- OrgDashboardResourceIT (permission omission, module gating, consent counts, alerts, dismissal)
- OrgOnboardingServiceTest
- RoleTemplateDocSyncTest update
- web dashboard.test.tsx (widget states, greet once)
- Playwright org-admin-home.spec.ts (E2E-A to dashboard; 390/1440)

- **Tech notes:** 14 §2; 18f2123 is prior art, not truth; 404 semantics on org routes; AnimatedNumber respects reduced motion.
- **Definition of Done:** openapi regenerated; CI green; progress-tracker; 14 §2.2 table matches the widget registry (doc-sync test). Plus the common DoD in `06-phase-plan.md` §5.

### X2.5 — Organization Branding page: logo/favicon/banner upload (S3 org/{id}/…), colours with contrast validation, welcome copy, terminology and nav prefs (allow-listed), draft → publish, config_version bump
- **Epic:** X2 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X1.2, X2.2, X2.12, X2.13 · **Relates:** O13.1
- **Persona:** Org Admin configuring Acme's look
- **Objective:** Brand the portal at runtime — draft, preview, publish, restore — with no deployment and no unreadable colour.
- **Story:** As an org admin, I want to upload our logo, pick our colours and words, preview the login and publish when ready, so that employees see Acme's portal and I can undo a mistake.

**Functional requirements**
- API: GET /api/orgs/{orgId}/branding → {published, draft, draftVersion, versions[]}; PATCH …/branding/draft (If-Match draftVersion; partial object; validation per 11 §1.1; PII scan on text; terminology/nav keys allow-listed); POST …/branding/publish (full validation, derive theme (X2.12), copy draft→columns, published_at, org_branding_version row, config_version++, audit BRANDING_PUBLISH MEDIUM with changed keys); POST …/branding/discard; POST …/branding/versions/{n}/restore (into draft); POST …/branding/assets/{logo|favicon|banner} multipart (magic bytes, dimensions, size limits, re-encode, key org/{orgId}/branding/{kind}-{hash}.{ext}), DELETE same.
- Web /w/admin/branding: sections Identity (display name), Logo/Favicon/Banner (ResumeUpload-style drop zones from packages/ui, previews), Colours (three pickers + hex input + "Adjusted for readability" chips from preview-theme), Welcome copy, Theme (LIGHT/DARK/SYSTEM), Terminology (allow-listed table), Navigation (hide/reorder per workspace, SortableList), Powered-by (LOGIN_ONLY/LOGIN_AND_FOOTER); live preview column (login card + shell header from the draft); header actions: "Open draft login", "Publish" (enabled only when draft ≠ published), "Discard draft"; History drawer with Restore.
- Autosave per field into the draft (800 ms, If-Match, inline ✓, undo toast per field); publish = the only explicit action (it is a release, not a save).
- Dashboard alert BRANDING_DRAFT when a draft is > 24 h old (X2.4 reads published_at vs draft updated_at).

**UI requirements**
- 11 §1 fields and limits; draft-vs-published badge; preview at 390 width inside the page on desktop; reduced to stacked sections on phone; tenant tokens only.

**Backend requirements**
- service/ent/OrgBrandingService, BrandingAssets (ImageIO validation + re-encode), web/rest/ent/OrgBrandingResource, Terminology allow-list, NavPrefs allow-list

**Database changes**
- org_branding_version (org_id, version_no, snapshot_json, published_at, published_by_member_id; unique (org_id, version_no)); org_branding.draft_version INT default 0, draft_updated_at; powered_by VARCHAR(20) default LOGIN_ONLY

**APIs**
- GET/PATCH /api/orgs/{orgId}/branding(/draft)
- POST …/branding/publish | /discard | /versions/{n}/restore
- POST/DELETE …/branding/assets/{kind}

**Permissions**
- branding.manage (ORG) for everything; member.view_summary may read published only

**Feature entitlements**
- —

**Acceptance criteria**
- Uploading a 3 MB banner → 413 BRANDING_ASSET_TOO_LARGE; an SVG logo → 415; a 40 px logo → 422 BRANDING_ASSET_TOO_SMALL; a valid PNG is stored under org/{acme}/branding/ and never under another org's prefix (isolation IT: beta cannot fetch it).
- Changing the primary colour autosaves into the draft; GET /api/public/tenant still returns the published colour until publish; after publish the public DTO changes within one request (config_version eviction).
- Publishing with a mid-grey primary succeeds and the response carries adjusted: ["primary"]; the login renders with the derived ink (contrast ≥ 4.5 asserted in the test).
- Restore version 2 fills the draft; publish writes version 4 (versions are append-only).
- Draft preview URL works only for a branding.manage member; a consultant gets the published login.
- Every publish/restore/asset change writes one audit row; discard writes none.

**Test cases**
- OrgBrandingResourceIT (validation matrix, draft/publish/restore, assets, isolation, audit)
- BrandingAssetsTest (magic bytes, re-encode strips EXIF)
- web branding.test.tsx (autosave, preview, publish enablement)
- Playwright branding.spec.ts (upload → publish → login shows it, 390/1440)

- **Tech notes:** 11 §1; OrgStorageKeys prefix helper (04 §4); ImageIO + a WebP reader (TwelveMonkeys, Apache-2.0) are API-side additions; no SVG.
- **Definition of Done:** openapi regenerated; CI green; 11 §1.1 limits match validators (doc-sync constants test). Plus the common DoD in `06-phase-plan.md` §5.

### X2.6 — Login-first routing on tenant hosts: proxy rewrite to the tenant route tree, unauthenticated → BrandedLogin, authenticated member → primary workspace home, join pages branded (from 2672733, re-verified)
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** Web, API · **Deps:** X2.3, X1.8, X2.2 · **Relates:** O2.3
- **Persona:** Anyone visiting a tenant host; an invitee accepting on careers.acme.com
- **Objective:** Every tenant URL is login-first and branded; invites are accepted on the tenant host without ever creating a tenant session for a non-member.
- **Story:** As a visitor, I want any Acme address to show Acme's sign-in or take me straight to my workspace, and as an invitee I want to accept on Acme's own domain, so that I never land on the public site or another company.

**Functional requirements**
- proxy.ts: on non-platform hosts rewrite every non-API/non-static path to /_t{path}{search}; set tenant security headers (11 §7) and X-Robots-Tag; refresh logic unchanged but sends the host header so the API refuses tid/host mismatches.
- Route tree web/src/app/(tenant)/_t/ per 16 §2.3: `/` redirect page (member → landing, else /login); login (X2.3); forgot/reset/activate wrappers (branded, links on this host); join/t/[token] and join/[slug]/[code] from 2672733 (ConsentScreen reused) with the branches in 12 §5; a platform host hitting /_t/* → notFound().
- API: /api/authenticate on a tenant host accepts X-Kiwiply-Invite {token} to mint a tid-less pair for a valid pending invite of that tenant (audit LOGIN_FOR_INVITE); POST /api/join/{token}/accept on a tenant host returns a fresh tid/hid pair which the BFF writes (replacing cookies); signup on tenant hosts allowed only with a valid invite token (POST /api/register gains inviteToken; else 404 on tenant hosts).
- TenantUrls used by every link the join/verify/reset mails carry (X2.10).

**UI requirements**
- Join preview card branded (logo, name, invited-as roles, what the org sees); consent screen unchanged (SUMMARY recommended / NONE); "You're in" screen with MascotPose celebrate + [Go to my workspace]; email-mismatch panel per 12 §5.

**Backend requirements**
- AuthenticateController invite-token path, JoinResource tenant return pair, AccountResource register with invite, TenantRouting headers

**Database changes**
- —

**APIs**
- POST /api/authenticate (+X-Kiwiply-Invite)
- POST /api/join/{token}/accept → {accessToken, refreshToken} on tenant hosts
- POST /api/register {…, inviteToken} on tenant hosts

**Permissions**
- public until accept; invite token bound to the tenant

**Feature entitlements**
- —

**Acceptance criteria**
- GET https://acme.localhost/ signed out → 307 /login (branded); signed in as acme-admin → 307 /w/admin; GET /w/admin signed out → /login?next=/w/admin and back after sign-in.
- GET https://acme.localhost/dashboard (a personal-app path) renders the tenant 404 state, never the personal dashboard; GET kiwiply.com/_t/login → 404.
- Invite flow: signed-out invitee with no account on acme.localhost → signup (only with the token) → verification link on acme.localhost → join → consent → accepted → cookies now carry tid=acme → lands on /w/consultant; at no point before accept does a tid=acme cookie exist (cookie assertions in Playwright).
- Accepting an acme invite while signed in as a different email → 409 INVITE_EMAIL_MISMATCH panel; with org.invite.require_email_match=false for acme → accepted and audited.
- Security headers present on every tenant response (CSP, frame DENY, nosniff, noindex); absent/unchanged on kiwiply.com.

**Test cases**
- proxy.test.ts (rewrite matrix, headers)
- TenantLoginFlowIT (invite-token login, accept returns pair, register gate)
- JoinResourceIT tenant cases extended
- Playwright tenant-join.spec.ts + tenant-routing.spec.ts (390/1440)

- **Tech notes:** 12 §4–§5, 16 §2.3; Next 16 proxy rewrite; keep (marketing)/(app)/(admin)/(org) untouched on platform hosts.
- **Definition of Done:** openapi regenerated; CI green; 12 §5 diagram matches the implemented branches. Plus the common DoD in `06-phase-plan.md` §5.

### X2.7 — Basic user profile surface (avatar menu): photo, name, work email, phone, title, timezone, language, notification prefs, security, memberships and roles (read-only)
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X2.2
- **Persona:** Any member (also personal users on kiwiply.com)
- **Objective:** One basic profile per person, reachable only from the avatar menu, autosaving, separate from career and organization profiles.
- **Story:** As a member, I want to manage my name, photo, contact details, timezone, security and see my memberships in one place that is never forced on me after login, so that my identity is consistent everywhere without the profile becoming a dashboard.

**Functional requirements**
- API: GET/PATCH /api/account/profile (user-scoped; accepts tid tokens) → {firstName, lastName, title, phone, email, imageUrl/avatarUrl, langKey, tz}; validation (names 1–50, title ≤ 80, phone E.164, tz IANA, langKey allow-list); tz written to NotificationPreference; PII scan on names/title; POST/DELETE /api/account/photo (re-encode 512²/96², key user/{uid}/avatar-{hash}.jpg, previous key returned for undo, 7-day purge job); GET /api/account/sessions, POST …/sessions/{fam}/revoke, POST …/sessions/revoke-all (RefreshTokenService + new columns); GET /api/me/orgs extended with roles[] and consent scope.
- On tenant hosts the title mirrors into org_member.title when the org has not set one (org-set wins, labelled).
- Web /me (tenant tree and platform `/me` route) per 13 §2: sections Identity, Contact, Preferences, Notifications (existing component), Security, Memberships, Danger (platform only); autosave via use-save; undo toasts; SaveStatusChip; AccountMenu gains "My profile" first on AppShell, AdminShell, EnterpriseShell; no redirect to /me anywhere.

**UI requirements**
- 13 §2.1 wireframes (390/1440); read-only work email on tenant hosts with the ⓘ reason; InitialsAvatar fallback; no Save buttons.

**Backend requirements**
- web/rest/AccountProfileResource, AccountPhotoService, AccountSessionsResource, MyOrgService extension, AvatarPurgeJob

**Database changes**
- jhi_user.phone VARCHAR(32) NULL, title VARCHAR(80) NULL, avatar_key VARCHAR(255) NULL; refresh_token.org_id BIGINT NULL, user_agent VARCHAR(80) NULL, last_used_at DATETIME(6) NULL (additive, 20261016xxxxxx_ent_profile.xml)

**APIs**
- GET/PATCH /api/account/profile
- POST/DELETE /api/account/photo
- GET /api/account/sessions, POST /api/account/sessions/{fam}/revoke, POST /api/account/sessions/revoke-all
- GET /api/me/orgs (+roles, consent)

**Permissions**
- self only; member.view_summary/view_full govern what others see elsewhere

**Feature entitlements**
- —

**Acceptance criteria**
- PATCH with a DOB-looking title ("DOB 01/02/1990") → 422 SENSITIVE_CONTENT; a phone "+1 555 0100" saves; tz "Europe/Berlin" updates NotificationPreference.tz.
- Photo upload 5 MB → 413; a JPG with EXIF is stored without EXIF at 512²; DELETE then undo restores the previous key.
- Sessions list shows "Acme workspace" for tid sessions and "Personal" otherwise; revoke-all ends every refresh family and the extension signal fires on kiwiply.com.
- After login nothing navigates to /me (route test + Playwright: landing is the workspace home); /me opens from the avatar menu on both hosts.
- Memberships section lists Acme with roles from org_member_role and the consent scope; "Leave" is absent for OWNER.
- Field edits show the inline ✓ and the quiet chip; a 5xx shows the retry state; no Save button exists in the DOM.

**Test cases**
- AccountProfileResourceIT, AvatarUploadIT, SessionsResourceIT, MyOrgServiceTest
- web me.test.tsx, AccountMenu.test.tsx update
- Playwright profile.spec.ts (390/1440)

- **Tech notes:** 13; ADR-006; the career profile editor is untouched; purge job follows *PurgeJob pattern.
- **Definition of Done:** openapi regenerated; CI green; no personal-flow regression (settings.spec.ts still green). Plus the common DoD in `06-phase-plan.md` §5.

### X2.8 — MascotPose wrapper in packages/ui with the enterprise pose map; empty states and celebrations use it compactly
- **Epic:** X2 · **Size/Complexity:** S/S · **Owners:** UI, Web · **Deps:** —
- **Persona:** Every enterprise surface
- **Objective:** One shared character, one fixed pose map, compact sizes, reduced-motion safe — no surface path-hunts for art.
- **Story:** As a developer, I want `MascotPose pose="empty"` to render the right compact Kiwiply character with the right motion so that every empty state, greeting and celebration looks consistent and organizations never get a different mascot.

**Functional requirements**
- packages/ui/src/primitives/MascotPose.tsx + MascotProvider (asset base, default "/v2"); MASCOT_POSES map per 11 §6 (welcome, greet, empty, encourage, celebrate, warn, error, peek → existing files + motion class + native size); sizes sm 48 / md 80 / lg 120 (phone caps md); alt="" aria-hidden; lazy except welcome; motion only when !prefersReducedMotion; export from the barrel.
- EmptyState gains `mascotPose?: EnterprisePose` (keeps the `mascot` boolean for the doodle); ErrorState gains the same; ConfettiBurst pairing helper `celebrate(eventId)` deduped per session.
- Copy deck web/src/lib/ent/mascot-copy.ts (3–5 lines per pose, terminology-aware, seeded pick) — used by the dashboard greet and the consultant home.
- Usage lint (ESLint, warn): more than one MascotPose in a page component file.

**UI requirements**
- Caps per 11 §6: one per viewport, never in tables/rows/sidebar (except Need-help card), greeting once per day and dismissable.

**Backend requirements**
- —

**Database changes**
- —

**APIs**
- —

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Each pose renders the mapped file at the requested size with aspect preserved; snapshot per pose × size.
- With prefers-reduced-motion the element has no motion class; without, it has the mapped one.
- EmptyState mascotPose="empty" renders the peek art above the title; the doodle path still works for `mascot`.
- Replacing a file name in the map changes every usage (one-line change test).

**Test cases**
- packages/ui MascotPose.test.tsx, EmptyState.test.tsx update
- web mascot-copy.test.ts

- **Tech notes:** 11 §6; assets stay in web/public/v2 (README there); the extension passes its own base if it ever renders one.
- **Definition of Done:** packages/ui tests green; README in packages/ui lists MascotPose; no new assets required. Plus the common DoD in `06-phase-plan.md` §5.

### X2.9 — Organization Settings page (separate from the basic profile): name/display name, contact, addresses, timezone, policies (org_setting overrides), subdomain display
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X2.2, X1.2
- **Persona:** Org Admin
- **Objective:** The organization profile and its policies, admin-configured and autosaving, clearly apart from the person's profile.
- **Story:** As an org admin, I want to manage Acme's identity, contacts and policies in one settings page so that organization configuration never mixes with my own profile.

**Functional requirements**
- API: OrgSettingsResource per 14 §4.1 (GET list of orgOverridable keys with source/default/history; PUT with reason for HIGH; DELETE reset; audit ORG_SETTING; config_version bump for DTO-affecting keys); EnterpriseSettingKeys.ORG_OVERRIDABLE = org.invite.require_email_match, org.consent.request_cooldown_days, org.security.mfa_required, org.domains.redirect_non_primary, org.domains.subdomain_mode, org.domains.max_custom, org.attention.inactive_days, org.dashboard.greeting, org.contact.support_email, org.addresses; OrgSettings.get(orgId, key) resolution helper with per-request cache; PATCH /api/orgs/{orgId} gains displayName.
- Web /w/admin/settings per 14 §4: sections Identity, Contact & addresses, Branding (link), Domains (subdomain read-only + link), Policies (each with platform default + Reset + history), Team configuration (links), Integrations (soon), Subscription (status; dev-activate in dev), Danger zone (transfer, close — existing flows with ConfirmTypedSheet).
- Autosave per field; HIGH keys (mfa_required) open ReasonSheet before saving; undo toasts for the rest.

**UI requirements**
- Anchored sections; phone stacked; SaveStatusChip; HistoryDrawer per policy key; addresses as repeatable cards (label, lines, city, region, postal, country) with PII scan on free text.

**Backend requirements**
- service/ent/OrgSettingsService (+OrgSettings helper), web/rest/ent/OrgSettingsResource, EnterpriseSettingKeys additions, OrgResource displayName

**Database changes**
- org_setting (X1.2) + org_setting_history (org_id, key, from_json, to_json, reason, actor_member_id, at) additive

**APIs**
- GET /api/orgs/{orgId}/settings
- PUT/DELETE /api/orgs/{orgId}/settings/{key}
- PATCH /api/orgs/{orgId} (+displayName)

**Permissions**
- org.settings.manage (ORG); OWNER-only for transfer/close

**Feature entitlements**
- —

**Acceptance criteria**
- PUT org.security.mfa_required=true without a reason → 422 REASON_REQUIRED; with a reason → saved, audited risk HIGH, public DTO login.mfaRequired flips within one request.
- PUT a key not in ORG_OVERRIDABLE (e.g. flag.enterprise) → 404; a wrong type → 422.
- DELETE resets to the global value and the list shows source GLOBAL.
- Address text containing a 9-digit SSN pattern → 422 SENSITIVE_CONTENT.
- The page is reachable only via /w/admin/settings and the dashboard quick action; /me never links to it; a consultant gets the not-part-of-your-role state.

**Test cases**
- OrgSettingsResourceIT (allow-list, HIGH reason, reset, audit, config_version, isolation)
- OrgSettingsTest (resolution order)
- web org-settings.test.tsx
- Playwright org-settings.spec.ts (E2E-A "opens separate organization settings")

- **Tech notes:** 14 §4; SettingDefinitions typing reused (type/range validation lives in the definition); PATCH /api/orgs exists (branch A problem mapping).
- **Definition of Done:** openapi regenerated; CI green; 06 §3 flag table unchanged; 14 §4 table matches ORG_OVERRIDABLE (doc-sync test). Plus the common DoD in `06-phase-plan.md` §5.

### X2.10 — Tenant-aware URL building (TenantUrls) for mail, notifications and redirects; notification kinds for org events
- **Epic:** X2 · **Size/Complexity:** S/S · **Owners:** API · **Deps:** X1.2, X1.3
- **Persona:** The API (mail and notifications)
- **Objective:** Every link an org member receives points at the org's own live host, built only from hostname rows, never from a request header.
- **Story:** As the API, I want one `TenantUrls` builder and the org notification kinds so that invitations, verifications, resets and alerts take people to the branded host they belong to.

**Functional requirements**
- service/ent/TenantUrls: base(org) = primary ACTIVE hostname with cert_state ISSUED → else SUBDOMAIN ACTIVE → else platform SITE_URL; joinLink, verifyLink, resetLink, workspaceLink(org, path); never reads TenantContext.host (T12).
- MailService templates take MailBranding {displayName, logoUrl (public asset URL, X2.13), primaryColor (published)} with Kiwiply defaults; subjects prefixed with the display name for org mails.
- NotificationKind additions: ORG_INVITE_ACCEPTED, ORG_ROLE_CHANGED, ORG_SUSPENDED_ME, ORG_OFFBOARDED_ME, ORG_MANAGER_CHANGED, DOMAIN_VERIFIED, DOMAIN_SUSPENDED, DOMAIN_CERT_FAILED, BRANDING_PUBLISHED (admins, batched), LOGIN_MFA_CODE (transactional); payloads carry orgId for display only; the notification matrix gains an "Organization" group with defaults (in-app on, email on for DOMAIN_* and *_ME).
- Web /api/auth/* and the join pages read `landing`/`next` from the API, never build cross-host URLs client-side.

**UI requirements**
- Notification preferences page shows the new group (existing component reads the matrix).

**Backend requirements**
- service/ent/TenantUrls, MailService/MailBranding, NotificationKind, NotificationService.publish(orgId?, …) overload

**Database changes**
- —

**APIs**
- —

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- TenantUrlsTest table: {custom ISSUED} → custom; {custom ACTIVE but cert REQUESTED} → subdomain; {no hostnames} → kiwiply.com; a forged X-Kiwiply-Host never changes the result.
- OrgInviteEmailIT: an acme invite email contains https://careers.acme.localhost/join/t/… and Acme's name/logo when the host is live, kiwiply.com otherwise.
- Each new kind round-trips through the matrix with the specified defaults (NotificationPreferenceTest).

**Test cases**
- TenantUrlsTest
- OrgInviteEmailIT extension
- NotificationKindTest / matrix defaults

- **Tech notes:** 10 §6, 12 §4; existing MAIL_BASE_URL stays the platform default; no header-derived hosts anywhere (ArchUnit rule: TenantUrls has no dependency on TenantContext).
- **Definition of Done:** CI green; 04 §6 T12 control implemented and tested. Plus the common DoD in `06-phase-plan.md` §5.

### X2.11 — E2E-A (to dashboard) and E2E-B (multi-role switcher) Playwright journeys over the mock at 390 px and desktop
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** QA, Web · **Deps:** X2.3, X2.4, X2.6, X2.7, X2.9, X1.12
- **Persona:** QA
- **Objective:** Scenarios A (up to the dashboard and the separate settings/profile) and B are executable gates in CI at both viewports.
- **Story:** As QA, I want the Phase 2 journeys automated over the mock so that branding, login-first routing, landing, the switcher and the profile/settings separation cannot regress.

**Functional requirements**
- web/e2e/journeys/ent/e2e-a.spec.ts: acme.localhost → branded login (screenshot) → sign in as acme-admin → first page is /w/admin with real fixture tiles → avatar → /me (basic profile) → back → Settings (/w/admin/settings) → Employees; asserts no personal-app DOM, no marketing links, title template, favicon link.
- web/e2e/journeys/ent/e2e-b.spec.ts: sarah (ORG_ADMIN + MARKETING_MANAGER) → lands /w/admin → switcher lists two → switch to /w/marketing-mgmt → /w/hr refused in-shell → /me identical on both → "Open Marketing first" → next login lands /w/marketing-mgmt.
- tenant-isolation.spec.ts (X1.9) extended with branding per host and unknown-host screenshots.
- Fixtures: sarah account with two roles; screenshots under web/e2e/__screenshots__/ent/ at 390 and 1440; helper withHost shared.

**UI requirements**
- —

**Backend requirements**
- —

**Database changes**
- —

**APIs**
- mock only

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Both specs pass in CI at 390 and 1440; failures include screenshots; runtime ≤ 90 s combined.
- Deliberately removing the landing redirect fails e2e-a; deliberately showing the switcher for single-workspace members fails e2e-b (documented mutation checks).

**Test cases**
- Themselves; ci.yml unchanged (pattern discovery).

- **Tech notes:** Playwright storage state per account; Host emulation helper from X1.12.
- **Definition of Done:** CI green; HANDOFF lists the journeys; progress-tracker rows. Plus the common DoD in `06-phase-plan.md` §5.

### X2.12 — Contrast-safe tenant theme derivation (BrandingTheme) in the public DTO, theme-tenant.css token remap in packages/ui, hex-literal lint for tenant surfaces
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** API, UI · **Deps:** X1.3
- **Persona:** The API and the design system
- **Objective:** Customer colours become a complete, WCAG-AA-safe variable set on the server; primitives re-skin through a token remap; no per-tenant build and no hex in tenant code.
- **Story:** As the platform, I want every organization's colours turned into readable tokens at runtime so that any brand looks right in every component without anyone hand-checking contrast.

**Functional requirements**
- api/service/ent/BrandingTheme.derive(branding) → light + dark sets per 11 §2.1 using the rules in 11 §4.1 (ink choice, OKLCH lightness stepping, soft mixes, nav pair); result cached with the branding; included in PublicTenantDTO.theme; adjusted[] list returned to the Branding page via GET …/branding/preview-theme?primary=&secondary=&accent= (branding.manage).
- packages/ui/styles/theme-tenant.css per 11 §2.2 (remaps accent/org-blue/blue families only; status colours and surfaces untouched); web globals import it; TenantThemeProvider writes inline variables + .dark per mode.
- packages/ui/src/color/contrast.ts (same math, used by tests/previews) + doc-sync fixture table shared with the Java test (JSON under packages/ui/src/__fixtures__/contrast-golden.json).
- ESLint rule kiwiply/no-hex-in-tenant for web/src/app/(tenant)/** and web/src/components/ent/**.

**UI requirements**
- No visible UI beyond the Branding page chips (X2.5 consumes preview-theme).

**Backend requirements**
- service/ent/BrandingTheme, PublicTenantDTO.theme, OrgBrandingResource.previewTheme

**Database changes**
- —

**APIs**
- GET /api/public/tenant (+theme)
- GET /api/orgs/{orgId}/branding/preview-theme (branding.manage)

**Permissions**
- public DTO; preview requires branding.manage

**Feature entitlements**
- —

**Acceptance criteria**
- Golden table (24 colours) passes in Java and TS with identical outputs (hex equality after rounding).
- Property test over 2 000 random sRGB colours: every pair in 11 §4.1 meets its minimum ratio in both light and dark sets.
- A `#808080` primary yields adjusted: ["primary"] and text ratio ≥ 4.5; `#94BD37` yields the Kiwiply defaults unchanged.
- Rendering Button/Badge/Tabs inside .theme-tenant with a blue primary uses the tenant variables (computed-style test) while danger stays #A23B2E.
- A hex literal added under web/src/components/ent fails lint in CI.

**Test cases**
- BrandingThemeTest (golden + property)
- packages/ui contrast.test.ts (golden parity)
- theme-tenant.test.tsx (computed styles)
- eslint rule test

- **Tech notes:** 11 §2, §4; pure functions, no colour library; keep derivation ≤ 2 ms per org (cached by config_version).
- **Definition of Done:** CI green; 11 §4.1 thresholds asserted by tests; tokens.css untouched. Plus the common DoD in `06-phase-plan.md` §5.

### X2.13 — Public tenant assets (logo, favicon, banner) served by host with caching; per-tenant favicon and title template in the tenant layout
- **Epic:** X2 · **Size/Complexity:** S/S · **Owners:** API, Web · **Deps:** X1.3, X1.4
- **Persona:** Any visitor of a tenant host
- **Objective:** Branding images load fast and only for live tenants; every tab shows the organization's icon and name.
- **Story:** As a visitor, I want Acme's favicon and title on every page and its logo to load instantly so that the portal feels like Acme's own product.

**Functional requirements**
- API GET /api/public/tenant/assets/{logo|favicon|banner} (permitAll; resolved by host; ACTIVE/PAST_DUE only; 404 otherwise; streams S3/local object; Cache-Control public max-age=86400; ETag = key hash; HEAD supported; rate-limited per host+IP).
- Web BFF /tenant-assets/{kind}?v={config_version} proxies it with the same cache headers (browser never calls the API host); next.config images unaffected.
- Tenant layout generateMetadata(): title template "%s · {displayName}", default displayName; icons from /tenant-assets/favicon?v= when set, else Kiwiply; apple-touch-icon likewise; no og:* on tenant hosts; unknown host title "Workspace unavailable".

**UI requirements**
- Logo slot in the shell header and login reads /tenant-assets/logo?v=; dark-mode paper plate behind transparent logos (11 §4.4).

**Backend requirements**
- web/rest/PublicTenantAssetResource, OrgBrandingAssets.read(orgId, kind)

**Database changes**
- —

**APIs**
- GET/HEAD /api/public/tenant/assets/{kind}
- GET /tenant-assets/{kind} (BFF)

**Permissions**
- public for ACTIVE/PAST_DUE tenants

**Feature entitlements**
- —

**Acceptance criteria**
- acme.localhost/tenant-assets/favicon returns Acme's PNG with max-age=86400 and an ETag; If-None-Match → 304; nobody.localhost → 404; a SUSPENDED org → 404 within one request of suspension.
- Beta's logo cannot be fetched through acme's host (the host selects the org, never a parameter) — isolation IT.
- The HTML head of /w/admin contains <title>Home · Acme Talent</title> and the favicon link with v=config_version; after a publish the v changes (cache bust).

**Test cases**
- PublicTenantAssetResourceIT (cache headers, 304, isolation, suspended)
- web tenant-assets route test, layout metadata test
- Playwright assertion in e2e-a

- **Tech notes:** 11 §5; OrgStorageKeys; FileStorage seam (local/S3).
- **Definition of Done:** openapi regenerated; CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X2.14 — Org-enforced sign-in code (email MFA) on tenant hosts via org.security.mfa_required; LoginMfaService generalises AdminMfaService
- **Epic:** X2 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X2.3, X2.9
- **Persona:** Security-minded org admin; every member of an org that requires it
- **Objective:** An organization can require a second factor for every sign-in on its hosts today, with the emailed-code flow that already exists for admins; TOTP/passkeys come with SSO later.
- **Story:** As an org admin, I want to require a sign-in code for everyone in Acme so that a leaked password alone cannot open our portal.

**Functional requirements**
- LoginMfaService (rename/extend AdminMfaService; AdminMfaService stays as a thin alias): shouldChallenge(user, tenantContext) = ROLE_ADMIN (as today) OR TenantContext is TENANT and OrgSettings.get(orgId, org.security.mfa_required); startChallenge mints mfaToken (10 min, 5 attempts, per-user rate limit 3 codes / 15 min) and sends LOGIN_MFA_CODE mail via TenantUrls/MailBranding; verify issues the tid/hid pair.
- Applies to /api/authenticate and /api/auth/google on tenant hosts; refresh is unaffected; extension session unaffected.
- Public DTO login.mfaRequired = the org setting (so the login card shows "Your organization requires a sign-in code" under the button).
- Audit LOGIN_MFA_CHALLENGED / PASSED / FAILED with hostname_id (risk LOW/LOW/MEDIUM); 5 failures → LOGIN_MFA_LOCKED (15 min) + notification SECURITY to the user.
- Web: the MFA state of BrandedLogin (X2.3) already handles {mfaRequired, mfaToken}; this story adds the resend (30 s) and the lock message.

**UI requirements**
- Code step per 11 §3.1 states; masked email; resend timer; lock copy "Too many attempts. Try again in 15 minutes."

**Backend requirements**
- service/LoginMfaService, AuthenticateController, GoogleAuthController, OrgSettings read, mail template loginMfaCode.html

**Database changes**
- None (challenges in memory/DB as AdminMfaChallenge today; add org_id column to admin_mfa_challenge if persisted — additive)

**APIs**
- POST /api/authenticate → {mfaRequired, mfaToken} on tenant hosts when required
- POST /api/authenticate/mfa (existing) → tid/hid pair
- POST /api/authenticate/mfa/resend {mfaToken} (new, rate-limited)

**Permissions**
- setting change: org.settings.manage with reason (HIGH); challenge applies to every member

**Feature entitlements**
- —

**Acceptance criteria**
- With acme mfa_required=true, acme-consultant login returns mfaRequired; the code mail is sent with Acme branding and a link base of acme.localhost; a wrong code 5× locks for 15 min (429 MFA_LOCKED) and audits.
- With the setting false, non-admin logins behave exactly as before (regression: AuthenticateControllerIT unchanged cases pass).
- Platform-host (kiwiply.com) logins ignore org settings entirely.
- The public DTO reflects the setting within one request (config_version bump by X2.9).

**Test cases**
- LoginMfaServiceTest
- AuthenticateControllerIT tenant MFA cases
- web BrandedLogin MFA resend/lock tests
- Playwright tenant-login MFA path over the mock

- **Tech notes:** 11 §3.4; escalation B3 (08 §Session B); no TOTP here (X12.4).
- **Definition of Done:** openapi regenerated; CI green; security review note in 04 §7 (MFA on tenant hosts). Plus the common DoD in `06-phase-plan.md` §5.

### X3 — Phase 3 — Custom domains
_careers.acme.com: registration, ownership verification, on-demand certificates through the shared edge, activation, primary/redirect, suspension, removal, monitoring._

**Session B (fully specified).** Build order: X3.1 → X3.2 → X3.3 → X3.4 → X3.5 → X3.6 → X3.7 → X3.8. X3.6 (docs + rehearsal) may start with X3.3; the user applies the edge change (E5, answered 2026-10-12) once X3.3 is deployed; X3.7 is independent of X3.4–X3.5.

### X3.1 — Domains page + API: add custom hostname (PENDING), DNS instructions (TXT ownership token + CNAME to edge.kiwiply.com), verify now, status timeline
- **Epic:** X3 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X1.2, X1.11, X2.2, X2.9 · **Relates:** O2.6
- **Persona:** Org Admin adding careers.acme.com
- **Objective:** Register a customer-owned hostname safely (unique, validated, never a platform name) and tell the customer exactly which DNS records to create.
- **Story:** As an org admin, I want to add our own domain and get precise DNS instructions with a "verify now" button so that our portal lives at careers.acme.com.

**Functional requirements**
- API: POST /api/orgs/{orgId}/hostnames {hostname} (domains.manage; flag.enterprise.domains allows org; org ACTIVE/PAST_DUE; normalise + validate per 10 §1; global uniqueness via active_hostname_key; ≤ org.domains.max_custom; kind CUSTOM, status PENDING, verification_method DNS_TXT, token 32 base62; audit DOMAIN_ADD); GET …/hostnames (list with state, isPrimary, certState, lastCheck, lastCheckResult, timeline); GET …/hostnames/{hid}/instructions per 10 §3 (apex detection, A record for apex, provider hints, CAA note, proxy warning); POST …/hostnames/{hid}/verify (rate-limited 1/min per hostname; runs HostnameVerifier synchronously; returns the result code) — the verifier itself lands in X3.2, so this story ships it behind an interface with a stub that returns TXT_MISSING until X3.2 merges.
- Web /w/admin/domains: list card per hostname (subdomain row read-only with "Ask Kiwiply to change"), add dialog (hostname input with live validation and reserved/taken check), instruction card with copyable records (SavedTick on copy), "Verify now", status timeline DNS verified → Certificate → Live with relative times, troubleshooting panel (10 §4.4 copy), empty state "Your workspace is at acme.kiwiply.com. Add your own domain."
- Generated active_hostname_key column + unique index (additive changeset in this story since X1.2 shipped only the base table).

**UI requirements**
- 390/1440: cards; timeline as three StatusDot steps; instructions in a monospace table with per-row Copy; provider accordion; tenant tokens.

**Backend requirements**
- service/ent/OrgHostnameService, HostnameNames (normalise/validate), HostnameVerifier interface (+stub), web/rest/ent/OrgHostnameResource, DTOs

**Database changes**
- org_hostname.active_hostname_key (generated, unique), failing_since DATETIME(6) NULL, last_ask_at DATETIME(6) NULL, cert_issued_at DATETIME(6) NULL (additive 20261017xxxxxx_ent_domains.xml)

**APIs**
- GET /api/orgs/{orgId}/hostnames
- POST /api/orgs/{orgId}/hostnames
- GET /api/orgs/{orgId}/hostnames/{hid}/instructions
- POST /api/orgs/{orgId}/hostnames/{hid}/verify

**Permissions**
- domains.manage (ORG); list visible to org.settings.manage

**Feature entitlements**
- flag.enterprise.domains per org

**Acceptance criteria**
- POST "Careers.Acme.com." → stored "careers.acme.com"; "acme.kiwiply.com" → 422 HOSTNAME_INVALID RESERVED; "api.kiwiply.com" → 422; "co.uk" → 422 PUBLIC_SUFFIX; "xn--…" punycode accepted; a hostname active in beta → 409 HOSTNAME_TAKEN (no org named); a 6th custom host with max_custom=5 → 422 LIMIT.
- Instructions for "acme.com" return an A record to the edge IP and the apex note; for "careers.acme.com" a CNAME to edge.kiwiply.com; both include the TXT at _kiwiply-verify.{host}.
- Verify now twice within a minute → 429; the result code is shown with the mapped copy.
- Every call writes one audit row with hostname_id; beta's admin cannot list or verify acme's hostnames (404).

**Test cases**
- HostnameNamesTest (validation table)
- OrgHostnameResourceIT (+OrgIsolationIT coverage)
- web domains.test.tsx
- Playwright domains.spec.ts (add → instructions → verify stub, 390/1440)

- **Tech notes:** 10 §1–§4; OrgTenancyService from X1.11 is extended, not duplicated; dnsjava arrives in X3.2.
- **Definition of Done:** openapi regenerated; CI green; 10 §3 JSON shape matches the DTO. Plus the common DoD in `06-phase-plan.md` §5.

### X3.2 — Ownership verification job: TXT + CNAME/A checks (dnsjava), VERIFYING → VERIFIED, auto-activate, re-check every enterprise.domains.recheck_hours, grace then SUSPENDED, audit
- **Epic:** X3 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X3.1, X1.10
- **Persona:** The API (domain checks)
- **Objective:** Prove ownership and routing before a hostname can ever resolve to the org, and keep proving it.
- **Story:** As the platform, I want hostnames verified by DNS proof and re-checked on a schedule so that a domain a customer no longer controls stops serving their portal.

**Functional requirements**
- HostnameVerifier (dnsjava): TXT _kiwiply-verify.{host} == kiwiply-verify={token}; CNAME → enterprise.domains.edge_cname (3 hops) or apex A/AAAA ∈ edge IPs; diagnostics PROXIED (proxy_ranges), CAA_BLOCKS_LE, DNS_NXDOMAIN, DNS_ERROR; 3 s timeout, 2 retries, resolvers from setting or system.
- Transitions per 10 §2: VERIFYING → VERIFIED (+ auto-activate when enterprise.domains.auto_activate and flag allows → ACTIVE, config_version++); failures keep state and write last_check_result; ACTIVE failing → failing_since set; after grace_hours_before_suspend → SUSPENDED (config_version++, sessions revoked via hid check, notification DOMAIN_SUSPENDED + email).
- HostnameCheckJob per 10 §4.3 (10 min; per-org TenantScoped; VERIFYING always, PENDING > 5 min, ACTIVE older than recheck_hours; checks_per_run cap; 200 ms spacing; last-run marker setting).
- Resume (X3.5) re-runs the verifier synchronously before ACTIVE.

**UI requirements**
- —

**Backend requirements**
- service/ent/HostnameVerifier (impl), HostnameCheckJob, OrgHostnameService transitions, settings keys per 10 §10

**Database changes**
- None beyond X3.1 columns

**APIs**
- (internal) same verify endpoint now real

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Table-driven verifier test with a stubbed resolver: each 10 §4.4 code is produced by its fixture (TXT missing/mismatch, CNAME wrong target, apex wrong IP, proxied range, CAA blocking, NXDOMAIN, OK).
- A VERIFYING row with both checks passing becomes VERIFIED then ACTIVE (auto_activate=true) in one job run; with auto_activate=false it stays VERIFIED and the Domains page shows "Activate".
- An ACTIVE row failing for 72 h of runs (clock-controlled) becomes SUSPENDED with audit DOMAIN_SUSPENDED and one notification; a passing run in between clears failing_since.
- The job never checks more than checks_per_run rows per run and logs each org id under TenantScoped (LogCaptureIT).
- SuspendedHostnameIT (X1.9) still green: a SUSPENDED row resolves to UNKNOWN immediately.

**Test cases**
- HostnameVerifierTest (stub resolver table)
- HostnameCheckJobTest (clock, grace, caps)
- OrgHostnameServiceTest (transitions)
- SuspendedHostnameIT

- **Tech notes:** 10 §4; dnsjava dependency (Apache-2.0) added to api/build.gradle; never block a request thread on DNS except the explicit verify-now (10 s budget).
- **Definition of Done:** CI green; 10 §4.4 table = enum of result codes (doc-sync test). Plus the common DoD in `06-phase-plan.md` §5.

### X3.3 — Activation and certificates: ACTIVE enables the ask endpoint for the host; cert_state from ask hits + HTTPS probe job; troubleshooting panel; platform admin Domains page and Tenant Health rows
- **Epic:** X3 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X3.2, X1.3, X1.11
- **Persona:** Org Admin waiting for "Live"; platform admin watching issuance
- **Objective:** Know, honestly, whether a hostname is live, and explain why when it is not.
- **Story:** As an org admin, I want to see "DNS verified → Certificate → Live" with real status and plain-language fixes, and as a platform admin I want every hostname's state in one place.

**Functional requirements**
- InternalTenantHostResource: accept the token as query param `t` (constant-time; masked in access logs); on 200 record last_ask_at and cert_state NONE→REQUESTED; Micrometer counter kiwiply_tenant_ask_total{result}.
- HostnameProbeJob (5 min): HTTPS probe of REQUESTED hosts per 10 §5.4 (SNI, 10 s, optional probe_via_edge_ip) → ISSUED (+cert_issued_at, le_issuance row for the registered domain) or FAILED after 30 min with hint RATE_LIMIT/CAA/UNREACHABLE; notification DOMAIN_CERT_FAILED once per 24 h; a later success flips to ISSUED.
- LE weekly counter table le_issuance (registered_domain, hostname, issued_at); subdomain provisioning refuses with SUBDOMAIN_THROTTLED when ≥ 45 kiwiply.com issuances in 7 days; gauge kiwiply_hostname_state{state}.
- Org Domains page: timeline step 2/3 from cert fields; troubleshooting panel copy per 10 §4.4 incl. CERT_PENDING/CERT_FAILED hints; "Activate" button when VERIFIED and auto_activate is off (POST …/hostnames/{hid}/activate).
- Platform admin /admin/domains (admin kit): every hostname across orgs with org, kind, state, cert state, last check/result, last ask; filters; actions re-check / suspend / resume (ReasonSheet, X1.11 endpoints extended to CUSTOM rows); Tenant Health page rows: ask 200/404 rate (5 min), hostnames by state, check-job last run, LE counter.

**UI requirements**
- Org page: three-step timeline + panel; admin page: AdminHero → AdminStatTiles → AdminFilterBar + AdminTable; 390/1440.

**Backend requirements**
- InternalTenantHostResource, HostnameProbeJob, HostnameMetrics, LeIssuanceRepository, AdminDomainResource, admin Tenant Health service

**Database changes**
- le_issuance (id, registered_domain, hostname, issued_at; index (registered_domain, issued_at)) additive

**APIs**
- GET /api/internal/tenant-hosts/check?domain=&t= (200|404|401)
- POST /api/orgs/{orgId}/hostnames/{hid}/activate
- GET /api/admin/domains (filters, paging)
- POST /api/admin/domains/{hid}/recheck|suspend|resume
- GET /api/admin/tenant-health

**Permissions**
- domains.manage; ROLE_ADMIN for admin routes

**Feature entitlements**
- flag.enterprise.domains for CUSTOM rows at the ask endpoint

**Acceptance criteria**
- AskEndpointIT: ACTIVE custom row of an allowed org → 200 and last_ask_at set; the same row with the org removed from the flag allow list → 404; PENDING/VERIFIED/SUSPENDED/REMOVED → 404; missing/wrong t → 401; header token still accepted.
- Probe success flips REQUESTED → ISSUED and writes le_issuance; 31 minutes without success → FAILED with the hint; the org page shows "Certificate is being issued" then "Live".
- With 45 kiwiply.com issuances in 7 days, provisioning a subdomain → 429 SUBDOMAIN_THROTTLED with the date it frees up.
- Admin Domains lists acme and beta hostnames; suspend via ReasonSheet makes the host UNKNOWN within one request and writes both audit rows (admin + tenant log).
- kiwiply_tenant_ask_total increments per result in a metrics test.

**Test cases**
- AskEndpointIT (hardened)
- HostnameProbeJobTest (clock, hints)
- LeIssuanceTest
- AdminDomainResourceIT
- web admin-domains.test.tsx, domains timeline test
- Playwright admin-domains.spec.ts

- **Tech notes:** 10 §5, §7; the probe runs in the API container; never log the token; Caddy sends no headers, hence the query token.
- **Definition of Done:** openapi regenerated; CI green; DEPLOY.md gains a "tenant hosts" subsection pointing to 10 §8. Plus the common DoD in `06-phase-plan.md` §5.

### X3.4 — Primary domain and redirects: one primary per org; non-primary ACTIVE hosts 308 to the primary (org setting); subdomain reachable or redirecting per org setting; links built on the primary
- **Epic:** X3 · **Size/Complexity:** S/S · **Owners:** API, Web · **Deps:** X3.3, X2.6, X2.10
- **Persona:** Org Admin choosing careers.acme.com as the address employees use
- **Objective:** One canonical address per org with predictable redirects that never break API calls or mailed links.
- **Story:** As an org admin, I want to make our custom domain primary so that everyone ends up on careers.acme.com even if they open the old address.

**Functional requirements**
- PUT /api/orgs/{orgId}/hostnames/{hid}/primary (domains.manage; target ACTIVE + ISSUED else 409 HOST_NOT_LIVE; generated primary_key keeps one; config_version++; audit DOMAIN_PRIMARY).
- PublicTenantDTO gains primaryHost and redirect (= host ≠ primary && org.domains.redirect_non_primary && (kind ≠ SUBDOMAIN || subdomain_mode = REDIRECT) && primary ISSUED).
- Web (tenant) layout: when dto.redirect and the request is a GET/HEAD page (not /api, not /_next, not /join|/account/activate|/reset-password), answer 308 to https://{primaryHost}{path}{search}; TenantUrls (X2.10) already uses the primary.
- Domains page: "Make primary" per live host (undo toast re-points to the previous primary); settings rows for redirect_non_primary and subdomain_mode link to Settings.

**UI requirements**
- Primary badge on the card; confirmation inline (no dialog); the subdomain card explains its mode.

**Backend requirements**
- OrgHostnameService.setPrimary, PublicTenantDTO fields, web tenant layout redirect

**Database changes**
- None (is_primary + generated key exist)

**APIs**
- PUT /api/orgs/{orgId}/hostnames/{hid}/primary
- GET /api/public/tenant (+primaryHost, redirect)

**Permissions**
- domains.manage

**Feature entitlements**
- flag.enterprise.domains

**Acceptance criteria**
- Making a VERIFIED-but-not-ISSUED host primary → 409 HOST_NOT_LIVE; making an ISSUED one primary succeeds and the DTO for acme.kiwiply.com reports redirect=true (subdomain_mode REDIRECT) or false (REACHABLE, default).
- GET https://acme.localhost/w/admin/employees?x=1 with redirect=true → 308 Location https://careers.acme.localhost/w/admin/employees?x=1; POST /api/... on the same host is never redirected; a join link on the old host is served, not redirected.
- Undo after "Make primary" restores the previous primary within the toast window.
- Invite mail links use the new primary after the change (TenantUrlsTest).

**Test cases**
- OrgHostnameServiceTest.setPrimary
- PublicTenantResourceIT redirect fields
- web tenant layout redirect test
- Playwright domains.spec.ts primary step

- **Tech notes:** 10 §6; 308 (not 301) to preserve method semantics for any stray POST page submits.
- **Definition of Done:** openapi regenerated; CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X3.5 — Suspension and removal lifecycle with typed confirmation; sessions on a suspended/removed host invalidated (hid check); resume re-verifies; audit
- **Epic:** X3 · **Size/Complexity:** S/S · **Owners:** API, Web · **Deps:** X3.3, X1.5
- **Persona:** Org Admin pausing or removing a domain
- **Objective:** Pausing or removing a hostname takes effect within a minute everywhere, keeps history, and never strands the org without an address.
- **Story:** As an org admin, I want to pause or remove a domain safely, with sessions on it ending and a clear way back, so that an address we stop controlling cannot keep serving our portal.

**Functional requirements**
- POST /api/orgs/{orgId}/hostnames/{hid}/suspend {reason} (ReasonSheet; domains.manage; audit DOMAIN_SUSPENDED HIGH; config_version++), POST …/resume (re-runs HostnameVerifier synchronously; passes → ACTIVE, else 409 VERIFY_FAILED {code}), POST …/remove {confirm: hostname, reason} (ConfirmTypedSheet; primary with other ACTIVE hosts → 409 PRIMARY_REQUIRED; SUBDOMAIN rows → 409 SUBDOMAIN_MANAGED; REMOVED is terminal; active key cleared; audit DOMAIN_REMOVED HIGH).
- JwtDecoder validator: hid present → HostnameStatusCache.isActive(hid) else 401 TOKEN_HOST_REVOKED (cache TTL 60 s, evicted on config_version); the BFF clears cookies on that code and the login shows STALE_SESSION.
- Domains page: Pause / Resume / Remove actions in the card kebab; removed hosts shown in a collapsed "History" list (read-only) with the audit drawer.

**UI requirements**
- ReasonSheet for pause; ConfirmTypedSheet (type the hostname) for remove; resume shows the verify result inline.

**Backend requirements**
- OrgHostnameService suspend/resume/remove, HostnameStatusCache, SecurityJwtConfiguration validator

**Database changes**
- None

**APIs**
- POST /api/orgs/{orgId}/hostnames/{hid}/suspend | /resume | /remove

**Permissions**
- domains.manage

**Feature entitlements**
- flag.enterprise.domains

**Acceptance criteria**
- Suspending careers.acme.localhost makes GET /api/public/tenant on it 404 within one request and a token with that hid → 401 TOKEN_HOST_REVOKED on the next call (HostMismatchIT extension); the subdomain keeps working.
- Resume with the TXT record deleted → 409 VERIFY_FAILED TXT_MISSING and the host stays SUSPENDED; with records intact → ACTIVE and the ask endpoint answers 200 again.
- Removing the primary while acme.kiwiply.com is the only other ACTIVE host → 409 PRIMARY_REQUIRED until another primary is set; after removal the name can be registered by beta (new row, new token).
- Every action writes one audit row with hostname_id, reason and risk HIGH.

**Test cases**
- OrgHostnameServiceTest (guards)
- OrgHostnameResourceIT
- SecurityJwtConfigurationTest hid validation
- SuspendedHostnameIT extended
- Playwright domains.spec.ts pause/resume/remove

- **Tech notes:** 10 §2, §6; typed confirmation only here, close org and transfer ownership (irreversible class).
- **Definition of Done:** openapi regenerated; CI green; 04 §5 item 4 names the extended IT. Plus the common DoD in `06-phase-plan.md` §5.

### X3.6 — Edge snippet and runbook (on_demand_tls ask + catch-all block + DNS records) for the user to apply; dev edge rehearsal on *.localhost with Caddy local_certs; monitoring alert when ask 404 rate spikes
- **Epic:** X3 · **Size/Complexity:** M/M · **Owners:** API, Ops, QA · **Deps:** X3.3
- **Persona:** The user applying the BeeCompete-edge change (E5, answered 2026-10-12); QA rehearsing it
- **Objective:** The exact edge change is written, rehearsed locally with real on-demand issuance, and monitored — so the single manual step is safe and reversible.
- **Story:** As the user, I want the precise Caddyfile snippet, a step-by-step runbook with rollback, and proof it works on a local edge so that I can apply the shared-edge change in minutes without risking BeeCompete.

**Functional requirements**
- Docs: 10 §5.3 snippet and 10 §8 runbook are the deliverable; DEPLOY.md gains §"Tenant hostnames (enterprise)" linking them; MIGRATION.md §10 cross-link.
- docker-compose.dev-edge.yml (dev only): caddy:2 with local_certs, the §5.3 blocks (ask → host.docker.internal:8080 with the dev internal token), proxying to the dev web; README section "Rehearsing on-demand TLS locally"; a script scripts/dev/edge-rehearsal.sh that provisions acme + careers.acme.localhost in the dev API, curls https://acme.localhost and https://careers.acme.localhost with the local CA and asserts 200 + branded title; CI job (optional, manual) edge-rehearsal.
- Monitoring: AlertService rule ask404Spike (> 50 in 5 min → platform admin notification + log at WARN with the top offending names hashed); Tenant Health page row; LE counter warning at 40/50.
- A "Google origin registered" note in the runbook (E14) and the E12 edge path denies (/management/*, /api/internal/*) included as an optional block with a comment.

**UI requirements**
- Tenant Health rows only.

**Backend requirements**
- service/ent/TenantAlertService (ask spike), scripts/dev/edge-rehearsal.sh, docker-compose.dev-edge.yml

**Database changes**
- —

**APIs**
- —

**Permissions**
- ROLE_ADMIN for Tenant Health

**Feature entitlements**
- —

**Acceptance criteria**
- Running the rehearsal script on a dev machine with Docker yields two locally-issued certificates and branded responses; the script fails if the ask endpoint answers 200 for nobody.localhost.
- The snippet in 10 §5.3 validates with `caddy validate` inside the rehearsal container (CI job when enabled).
- A synthetic burst of 60 ask 404s in 5 minutes triggers one platform notification and one WARN line, not sixty.
- DEPLOY.md and the runbook name the exact commands, rollback and neighbour checks (reviewed against 10 §8).

**Test cases**
- TenantAlertServiceTest (spike window)
- edge-rehearsal.sh self-check (bash, shellcheck in CI ops job)
- docs link check

- **Tech notes:** 10 §5, §8; never automate the production edge; dev token differs from prod.
- **Definition of Done:** Docs merged; rehearsal green locally (evidence: script output in the PR); CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X3.7 — Google sign-in per tenant host (opt-in after origin registration) and security headers on tenant hosts (CSP with nonce, frame-deny, noindex, Permissions-Policy)
- **Epic:** X3 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X2.6, X3.3
- **Persona:** Org Admin enabling Google; platform admin registering the origin
- **Objective:** Google works on a tenant host only when both the platform registered the origin and the org opted in; every tenant response carries hardened headers.
- **Story:** As an org admin, I want to let employees sign in with Google on careers.acme.com once Kiwiply has registered our domain, and as a visitor I want the portal to be unframeable and unindexed.

**Functional requirements**
- org_hostname.google_origin_registered BOOL default false (platform admin toggles on /admin/domains with ReasonSheet; audit); org setting org.security.google_signin (BOOL, default false, org.settings.manage); PublicTenantDTO.login.google = registered(primary or current host) && setting.
- GoogleAuthController on tenant hosts: refuse (404) unless login.google is true for the host; membership rule unchanged; tid/hid pair on success.
- Web GoogleSignIn on tenant hosts passes the current origin; the client id is the platform's (one client, many origins).
- proxy.ts headers per 11 §7 with a per-request nonce threaded to Next scripts (next.config headers + nonce in the tenant layout); X-Frame-Options DENY; Referrer-Policy; nosniff; Permissions-Policy; X-Robots-Tag; no HSTS. Platform hosts unchanged.
- E14 answer documented: default password + email verification; Google per domain on request.

**UI requirements**
- Settings → Policies row "Google sign-in" disabled with the note "Ask Kiwiply to register careers.acme.com" until registered; Google button appears on the login when enabled.

**Backend requirements**
- OrgHostname column, AdminDomainResource toggle, GoogleAuthController tenant gate, PublicTenantDTO

**Database changes**
- org_hostname.google_origin_registered BOOL NOT NULL DEFAULT false (additive)

**APIs**
- POST /api/admin/domains/{hid}/google-origin {registered, reason}
- PUT /api/orgs/{orgId}/settings/org.security.google_signin

**Permissions**
- ROLE_ADMIN; org.settings.manage

**Feature entitlements**
- flag.enterprise.domains

**Acceptance criteria**
- With the origin unregistered, the login on careers.acme.localhost shows no Google button and POST /api/auth/google → 404; registering + enabling shows it and a non-member Google account still gets NOT_A_MEMBER.
- Every tenant HTML response has CSP with a nonce that matches the inline scripts (Playwright checks console for CSP violations = 0), X-Frame-Options DENY, X-Robots-Tag noindex; kiwiply.com responses are byte-identical to before (snapshot).
- Framing the tenant login from another origin is blocked (Playwright iframe test).

**Test cases**
- GoogleAuthControllerIT tenant gate
- PublicTenantResourceIT login.google matrix
- proxy headers test
- Playwright tenant-headers.spec.ts

- **Tech notes:** 11 §7; 12 §4 step 5; Next 16 nonce pattern; keep the single Google client id.
- **Definition of Done:** openapi regenerated; CI green; 04 §7 updated to "implemented". Plus the common DoD in `06-phase-plan.md` §5.

### X3.8 — E2E-A custom-domain segment and SuspendedHostnameIT/AskEndpointIT hardening; Playwright domains journey
- **Epic:** X3 · **Size/Complexity:** M/M · **Owners:** QA, API, Web · **Deps:** X3.1, X3.2, X3.3, X3.4, X3.5, X3.7, X2.11
- **Persona:** QA
- **Objective:** The full hostname lifecycle is a CI gate: add → instructions → verify → live → primary → pause → resume → remove, plus the certificate gate's negative cases.
- **Story:** As QA, I want the domain lifecycle automated end to end over the mock and the API so that no later change can make an unverified host resolve or a removed host keep sessions.

**Functional requirements**
- API: AskEndpointIT final matrix (every status × flag × org status × token form); SuspendedHostnameIT (suspend/resume/remove × session validity × cache eviction timing); HostnameLifecycleIT (full transition path with a stub resolver and a clock).
- Web: mock-api gains hostname fixtures with state machines (verify stub toggled by a header for tests); Playwright web/e2e/journeys/ent/domains.spec.ts: add careers.acme.localhost → instructions → "verify now" fails (copy) → fixture flips → verified → live → make primary → redirect observed → pause → login on the paused host shows STALE_SESSION → resume → remove with typed confirmation → history row; 390/1440 screenshots.
- e2e-a.spec.ts extended: "custom domain verified → opens careers.acme.localhost → branded login → dashboard".

**UI requirements**
- —

**Backend requirements**
- tests only

**Database changes**
- —

**APIs**
- mock only

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- All suites exist, run in CI and pass; mutation checks documented in the test javadoc (removing the ACTIVE check in the ask endpoint fails AskEndpointIT; removing the hid validation fails SuspendedHostnameIT).
- Playwright runtime ≤ 120 s for the domains journey.

**Test cases**
- Themselves.

- **Tech notes:** 10 §9; X1.9 patterns; clock injection for the jobs.
- **Definition of Done:** CI green; 04 §5 and 10 list the classes as built; progress-tracker. Plus the common DoD in `06-phase-plan.md` §5.

### X4 — Phase 4 — Roles, employees, departments, teams, assignments
_Configurable role templates with a ceiling rule, employee lifecycle with bulk actions and audit, departments/teams, auditable consultant–marketer assignments._

**Session B (fully specified).** Build order: X4.1 → X4.2 → X4.5 → X4.3 → X4.6 → X4.4 → X4.9 (then D's X4.7 → X4.8, then X4.10). X4.5 before X4.3 (the Employees filters need the tree); X4.9 can run any time after X2.2.

Owned elsewhere (titles only here): 

| Id | Story | Size | Owner session |
|---|---|---|---|
| X4.7 | Consultant–marketer assignments: org_assignment CRUD (primary/backup/manager/delegate), effective dates, history, reassignment with consent re-point prompt | L | D |
| X4.8 | Workload balancing view for Marketing Managers: open assignments per marketer, caps from entitlement, drag/reassign with undo | M | D |
| X4.10 | org_member_role becomes authoritative; legacy enum fallback removed from OrgAccessService; flag.enterprise.roles on by default for enterprise orgs | S | E (finalise; API-only cutover of org_member_role) |

### X4.1 — Roles & Permissions page: templates, clone, edit permission/scope grid with ceiling rule, diff and history
- **Epic:** X4 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X1.6, X1.7, X2.2
- **Persona:** Org Admin tailoring roles
- **Objective:** Configure roles from templates without ever granting more than you hold, with every change diffed and audited.
- **Story:** As an org admin, I want to clone a template, rename it and adjust its permissions and scopes within my own ceiling so that Acme's roles match how we work.

**Functional requirements**
- API (extends X1.6): GET /api/orgs/{orgId}/roles → system templates + org roles with permission rows, member counts, editable flag; GET …/roles/{id} (+ diff vs its template); POST …/roles {templateKey, name} (clone); PATCH …/roles/{id} {name?, description?, permissions:[{key, scope}]} with the ceiling rule (422 ROLE_CEILING {key, scope}), OWNER immutable (409 ROLE_SYSTEM), dangerous keys flagged; DELETE …/roles/{id} (org roles with 0 members; else 409 ROLE_IN_USE {count}); POST …/roles/{id}/resync (re-copy the template; diff shown first); every write audited ROLE_* (HIGH for permission changes) with the diff in details; GET …/roles/{id}/history.
- EntPermissions registry exposes families, descriptions, default scopes, dangerous flags → GET /api/orgs/{orgId}/permissions (catalog for the grid; filtered to the caller's ceiling with a `grantable` flag per key/scope).
- Web /w/admin/roles: left list (System templates | Acme roles) with member counts; detail: name/description (autosave), permission grid grouped by family (rows = keys, columns = scope radios OWN…ORG + "not granted"); rows the caller cannot grant are disabled with "beyond your access"; dangerous keys show a ReasonSheet on grant; "Compare with template" diff view (DiffText); History drawer; "Clone" from a template; "Delete" when unused; members-with-this-role link to Employees filter.
- Primary role / member assignment stays on the Employees page (X4.3); this page never edits members.

**UI requirements**
- Grid is a table ≥ md and stacked cards per family < md; scope radios 44 px; autosave per cell with undo; HIGH changes via ReasonSheet; tenant tokens.

**Backend requirements**
- OrgRoleService extensions, EntPermissions catalog endpoint, OrgRoleResource

**Database changes**
- org_role.description exists; org_role_permission unchanged; audit details JSON

**APIs**
- GET /api/orgs/{orgId}/roles, GET …/roles/{id}, POST …/roles, PATCH …/roles/{id}, DELETE …/roles/{id}, POST …/roles/{id}/resync, GET …/roles/{id}/history
- GET /api/orgs/{orgId}/permissions

**Permissions**
- roles.manage (write), member.view_summary (read)

**Feature entitlements**
- flag.enterprise.roles

**Acceptance criteria**
- An ORG_ADMIN cloning MARKETING_MANAGER and adding org.close → 422 ROLE_CEILING; setting assignments.manage to ORG when the admin holds it at ORG → saved; an HR_SPECIALIST opening the page sees marketing keys as not grantable.
- OWNER rows are read-only (409 on PATCH); deleting a role with 3 members → 409 ROLE_IN_USE 3.
- Every permission change writes ROLE_UPDATE risk HIGH with {added, removed, scopeChanged}; the History drawer shows it with the actor.
- Resync shows the diff and, on confirm, restores the template rows (audit ROLE_RESYNC).
- Doc-sync: the grid's families/keys equal EntPermissions (test) and 05 §3 (existing EntPermissionsDocSyncTest).

**Test cases**
- OrgRoleServiceTest (ceiling matrix, system guard, in-use)
- OrgRoleResourceIT (+coverage registry)
- web roles.test.tsx (grantable disabling, autosave, diff)
- Playwright roles.spec.ts (clone → edit → ceiling refusal → history, 390/1440)

- **Tech notes:** 05 §3, §6; ADR-005; E4 answered by default (a); keep 404 semantics for outsiders.
- **Definition of Done:** openapi regenerated; CI green; 05 §3 amended if keys change. Plus the common DoD in `06-phase-plan.md` §5.

### X4.2 — Workspace definitions as data (workspace_key → nav → needs) with per-org nav preferences; primary role → landing; member landing preference
- **Epic:** X4 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X2.2, X2.5, X4.1
- **Persona:** Org Admin shaping navigation; members with several roles
- **Objective:** Navigation and landing come from data the org can tune (hide/reorder) and the member can prefer, never from code forks.
- **Story:** As an org admin, I want to hide pages we don't use and order the rest, and as a member I want to choose which workspace opens first, so that the portal fits how Acme works.

**Functional requirements**
- API: WorkspaceService (X2.2) applies nav_prefs_json (hidden[], order[] per workspace, allow-listed keys) from published branding when computing /api/me/tenant.workspaces; member preference PUT /api/me/tenant/landing {workspaceKey} (must be in workspaces; stored org_member.landing_workspace; audited LOW); landing = preference if still allowed else primary role's workspace.
- Branding page Navigation section (X2.5) edits the prefs per workspace with a live preview of the sidebar; hidden pages remain reachable by URL and permission-checked (the shell shows a "hidden from the menu" eyebrow).
- Web workspaces.ts applies the prefs (order then hide) and exposes `isHiddenByOrg(item)`; the switcher's "Open … first" calls the landing endpoint.
- Role template change (member's primary role changes) → next /api/me/tenant reflects the new landing; the shell banner informs.

**UI requirements**
- Navigation editor: per-workspace list with DragHandle/SortableList and hide toggles; phone: move up/down buttons; undo per change.

**Backend requirements**
- WorkspaceService prefs, MeTenantResource.landing, nav prefs validation

**Database changes**
- org_member.landing_workspace (X2.2 column) now written

**APIs**
- PUT /api/me/tenant/landing
- GET /api/me/tenant (prefs applied)

**Permissions**
- branding.manage for prefs; self for landing

**Feature entitlements**
- —

**Acceptance criteria**
- Hiding "Reports" in ADMIN removes it from the sidebar for every admin but /w/admin/reports still renders for them; an unknown nav key in nav_prefs_json → 422 at publish.
- Sarah sets Marketing management as landing; next login lands there; removing her MARKETING_MANAGER role makes landing fall back to /w/admin and the preference is cleared (audit).
- Order prefs reorder the sidebar and the phone bottom tabs (first four follow the new order).

**Test cases**
- WorkspaceServiceTest (prefs, fallback)
- MeTenantResourceIT landing
- web workspaces.test.ts prefs cases
- Playwright e2e-b landing preference step

- **Tech notes:** 16 §2.2, §3, §4; ADR-007; prefs never add pages.
- **Definition of Done:** openapi regenerated; CI green; 16 §3 landing rule verified. Plus the common DoD in `06-phase-plan.md` §5.

### X4.3 — Employees page on real data: list/filters/search, roles, department, team, manager, status, bulk actions (assign roles, move team, set manager, suspend, resend)
- **Epic:** X4 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X1.6, X1.8, X2.2, X4.5 · **Relates:** O5.1
- **Persona:** Org Admin / HR Specialist managing people
- **Objective:** One Employees page shared by Admin, HR and Marketing-management (scope-driven), with server-side lists and audited bulk actions with undo.
- **Story:** As an org admin, I want to find any employee quickly, see their roles, team and manager, and act on many at once with an undo, so that managing a growing organization stays fast and safe.

**Functional requirements**
- API: GET /api/orgs/{orgId}/members (q, status, roleId, departmentId, teamId, managerId, licenseStatus (Phase 6), sort, page, size; scope-aware: TEAM scope returns only the caller's team rows); rows carry roles[], groups, manager, status, lastActiveAt, inviteMeta; POST …/members/bulk/roles | /groups | /manager | /status | /resend per 15 §3.2 with per-row results and MEMBER_BULK audit; PATCH …/members/{id} {title, departmentGroupId, teamGroupId, managerMemberId} (single edits, autosave); GET …/members/export.csv (reports.export, audited EXPORT); org_member.last_active_at updated by the interceptor at most hourly.
- New permission keys members.group.set, members.manager.set in EntPermissions + templates (ORG_ADMIN, HR_SPECIALIST; MARKETING_MANAGER at TEAM for manager); manager cycle guard; team ⊂ department rule.
- Web /w/admin/employees (+ /w/hr/employees, /w/marketing-mgmt/team preset): EmployeesPage per 15 §3.1 with FilterBar/DataTable (promoted kit), selection bar with bulk actions (sheets + ReasonSheet for suspend), Invite ▾ (email sheet with roles within ceiling, CSV import from branch B, join link/QR), Export; row kebab; URL-synced filters; cards < md.
- Invite send is queued 15 s so the toast's Undo can revoke (OrgInviteService delay via the mail queue; a flag for tests).

**UI requirements**
- 15 §3.1 wireframes (390/1440); StatusDot statuses; PersonCell; sticky selection bar; EmptyState mascot "It's just you so far".

**Backend requirements**
- OrgMemberQueryService (paging/filters/scope), OrgMemberBulkService, OrgMemberResource extensions, EntPermissions keys, interceptor last_active throttle

**Database changes**
- org_member indexes (org_id, status, department_group_id), (org_id, team_group_id), (org_id, manager_member_id), (org_id, last_active_at); lower-case search columns name_search/email_search generated (additive)

**APIs**
- GET /api/orgs/{orgId}/members (filters)
- POST /api/orgs/{orgId}/members/bulk/{roles|groups|manager|status|resend}
- PATCH /api/orgs/{orgId}/members/{id}
- GET /api/orgs/{orgId}/members/export.csv

**Permissions**
- member.view_summary (list), members.invite, members.role.set (+ceiling), members.group.set, members.manager.set, members.suspend, reports.export

**Feature entitlements**
- —

**Acceptance criteria**
- Filter status=invited&roleId=… returns only matching rows with correct paging headers; search "ani" finds Anika by name and "anika@" by email; a MARKETING_MANAGER with TEAM scope sees only their team.
- Bulk roles on 12 members where one is the last ORG_ADMIN being demoted → 11 ok, 1 skipped LAST_ADMIN, 12+1 audit rows, Undo reverses the 11.
- Bulk suspend requires a reason (422 without); undo reinstates; suspended members' tid sessions are revoked.
- Setting a manager that creates a cycle → 422 MANAGER_CYCLE; moving to a team outside the chosen department → 422 TEAM_NOT_IN_DEPARTMENT.
- Export CSV contains no phone/consent fields and writes one EXPORT audit row.
- Invite 3 emails → toast with Undo; undo within 10 s → seats revoked, no mail sent (mail queue assertion).

**Test cases**
- OrgMemberQueryServiceTest (filters, scope)
- OrgMemberBulkResourceIT (each action, skips, audit, undo)
- OrgIsolationIT coverage
- web employees.test.tsx (filters URL sync, selection bar, sheets)
- Playwright employees.spec.ts (invite → appears → resend → bulk roles → suspend/reinstate, 390/1440)

- **Tech notes:** 15 §2–§3; branch A TeamPage/TeamTable as visual prior art only; 404 semantics; keep OrgLimitsIT green.
- **Definition of Done:** openapi regenerated; CI green; 15 §3.2 table = implemented actions (doc-sync test on the bulk enum). Plus the common DoD in `06-phase-plan.md` §5.

### X4.4 — Employee lifecycle: suspend, reinstate, offboard wizard (records kept, scheduled last day), transfer ownership, last-admin guards, audit history
- **Epic:** X4 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X4.3, X4.6 · **Relates:** O5.2
- **Persona:** Org Admin offboarding or pausing someone
- **Objective:** Every lifecycle transition in 15 §2 is explicit, guarded, audited and keeps business records.
- **Story:** As an org admin, I want to pause, reinstate or offboard an employee through a clear wizard that shows what will happen and keeps every record, so that leaving never destroys history.

**Functional requirements**
- API: POST /api/orgs/{orgId}/members/{id}/suspend {reason} / reinstate; GET …/members/{id}/offboard-preview → {roles, assignments (D hook: count + list; empty until X4.7), consentEnds, resumeLinks (count), licenses (C hook: text), sessions}; POST …/members/{id}/offboard {reason, effectiveAt?, reassignments?: [{consultantMemberId, newAssigneeMemberId}]} → immediate (status REMOVED + effects: org_member_role ends_at, org_assignment ends (via D's service when present), org_resume links removed + audited, data_share ended, sessions revoked, overlay deleted, licenses handed to C's LicenseService.endAtPeriodEnd when the module exists) or scheduled via org_member_offboarding + OffboardingJob (hourly); OWNER → 409 OWNER_MUST_TRANSFER; self → 409 SELF; last ORG_ADMIN → 409 LAST_ADMIN; POST …/transfer-ownership {toMemberId, confirm} exists → ensure audit OWNER_TRANSFER HIGH and role rows move; revoke invitation (INVITED → REMOVED).
- Web: offboarding wizard per 15 §5 (Dialog ≥ md, 3 steps; reassign picker required when PRIMARY assignments exist; last-day date; ConfirmTypedSheet); suspend/reinstate from the sheet footer and row kebab (ReasonSheet / undo toast); scheduled offboardings list at /w/hr/offboarding and in the employee sheet; History tab shows the transitions.
- Notifications: ORG_SUSPENDED_ME, ORG_OFFBOARDED_ME (email), ORG_INVITE_ACCEPTED batch (X2.10 kinds).

**UI requirements**
- Wizard copy per 15 §5; reason 10–500; no undo for offboard (re-invite is the path); phone: full-screen steps.

**Backend requirements**
- OrgMemberLifecycleService, OrgOffboardingService (+job), OrgMemberResource endpoints, hooks (interfaces) for assignments/licenses

**Database changes**
- org_member_offboarding (org_id, member_id, effective_at, reason, created_by_member_id, status PENDING|DONE|CANCELLED, done_at) additive

**APIs**
- POST /api/orgs/{orgId}/members/{id}/suspend | /reinstate | /offboard | /revoke-invite
- GET /api/orgs/{orgId}/members/{id}/offboard-preview
- GET/DELETE /api/orgs/{orgId}/members/offboarding(/{id})

**Permissions**
- members.suspend, members.remove, org.transfer_ownership

**Feature entitlements**
- —

**Acceptance criteria**
- Offboarding Anika immediately: status REMOVED, role rows ended, org_resume links gone and audited, data_share ended, her acme tid session 401 on next call, her personal resumes/applications untouched (PersonalDataUntouchedIT); the preview listed exactly those effects.
- Scheduling for a future date keeps her ACTIVE until the job runs at effective_at (clock test); cancelling the schedule before then leaves no effect.
- Offboarding the OWNER → 409 OWNER_MUST_TRANSFER; after transfer the former owner can be offboarded.
- Revoking an INVITED seat frees the email (active_key) for a new invite.
- Each transition writes one audit row with reason and the right risk; notifications to the person only.

**Test cases**
- OrgMemberLifecycleServiceTest (guards)
- OrgOffboardingServiceTest (effects, schedule, cancel)
- OrgMemberResourceIT lifecycle
- PersonalDataUntouchedIT
- web offboarding wizard test
- Playwright employees.spec.ts lifecycle steps

- **Tech notes:** 15 §2, §5; ADR-009 link removal; D's X4.7 and C's X5.4 plug into the two hook interfaces defined here (AssignmentOffboardingHook, LicenseOffboardingHook) with no-op defaults.
- **Definition of Done:** openapi regenerated; CI green; 15 §2 table = implemented transitions (doc-sync on the action enum). Plus the common DoD in `06-phase-plan.md` §5.

### X4.5 — Departments and teams: parent/child groups, leads, move members, counts, drag/undo
- **Epic:** X4 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X1.2, X2.2 · **Relates:** O5.3
- **Persona:** Org Admin / HR structuring the organization
- **Objective:** Departments and teams as a two-level tree with leads and live counts, editable inline with undo, feeding TEAM/DEPARTMENT scopes.
- **Story:** As an org admin, I want to create departments and teams, name leads and move people between them so that permissions scoped to a team or department mean something.

**Functional requirements**
- API: org_group gains parent_group_id (team → department; a DEPARTMENT cannot have a parent; a TEAM may have none), lead_member_id (ACTIVE member); GET /api/orgs/{orgId}/groups returns the tree with memberCount per node (ACTIVE members by department/team columns), cohorts separately; POST …/groups {name, kind, parentGroupId?, leadMemberId?}; PATCH …/groups/{id} {name?, parentGroupId?, leadMemberId?} (moving a team re-points its members' department_group_id in the same tx); DELETE …/groups/{id} only when empty (409 GROUP_NOT_EMPTY {count}); POST …/groups/{id}/members {memberIds[]} (bulk move shortcut → same rules as X4.3 bulk/groups); audit GROUP_* (exists) + GROUP_MOVE, GROUP_LEAD.
- ScopeEvaluator uses the lead as a member of the group (05 §4) — verify with a test (X1.7 wrote the rule).
- Web /w/admin/teams (+ /w/hr/teams): tree per 15 §6, inline create/rename (autosave on blur), Move under (menu; drag on desktop), lead picker, members panel with Move, delete-empty guard with the bulk-move shortcut; undo for move/rename/lead; counts live.
- EntPermissions: departments.manage / teams.manage resolve to groups.manage (alias table) so HR templates work.

**UI requirements**
- 15 §6 wireframes; SortableList/DragHandle on desktop, buttons on phone; EmptyState "Group people into departments and teams".

**Backend requirements**
- OrgGroupService extensions, OrgGroupResource, ScopeEvaluator test, EntPermissions alias

**Database changes**
- org_group.parent_group_id BIGINT NULL FK, lead_member_id BIGINT NULL FK (additive, 03 §2.1); index (org_id, parent_group_id)

**APIs**
- GET/POST /api/orgs/{orgId}/groups
- PATCH/DELETE /api/orgs/{orgId}/groups/{id}
- POST /api/orgs/{orgId}/groups/{id}/members

**Permissions**
- groups.manage (aliases departments.manage, teams.manage)

**Feature entitlements**
- —

**Acceptance criteria**
- Creating a TEAM under a DEPARTMENT and moving 3 members into it sets both group columns; moving the team under another department updates the 3 members' department in one transaction (IT asserts counts).
- DELETE a team with 7 members → 409 GROUP_NOT_EMPTY 7; after bulk move → 204.
- A DEPARTMENT with parentGroupId → 422; a lead who is INVITED → 422 LEAD_NOT_ACTIVE.
- A MARKETING_MANAGER whose team has lead R. Iyer sees Iyer's rows under TEAM scope (ScopeEvaluatorTest case).
- HR_SPECIALIST can manage groups through the alias; CONSULTANT gets 404.

**Test cases**
- OrgGroupServiceTest
- OrgGroupResourceIT (existing extended)
- ScopeEvaluatorTest lead case
- web teams.test.tsx
- Playwright teams.spec.ts (create → move → lead → delete guard, 390/1440)

- **Tech notes:** 15 §6; cohorts untouched; keep OrgGroupResourceIT's existing cases.
- **Definition of Done:** openapi regenerated; CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X4.6 — Employee detail sheet: seat, roles (ceiling-aware), groups, manager, consent scope summary, sessions, audit of org actions on them
- **Epic:** X4 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X4.3, X4.1 · **Relates:** O5.8
- **Persona:** Org Admin / HR / Marketing Manager looking at one person
- **Objective:** Everything about a seat in one sheet with autosaving edits, without ever exposing more than the caller's permission and the person's consent allow.
- **Story:** As an org admin, I want to open an employee and adjust their roles, team and manager, see what they share and what happened to their seat, so that one person's administration never needs five pages.

**Functional requirements**
- API: GET /api/orgs/{orgId}/members/{id} (extended) → seat, title (org-set vs own), roles with primary, groups, manager, consent {scope, fullTo}, lastActive, inviteMeta, sessionCount, consultant chips (D overlay when present, read-only); PUT …/members/{id}/roles (exists, X1.6) with ceiling; PATCH …/members/{id} (X4.3); POST …/members/{id}/sessions/revoke (revokes this user's tid sessions for this org only; audit MEMBER_SESSIONS_REVOKED); GET …/members/{id}/activity?direction=on|by (org_audit_event by target or actor; paged); POST …/members/{id}/consent-request {kind} (cooldown org.consent.request_cooldown_days; notification to the person).
- Web: EmployeeSheet per 15 §4 (SideSheet ≥ md / BottomSheet full < md) with tabs Overview, Roles (checklist within ceiling, primary radio, ReasonSheet for admin roles, autosave + undo), Groups & manager, Access (consent summary + Ask, licenses link when module, sessions count + revoke), Activity (HistoryDrawer list with direction toggle and family filter); footer actions (suspend/reinstate/offboard/revoke invite) wiring to X4.4.

**UI requirements**
- 15 §4; focus trap; returnFocusTo the row; deep link ?member={id} opens the sheet; phone full-screen.

**Backend requirements**
- OrgMemberResource detail/activity/sessions/consent-request, OrgMemberDetailDTO

**Database changes**
- None

**APIs**
- GET /api/orgs/{orgId}/members/{id}
- POST /api/orgs/{orgId}/members/{id}/sessions/revoke
- GET /api/orgs/{orgId}/members/{id}/activity
- POST /api/orgs/{orgId}/members/{id}/consent-request

**Permissions**
- member.view_summary (open), members.role.set, members.group.set, members.manager.set, members.suspend, audit.view (activity); consent summary never exposes FULL fields

**Feature entitlements**
- —

**Acceptance criteria**
- Opening Anika as a MARKETING_SPECIALIST without an assignment → 404; with an open PRIMARY assignment → summary fields only (no phone, no manager edits); as ORG_ADMIN → full sheet.
- Toggling MARKETING_MANAGER on Priya as an ORG_ADMIN who lacks approvals.decide → 422 ROLE_CEILING shown inline; granting ORG_ADMIN asks a reason and writes ROLE_ASSIGN HIGH.
- Consent request twice within 7 days → 429 CONSENT_COOLDOWN with the next allowed date; the person receives one notification.
- Sessions revoke ends only acme tid sessions (a kiwiply.com session of the same user survives).
- Activity "on them" lists MEMBER_* rows targeting the member; "by them" lists rows they performed; paging works.

**Test cases**
- OrgMemberResourceIT detail/activity/sessions/consent
- ScopeEvaluator-driven projection test
- web EmployeeSheet.test.tsx (tabs, ceiling disabling, autosave)
- Playwright employees.spec.ts sheet steps

- **Tech notes:** 15 §4; ShareField projection for consent-scoped fields; the sheet is shared by HR and Marketing management (scope decides).
- **Definition of Done:** openapi regenerated; CI green. Plus the common DoD in `06-phase-plan.md` §5.

### X4.9 — Org audit log viewer (filters, risk, CSV export audited) for OWNER/ORG_ADMIN/FINANCE; Reports page exports hub
- **Epic:** X4 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X1.10, X2.2 · **Relates:** O13.4
- **Persona:** Org Admin / Finance reviewing what happened
- **Objective:** Every org action is reviewable and exportable by the roles allowed to see it, with the export itself audited.
- **Story:** As an org admin, I want to search our audit log by person, action, risk and date and export it, so that I can answer "who changed what, when and why".

**Functional requirements**
- API: GET /api/orgs/{orgId}/audit (q on actor/target login, action family, action, risk, hostnameId, beneficiaryLogin, from/to, page/size; FINANCE sees BILLING_/OPS_ rows only via row_filter; EXEC none) → rows {at, actorLogin, actorRole, action, targetType, targetLogin/id, risk, hostname, beneficiary, details (safe subset)}; GET …/audit/export.csv (reports.export; max 50 000 rows; writes EXPORT audit row with the filter); GET …/audit/actions (catalog of families/actions for filters).
- Web /w/admin/audit (+ /w/finance/audit read via the same page): FilterBar (search, family, action, risk, person, date range), DataTable with risk Badge, row click → details sheet (JSON details rendered as key/value; diffs via DiffText for ROLE_UPDATE/BRANDING_PUBLISH); Export CSV (ReasonSheet not needed; audited); 390: cards.
- Reports page /w/admin/reports Phase-2 scope: an "Exports" hub listing the audited CSV exports available to the caller (employees, audit, usage when C ships) with their last run; Phase 12 adds real reports.

**UI requirements**
- Admin kit; risk tones (LOW muted, MEDIUM amber, HIGH coral); details sheet; empty "No activity yet".

**Backend requirements**
- OrgAuditQueryService (filters, row_filter), OrgAuditResource, CSV writer (streaming)

**Database changes**
- org_audit_event indexes (org_id, created_at), (org_id, action), (org_id, actor_login), (org_id, target_login) additive

**APIs**
- GET /api/orgs/{orgId}/audit
- GET /api/orgs/{orgId}/audit/export.csv
- GET /api/orgs/{orgId}/audit/actions

**Permissions**
- audit.view (row filter per template), reports.export for CSV

**Feature entitlements**
- —

**Acceptance criteria**
- ORG_ADMIN filtering risk=HIGH&family=ROLE returns only HIGH role rows; FINANCE_SPECIALIST sees BILLING_/OPS_ rows and nothing else for the same query; CONSULTANT → 404.
- Export writes one EXPORT row whose details hold the filter and row count; a 60 000-row export → 413 EXPORT_TOO_LARGE with a narrower-range hint.
- Details for a ROLE_UPDATE row render the added/removed diff; for an admin break-glass read (E8) the row shows actor_login=admin and risk HIGH.
- beta's admin cannot read acme's audit (404) — coverage registry.

**Test cases**
- OrgAuditQueryServiceTest (filters, row_filter)
- OrgAuditResourceIT (+coverage)
- web audit.test.tsx
- Playwright audit.spec.ts (filter → details → export, 390/1440)

- **Tech notes:** 04 §4 logs/audit row; X1.10 columns; streaming CSV; never include ip_hash or details beyond the safe subset.
- **Definition of Done:** openapi regenerated; CI green. Plus the common DoD in `06-phase-plan.md` §5.

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
