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

## 3. Phases 2–12 — epic-level entries (X2, X3, X5, X6, X12) and fully specified stories (X4.7–4.8, X7–X11 by Session D)

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

#### X4.7–X4.8 — fully specified (Session D; build order X4.7 → X4.8, after X4.3)

### X4.7 — Consultant–marketer assignments: org_assignment CRUD (primary/backup/manager/delegate), effective dates, history, reassignment with consent re-point prompt
- **Epic:** X4 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X1.6, X1.7, X4.3
- **Persona:** Org Admin / Marketing Manager
- **Objective:** Replace the single support-owner field with an auditable, dated assignment entity so every act-for check and every scope evaluation has one source of truth.
- **Story:** As a Marketing Manager, I want to assign a primary, a backup, a manager and temporary delegates to each consultant with effective dates and full history, so that reassignment never loses who did what and consent is never silently moved.

**Functional requirements**
- org_assignment per 17-consultant-assignments.md §2: kinds PRIMARY|BACKUP|MANAGER|DELEGATE, starts_at/ends_at, reason, end_reason, replaced_by_assignment_id, health; one open PRIMARY per consultant (generated primary_active_key); no duplicate open (consultant, assignee, kind).
- DELEGATE requires ends_at ≤ org.assignments.delegate_max_days (default 90) and a reason; AssignmentHandoverJob expires delegates and ends scheduled handovers.
- Reassign = end current + open new in one transaction (§3); scheduled starts end the current PRIMARY at the new starts_at.
- Consent interaction (§4): FULL never moves; DataShareService.endPairingsTo only when the old assignee holds no other act-for row; ORG_CONSENT re-point notification to the consultant with one-tap grant; ORG_ASSIGNMENT notifications to consultant, new and previous assignee.
- Assignee role check at create (must hold submissions.prepare for act-for kinds, approvals.decide for MANAGER); nightly re-check flags health=ROLE_LOST and notifies the manager.
- ScopeEvaluator.ASSIGNED and AuthorizationService step 9 read the 'open and effective' predicate from OrgAssignmentRepository.isActingFor.

**UI requirements**
- Consultant card in Employees/Consultants shows PRIMARY/BACKUP/MANAGER chips with dates; 'Reassign…' SideSheet (new assignee, kind, reason, starts now/scheduled) with the consent note 'Anika will be asked to share with Priya'.
- History tab: chain rows (who → who, kind, dates, reason, by whom) using TimelineFeed; 390 and 1440 per 38 §1.
- Consultant side (user app Settings → Organizations): 'Sarah is now your marketer' card with 'Share resumes with Sarah' one-tap (existing share screen prefilled).

**Backend requirements**
- domain/org/OrgAssignment + OrgAssignmentRepository (findOpen, findOpenForAssignee, countOpenByAssignee, history, isActingFor).
- service/org/OrgAssignmentService (create, reassign, end, expireDelegates, recheckRoles) + AssignmentHandoverJob (15 min, ShedLock-ready).
- ScopeEvaluator ASSIGNED branch and AuthorizationService step 9 wired to the repository predicate; NotificationKind ORG_ASSIGNMENT, ORG_CONSENT added (NOTIFY_DEFAULTS: in-app on, email off).
- OrgAuditService constants ASSIGNMENT_REASSIGN, ASSIGNMENT_CAP_OVERRIDE added; existing ASSIGNMENT_CREATE/END used.

**Database changes**
- Changelog 202610xxxxxxxx_ent_assignments.xml: createTable org_assignment with the columns and generated keys of 17 §2; indexes (org_id, consultant_member_id, ends_at), (org_id, assignee_member_id, ends_at), (org_id, kind, ends_at).
- No change to org_member.support_owner_member_id (kept for STAFF).

**APIs**
- GET /api/orgs/{orgId}/assignments?consultant=&assignee=&kind=&open= · GET /assignments/history?consultant= · POST /assignments · POST /assignments/reassign · POST /assignments/{id}/end · GET /assignments/mine (17 §6).
- Errors: 409 ASSIGNMENT_CAP, 409 PRIMARY_EXISTS, 422 DELEGATE_NEEDS_END, 422 ASSIGNEE_ROLE.

**Permissions**
- assignments.manage (TEAM for Marketing Manager, ORG for Org Admin); consultants.view for reads; history readable by the consultant themself (self.*).

**Feature entitlements**
- —

**Acceptance criteria**
- Creating a second open PRIMARY for a consultant returns 409 PRIMARY_EXISTS; /reassign ends the old row with end_reason=REASSIGNED, sets replaced_by_assignment_id and opens the new row atomically (rollback test).
- A DELEGATE without ends_at → 422; a delegate past ends_at is ended by the job with DELEGATION_EXPIRED and the cover-ended notification is sent once.
- After a reassignment, data_share.full_to_member_id is unchanged; the consultant receives exactly one ORG_CONSENT re-point notification (dedupe consent:repoint:{member}:{assignee}); endPairingsTo runs only when the previous assignee has no other act-for row.
- AuthorizationService step 9 passes for PRIMARY/BACKUP/valid DELEGATE and fails (404 NOT_ASSIGNED) for MANAGER on an act-for operation and for an expired delegate.
- Every write produces exactly one org_audit_event row; all six routes are in the OrgIsolationIT registry and an outsider gets 404.

**Test cases**
- OrgAssignmentServiceTest, AssignmentConsentTest, AssignmentHandoverJobTest, ScopeEvaluatorAssignedTest, OrgIsolationIT lines, Playwright assignments.spec.ts (reassign sheet at 390, history at 1440).

- **Tech notes:** Follow 17-consultant-assignments.md exactly; the generated active-key pattern is org_member.active_key. Notifications after commit via @TransactionalEventListener.
- **Definition of Done:** Assignments drive ASSIGNED scope end to end; consent never moves without the consultant; tracker row Completed with test paths. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.1

### X4.8 — Workload balancing view for Marketing Managers: open assignments per marketer, caps from entitlement, drag/reassign with undo
- **Epic:** X4 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X4.7
- **Persona:** Marketing Manager
- **Objective:** Let a manager see and fix uneven load in one screen without losing history.
- **Story:** As a Marketing Manager, I want a workload board of my marketers with their open consultants and caps, so that I can rebalance by dragging a consultant to another marketer and undo if I slip.

**Functional requirements**
- GET /assignments/workload returns per assignee: open counts by kind, cap = min(consultants.max allowance, org.assignments.cap_per_marketer), utilisation, bench>N days list, scheduled handovers, health flags; sorted by utilisation desc (17 §5).
- Drag a consultant chip to another marketer → POST /assignments/reassign (kind PRIMARY, reason 'Workload balance'); exceeding the cap → 409 ASSIGNMENT_CAP unless override=true by an ORG-scope holder (audited ASSIGNMENT_CAP_OVERRIDE).
- Undo toast (8 s) performs the reverse reassign as a new row; history shows both moves.

**UI requirements**
- Workload page per 38 §4.1: WorkloadColumn primitive (capacity dots, chips with DragHandle on desktop, Menu 'Reassign…' on touch), health Badges, Dialog with reason on drop; 390 accordion layout.
- Add WorkloadColumn to packages/ui with tests before use.

**Backend requirements**
- OrgAssignmentService.workload(orgId, scopeMembers) + cap resolution via EntitlementService.check(quantity=0) for consultants.max (falls back to the setting when Session C's service is not yet present — behind a small CapResolver interface).

**Database changes**
- None (reads org_assignment, consultant_profile.bench_since when present).

**APIs**
- GET /api/orgs/{orgId}/assignments/workload (TEAM/ORG); reuses POST /assignments/reassign.

**Permissions**
- workload.view (TEAM) for Marketing Managers; assignments.manage for the drop action.

**Feature entitlements**
- consultants.max allowance read as a limit (quantity 0) — Session C's feature definition; no usage consumed.

**Acceptance criteria**
- Board shows every marketer in the manager's TEAM scope with correct open counts and caps; a marketer outside the team is absent (404 on direct id).
- Dropping beyond the cap shows the 409 message with counts and offers override only to ORG-scope holders; override writes ASSIGNMENT_CAP_OVERRIDE.
- Undo within 8 s creates the reverse assignment; history shows two rows; after 8 s the toast is gone and no reverse happens.
- Touch (390): no drag; Menu reassign works; reduced-motion honoured.

**Test cases**
- WorkloadServiceTest (cap resolution, sorting), AssignmentCapOverrideTest, Playwright workload.spec.ts (drag at 1440, menu at 390, undo).

- **Tech notes:** Desktop drag uses pointer events with keyboard fallback (select chip, press 'm', pick marketer).
- **Definition of Done:** Manager can rebalance in one screen; all moves audited; tracker row Completed. Plus the common DoD in `06-phase-plan.md` §5.

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

### X7 — Phase 7 — Consultant and resume management (fully specified, Session D)
_Consultant directory and profile overlay, org-managed resume links with approval and visibility, readiness, per-feature consent._

Design: `docs/enterprise-v2/30-resume-management.md`. Build order: X7.2 → X7.1 → X7.3 → X7.6 → X7.4 → X7.5 → X7.7.

### X7.2 — Consultant profile overlay (consultant_profile): availability, bench date, marketing status, preferences, self-declared work-auth category; consultant edits own, marketer proposes
- **Epic:** X7 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X4.7, X1.7
- **Persona:** Consultant / Marketer
- **Objective:** Give the org a membership-scoped overlay for marketing facts without copying career data or collecting documents.
- **Story:** As a consultant, I want to set my availability, bench date, marketing status and preferences for Acme, and accept or reject what my marketer proposes, so that the org markets me on facts I control.

**Functional requirements**
- consultant_profile per 03 §2.3 + 30 §2 additions (resume_summary_json, readiness_json, readiness_score, photo_consent); one row per member, created on first CONSULTANT role grant, deleted on leave (ADR-006).
- Consultant edits own fields (autosave); marketer edits create consultant_profile_proposal rows the consultant accepts/rejects (PROFILE_SUGGESTION-style card).
- work_auth_category is a self-declared label list (setting pipeline.work_auth_categories) — no document numbers, no expiry documents; free text scanned by SensitiveContent.check.
- Status effects: availability/marketing_status feed readiness (X7.7) and placement effects (35 §3).

**UI requirements**
- My Profile → 'For Acme' section in the consultant workspace (390 first): ChoiceGroup availability, MonthPicker/date for available_from, Switch marketing status, ChipInput skills/locations, rate band Select, photo consent Switch with the honest explanation.
- Marketer view: same fields read-only with 'Suggest a change' → BottomSheet → proposal chip 'Waiting for Anika'.

**Backend requirements**
- domain/org/ConsultantProfile, ConsultantProfileProposal; ConsultantProfileService (upsert own, propose, accept/reject); ResumeLifecycle listener stub for resume_summary (filled in X7.7).

**Database changes**
- Changelog 202610xxxxxxxx_ent_talent.xml changeSet 1: consultant_profile (columns 03 §2.3 + 30 §2) UNIQUE (org_id, member_id); consultant_profile_proposal (id, org_id, member_id, field, proposed_value_json, by_member_id, status, decided_at, created_at).

**APIs**
- GET/PATCH /api/me/orgs/{orgId}/profile · GET /api/me/orgs/{orgId}/profile/proposals · POST …/proposals/{id}/accept|reject · GET /api/orgs/{orgId}/consultants/{memberId}/profile · POST …/profile/proposals (marketer).

**Permissions**
- self.* (OWN) for the consultant; consultants.edit (ASSIGNED) for proposals; consultants.view for reads.

**Feature entitlements**
- —

**Acceptance criteria**
- Consultant PATCH persists and audits nothing (own data) but bumps updated_by; marketer PATCH is refused (404) and POST proposal creates a PENDING row; accept applies the value and records who proposed it.
- A work_auth_category value outside the setting list → 422; free text with a visa number → 422 SENSITIVE_CONTENT.
- Leaving the org deletes the overlay and proposals (OrgMembershipPrivacyService hook).
- photo_consent=false → directory DTO returns initials only.

**Test cases**
- ConsultantProfileServiceTest, ProposalFlowTest, SensitiveOverlayTest, OrgIsolationIT lines, Playwright consultant-profile.spec.ts.

- **Tech notes:** Membership-scoped: no org_id on person tables; the overlay row is the only org-owned copy and holds no career history.
- **Definition of Done:** Overlay editable by the consultant, proposals by marketers; no PII classes; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.12, O10.13

### X7.1 — Consultant directory: photo, skills, experience summary (consented), availability, marketing status, assigned marketer, license status, resume completeness
- **Epic:** X7 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X7.2, X4.7
- **Persona:** Org Admin / Marketer / Marketing Manager
- **Objective:** One list that answers 'who can we market, who is ready, who is mine' with consent made visible.
- **Story:** As a marketer, I want a directory of consultants with their availability, marketing status, assigned marketer, license and readiness, so that I can pick who to work on next without guessing what I'm allowed to see.

**Functional requirements**
- GET /consultants joins org_member × consultant_profile × data_share projection × open org_assignment × consultant_license × readiness per 30 §2; filters q/availability/marketing/marketer/license/readiness; paged.
- Scope: ASSIGNED for marketers, TEAM for managers, ORG for admins/HR/TA; consent projection per ShareField (experience summary only at FULL; readiness band at SUMMARY).
- Directory never calls ResumeAccessService per row; resume_summary_json is precomputed (X7.7 fills it; until then null → 'Not computed yet').

**UI requirements**
- Consultants page (38 §2.1 at 390/1440): cards with ConsentChip, availability dot, bench aging, ReadinessRing, assigned marketer chips, license chips; EmptyState texts from 38 §6; 'Ask Anika' with cooldown.
- Add ConsentChip and ReadinessRing primitives to packages/ui (tests) before use.

**Backend requirements**
- service/org/ConsultantDirectoryService (query + projection); ConsultantRowDTO; ScopeEvaluator used for the row filter.

**Database changes**
- Index consultant_profile (org_id, availability_status, marketing_status); none else.

**APIs**
- GET /api/orgs/{orgId}/consultants · GET /api/orgs/{orgId}/consultants/{memberId} (30 §9).

**Permissions**
- consultants.view (ASSIGNED/TEAM/ORG by role); member.view_summary/member.view_full projections via DataShareService.scopeOf.

**Feature entitlements**
- —

**Acceptance criteria**
- A marketer sees only consultants with an open act-for assignment to them; a direct GET on another marketer's consultant → 404.
- A consultant at SUMMARY shows readiness band and counts but no experience summary; at FULL naming the viewer the summary appears and a SHARE_READ_FULL audit row is written once per page view.
- Filters compose and page; 390 has no horizontal scroll; 1440 shows the three-pane layout.
- 'Ask Anika' is disabled for org.consent.request_cooldown_days after a request (server-enforced).

**Test cases**
- ConsultantDirectoryServiceTest (scope, projection, filters), ConsentRequestCooldownTest, OrgIsolationIT lines, Playwright consultants.spec.ts (390/1440).

- **Tech notes:** Projection through ShareField.project so a new field cannot leak; ShareMatrixTest unchanged (no new ShareField in this story).
- **Definition of Done:** Directory live for all roles with consent-honest blanks; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X7.3 — Resumes page for the org: org_resume links, named/primary per org, versions, approval status, visibility, view/download/print by permission, audit
- **Epic:** X7 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X7.1
- **Persona:** Marketer / Org Admin / Consultant
- **Objective:** Link, never copy: give the org management rights over person-owned resumes through org_resume.
- **Story:** As a marketer, I want to see the resumes a consultant shares with Acme, name the org's primary one, open or print the approved version and see its history, so that submissions use a resume everyone agrees on.

**Functional requirements**
- org_resume per 30 §3 with kinds PERSONAL_SHARED|ORG_MANAGED, approval_status, approved_version_no, visibility ORG|ASSIGNED|PRIVATE, primary_for_org (one per member), edit_allowed, ended_at/end_reason.
- OrgResumeLinkService.syncPersonal creates PERSONAL_SHARED links for non-archived resumes with share_with_org=TRUE when FULL is granted and on ResumeLifecycle events; ends links on archive/unshare/consent drop/leave.
- Reads go through ResumeAccessService.access → Via.ORG (FULL) and record ResumeViewEvent(ORG) + SHARE_READ_FULL; visibility ORG + org_feature_consent('resume.view_org') is the second qualifying path inside OrgShareResumeSharing.
- Print = web print stylesheet over the doc; download = rendered PDF only (409 PDF_NOT_READY passthrough); original upload is owner-only.

**UI requirements**
- Org Resumes page (list by consultant: display name, kind chip, approval Badge, version no, visibility, primary star, last marketer edit) + consultant Resumes tab; Menu for versions (named rows) per Notion-style; PDF/print actions by permission; 390/1440 per 38 §1.
- Consultant side (user app Resumes → 'Shared with Acme' section): per-link visibility Select, edit_allowed Switch, primary toggle.

**Backend requirements**
- domain/org/OrgResume + repository; OrgResumeLinkService; OrgShareResumeSharing extended with the visibility-ORG path; ActForResumeService facade (reads only in this story).

**Database changes**
- _ent_talent.xml changeSet 2: org_resume (30 §3 columns, generated live_key and primary_key, indexes).

**APIs**
- GET /api/orgs/{orgId}/resumes · GET /consultants/{memberId}/resumes · GET …/resumes/{resumeId}/doc · /pdf · /versions · /versions/{n}/text (30 §9); consultant: GET /api/me/orgs/{orgId}/resumes · PATCH /resumes/{orgResumeId}.

**Permissions**
- resumes.view_for (ASSIGNED/TEAM/ORG) + FULL consent for documents; consultant OWN for link settings; HR/Finance templates hold no resumes.* key (404).

**Feature entitlements**
- —

**Acceptance criteria**
- Granting FULL to Sarah creates PERSONAL_SHARED links for Anika's shared resumes; revoking ends them (end_reason UNSHARED) and Sarah's document GET → 404 on the next request.
- A HR_SPECIALIST GET on any resume route → 404; an ORG_ADMIN sees link metadata but gets 403 CONSENT_REQUIRED on /doc without FULL.
- Exactly one primary_for_org per (org, member); setting another flips the previous.
- Every document/PDF read writes ResumeViewEvent(viewer_kind=ORG) and SHARE_READ_FULL; print uses no new endpoint.

**Test cases**
- OrgResumeLinkServiceTest, ResumeAccessOrgIT (extended), ResumeViewAuditTest, OrgIsolationIT lines, Playwright org-resumes.spec.ts.

- **Tech notes:** Do not add columns to resume; ResumeAccessService.access keeps its signature — extend OrgShareResumeSharing only.
- **Definition of Done:** Org Resumes page works on real links; no content copied; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O8.4

### X7.6 — org_feature_consent: per-feature act-for consent with cooldown-limited requests; CONSENT_REQUIRED 403 card; immediate revoke
- **Epic:** X7 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X7.3, X5
- **Persona:** Consultant / Marketer
- **Objective:** Let a consultant allow specific act-for features (edits, AI tailoring, org-wide resume view) beyond FULL pairing, and revoke instantly.
- **Story:** As a consultant, I want to decide per feature what my marketer may do for me — edit my org resume, run AI tailoring, let the org view it — and withdraw any of it at once, so that FULL sharing doesn't mean 'anything'.

**Functional requirements**
- org_feature_consent per 03 §2.1 (feature_key, granted_to_member_id NULL = any assignee, consent_version, granted_at, revoked_at) + the missing HTTP route for DataShareService.grant (PUT /api/me/orgs/{orgId}/share).
- AuthorizationService step 10 consults it for CONSENT-dependency features and for resume.edit_for / resume.view_org; CONSENT_REQUIRED (403) response carries {beneficiary, consentKind, requestable, cooldownUntil}.
- Marketer 'Ask' creates a consent_request (member, feature, by, created_at) limited by org.consent.request_cooldown_days; the consultant gets ORG_CONSENT with one-tap grant.
- Revoke takes effect on the next request (no cache), audited SHARE_SCOPE_CHANGED-style CONSENT_CHANGED; data_share_event-like consent_event keeps proof.

**UI requirements**
- Consultant: Settings → Organizations → Acme → 'What Sarah may do' list of Switches (consent text version shown; 'can / can never' lists reused from O10.2 design); CONSENT_REQUIRED card in org pages ('Anika hasn't allowed this yet' + Ask button with cooldown state) via ConsentChip.

**Backend requirements**
- domain/org/OrgFeatureConsent, ConsentRequest; OrgFeatureConsentService; AuthorizationService step 10 implementation; web BFF 403 handling → card.

**Database changes**
- _ent_talent.xml changeSet 3: org_feature_consent (UNIQUE live (org_id, member_id, feature_key, granted_to_member_id)), consent_request, consent_event (login-keyed, append-only).

**APIs**
- GET/PUT /api/me/orgs/{orgId}/feature-consents · PUT /api/me/orgs/{orgId}/share · POST /api/orgs/{orgId}/consultants/{memberId}/consent-requests {featureKey}.

**Permissions**
- self.share_scope.set (OWN); any act-for permission may request.

**Feature entitlements**
- Feature keys with a CONSENT dependency (Session C's feature_dependency) are resolved here; no usage consumed by a request.

**Acceptance criteria**
- Without consent, an act-for tailor call returns 403 CONSENT_REQUIRED with the beneficiary and consentKind; after the consultant grants, the same call proceeds (402/200 per entitlement); after revoke, the next call is 403 again (no cache).
- A second request inside the cooldown → 429 CONSENT_COOLDOWN; the consultant never gets a duplicate notification (dedupe).
- consent_event rows survive membership erasure; org_feature_consent rows are ended on leave.

**Test cases**
- OrgFeatureConsentServiceTest, AuthorizationStep10Test, ConsentCooldownTest, OrgIsolationIT lines, Playwright consent.spec.ts (grant/revoke at 390).

- **Tech notes:** Mirror DataShareService patterns (ShareContext hashes, consent text under api/src/main/resources/consent/).
- **Definition of Done:** Per-feature consent enforced centrally; instant revoke proven; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.2

### X7.4 — Resume approval workflow: marketer proposes (ORG_MANAGED or edit of shared), consultant approves/rejects with diff, approved_version pin
- **Epic:** X7 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X7.3, X7.6
- **Persona:** Consultant / Marketer
- **Objective:** Nothing a marketer wrote is used until the consultant approves that exact version.
- **Story:** As a consultant, I want to review what Sarah changed against the version I approved, approve or reject it with a note, and know submissions can only use what I approved, so that every resume sent in my name is one I attest.

**Functional requirements**
- approval_status machine per 30 §5 (NOT_REQUIRED/DRAFT/PENDING_APPROVAL/APPROVED/REJECTED/STALE); any new resume_doc_version on an APPROVED link → STALE (ResumeLifecycle listener).
- Approve pins approved_version_no and approved_by_login; ResumeDocVersionService retention keeps pinned versions (keepIds).
- ApprovalGate: opportunity_match and candidate_submission may only reference APPROVED/NOT_REQUIRED links and pin the version (enforced here as a service, consumed by X8.4/X10.3).
- Notifications ORG_RESUME (request → consultant, decision → marketer), emailWorthy.

**UI requirements**
- Consultant review screen (38 §3.3): DiffText approved→current per section, Approve / Reject with note / 'Revert to v4?' offer; marketer sees Badge state and the note.
- Marketing Manager approvals list shows resume requests only when org.resume.manager_review=true (metadata only).

**Backend requirements**
- OrgResumeApprovalService (request, approve, reject, markStale); NotificationKind ORG_RESUME; ResumeDocVersionService.keepIds extension.

**Database changes**
- None beyond X7.3 columns.

**APIs**
- POST /api/orgs/{orgId}/consultants/{memberId}/resumes/{resumeId}/request-approval · POST /api/me/orgs/{orgId}/resumes/{orgResumeId}/approve · /reject {note}.

**Permissions**
- resumes.approve_request (ASSIGNED) for marketers; resumes.manage (OWN) for the consultant.

**Feature entitlements**
- —

**Acceptance criteria**
- Request on DRAFT → PENDING_APPROVAL and one ORG_RESUME notification; approve stores the current version_no; a later autosave by the marketer flips to STALE and the pinned version remains readable via /versions/{n}/text.
- Retention trimming never removes a pinned version (test with 30 autosaves).
- ApprovalGate.require(orgResumeId) throws 409 RESUME_NOT_APPROVED for DRAFT/PENDING/REJECTED/STALE.
- Reject with a note returns REJECTED and notifies the marketer; the consultant's optional revert calls the existing restore endpoint (no server-side auto revert).

**Test cases**
- ResumeApprovalStateTest, ApprovalGateTest, PinnedVersionRetentionTest, Playwright resume-approval.spec.ts (diff at 390).

- **Tech notes:** State table in 30 §5 is the contract; registry style like PipelineTransitions is optional here but the doc-sync test is required.
- **Definition of Done:** Approval machine complete; gate available to later phases; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X7.5 — Marketer-made resumes via the builder in act-for mode (FULL consent + resumes.edit_for), versions with reason, AI tailoring charged to the consultant's entitlement (or org pool)
- **Epic:** X7 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X7.4, X5
- **Persona:** Marketer
- **Objective:** Reuse the resume builder end to end for a marketer working on a consultant's resume, with actor/beneficiary recorded everywhere.
- **Story:** As a marketer with Anika's consent, I want to create or edit an org resume for her in the same builder she uses, with AI help paid by her license, so that I never maintain a second document format or a second AI budget.

**Functional requirements**
- Act-for BFF routes under /api/orgs/{orgId}/consultants/{memberId}/resumes/{resumeId}/doc delegating to ResumeDocService.save with byLogin=marketer; versions reason=MARKETER, name 'Edit by <marketer>', never trimmed.
- Create ORG_MANAGED: builder create path under the consultant's user with created_by_login=marketer, source COPY of the approved primary or BLANK, role TAILORED; link kind ORG_MANAGED, status DRAFT; first edit of a PERSONAL_SHARED link promotes it.
- AI (rewrite/summary/suggest/tailor) with @RequiresFeature(resume.optimization|ai.resume_tailoring, PATH_MEMBER) and AiCallContext(actor, beneficiary, orgId, featureKey, usageEventId); rate limits count against the actor, budget against the beneficiary (30 §6, 37 #3/#5).
- Edits blocked while PENDING_APPROVAL (409 RESUME_LOCKED); any edit on APPROVED → STALE.

**UI requirements**
- Web route /org/resumes/{orgResumeId}/edit mounting the existing builder with mode='act-for': banner, AiDisclosure 'charged to Anika's license', SaveStatusChip; AI panel hidden when the beneficiary lacks the feature (402 → chip).

**Backend requirements**
- ActForResumeService (write facade; the only org path into Resume*Service writes); ResumeAiService entry points accept beneficiaryLogin; AiRouter AiCallContext (from X5 metering story) consumed.

**Database changes**
- None (uses X7.3 + Session C's ai_call columns).

**APIs**
- PUT …/resumes/{resumeId}/doc · POST …/resumes · POST …/resumes/{resumeId}/ai/{rewrite|summary|suggest|tailor} (30 §9).

**Permissions**
- resumes.edit_for (ASSIGNED) + step 9 act-for assignment + step 10 FULL naming the actor and org_feature_consent('resume.edit_for') or link edit_allowed.

**Feature entitlements**
- resume.optimization (1 operation) and ai.resume_tailoring (1 tailoring), beneficiary = consultant, actor = marketer; CONSENT dependency on ai.resume_tailoring.

**Acceptance criteria**
- A marketer save creates resume_doc_version(reason=MARKETER, created_by_login=marketer) and audit MARKETER_RESUME_EDIT with beneficiary_login; the consultant's own autosave path is unchanged (regression test on /api/profile/resumes).
- Without FULL naming the marketer → 404; with FULL but no edit consent → 403 CONSENT_REQUIRED; with both → 200.
- AI tailor: usage_event(actor=sarah, member=anika) and ai_call(login=sarah, beneficiary_login=anika, feature_key) written; a failed provider call books the failure to anika with actor sarah.
- The marketer cannot create share links or read the original upload for the consultant (routes absent; MarketerVerbsTest).

**Test cases**
- ActForBuilderIT, ActForAiChargingTest, MarketerVerbsTest, PersonalBuilderRegressionIT, Playwright act-for-builder.spec.ts.

- **Tech notes:** Never fork the builder; pass mode and beneficiary through props; the BFF swaps the API base path only.
- **Definition of Done:** Marketer can build/edit with full attribution and correct charging; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.4

### X7.7 — Marketing readiness checklist per consultant (profile, approved resume, availability, license, consent) feeding the dashboard
- **Epic:** X7 · **Size/Complexity:** S/S · **Owners:** API, Web · **Deps:** X7.4, X7.2
- **Persona:** Marketer / Org Admin
- **Objective:** One number and one next action per consultant, computed from facts the org already has.
- **Story:** As a marketer, I want a readiness score and the single next thing to fix for each consultant, so that 'ready to market' is a fact, not a feeling.

**Functional requirements**
- ConsultantReadiness.compute per 30 §7 (weights, nextAction audience); stored in consultant_profile.readiness_json/readiness_score; recomputed by ConsultantReadinessJob hourly and on resume/profile/consent/assignment/license events.
- resume_summary_json computed at the same time (FULL-projected at read time only).

**UI requirements**
- ReadinessRing on directory cards and consultant page; 'Needs you' tab uses nextAction; Org Admin dashboard tile 'Ready to market: N of M' (Session B's dashboard spec consumes this DTO).

**Backend requirements**
- service/org/ConsultantReadiness + ConsultantReadinessJob; event listeners on ResumeLifecycle, DataShare changes, OrgAssignment changes, license changes (Session C event).

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/consultants/readiness-summary (counts) · included in ConsultantRowDTO.

**Permissions**
- consultants.view.

**Feature entitlements**
- —

**Acceptance criteria**
- Weights sum to 100; each check toggles the expected points (table-driven test); nextAction names the right audience.
- Recompute happens within 60 s of an approval or consent change (event path) and hourly otherwise.
- Readiness band is visible at SUMMARY; the summary text only at FULL.

**Test cases**
- ConsultantReadinessTest, ReadinessRecomputeEventTest, Playwright readiness.spec.ts.

- **Tech notes:** Pure function + job; keep the compute under 5 ms per consultant (no AI).
- **Definition of Done:** Readiness shown everywhere the design says; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X8 — Phase 8 — Talent marketing (fully specified, Session D)
_Assigned talent, job discovery and AI matching for a consultant, opportunity assignment and authorization, follow-ups, activities, duplicate guard — the marketer prepares, never submits (E1 answered 2026-10-12)._

Design: `docs/enterprise-v2/31-talent-marketing.md` · `docs/enterprise-v2/37-entitlement-hooks.md` · `docs/enterprise-v2/38-ux-talent-workspaces.md`. Build order: X8.10 → X8.1 → X8.2 → X8.3 → X8.4 → X8.5 → X8.8 → X8.6 → X8.7 → X8.9.

### X8.10 — Pipeline schema (_ent_pipeline.xml), PipelineTransitions registry, pipeline_event, PipelineService.transition, ORG_* notification kinds
- **Epic:** X8 · **Size/Complexity:** L/L · **Owners:** API · **Deps:** X7.4, X4.7
- **Persona:** Platform / Sonnet
- **Objective:** Lay down every pipeline table and the one transition engine so each later story adds rows to a registry instead of inventing status logic.
- **Story:** As the build team, we want the PIPELINE context tables, the transition registry and the event/notification plumbing in one additive migration, so that X8–X10 stories are thin and the doc↔code sync test guards every state machine.

**Functional requirements**
- Tables: job_opportunity (31 §3), opportunity_match (31 §4), candidate_submission (31 §5), pipeline_application_link (32 §2), interview_slot (33 §2), offer (31 §7), placement + placement_extension (35 §2), pipeline_event, pipeline_task (31 §12), client_account/client_contact/client_relationship/client_requirement (34 §1–2) — all org_id-first, generated live keys as specified.
- PipelineTransitions registry (data) + PipelineService.transition(entity, id, to, actor, body) with AuthorizationService, guards, effects, pipeline_event, audit, after-commit notifications; 409 PIPELINE_TRANSITION on illegal moves.
- NotificationKind ORG_OPPORTUNITY, ORG_AUTHORIZATION, ORG_APPROVAL, ORG_INTERVIEW, ORG_OFFER, ORG_PLACEMENT, ORG_HR, ORG_FINANCE (ORG_ASSIGNMENT/ORG_CONSENT/ORG_RESUME exist from X4.7/X7.4) with NOTIFY_DEFAULTS per 31 §11 and messages.properties keys notif.org.*.
- PipelineStateMachineTest renders the registry and diffs it against the tables in 31/33/35 (and 34 §2, 36 §2) — ShareMatrixTest pattern.

**UI requirements**
- None.

**Backend requirements**
- domain/org/pipeline/* entities + repositories (each with a REPOSITORY_CHECKS line in OrgIsolationIT); service/org/pipeline/{PipelineTransitions, PipelineService, PipelineEventService, Guards, Effects}; NotificationKind additions.

**Database changes**
- Changelog 202610xxxxxxxx_ent_pipeline.xml (additive): all tables above with indexes from the docs; retention of pipeline_event 36 months via a *PurgeJob per 03 §6.

**APIs**
- None public in this story (engine only); a dev-only POST /api/orgs/{orgId}/pipeline/_transition behind flag.enterprise.marketing allow-list for fixtures is NOT added — use service tests.

**Permissions**
- N/A (engine); every later route names its key.

**Feature entitlements**
- —

**Acceptance criteria**
- Changelog runs clean on empty DB and on the previous changelog (Liquibase test pattern); every table has org_id first in its primary index.
- PipelineStateMachineTest passes and fails when a doc table row is edited (proven by a deliberate mismatch in a unit test fixture).
- An illegal transition returns 409 with {entity, from, to}; a legal one writes exactly one pipeline_event and one audit row and publishes notifications after commit (rollback → none).
- NotificationKind.parse handles the new kinds; notification_preference matrix defaults apply.

**Test cases**
- PipelineStateMachineTest, PipelineServiceTest, PipelineEventPurgeJobTest, LiquibaseChangelogTest, NotificationKindDefaultsTest.

- **Tech notes:** Transition registry shape: Transition(entity, from, to, actorKind, permissionKey, guards[], effects[], notifications[]). Keep guards pure and effects idempotent.
- **Definition of Done:** Engine and schema in; later stories only register transitions; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X8.1 — Marketing workspace shell: My Assigned Talent, consultant switcher, consent/license chips
- **Epic:** X8 · **Size/Complexity:** M/M · **Owners:** Web, API · **Deps:** X8.10, X7.1, X2
- **Persona:** Marketer
- **Objective:** The marketer's home: their consultants, what needs them, and the switcher every other page keys off.
- **Story:** As a marketer, I want a workspace that opens on my assigned talent with consent and license chips and a consultant switcher, so that every page I open is already about the right person.

**Functional requirements**
- Workspace key MARKETING (05 §3) with nav from 38 §2; My Assigned Talent = GET /assignments/mine ⨝ directory rows; tabs Needs you / Ready / All from readiness.
- Consultant switcher (shell-level, Session B's pattern) persists the selected consultant per workspace; consent + license chips from X7.1 DTO.
- Home tiles: needs-you count, follow-ups due (X8.6 later), authorizations pending.

**UI requirements**
- 38 §2.1 at 390 (cards) and 1440 (three-pane); EmptyState texts; keyboard j/k/enter/a.

**Backend requirements**
- Marketer home DTO endpoint composing directory + assignment + counts.

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/marketing/home · GET /api/orgs/{orgId}/assignments/mine.

**Permissions**
- Any MARKETING_SPECIALIST permission to enter; rows scoped ASSIGNED.

**Feature entitlements**
- —

**Acceptance criteria**
- A marketer with 7 open assignments sees 7 cards; a consultant reassigned away disappears on reload; chips reflect consent and license live.
- Switching consultant updates the URL and the right rail; back/forward restores it.
- 390: no horizontal scroll; 1440: panes scroll independently.

**Test cases**
- Playwright marketing-shell.spec.ts; MarketingHomeDtoTest.

- **Tech notes:** Build on Session B's shell/workspace definitions (X4.2); do not create a second shell.
- **Definition of Done:** Marketer lands on assigned talent; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.3

### X8.2 — Job discovery for a consultant (JobSearchService with beneficiary) and org-curated job banks
- **Epic:** X8 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X8.1
- **Persona:** Marketer
- **Objective:** Search the public posting store for a specific consultant and keep an org bank of opportunities, without scraping anything.
- **Story:** As a marketer, I want to search jobs for Anika using her preferences and keep an Acme bank of opportunities (from the public boards we already ingest, pasted links, or the extension), so that assignment starts from a curated list.

**Functional requirements**
- JobSearchService.search(Request) reused with MatchPreferences derived from the consultant's bio/default resume under FULL (otherwise plain search); results show the consultant's existing applications/hides (JobFeedback) as chips.
- job_opportunity creation from a posting (source_label BOARD_API), a pasted URL (PASTED: URL + typed title/company only on unsupported hosts; supported hosts resolve via JobBoardUrls to the existing posting), or a requirement (X10.2); org job bank = job_opportunity rows with bank_id (org_job_bank(id, org_id, name, created_by)).
- OpportunityFreshnessJob: HEAD-only liveness check (31 §9) with org.pipeline.link_check switch (default per escalation D1); never fetches HTML.
- Duplicate guard rules 1 (unique posting per org) and dedupe_key warning.

**UI requirements**
- Job Discovery per 38 §2.2 (Search tab + Bank tab); 'Add jobs' BottomSheet (paste links one per line, pick from matches, extension-saved items); SourceChip per origin; BoardPolicy note on cards.

**Backend requirements**
- service/org/pipeline/OpportunityService (createFromPosting/Pasted/Requirement, close), OrgJobBankService, OpportunityFreshnessJob, BoardPolicy (setting pipeline.board_policies).

**Database changes**
- _ent_pipeline.xml changeSet: org_job_bank; job_opportunity already created in X8.10.

**APIs**
- GET /api/orgs/{orgId}/consultants/{memberId}/jobs/search?q… · GET/POST /api/orgs/{orgId}/opportunities · POST /opportunities/paste {urls[]} · POST /opportunities/{id}/close · GET/POST /banks.

**Permissions**
- opportunities.manage (ASSIGNED) for creating/closing; consultants.view for search; step 10 FULL only for preference-aware search (falls back to plain search at SUMMARY).

**Feature entitlements**
- None (core, free — 37 #2).

**Acceptance criteria**
- Pasting a greenhouse/lever/ashby URL links the existing job_posting (or triggers the existing single-board ingest) and stores apply_url; pasting any other host stores only URL + typed fields and no outbound fetch occurs (WireMock asserts zero GETs).
- The same posting pasted twice in one org → 409 OPPORTUNITY_EXISTS with the id.
- Search at SUMMARY ignores the consultant's preferences; at FULL it applies them and audits one SHARE_READ_FULL per search session.
- Freshness job marks CLOSED when HEAD returns 404/410 twice; respects the org switch.

**Test cases**
- OpportunityServiceTest, PastedLinkNoFetchTest, OpportunityFreshnessJobTest, BoardPolicyTest, OrgIsolationIT lines, Playwright job-discovery.spec.ts.

- **Tech notes:** Reuse JobBoardUrls/JobIngestService; add nothing that parses arbitrary HTML.
- **Definition of Done:** Discovery and bank usable; no scraping path exists; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.5, O8.2

### X8.3 — AI matching for a consultant (opportunity_match with score/reason, beneficiary entitlement ai.job_matching, actor recorded)
- **Epic:** X8 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X8.2, X5
- **Persona:** Marketer
- **Objective:** Score the org's opportunities for a consultant with the existing matching pipeline, charged to the consultant's license and attributed to the marketer.
- **Story:** As a marketer, I want AI-scored matches between Anika and our opportunities, paid by her license and recorded as me acting for her, so that I assign the right jobs first.

**Functional requirements**
- OrgMatchService.matchOne(orgId, memberId, actor): candidates = open job_opportunity rows (bank + requirements) ∪ JobPrefilter.select over fresh postings; one AiTask.JOBS call via the decide→generate→record sequence with AiCallContext(actor, beneficiary); writes opportunity_match SUGGESTED rows (source SUGGESTED_AI, score, reason ≤ 300, model); rule-only fallback (SUGGESTED_RULE, JobRanker) when the feature is not licensed.
- EntitlementService.check(actor=marketer, beneficiary=consultant, ai.job_matching, 1) per run; OrgMatchJob nightly for consultants with marketing_status ACTIVE and the feature (explicit check; idempotency key per day).
- Requires FULL (reads bio/resume) → otherwise CONSENT_REQUIRED and the rule fallback uses only consultant_profile skills.

**UI requirements**
- Job Matches tab per 38 §2.2 with AiDisclosure; 402 chip 'AI matching isn't on Anika's license'; SwipeCard select/dismiss at 390.

**Backend requirements**
- service/org/pipeline/OrgMatchService + OrgMatchJob; prompt reuse of JobMatchService.buildPrompt (make package-visible or extract JobsPrompt).

**Database changes**
- None beyond X8.10.

**APIs**
- POST /api/orgs/{orgId}/consultants/{memberId}/matches/run · GET /matches?consultant=&status= · POST /matches/{id}/dismiss.

**Permissions**
- matches.run (ASSIGNED); step 9 act-for; step 10 FULL.

**Feature entitlements**
- ai.job_matching — actor marketer, beneficiary consultant, 1 matching_run (37 #1); AiCallContext recorded.

**Acceptance criteria**
- With the feature licensed: one usage_event(actor=sarah, member=anika, feature=ai.job_matching) and one ai_call with beneficiary_login=anika per run; without: 402 on the handler and SUGGESTED_RULE rows from the job (no AI call).
- The same (opportunity, consultant) pair never produces two rows (unique key; rerun updates score/reason).
- Consent revoked → the nightly job skips the consultant and logs CONSENT_REQUIRED (no 403 leak to anyone).

**Test cases**
- OrgMatchServiceTest, OrgMatchJobTest (idempotency, skip rules), EntitlementHookTest for #1, Playwright matches.spec.ts.

- **Tech notes:** Scheduler path must call EntitlementService.check explicitly (no handler); keep the prompt identical to the personal one so quality stays comparable.
- **Definition of Done:** AI matching live with correct actor/beneficiary ledger rows; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X8.4 — Opportunity assignment: assign/withdraw, batch assign with default/override approved resume, one notification, duplicate guard
- **Epic:** X8 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X8.3, X7.4
- **Persona:** Marketer
- **Objective:** Turn suggestions into assignments the consultant sees, with the approved resume pinned and one notification per batch.
- **Story:** As a marketer, I want to assign one or many opportunities to Anika with a default approved resume (overridable per job) and a note, and withdraw if needed, so that she gets one clear list and one notification.

**Functional requirements**
- Transitions SUGGESTED/—→ASSIGNED, →WITHDRAWN per 31 §4 registered; guards: ApprovalGate on the chosen org_resume (pins resume_version_no), assignments.open_max cap (409 ASSIGNMENT_CAP), DuplicateGuard rules 2 and 5 (existing application → link instead), BoardPolicy; manager approval hold when org.pipeline.manager_approval applies.
- Batch endpoint creates N matches in one transaction with groupKey batch:{uuid} → exactly one ORG_OPPORTUNITY notification; opportunity → ASSIGNED.
- Feature marketing.assisted_applications consumed once per batch (37 #7).

**UI requirements**
- Assign bar per 38 §2.2 (useBottomBar), resume picker (APPROVED only; STALE disabled with reason), note; Opportunities Kanban per 38 §2.3 (Suggested/Assigned columns live).

**Backend requirements**
- OpportunityMatchService.assign(batch)/withdraw; transitions registered; BatchNotification.

**Database changes**
- None beyond X8.10.

**APIs**
- POST /api/orgs/{orgId}/matches {consultantMemberId, opportunityIds[], defaultOrgResumeId, overrides{}, note, confirmDuplicate?} · POST /matches/{id}/withdraw {reason}.

**Permissions**
- opportunities.manage (ASSIGNED); step 9; FULL not required to assign (metadata), but required to link an existing application.

**Feature entitlements**
- marketing.assisted_applications — actor marketer, beneficiary consultant, 1 operation per batch.

**Acceptance criteria**
- A batch of 14 creates 14 ASSIGNED rows, one notification, one usage_event; a row whose resume is STALE fails the whole batch with 409 RESUME_NOT_APPROVED {opportunityId}.
- Assigning a job the consultant already applied to (FULL) creates the row already IN_PROGRESS linked to their application and the card says so.
- Cap exceeded → 409 ASSIGNMENT_CAP; withdraw records reason and notifies the consultant.
- With manager approval ALWAYS the rows stay SUGGESTED with approval PENDING and appear in the manager's queue.

**Test cases**
- OpportunityMatchServiceTest, BatchAssignNotificationTest, ApprovalGateTest (reuse), DuplicateGuardTest rules 2/5, Playwright assign.spec.ts.

- **Tech notes:** Registry-driven; no status writes outside PipelineService.
- **Definition of Done:** Assignment flow complete through the engine; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.5

### X8.5 — Authorization requests: consultant accepts/declines and authorizes a submission; marketer sees state; approvals for Marketing Managers
- **Epic:** X8 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X8.4
- **Persona:** Consultant / Marketer / Marketing Manager
- **Objective:** The consultant's decisions and authorization scope become explicit states the marketer and manager can see.
- **Story:** As a consultant, I want to accept or decline what Sarah assigned and authorize exactly what she may do (I apply myself / she may present me to a client / both), and as a manager I want to approve assignments when my org requires it, so that nothing happens in my name without my say.

**Functional requirements**
- Transitions ASSIGNED→ACCEPTED/DECLINED, ACCEPTED→AUTHORIZED (scope APPLY_SELF|SUBMIT_RECORD|BOTH; SUBMIT_RECORD hidden for JOB_POSTING per BoardPolicy), →DECLINED(auth), manager approve/reject per 31 §4; guard RESUME_STALE on authorize.
- Notifications ORG_OPPORTUNITY (grouped to marketer), ORG_AUTHORIZATION (emailWorthy), ORG_APPROVAL to managers.
- Consultant-side list and detail endpoints (32 §2 subset: accept/decline/authorize/withdraw).

**UI requirements**
- Consultant: assigned opportunity detail per 38 §3.2 (Accept/Decline/Authorize with ChoiceGroup); Home 'Needs you'; marketer Kanban columns Accepted/Authorized; manager Approvals page per 38 §4.2.

**Backend requirements**
- Transitions registered; MatchDecisionService for the consultant routes; approvals query for managers.

**Database changes**
- None beyond X8.10.

**APIs**
- GET /api/me/orgs/{orgId}/opportunities · POST …/opportunities/{matchId}/accept|decline|authorize|withdraw · GET /api/orgs/{orgId}/approvals · POST /approvals/{matchId}/approve|reject.

**Permissions**
- opportunities.respond and submissions.authorize (OWN) for consultants; approvals.decide (TEAM) for managers; pipeline.view for marketers.

**Feature entitlements**
- —

**Acceptance criteria**
- Authorize with a STALE pinned resume → 409 RESUME_STALE; after approval of the new version it succeeds and stores scope and authorized_at.
- A marketer cannot call any consultant route (404); a MANAGER cannot authorize (registry has no such transition — NoSubmitSurfaceTest rule 4).
- Manager reject returns the row to SUGGESTED with a note; the marketer is notified once.
- JOB_POSTING opportunity: the authorize body with SUBMIT_RECORD → 422 BOARD_POLICY.

**Test cases**
- MatchDecisionTest, ManagerApprovalTest, BoardPolicyTest, Playwright authorize.spec.ts (390).

- **Tech notes:** Authorization is the consultant's write only; keep the consultant routes under /api/me/orgs/** with the user's own token.
- **Definition of Done:** E2E-D reaches 'Anika authorizes'; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X8.8 — Duplicate-submission guard across consultants and vendors; same-employer window setting
- **Epic:** X8 · **Size/Complexity:** S/S · **Owners:** API · **Deps:** X8.4
- **Persona:** Marketer / Account Manager
- **Objective:** Make the five duplicate rules one service with one response shape.
- **Story:** As a marketer, I want to be warned before presenting the same person to the same end client through another vendor or within a short window, and blocked from true duplicates, so that we never burn a client relationship by double-submitting.

**Functional requirements**
- DuplicateGuard service implementing 31 §8 rules 1–6 with settings org.pipeline.same_client_window_days (90), org.pipeline.max_submissions_per_requirement (3); 409 DUPLICATE_WARNING requires confirmDuplicate + reason (audited PIPELINE_DUPLICATE_OVERRIDE); hard uniques → 409 *_EXISTS.
- Vendor-chain resolution via client_relationship walk (34 §1).

**UI requirements**
- Inline warning card on assign/submission sheets with 'Proceed anyway' + reason (compact, no Dialog unless hard block).

**Backend requirements**
- service/org/pipeline/DuplicateGuard; wired into OpportunityService, OpportunityMatchService, SubmissionService (X10.3).

**Database changes**
- Settings keys registered in EnterpriseSettingKeys (org-overridable).

**APIs**
- None new; error bodies on existing POSTs.

**Permissions**
- As the calling routes.

**Feature entitlements**
- —

**Acceptance criteria**
- Each rule has a positive and negative test; the vendor-chain case (TekVendor → Globex and Prime → Globex) warns; override writes the audit row with the reason.
- Settings changes apply without restart.

**Test cases**
- DuplicateGuardTest (six rules), SettingsApplyTest.

- **Tech notes:** Pure service over repositories; no new tables.
- **Definition of Done:** Guard complete and wired; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.11

### X8.6 — Follow-ups and tasks: due dates, reminders, activity feed, status updates on matches/submissions
- **Epic:** X8 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X8.5
- **Persona:** Marketer
- **Objective:** Keep the marketer's day honest: what's due, what happened, what changed.
- **Story:** As a marketer, I want follow-up tasks with due dates and reminders, an activity feed of everything I and the system did, and quick status updates on my pipeline rows, so that nothing goes quiet for 45 days by accident.

**Functional requirements**
- pipeline_task CRUD per 31 §12 with auto-suggested follow-ups (org.pipeline.followup_days); FollowUpReminderJob daily (ORG_OPPORTUNITY digest) with alerts.advanced limit check for the richer digest (37 #11).
- Activity feed = pipeline_event by actor; status updates = transitions IN_PROGRESS→CLOSED_* by marketer with followups.manage.
- Ghost rule: OpportunityFreshnessJob closes IN_PROGRESS rows with no event for 2×org.pipeline.no_response_days.

**UI requirements**
- Follow-ups page (Today/Overdue/This week), Tasks sheet, Activities feed (TimelineFeed) per 38 §2.4; undo Toast on Done.

**Backend requirements**
- PipelineTaskService, FollowUpReminderJob, activity query.

**Database changes**
- pipeline_task created in X8.10; index (org_id, assignee_member_id, status, due_at).

**APIs**
- GET/POST/PATCH /api/orgs/{orgId}/pipeline/tasks[/{id}] · POST /tasks/{id}/done|snooze · GET /pipeline/activities?actor=me · POST /matches/{id}/status {to, reason}.

**Permissions**
- followups.manage (ASSIGNED); pipeline.view.

**Feature entitlements**
- alerts.advanced — actor = beneficiary = marketer, limit check only (37 #11).

**Acceptance criteria**
- A SUBMITTED record with no change for 7 days produces one suggested task; done/undo works within 8 s; reminders deduped per day.
- Without alerts.advanced the marketer still gets the basic in-app daily count; with it, the grouped digest email.

**Test cases**
- PipelineTaskServiceTest, FollowUpReminderJobTest, GhostRuleTest, Playwright followups.spec.ts.

- **Tech notes:** Tasks are org rows about pipeline objects, never about the consultant's private application.
- **Definition of Done:** Follow-ups and activities live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X8.7 — Marketer performance view (counts, response rates; k-anonymity rules not needed for own rows)
- **Epic:** X8 · **Size/Complexity:** S/S · **Owners:** API, Web · **Deps:** X8.6
- **Persona:** Marketer / Marketing Manager
- **Objective:** Show each marketer their own funnel and let managers compare the team.
- **Story:** As a marketer, I want my own numbers (assigned, accepted %, authorized %, submissions recorded, interviews, offers, placements, median days to authorize), and as a manager the same per team member, so that coaching is based on the pipeline, not impressions.

**Functional requirements**
- Metrics per 31 §13 computed from pipeline_event attributed by assignment_id (history preserved across reassignment); own rows unsuppressed; team table for managers (TEAM scope); org aggregates deferred to X12.1.

**UI requirements**
- Performance page: AnimatedNumber tiles + 12-week bars (chart via the dataviz rules), 390 stacked.

**Backend requirements**
- PipelinePerformanceService (SQL over pipeline_event with period buckets).

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/pipeline/performance?member=me|{id}&weeks=12.

**Permissions**
- reports.view (ASSIGNED own; TEAM for managers).

**Feature entitlements**
- —

**Acceptance criteria**
- Reassigning a consultant keeps the old marketer's historical counts; a marketer requesting another's id → 404; manager sees team rows only.

**Test cases**
- PipelinePerformanceServiceTest (attribution, buckets), Playwright performance.spec.ts.

- **Tech notes:** No AI, no suppression needed for self/team views; respect analytics.md for anything org-wide (not here).
- **Definition of Done:** Performance view done; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X8.9 — NoSubmitSurfaceTest + MarketerScopeTest kept green; E2E-D up to authorization in Playwright
- **Epic:** X8 · **Size/Complexity:** M/M · **Owners:** API, Web, QA · **Deps:** X8.5, X8.8
- **Persona:** Security / QA
- **Objective:** Prove structurally that no org surface can submit, and that scenario D runs to the consultant's authorization.
- **Story:** As the security owner, I want CI to fail if any org route, transition or UI label could submit an application or act as a consultant, and a Playwright journey covering scenario D to 'Anika authorizes', so that the E1 decision is enforced by tests, not reviews.

**Functional requirements**
- NoSubmitSurfaceTest per 31 §10 rules 1–4 (reflection over /api/orgs/** and /api/ent/** handlers, injected bean types, JWT claims, registry actors); web lint rule for forbidden labels under src/app/(org)/** (rule 6).
- MarketerScopeTest (sees only assigned+consented; another marketer's → 404) from prior art.
- Playwright e2e-d.spec.ts over the mock API (X1.12 tenants): Sarah assigned Anika → opens profile → reviews authorized resume → finds matching jobs → assigns → Anika approves (accept + authorize) — tagged @critical.

**UI requirements**
- None (tests).

**Backend requirements**
- Test classes under api/src/test/java/com/dossier/api/security/ent/; ESLint rule in web/eslint config.

**Database changes**
- None.

**APIs**
- None.

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Adding a handler named submitForConsultant under /api/orgs fails NoSubmitSurfaceTest (demonstrated by a temporary test fixture); adding a MANAGER→AUTHORIZED transition fails rule 4; a 'Submit application' button under (org) fails lint.
- e2e-d.spec.ts passes on CI against the mock; MarketerScopeTest green.

**Test cases**
- NoSubmitSurfaceTest, MarketerScopeTest, web lint test, Playwright e2e-d.spec.ts.

- **Tech notes:** Keep the allow-list of permitted verbs in one constant shared with MarketerVerbsTest (X7.5).
- **Definition of Done:** Guarantee is CI-enforced; scenario D half proven; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.10

### X9 — Phase 9 — Consultant applications, interviews, extension workspace (fully specified, Session D)
_Consultant workspace, assigned jobs, application link via submit-detect, interview coordination, AI interview prep (licensed), offers, extension workspace selector._

Design: `docs/enterprise-v2/32-applications.md` · `docs/enterprise-v2/33-interviews.md`. Build order: X9.1 → X9.2 → X9.3 → X9.4 → X9.5 → X9.6 → X9.7 → X9.8 → X9.9 → X9.10.

### X9.1 — Consultant workspace: Home, My Profile, My Resumes, Job Matches, Assigned Opportunities, Applications, Interviews, Offers, Placements, My Available Features, Notifications
- **Epic:** X9 · **Size/Complexity:** L/L · **Owners:** Web, API · **Deps:** X8.5, X2
- **Persona:** Consultant
- **Objective:** The consultant's org lens over their own app, branded by the org, with nothing copied.
- **Story:** As a consultant, I want a home in Acme's workspace that shows what needs me, my assigned opportunities, my own applications and interviews, offers, placements and what Acme licensed for me, so that I work in one place and keep my own account.

**Functional requirements**
- Workspace key CONSULTANT with nav per 38 §3; pages embed the existing user-area routes (tracker, resumes, interviews, job matches) inside the enterprise shell on tenant hosts; org-specific lists from /api/me/orgs/{orgId}/** (32 §1).
- Home composition: needs-you (resume approvals, slot confirmations, offers), assigned opportunities, counts; SpeechBubble only when something is new.
- My Available Features = Session C's entitlement view embedded.

**UI requirements**
- 38 §3.1 Home at 390/1440; EmptyState texts; the existing tracker gets a 'From Acme' filter preset (application.source='org' or linked).

**Backend requirements**
- ConsultantHomeService (counts + needs-you); user-area routes unchanged.

**Database changes**
- None.

**APIs**
- GET /api/me/orgs/{orgId}/home.

**Permissions**
- self.* (OWN); the shell derives nav from the CONSULTANT template.

**Feature entitlements**
- —

**Acceptance criteria**
- A consultant on acme.localhost lands on Home with the org brand and sees only their own data; a non-consultant member gets the 'not part of your role' state.
- The personal workspace is unchanged (PersonalSubscriptionUnchangedIT + Playwright regression of /applications).
- 390: every tile reachable without horizontal scroll.

**Test cases**
- ConsultantHomeServiceTest, Playwright consultant-workspace.spec.ts.

- **Tech notes:** Reuse user-area components; the org lens is routing + branding, not new CRUD.
- **Definition of Done:** Consultant workspace live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X9.2 — Assigned jobs list for the consultant and application link via submit-detect (pipeline_application_link); marketer sees APPLIED live
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** API, Web, Ext · **Deps:** X9.1
- **Persona:** Consultant / Marketer
- **Objective:** Close the loop: the consultant applies in their own session and the org learns it from submit-detect, never from a marketer click.
- **Story:** As a consultant, I want to open an assigned job and apply with my own extension, and have Acme's record update by itself, so that Sarah sees progress without ever touching my application.

**Functional requirements**
- pipeline_application_link + PipelineApplicationLinker per 32 §2: ApplicationStatusChanged event added to ApplicationEventService.recordStatus (additive); matching by posting_id, normalised jobUrl, or companyKey+roleTitle within 30 days; manual link/unlink routes; status mirror SYSTEM-only.
- 'Apply' opens apply_url; 'Save to my board' creates the application (source 'org', SAVED) and links; hints.resumeId on /api/profile/version (32 §5 subset) so the drawer preselects the pinned resume.
- Marketer pipeline polls/SSE for live APPLIED.

**UI requirements**
- Assigned opportunity detail per 38 §3.2 (post-authorize actions); marketer Kanban card turns IN_PROGRESS with 'applied 2 min ago'.

**Backend requirements**
- PipelineApplicationLinker (@TransactionalEventListener), link routes, ProfileVersion hints.

**Database changes**
- pipeline_application_link created in X8.10; application_note unchanged here.

**APIs**
- POST /api/me/orgs/{orgId}/opportunities/{matchId}/link {applicationId} · /unlink · POST …/save-to-board · GET /api/profile/version (hints).

**Permissions**
- OWN for the consultant; marketers read via pipeline.view.

**Feature entitlements**
- —

**Acceptance criteria**
- Submit-detect PUT APPLIED on an application whose postingId matches an AUTHORIZED match links it and moves the match to IN_PROGRESS within the same transaction; the marketer's list shows it on next poll.
- No org route can set application.status (NoSubmitSurfaceTest rule 2 stays green); the linker runs only on the consultant's own events.
- Unlink keeps unlinked_at and the match returns to AUTHORIZED.
- Extension version bumped (wxt.config.ts + package.json) for the hints change.

**Test cases**
- PipelineApplicationLinkerTest, LinkRoutesTest, extension sync hint test, Playwright apply-loop.spec.ts (mock submit-detect).

- **Tech notes:** Keep the linker tolerant: never fail the user's own status write because org matching failed (catch + log).
- **Definition of Done:** Apply loop proven end to end; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O10.6, O10.8

### X9.3 — Application tracking for the org: consented stage view, timeline merge of application_event and pipeline_event
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X9.2
- **Persona:** Marketer / Org Admin
- **Objective:** One read model that respects consent and merges both timelines.
- **Story:** As a marketer, I want a consented view of a consultant's applications with a merged timeline of what they did and what we did, so that I can follow progress without seeing anything they didn't share.

**Functional requirements**
- ApplicationOrgViewService per 32 §3: SUMMARY → stage counts/last activity; FULL → rows + merged timeline (application_event ∪ pipeline_event) with actor tags; shareable notes via application_note.shared_with_org (additive column, owner toggles).
- Ghost indicator derived; never stored.

**UI requirements**
- None in this story (API read model; UI in X9.4).

**Backend requirements**
- ApplicationOrgViewService; ShareField projection; note toggle in ApplicationNoteService.update.

**Database changes**
- Additive: application_note.shared_with_org BOOLEAN DEFAULT FALSE (user-area table, additive changeSet).

**APIs**
- GET /api/orgs/{orgId}/applications?consultant=&status=&period= · GET /consultants/{memberId}/applications/{applicationId} · PATCH /api/profile/applications/{id}/notes/{nid} {sharedWithOrg}.

**Permissions**
- pipeline.view / applications.view; FULL for rows; SUMMARY for counts.

**Feature entitlements**
- —

**Acceptance criteria**
- At SUMMARY the response has no company names (schema test); at FULL the timeline interleaves both event sources ordered by time with correct actor tags.
- A note with shared_with_org=false never appears to any org viewer; toggling it on appears on next read.

**Test cases**
- ApplicationOrgViewTest, TimelineMergeTest, NoteSharingTest.

- **Tech notes:** Project through ShareField; do not add a new ShareField (reuse APPLICATION_DETAIL/EMPLOYER_DETAILS).
- **Definition of Done:** Read model done; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X9.4 — Applications page (org side) consent-scoped on real data
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** Web · **Deps:** X9.3
- **Persona:** Marketer / Org Admin
- **Objective:** Replace the sample-data org Applications page with the consented read model.
- **Story:** As an org admin or marketer, I want the Applications page to show real, consent-scoped data with honest blanks, so that the org dashboard stops lying with sample data.

**Functional requirements**
- Org Applications page on X9.3 DTOs: per-consultant stage tiles (SUMMARY), expandable rows and timeline (FULL); 'From Acme' vs 'Own' split; filters by consultant/status/period.

**UI requirements**
- 38 §1 rules; TimelineFeed primitive (add to packages/ui); 390 cards / 1440 table; EmptyState 'nothing shared'.

**Backend requirements**
- None.

**Database changes**
- None.

**APIs**
- Uses X9.3 routes.

**Permissions**
- pipeline.view.

**Feature entitlements**
- —

**Acceptance criteria**
- Sample-data component for applications removed (O8.5 pointer); page renders SUMMARY and FULL variants from the mock API; 390/1440 checks pass.

**Test cases**
- Playwright org-applications.spec.ts; unit tests for TimelineFeed.

- **Tech notes:** Delete web/src/components/org-v2/applications sample usage; keep component names where Session B's shell expects them.
- **Definition of Done:** Org Applications page real; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O8.1, O8.5

### X9.5 — Interview coordination: interview_slot propose/confirm, consultant accepts into own calendar (interview row), ICS, reminders
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X9.2, X8.10
- **Persona:** Marketer / Consultant
- **Objective:** Coordinate interviews on the org side while the consultant's calendar stays their own.
- **Story:** As a marketer, I want to propose an interview slot with a client contact and have Anika confirm it into her own calendar with an .ics and reminders, so that scheduling is coordinated but her data stays hers.

**Functional requirements**
- interview_slot state machine per 33 §3 registered; confirm creates the person interview row via InterviewService.create with source ORG (new constant) and nullable application_id (additive change); one-way reconciliation; InterviewSlotSuggester under FULL.
- IcsCalendar.event(...) overload; GET …/interviews/{slotId}/ics; InterviewReminderJob (10 min) writing reminder_24h/1h columns for all person rows; ORG_INTERVIEW notifications per 33 §3.
- Overlap guard SLOT_OVERLAP.

**UI requirements**
- Consultant confirm/decline BottomSheet (390) with .ics button; marketer propose SideSheet; Home 'Needs you' entry.

**Backend requirements**
- InterviewSlotService + transitions; IcsCalendar overload; InterviewReminderJob; Interview.SRC_ORG.

**Database changes**
- interview_slot created in X8.10; additive: interview.application_id nullable (dropNotNullConstraint), interview_prep table deferred to X9.7.

**APIs**
- POST /api/orgs/{orgId}/interviews · POST …/{slotId}/repropose|cancel|no-show|outcome · GET …/{slotId}/ics · GET/POST /api/me/orgs/{orgId}/interviews[/{slotId}/confirm|decline|cancel|done|feedback].

**Permissions**
- interviews.coordinate (ASSIGNED/ORG) for org actors; interviews.manage (OWN) for the consultant.

**Feature entitlements**
- —

**Acceptance criteria**
- Confirm creates exactly one interview row owned by the consultant with source ORG and links it; the org cannot edit that row (no route); cancelling on the org side leaves the row with a note.
- ICS output has VTIMEZONE, UID slot-<id>@kiwiply.com and no ATTENDEE; reminders are sent once per column.
- A second CONFIRMED slot overlapping in time → 409 SLOT_OVERLAP.
- SUMMARY viewers see 'Interview · Anika' without client names (projection test).

**Test cases**
- InterviewSlotStateTest, SlotConfirmCreatesPersonRowTest, IcsCalendarEventTest, InterviewReminderJobTest, SlotOverlapTest, Playwright interviews.spec.ts.

- **Tech notes:** Reuse InterviewService verbatim for the person row; the reminder job fulfils the parked U7 reminder intent for everyone.
- **Definition of Done:** Interview coordination live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X9.6 — Interviews page (org side) and calendar of consented interviews
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** Web, API · **Deps:** X9.5
- **Persona:** Marketer / Account Manager / Org Admin
- **Objective:** Replace the sample Interviews page with the slot calendar at the viewer's scope and consent.
- **Story:** As a marketer, I want an org calendar of interview slots (week/agenda) with client details only where consent allows, so that I can coordinate a week without exposing anyone's details.

**Functional requirements**
- GET /api/orgs/{orgId}/interviews?from&to&consultant&status with consent projection (33 §5); week/agenda views; outcome/no-show actions inline for coordinators.

**UI requirements**
- Reuse the user app's Calendar primitive from @kiwiply/ui (add if missing); 390 agenda list, 1440 week grid; EmptyState.

**Backend requirements**
- Query + projection in InterviewSlotService.

**Database changes**
- None.

**APIs**
- Uses X9.5 routes.

**Permissions**
- interviews.coordinate / pipeline.view.

**Feature entitlements**
- —

**Acceptance criteria**
- Sample interviews component removed; SUMMARY viewer sees blocks without client names; coordinator actions update the slot and the consultant is notified.

**Test cases**
- Playwright org-interviews.spec.ts; projection unit test.

- **Tech notes:** Keep calendar logic shared with the user app (same primitive).
- **Definition of Done:** Org Interviews page real; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O8.3

### X9.7 — AI Interview Preparation for consultants gated by interview.ai_prep entitlement; mascot encouragement
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X9.5, X5
- **Persona:** Consultant
- **Objective:** Text-only AI prep from what the org and the consultant already hold, paid by the consultant's license.
- **Story:** As a consultant with an interview coming, I want a prep plan (focus areas, likely questions with STAR hints, stories to prepare) generated from the requirement and my approved resume, so that I walk in ready — and Acme never sees my prep.

**Functional requirements**
- AiTask.PREP + InterviewPrompts.PREP_PLAN with the closed schema of 33 §6; inputs limited to org-held requirement/posting text and the pinned resume text; no external fetch; consent flag required as in existing AI endpoints.
- interview_prep table (person-owned, no org_id); marketer may request (nudge) but generation runs in the consultant's session only.
- @RequiresFeature(interview.ai_prep, SELF) with workspace header; org-curated practice sets (O8.6) shown alongside when published.

**UI requirements**
- Interview detail → 'Prepare' panel (390 first): sections as cards, AiDisclosure, one SpeechBubble line; 402 state with the honest alternative.

**Backend requirements**
- InterviewPrepService; prompt file; AiCallContext self.

**Database changes**
- Changelog changeSet (user area, additive): interview_prep (id, user_id, slot_id NULL, interview_id NULL, plan_json, model, created_at).

**APIs**
- POST /api/profile/interviews/{id}/prep · GET …/prep · POST /api/orgs/{orgId}/interviews/{slotId}/prep/request.

**Permissions**
- OWN for the consultant; interviews.coordinate for the nudge.

**Feature entitlements**
- interview.ai_prep — actor = beneficiary = consultant, 1 session (37 #10).

**Acceptance criteria**
- Generation writes usage_event and ai_call for the consultant; without the feature → 402 FEATURE_NOT_LICENSED and no AI call; the marketer's request creates one ORG_INTERVIEW nudge and consumes nothing.
- No org route returns interview_prep rows (reflection test); output validates against the schema; redaction applied to inputs.

**Test cases**
- InterviewPrepServiceTest, PrepSchemaTest, NoOrgReadOfPrepTest, Playwright prep.spec.ts.

- **Tech notes:** Wire value 'prep' (≤ 12 chars for ai_call.task); reuse the Prompt record and prompt-versioning conventions of ResumePrompts.
- **Definition of Done:** AI prep live and private; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X9.8 — Offers: extend/record, consultant responds, feedback capture
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X9.5
- **Persona:** Account Manager / Marketer / Consultant
- **Objective:** Offers as org records the consultant answers, with rates kept as records.
- **Story:** As an account manager, I want to record and extend an offer to Anika with rate records and an expiry, and have her accept or decline with a note, so that placements start from an explicit yes.

**Functional requirements**
- offer machine per 31 §7 registered (DRAFT/EXTENDED/ACCEPTED/DECLINED/EXPIRED/WITHDRAWN); ACCEPTED creates placement PENDING_START (X10.4 owns placement effects beyond creation); rates as records with DTO redaction (bill rate to AM/finance only); ORG_OFFER notifications; OfferExpiryJob.
- Consultant may mark their own linked application OFFER from the same screen (their own token, user-area route).

**UI requirements**
- AM/marketer offer SideSheet; consultant Offers page + accept/decline BottomSheet (390); offer card on Home 'Needs you'.

**Backend requirements**
- OfferService + transitions; redaction in DTO mapper; OfferExpiryJob.

**Database changes**
- offer created in X8.10; add ShareField.OFFERS (FULL) + the matching row in docs/design/org/consent-data-sharing.md §3 (ShareMatrixTest).

**APIs**
- GET/POST /api/orgs/{orgId}/offers · GET/PATCH /offers/{id} · POST /offers/{id}/extend|withdraw · POST /api/me/orgs/{orgId}/offers/{id}/accept|decline.

**Permissions**
- offers.manage (AM ORG; marketer ASSIGNED) and offers.respond (OWN).

**Feature entitlements**
- —

**Acceptance criteria**
- Extending sends one ORG_OFFER email-now notification; accept creates one placement PENDING_START and sets submission OFFERED; decline records reason; expiry job flips EXTENDED→EXPIRED once.
- bill_rate_minor absent from consultant and marketer DTOs (schema test); pay_rate visible to the consultant.
- ShareMatrixTest passes with the new OFFERS row.

**Test cases**
- OfferStateTest, OfferDtoRedactionTest, OfferExpiryJobTest, ShareMatrixTest, Playwright offers.spec.ts.

- **Tech notes:** Money in minor units + currency; never floats; rate_basis label.
- **Definition of Done:** Offers flow complete; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X9.9 — Extension workspace selector: GET /api/profile/version workspaces[], X-Kiwiply-Workspace header, per-workspace mirror partition, 'Pro via Acme' only inside the org workspace
- **Epic:** X9 · **Size/Complexity:** L/L · **Owners:** Ext, API · **Deps:** X9.2, X5
- **Persona:** Consultant / Marketer (extension users)
- **Objective:** Make the extension workspace-aware without a new login or a new origin (E6 default a).
- **Story:** As a consultant who is also a personal user, I want to switch the extension between Personal and Acme, see Acme's licensed features only there, and keep my learned answers, so that one extension serves both lives without mixing them.

**Functional requirements**
- ProfileVersion response gains workspaces[] and hints (additive); WorkspaceHeaderFilter validates X-Kiwiply-Workspace against ACTIVE membership (404 otherwise) and sets TenantContext for workspace-aware /api/profile/** reads; plan resolution per ADR-018 (no stacking).
- Extension: workspace chip in the drawer; storage.js partitions ACCOUNT_KEYS by workspace prefix; clearAccountData clears all; TrackingProvider gains listWorkspaces/setWorkspace/assignedJobs/saveForConsultant; marketer-only 'Save for consultant…' drawer action (creates job_opportunity + draft match via POST /api/orgs/{orgId}/opportunities/from-extension).
- no_submit.test.js: autofill always uses the signed-in user's own profile; BLOCK_RE unchanged; no click on submit-class controls in fixtures.

**UI requirements**
- Drawer header chip (Personal / Acme) using the drawer's existing design tokens; assigned jobs list in the drawer's Jobs tab when in an org workspace.

**Backend requirements**
- WorkspaceHeaderFilter, ProfileVersion extension, OpportunityService.fromExtension; extension modules per 32 §5.

**Database changes**
- None.

**APIs**
- GET /api/profile/version (extended) · POST /api/orgs/{orgId}/opportunities/from-extension {consultantMemberId, url, title, company} · header X-Kiwiply-Workspace on all org-workspace calls.

**Permissions**
- Membership check in the filter; opportunities.manage for saveForConsultant.

**Feature entitlements**
- Plan/feature visibility: 'Pro via Acme' only when the header names Acme (ADR-018); no feature consumed by the selector.

**Acceptance criteria**
- A forged workspace header → 404 before any data; without the header the personal plan applies (PersonalSubscriptionUnchangedIT extended).
- Switching workspaces swaps resumes/assigned jobs/plan and keeps learned answers; account change wipes all partitions (account_clear.test.js extended).
- In a marketer session the drawer never loads a consultant's bio (jsdom test) and only 'Save for consultant…' is offered.
- Versions bumped in wxt.config.ts and package.json; rules version untouched.

**Test cases**
- WorkspaceHeaderFilterIT, extension workspace.test.js, no_submit.test.js, account_clear.test.js (extended), Playwright e2e-e.spec.ts (personal compatibility).

- **Tech notes:** Token stays user-only (no tid for extension tokens); the header is the only workspace signal; /connect stays on kiwiply.com.
- **Definition of Done:** Extension workspace-aware and still single-account; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** O3.4, O10.7

### X9.10 — E2E-D completion (submit in own session → interview → outcome) and E2E-E personal-compatibility Playwright journeys
- **Epic:** X9 · **Size/Complexity:** M/M · **Owners:** QA, Web · **Deps:** X9.9, X9.8
- **Persona:** QA
- **Objective:** Prove scenarios D and E end to end on the mock tenants.
- **Story:** As QA, I want Playwright journeys for scenario D from authorization through Anika applying in her session, interview scheduling and outcome/placement recording, and for scenario E (personal subscription unchanged), so that the programme's two consultant-facing promises are regression-tested.

**Functional requirements**
- e2e-d.spec.ts extended: Anika opens the job → mock submit-detect → both track → Sarah proposes interview → Anika confirms (.ics) → outcome recorded → offer → accept → placement recorded (X10.4 may stub placement until built).
- e2e-e.spec.ts: Anika personal Pro → joins Acme → Acme licenses features → personal subscription unchanged → features only in Acme workspace → billing separate (mock).

**UI requirements**
- None (tests).

**Backend requirements**
- Mock API fixtures for the pipeline objects (X1.12 extension).

**Database changes**
- None.

**APIs**
- None.

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- Both specs tagged @critical and green in CI; each step asserts the consent/plan state the scenario names.

**Test cases**
- Playwright e2e-d.spec.ts, e2e-e.spec.ts; mock fixtures unit test.

- **Tech notes:** Reuse X8.9's spec file and continue it; keep steps data-driven from one scenario JSON.
- **Definition of Done:** Scenarios D and E proven; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10 — Phase 10 — Clients and placements (fully specified, Session D)
_Client accounts, contacts, vendor relationships, requirements, candidate submissions (records), offers, placements, extensions and redeployment, Account Manager workspace._

Design: `docs/enterprise-v2/34-clients.md` · `docs/enterprise-v2/35-placements.md`. Build order: X10.1 → X10.2 → X10.3 → X10.4 → X10.8 → X10.6 → X10.5 → X10.7.

### X10.1 — Client accounts, contacts, relationships (vendor chains) CRUD with PII scanner
- **Epic:** X10 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X8.10, X11.7
- **Persona:** Account Manager
- **Objective:** One client model with edges, scanned on every field.
- **Story:** As an account manager, I want to manage clients, vendors, primes and partners with their contacts and how they relate (who subcontracts to whom), so that requirements and placements always point at real relationships.

**Functional requirements**
- client_account/client_contact/client_relationship per 34 §1 (tables from X8.10) with CRUD, archive, DO_NOT_WORK reason, work-email rule (422 WORK_EMAIL_REQUIRED), cycle refusal (422 RELATIONSHIP_CYCLE), @NoSensitiveText on every String field.

**UI requirements**
- Clients list + account page per 38 §5 (Tabs: Contacts, Relationships as nested chips, Requirements, Placements); SideSheets with autosave; 390/1440.

**Backend requirements**
- ClientService, ClientRelationshipGraph; DTOs annotated.

**Database changes**
- Indexes and generated name key per 34 §1 (addColumn/createIndex if not in X8.10).

**APIs**
- 34 §6 client/contact/relationship routes.

**Permissions**
- clients.view / clients.manage (ORG for AM; ORG_ADMIN read).

**Feature entitlements**
- —

**Acceptance criteria**
- Creating a contact with a gmail.com address → 422; a note containing an EIN → 422 SENSITIVE_CONTENT; a relationship forming a cycle → 422.
- Two clients with the same name (case-insensitive) → 409; archive hides from pickers but keeps history.
- All routes in OrgIsolationIT; mutations audited CLIENT_*.

**Test cases**
- ClientServiceTest, ClientRelationshipGraphTest, ContactWorkEmailTest, SensitiveTextCoverageTest (package), Playwright clients.spec.ts.

- **Tech notes:** Keep ops_client_id/ops_vendor_id nullable; the bridge (X10.8) fills them.
- **Definition of Done:** Client model live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10.2 — Client requirements: intake (manual/email paste/import), status, owner, dedupe
- **Epic:** X10 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X10.1
- **Persona:** Account Manager / Marketer
- **Objective:** Requirements with their own lifecycle that automatically become opportunities.
- **Story:** As an account manager, I want to capture requirements by typing, pasting a vendor email or importing CSV, with dedupe and status, so that marketers can match consultants to them the moment they arrive.

**Functional requirements**
- client_requirement per 34 §2 with the state machine registered; OPEN creates job_opportunity(kind=CLIENT_REQUIREMENT); RequirementParser (rules; AI enrich only on confirm, charged to the AM — 37 #14); pasted text scanned and refused on PII; CSV import with per-row dedupe preview.

**UI requirements**
- Requirements board by status; intake SideSheet with paste Textarea → prefilled fields; import preview table; 390/1440.

**Backend requirements**
- RequirementService + transitions; RequirementParser; CsvImport.

**Database changes**
- None beyond X8.10 (dedupe_key index).

**APIs**
- 34 §6 requirement routes incl. /parse and /import.

**Permissions**
- requirements.manage; pipeline.view for reads.

**Feature entitlements**
- marketing.assisted_applications for AI enrichment — actor = beneficiary = AM, 1 operation (37 #14).

**Acceptance criteria**
- Paste with a candidate SSN → 422 and nothing stored; rules extract title/rate/location on the fixture corpus ≥ 80 %; AI enrich only after the user confirms and writes usage_event for the AM.
- Duplicate (client+title+location+external_reference) → 409 REQUIREMENT_EXISTS; closing a requirement withdraws open matches and closes the opportunity.
- FILLED auto-sets when placements reach positions.

**Test cases**
- RequirementStateTest, RequirementParserTest, RequirementDedupeTest, CsvImportTest, Playwright requirements.spec.ts.

- **Tech notes:** No mailbox read; paste only.
- **Definition of Done:** Requirements intake live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10.3 — Candidate submissions as records: authorize → submitted → shortlisted/rejected; unique per requirement+consultant; channel label and external reference
- **Epic:** X10 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X10.2, X8.5
- **Persona:** Marketer / Account Manager / Consultant
- **Objective:** The CRM record of presenting a consultant, authorized by them, recorded by us, transmitted by nobody.
- **Story:** As a marketer, I want to prepare a submission packet (approved resume version, rate band, notes) that Anika authorizes, then record when and how I presented it outside Kiwiply and its outcome, so that the pipeline is accurate without Kiwiply ever sending anything.

**Functional requirements**
- candidate_submission machine per 31 §5 registered (DRAFT/AUTHORIZED/SUBMITTED/SHORTLISTED/INTERVIEWING/REJECTED/OFFERED/WITHDRAWN); DuplicateGuard rules 3–4/6; ApprovalGate pin; authorization through the match (scope ⊇ SUBMIT_RECORD); 'Record submission' sets submitted_at (entered), channel_label, external_reference; inbox suggestions (D4) are confirm-only.
- marketing.assisted_applications consumed per DRAFT and per record (37 #7).

**UI requirements**
- Submissions table and 'Record what you sent outside Kiwiply' SideSheet per 38 §2.3; consultant packet review inside the authorize sheet (resume version, rate band, client/vendor).

**Backend requirements**
- SubmissionService + transitions.

**Database changes**
- None beyond X8.10.

**APIs**
- GET/POST /api/orgs/{orgId}/submissions · POST /submissions/{id}/record|shortlist|reject|withdraw · GET /requirements/{id}/submissions.

**Permissions**
- submissions.prepare (ASSIGNED), submissions.record (ASSIGNED/ORG), submissions.authorize (OWN) via the match.

**Feature entitlements**
- marketing.assisted_applications — actor marketer/AM, beneficiary consultant, 1 operation.

**Acceptance criteria**
- DRAFT without an APPROVED resume → 409; record before authorization → 409 PIPELINE_TRANSITION; submitted_at earlier than authorized_at → 422.
- Second submission of the same consultant to the same requirement → 409 SUBMISSION_EXISTS; same end client via another vendor within 90 days → 409 DUPLICATE_WARNING until confirmed with reason.
- No endpoint attaches or sends a file; the packet references resume_version_no only (NoSubmitSurfaceTest rule 1 allow-list includes /record).

**Test cases**
- SubmissionStateTest, SubmissionGuardsTest, PacketPinTest, Playwright submissions.spec.ts.

- **Tech notes:** The verb is 'record'; never name a method submit*.
- **Definition of Done:** Submission records flow complete under E1; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10.4 — Offers → placements lifecycle: pending start, active, extension, redeployment, ended/terminated; bill-to account
- **Epic:** X10 · **Size/Complexity:** L/L · **Owners:** API, Web · **Deps:** X9.8, X10.3
- **Persona:** Account Manager
- **Objective:** Placements as the engagement record, distinct from applications, with extensions and redeployment chains.
- **Story:** As an account manager, I want placements created from accepted offers to go through pending start, active, extensions, end or termination, and redeployment into a new placement, so that the org's book of business is a record, not a spreadsheet.

**Functional requirements**
- placement machine per 35 §3 registered (PENDING_START/ACTIVE/ON_HOLD/EXTENDED chip/ENDED/TERMINATED), placement_extension log, redeployment chain, effects on consultant_profile (ON_PROJECT/PAUSED; back to ACTIVE only on consultant confirm), requirement filled count, PlacementStartJob/EndNudgeJob; bill_to_client_id; DTO redaction of bill rate.

**UI requirements**
- Placements board per 38 §5.1 (1440) and list (390); Extend/End/Terminate SideSheets; redeploy Menu.

**Backend requirements**
- PlacementService + transitions + jobs; redaction mapper.

**Database changes**
- placement/placement_extension created in X8.10; indexes (org_id, status, start_date), (org_id, consultant_member_id).

**APIs**
- 35 §6 placement routes (org side).

**Permissions**
- placements.view / placements.manage (AM ORG; FINANCE view).

**Feature entitlements**
- —

**Acceptance criteria**
- Accepting an offer yields PENDING_START; the start job activates on start_date and sets availability ON_PROJECT; extension with changed rates creates a new offer that the consultant must accept; dates-only extension logs a placement_extension row.
- ENDED sets availability AVAILABLE/available_from and does not resume marketing until the consultant confirms; redeploy creates a chained placement and the bench gap is computed.
- bill_rate_minor never in consultant/marketer DTOs.

**Test cases**
- PlacementStateTest, PlacementChainTest, PlacementAvailabilityEffectsTest, PlacementDtoRedactionTest, Playwright placements.spec.ts.

- **Tech notes:** Extension is an event on the same row; redeployment is a new row — keep that distinction in code names.
- **Definition of Done:** Placement lifecycle complete; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10.8 — Timesheets bridge: placement ACTIVE → ops_placement/ops_client/ops_vendor/ops_placement_rate (product H), one-way status mirror
- **Epic:** X10 · **Size/Complexity:** M/M · **Owners:** API · **Deps:** X10.4, H1.1
- **Persona:** Finance
- **Objective:** Reuse product H for hours and money instead of duplicating placement rates.
- **Story:** As finance, I want an active placement to appear in Timesheets automatically with its client, vendor and starting rates, so that hours and invoices are tracked where they already live.

**Functional requirements**
- OpsPlacementBridge.ensure per 35 §5: find-or-create ops_client/ops_vendor (links on client_account), create ops_placement with pipeline_placement_id (additive column on ops_placement) and the initial ops_placement_rate; one-way status mirror ACTIVE/ON_HOLD/ENDED; no-op when flag.ops_timesheets/ops.enabled is off.

**UI requirements**
- Placement card shows 'Timesheets: on' chip and a link; finance placements page reads H rate history.

**Backend requirements**
- OpsPlacementBridge (listener on placement transitions); H repositories reused.

**Database changes**
- Additive changeSet in H's changelog (or a new _ent_ops_bridge.xml if H's file is frozen): ops_placement.pipeline_placement_id BIGINT NULL + index; client_account.ops_client_id/ops_vendor_id already present.

**APIs**
- GET /api/orgs/{orgId}/placements/{id}/timesheets (summary proxy).

**Permissions**
- placements.view + ops.* row rules for the summary.

**Feature entitlements**
- ops.enabled (Session H's entitlement) gates the bridge at step 6.

**Acceptance criteria**
- With Timesheets on, activating a placement creates exactly one ops_placement and one rate row; re-activating is idempotent; with it off nothing is created and the UI explains.
- Ending the pipeline placement ends the ops placement; editing rates in H does not change the pipeline snapshot.

**Test cases**
- OpsPlacementBridgeTest (on/off/idempotent/mirror), changelog test.

- **Tech notes:** Depends on H0.1/H1.1 tables existing; if H is not built yet, ship the listener behind the flag with a no-op and a tracker note.
- **Definition of Done:** Bridge done; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** H1.1, H0.3

### X10.6 — Placement declaration from the consultant side and org celebration (mascot), feeding Timesheets (H)
- **Epic:** X10 · **Size/Complexity:** S/S · **Owners:** Web, API · **Deps:** X10.4
- **Persona:** Consultant
- **Objective:** Let the consultant say 'I started' and celebrate once, honestly.
- **Story:** As a consultant, I want to confirm I started (or declare a placement I found myself) and see one honest celebration, so that my status is mine to state and the org records what it actually has.

**Functional requirements**
- POST …/placements/{id}/started sets consultant_confirmed_at (pipeline placement); POST /placements/declare sets the SUMMARY PLACEMENT flag only and nudges the AM (no org placement row); celebration card shown once via a notification with groupKey placement:{id}.

**UI requirements**
- Consultant Placements page + 'I started' / 'I got placed' sheet (390); ConfettiBurst once on ACTIVE; marketer card and Org Admin ticker line (Session B's dashboard consumes).

**Backend requirements**
- PlacementService consultant routes; declaration writes the existing member-declared flag path.

**Database changes**
- None.

**APIs**
- GET /api/me/orgs/{orgId}/placements · POST …/placements/{id}/started · POST …/placements/declare.

**Permissions**
- OWN.

**Feature entitlements**
- —

**Acceptance criteria**
- Declaration never creates a placement row; the AM gets one ORG_PLACEMENT nudge; confetti renders once and respects reduced motion; no cheer on TERMINATED.

**Test cases**
- PlacementDeclareTest, Playwright placement-celebration.spec.ts.

- **Tech notes:** Keep the free declaration path on the existing ShareField.PLACEMENT semantics.
- **Definition of Done:** Consultant declaration live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10.5 — Account Manager workspace: Clients, Contacts, Requirements, Submissions, Interviews, Offers, Placements
- **Epic:** X10 · **Size/Complexity:** M/M · **Owners:** Web · **Deps:** X10.4, X10.6
- **Persona:** Account Manager
- **Objective:** Assemble the AM pages into one workspace with the consent projection applied.
- **Story:** As an account manager, I want a workspace with Home, Clients, Contacts, Requirements, Submissions, Interviews, Offers and Placements, so that the demand side of the business is one place.

**Functional requirements**
- Workspace key ACCOUNTS with nav per 38 §5; Home tiles (requirements by status, submissions awaiting record, interviews this week, offers pending, placements starting); every consultant reference at the consent projection (resume display name only without FULL).

**UI requirements**
- 38 §5 at 390/1440; EmptyStates from 38 §6.

**Backend requirements**
- Home DTO endpoint.

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/accounts/home.

**Permissions**
- ACCOUNT_MANAGER template keys.

**Feature entitlements**
- —

**Acceptance criteria**
- An AM opening a submission sees the consultant's seat name and resume display name but gets the CONSENT card on the document; all pages pass 390/1440 checks.

**Test cases**
- Playwright account-manager.spec.ts.

- **Tech notes:** Compose existing pages; no new CRUD here.
- **Definition of Done:** AM workspace live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X10.7 — Pipeline reports: requirement fill rate, time-to-place, submissions per consultant (consent-scoped)
- **Epic:** X10 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X10.5
- **Persona:** Account Manager / Marketing Manager / Org Admin
- **Objective:** Reports computed from the event log with consent and suppression rules.
- **Story:** As a manager, I want fill rate, time-to-place, time-to-redeploy, submissions per consultant and vendor performance over a period, exportable as CSV, so that we manage the pipeline with numbers.

**Functional requirements**
- GET /pipeline/reports kinds per 34 §5 computed from pipeline_event; consultant rows obey consent (SUMMARY ⇒ counts) and < 5-contributor suppression when grouped by team/department; vendor/client rows full; CSV export audited EXPORT with redaction pass.

**UI requirements**
- Reports page with kind Tabs, period picker, tiles + table; 390 stacked.

**Backend requirements**
- PipelineReportService; export via the existing audited export pattern.

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/pipeline/reports · /export.

**Permissions**
- reports.view / reports.export (ORG for AM/admin; TEAM for managers).

**Feature entitlements**
- analytics.applications gates consultant-level rows (37 #12) — module check; counts-only without it.

**Acceptance criteria**
- Team grouping with 4 contributors is suppressed; vendor rows never suppressed; export writes one audit row and contains no free text with PII (redaction test).

**Test cases**
- PipelineReportServiceTest, SuppressionTest, ExportAuditedTest, Playwright reports.spec.ts.

- **Tech notes:** Reuse analytics.md suppression helper if X12.1 has not landed, else share it.
- **Definition of Done:** Reports live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X11 — Phase 11 — HR and Finance (fully specified, Session D)
_Lifecycle records, compliance checklists and policy acknowledgements without identity documents; finance records over the Timesheets product; reports. E2 answered 2026-10-12: record-only, PII scanner on every path._

Design: `docs/enterprise-v2/36-hr-and-finance.md`. Build order: X11.7 → X11.1 → X11.2 → X11.3 → X11.5 → X11.4 → X11.6.

### X11.7 — PII scanner on every path: @NoSensitiveText coverage test, PdfTextScanner refusal, HrFinanceNeverCollectedTest, SensitiveTextField primitive
- **Epic:** X11 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X8.10
- **Persona:** Security
- **Objective:** Make 'a PII scanner runs on every path' a CI property before HR/Finance pages exist (E2 answered).
- **Story:** As the security owner, I want every free-text DTO field in the talent, pipeline, HR and finance packages scanned, every upload text-scanned and refused on a hit, and a schema/DTO deny-list test, so that E2's promise cannot regress.

**Functional requirements**
- @NoSensitiveText + SensitiveTextValidator (H3.1; build here if absent, product-wide) applied to String fields in web/rest/org/{talent,pipeline,hr,finance}/**; SensitiveTextCoverageTest (reflection); SensitiveContent.check on JSON blobs; PdfTextScanner (PDFBox text layer) + ops_refused_hash reuse; per-cell CSV scan; export redaction pass; packages/ui SensitiveTextField using sensitive-patterns.ts.
- HrFinanceNeverCollectedTest: Liquibase + DTO name deny-list from 36 §1 over the enterprise changelogs and DTO packages.

**UI requirements**
- SensitiveTextField primitive (Input/Textarea variants) with the pre-submit warning and 422 message rendering; used by all later HR/Finance/pipeline forms.

**Backend requirements**
- service/privacy additions; validator; scanner; tests.

**Database changes**
- None.

**APIs**
- None (cross-cutting).

**Permissions**
- —

**Feature entitlements**
- —

**Acceptance criteria**
- A new DTO String field without the annotation fails SensitiveTextCoverageTest; a PDF with a passport number in its text layer is refused with 422 and its hash recorded; a column named dob in any enterprise changelog fails HrFinanceNeverCollectedTest.
- The TS twin flags the same corpus hits as Java (shared corpus.json).

**Test cases**
- SensitiveTextCoverageTest, PdfTextScannerRefusalTest, HrFinanceNeverCollectedTest, CsvCellScanTest, ExportRedactionTest, SensitiveTextField unit tests.

- **Tech notes:** Share the corpus at api/src/test/resources/sensitive-patterns/corpus.json; keep the TS and Java scanners in lockstep (existing sensitive-patterns tests).
- **Definition of Done:** Scanner coverage enforced; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** H3.1, H3.3

### X11.1 — HR lifecycle records (employment_record): onboarding → active → leave → offboarding → ended; manager, department, team; history
- **Epic:** X11 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X11.7, X4.4
- **Persona:** HR Specialist
- **Objective:** Effective-dated employment records with a lifecycle, no identity data.
- **Story:** As HR, I want each member's employment record (title, type, department, team, manager, dates) with a lifecycle and full history, so that onboarding and offboarding are tracked without a document vault.

**Functional requirements**
- employment_record per 36 §2 (effective-dated supersede chain) + EMPLOYMENT state machine registered (ONBOARDING/ACTIVE/LEAVE/OFFBOARDING/ENDED) with checklist guard (X11.2) and effects (assignments nudges, member lifecycle after HR confirm, org_resume link ending); org_member.employment_status dual-write; ORG_HR notifications.

**UI requirements**
- Lifecycle timeline on the employee detail (X4.6 sheet gains an HR tab); transition SideSheets with reason; 390/1440.

**Backend requirements**
- EmploymentRecordService + transitions; dual-write.

**Database changes**
- Changelog 202610xxxxxxxx_ent_hr_finance.xml changeSet 1: employment_record (36 §2) with indexes (org_id, member_id, effective_from).

**APIs**
- 36 §7 /hr/employment routes.

**Permissions**
- hr.view / lifecycle.manage (ORG).

**Feature entitlements**
- —

**Acceptance criteria**
- Changing title creates a new row and supersedes the old; history lists both; ENDED requires OFFBOARDING first and then triggers the member lifecycle (X4.4) only after HR confirms.
- No column or DTO field in the deny-list (HrFinanceNeverCollectedTest).

**Test cases**
- EmploymentRecordStateTest, SupersedeChainTest, DualWriteTest, Playwright hr-lifecycle.spec.ts.

- **Tech notes:** Registry-driven like pipeline; keep HR effects as nudges, never automatic license or data changes.
- **Definition of Done:** HR lifecycle live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X11.2 — Compliance checklists (hr_task) and policy acknowledgements (policy_ack) with org-authored policy PDFs; no identity documents; PII scanner on uploads
- **Epic:** X11 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X11.1
- **Persona:** HR Specialist / Member
- **Objective:** Checklists and acknowledgements as the only 'documents' HR keeps.
- **Story:** As HR, I want onboarding/offboarding/compliance checklists from templates and versioned policies members acknowledge after reading, so that compliance is tracked while Kiwiply holds no identity documents.

**Functional requirements**
- hr_checklist_template/item_template, hr_task, org_policy, policy_ack per 36 §2; templates seeded per org type; no upload item kind; policy PDF ≤ 5 MiB text-scanned (X11.7) and refused on hit; ack requires viewedMs ≥ setting; HrTaskReminderJob; login-keyed acks kept after erasure.

**UI requirements**
- Onboarding board (ProgressBar per member), Policies page with version Menu (nav label 'Policies'), ack flow at 390 (scroll-to-end then 'I acknowledge'); Compliance tasks list; EmptyState text from 38 §6.

**Backend requirements**
- HrChecklistService, HrTaskService, PolicyService; reminder job.

**Database changes**
- _ent_hr_finance.xml changeSets 2–3: the four tables with indexes; seed templates with preconditions.

**APIs**
- 36 §7 /hr/checklists, /hr/tasks, /hr/policies routes + member routes.

**Permissions**
- hr.manage for templates/policies; hr.view; members act on own tasks/acks.

**Feature entitlements**
- —

**Acceptance criteria**
- A template cannot contain an upload step (schema has no such kind); uploading a 'policy' PDF containing an SSN is refused; acknowledging without reaching the end → 422; a new policy version requires new acks and the report shows the gap.
- Erasing a member keeps policy_ack rows keyed by login; ONBOARDING→ACTIVE blocked while required tasks are open.

**Test cases**
- ChecklistInstantiationTest, PolicyAckTest, PolicyUploadRefusalTest, HrTaskReminderJobTest, Playwright hr-policies.spec.ts.

- **Tech notes:** Use FileStorage two-phase upload (H3.2) for PDFs; never store images for HR.
- **Definition of Done:** Checklists and policies live without identity documents; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X11.3 — HR workspace: Employees, Onboarding, Documents (policies only), Compliance, Lifecycle, Offboarding, Reports
- **Epic:** X11 · **Size/Complexity:** L/L · **Owners:** Web, API · **Deps:** X11.2
- **Persona:** HR Specialist / Talent Acquisition
- **Objective:** Assemble the HR workspace and the TA talent pools.
- **Story:** As HR, I want a workspace with Home, Employees, Onboarding, Policies, Compliance, Lifecycle, Offboarding and Reports, and as Talent Acquisition I want talent pools of invited/existing members, so that people operations run in one place.

**Functional requirements**
- Workspace key HR with nav per 36 §3; Home tiles; talent_pool/talent_pool_member for TA (members or invites only; no external CV storage — escalation D5); HR reports (headcount, onboarding_time, ack_rate, compliance_open).

**UI requirements**
- 38 §5 HR pages at 390/1440; Policies nav label and empty state; TA pools as ChipInput lists.

**Backend requirements**
- HrHomeService; TalentPoolService; HrReportService.

**Database changes**
- _ent_hr_finance.xml changeSet 4: talent_pool, talent_pool_member.

**APIs**
- GET /api/orgs/{orgId}/hr/home · talent pool CRUD · GET /hr/reports.

**Permissions**
- HR_SPECIALIST / TALENT_ACQUISITION template keys.

**Feature entitlements**
- —

**Acceptance criteria**
- HR pages never render consultant career data (no resumes.* route reachable → 404 states); TA pools accept only member/invite ids; reports compute on fixtures.

**Test cases**
- Playwright hr.spec.ts; TalentPoolServiceTest; HrReportServiceTest.

- **Tech notes:** Reuse X4.3 Employees list with HR columns.
- **Definition of Done:** HR workspace live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X11.5 — Finance records for placements: bill/pay rate labels, invoice_record and payment_record links to H6; profit view (H5.15)
- **Epic:** X11 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X10.8, X11.7
- **Persona:** Finance Specialist
- **Objective:** Placement financials as records: snapshot rates, H rate history, invoices and payments from product H.
- **Story:** As finance, I want each placement's bill/pay rates, margin, invoice and payment records (from Timesheets) and a profit view, so that I see the money story without Kiwiply ever touching money.

**Functional requirements**
- Finance placements read model per 36 §4: placement snapshot + ops_placement_rate history + ops_invoice/ops_payment summaries by ops_placement_id; margin bands (org.finance.margin_bands) for non-finance viewers; FinanceVerbsTest (record/issue/void/export only); finance.* ⇒ ops.* permission mapping.

**UI requirements**
- Finance placements table with RateCell (band mode for non-finance); detail with H6 summaries and deep links; 390/1440.

**Backend requirements**
- FinancePlacementService; permission mapping in EntPermissions.

**Database changes**
- None (reads H6 tables).

**APIs**
- GET /api/orgs/{orgId}/finance/placements · /finance/placements/{id}/rates.

**Permissions**
- finance.view / finance.manage (ORG); placements.view.

**Feature entitlements**
- —

**Acceptance criteria**
- A marketer sees margin band only; finance sees numbers; no route exists to create a payment outside H's record endpoints (FinanceVerbsTest); money is minor units + currency everywhere.

**Test cases**
- FinancePlacementServiceTest, FinanceVerbsTest, FinancePermissionMappingTest, Playwright finance-placements.spec.ts.

- **Tech notes:** ADR-011's invoice_record/payment_record names map to H6 ops_invoice/ops_payment (36 §4); do not create new money tables.
- **Definition of Done:** Placement financial records live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** H6.1, H6.4

### X11.4 — Finance workspace over product H: Consultant Subscriptions (read), Billing, Invoices, Placements (rates), Timesheets, Approvals, Payments (status records), Reports
- **Epic:** X11 · **Size/Complexity:** L/L · **Owners:** Web, API · **Deps:** X11.5, X6
- **Persona:** Finance Specialist
- **Objective:** Assemble the finance workspace from Session C's billing pages, H's pages and X11.5.
- **Story:** As finance, I want one workspace with licenses cost, Kiwiply billing, client invoices (records), placements, timesheets and approvals, payments (records) and reports, so that every money record is one click away and nothing in it can move money.

**Functional requirements**
- Workspace key FINANCE with nav per 36 §4; Home tiles (AnimatedNumber) deep-linking into Session C billing pages and H pages (embedded); disclaimer line; finance reports (licenses_cost, placements_margin, invoices_outstanding, payments_recorded).

**UI requirements**
- 38 §5 finance home; H's week view/approver inbox embedded unchanged (H2.4/H3.6); EmptyState for Payments from 38 §6.

**Backend requirements**
- FinanceHomeService; FinanceReportService.

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/finance/overview · /finance/reports.

**Permissions**
- FINANCE_SPECIALIST template keys (finance.*, billing.*, licenses.view, usage.view, ops.*).

**Feature entitlements**
- —

**Acceptance criteria**
- Home tiles reconcile with their source pages on fixtures; no button on any finance page triggers a payment (lint + FinanceVerbsTest); H pages render inside the shell at 390.

**Test cases**
- Playwright finance.spec.ts; FinanceHomeServiceTest.

- **Tech notes:** If H pages are not built yet, show the 'Turn on Timesheets' card and keep tiles computed from what exists.
- **Definition of Done:** Finance workspace live; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.

### X11.6 — HR/Finance reports and CSV exports (audited); retention per settings
- **Epic:** X11 · **Size/Complexity:** M/M · **Owners:** API, Web · **Deps:** X11.3, X11.4
- **Persona:** HR / Finance
- **Objective:** Exports with redaction and audit; retention jobs per the locked periods.
- **Story:** As HR or finance, I want CSV exports of reports with an audit trail and redaction, and retention applied per settings, so that reporting is possible without creating a new PII store.

**Functional requirements**
- GET …/{hr|finance}/reports/export → async export (H5.1 pattern) with the redaction pass; audited EXPORT; ops-export lifecycle 24 h; retention: employment_record anonymised with membership erasure, policy_ack kept, finance mirrors per H7.2 (7 y), pipeline_event 36 m purge job already in X8.10.

**UI requirements**
- Export buttons with 'Exports are logged' hint; download list; 390/1440.

**Backend requirements**
- ExportService reuse; RetentionJob wiring for HR tables.

**Database changes**
- None.

**APIs**
- GET /api/orgs/{orgId}/hr/reports/export · /finance/reports/export · GET /exports.

**Permissions**
- reports.export (ORG).

**Feature entitlements**
- —

**Acceptance criteria**
- Export writes one EXPORT audit row and the file has no free-text PII hits (scan the output); erasure anonymises employment rows but keeps acks; retention job purges only past the configured period.

**Test cases**
- ExportAuditedTest, ExportRedactionTest, HrRetentionTest.

- **Tech notes:** Reuse H5.1's async export job; never synchronous for large orgs.
- **Definition of Done:** Reports/exports/retention done; tracker Completed. Plus the common DoD in `06-phase-plan.md` §5.
- **Relates / supersedes:** H5.1, H7.2

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
