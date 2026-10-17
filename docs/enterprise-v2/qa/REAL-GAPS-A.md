# Real gaps A: Enterprise V2 stories X1-X4 (platform, tenancy, domains, workspaces, roles)

Audit date 2026-10-16, branch `roadmap-reconcile-a` (from `origin/version2`). Read-only: nothing was built or run, so every verdict comes from code, tests present on disk and `progress-tracker.md`. "Unverified" means I did not open that code path or could not tell without running it. X5.x and X6.x are DEFERRED (billing/subscription, next week) and were not audited.

Note: `docs/roadmap/areas/ent.json` is less stale for X1-X4 than expected. Most real DONE rows already say `done`. The wrong ones are X2.1 (really done, still `not_started`), and X1.9, X2.11, X2.7, X2.9, X4.2, X4.7, X4.8, X4.9 (partial, still `not_started`).

Importance legend: BLOCKER = needed before the first paying customer on a real tenant host; IMPORTANT = needed soon after; LATER = polish or only needed for custom domains.

## Counts (54 stories in X1-X4)

DONE 33 | PARTIAL 10 | NOT BUILT 11 | DEFERRED: all X5.x and X6.x.

## X1 Platform and tenancy

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| X1.1 | Enterprise flags + EnterpriseEnabledFilter | DONE | `EnterpriseEnabledFilter`, `EnterpriseFeatureFlag`; `EnterpriseEnabledFilterIT` | none | - | - |
| X1.2 | Tenancy schema | DONE | `20261015010000_ent_tenancy.xml`, `OrgHostname`, `EntTenancySchemaIT` | none | - | - |
| X1.3 | TenantResolver + public tenant + ask endpoint | DONE | `TenantResolver`, `PublicTenantResource`, `InternalTenantHostResource`; `TenantResolutionIT`, `InternalTenantHostResourceIT` | none | - | - |
| X1.4 | Web host resolution, `(tenant)` group | DONE | `web/src/proxy.ts`, `app/(tenant)/%5Ft/**`; `proxy.test.ts` | none | - | - |
| X1.5 | Tenant-bound sessions (tid/hid) | DONE | `TenantTokenBindingFilter`, `TenantSessionService`; `TenantBoundSessionIT`, `TenantTokenBindingTest` | none | - | - |
| X1.6 | Roles as data (read side) | DONE | `20261015020000_ent_roles.xml`, `RoleTemplateSeeder`; `RoleTemplateSeederIT`, `EntRolesMigrationIT` | none | - | - |
| X1.7 | Scope model + AuthorizationService | DONE | `ScopeEvaluator`, `AuthorizationService`, `EntPermissions` | none (step 9 reads `org_assignment`, see X4.7) | - | - |
| X1.8 | Invitation framework | DONE | `JoinResource`, `HostnameJoinLinks`; `JoinTenantHostIT`, `HostnameJoinLinksTest` | none | - | - |
| X1.9 | Isolation test gate | PARTIAL | `TenantResolutionIT`, `TenantBoundSessionIT`, `TenantHostSecretIT`, `OrgIsolationIT`, `EntRepositoryContractTest`, `OrgRepositoryContractTest`, `e2e/journeys/tenant-unknown.spec.ts` | none of the named classes exist (`HostUnknownIT`, `HostMismatchIT`, `ForgedHostHeaderIT`, `SuspendedHostnameIT`, `AskEndpointIT`, `CrossTenantSweepIT`, `tenant-isolation.spec.ts`); coverage is real but spread out, no documented mutation checks | M | IMPORTANT: isolation is the product; a named, mutation-checked gate stops silent regressions |
| X1.10 | Tenant context in logs/audit/async | DONE | `TenantLogConverter`, `TenantScoped`; `TenantLogCaptureTest`, `TenantScopedTest` | none | - | - |
| X1.11 | Platform admin Organizations and hostnames | DONE | `AdminOrgResource`, `AdminOrgService`, `web/src/app/(admin)/admin/organizations/**`; `AdminOrgResourceIT` | custom-domain rows not manageable here (that is X3) | - | - |
| X1.12 | Mock tenants + demo seeder | DONE | `EnterpriseDemoSeeder`, `EnterpriseDemoService`; web `scripts/mock-tenants.mjs` | none | - | - |
| X1.13 | Ops endpoints off the public host | FIXED (51f1f53a; edge lines in 62b-edge-rules.md) | `SecurityConfiguration.java:93` still `permitAll()` on `/management/prometheus`; no scrape-token filter | admin-or-scrape-token on prometheus; refuse `/api/internal/**` and non-health `/management/**` on public hosts; exposure allow-list tests; edge path rules (user, decision E12) | S | BLOCKER: metrics are world-readable at api.kiwiply.com today |
| X1.14 | Role writes + ceiling rule | DONE | `OrgRoleWriteService`, `RoleCeiling`, `OrgMemberRoleResource`; `RoleCeilingTest`, `OrgRoleServiceTest` | none | - | - |
| X1.15 | Multi-role invites | DONE | `20261015040000_ent_invites.xml`, `InviteCeilingChecker`, `OrgInvitationService` | none | - | - |

## X2 Workspaces, branding, login, shell

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| X2.1 | Consolidate parked web helpers into `lib/ent` | DONE | no `org-types/org-api/org-client/org-join/org-proxy/mock-org*` left in `web/src/lib`; all under `lib/ent/*` (ent.json is stale) | none | - | - |
| X2.2 | Tenant session contract + workspaces as data | DONE | `MeTenantResource`, `WorkspaceService`, `config/ent/workspaces.json`; `MeTenantResourceIT`, `workspaces.test.ts` | none | - | - |
| X2.3 | BrandedLogin | DONE | `components/ent/login/BrandedLogin.tsx`; `BrandedLogin.test.tsx`; `tenant-login-layout.spec.ts` | none | - | - |
| X2.4 | Org Admin Dashboard API | DONE | `service/ent/dashboard/*`, `OrgDashboardResource` | none | - | - |
| X2.5 | Branding API | DONE | `OrgBrandingService`, `BrandingAssetProcessor`, `OrgBrandingResource` | none | - | - |
| X2.6 | Login-first routing | DONE | `proxy.ts` rewrite, `proxy.test.ts` (33), `routing.test.tsx` | none | - | - |
| X2.7 | Basic user profile surface | PARTIAL | `app/(tenant)/%5Ft/me/page.tsx`, `components/ent/me/MyProfilePage.tsx`, `app/api/me/profile/route.ts` (PATCH) | photo upload ("isn't available here yet" in the UI); server-side `SENSITIVE_CONTENT` check on title and EXIF strip unverified | S | IMPORTANT: every member sees this page; a dead photo control looks unfinished |
| X2.8 | MascotPose | DONE | `packages/ui/src/primitives/MascotPose.tsx`; `MascotPose.test.tsx` | none | - | - |
| X2.9 | Organization Settings page | PARTIAL | `settings/page.tsx` + `components/ent/settings/OrgSettingsPage.tsx` (156 lines) edits only the resume policy and share links; `PATCH /api/orgs/{id}` exists | name/display name, contact, addresses, timezone, policy overrides with `REASON_REQUIRED` (no `ORG_OVERRIDABLE` allow-list found in the API) | M | IMPORTANT: admins cannot change org name, timezone or security policy in the product |
| X2.10 | TenantUrls + notification kinds | PARTIAL | `TenantUrls`, `web/src/lib/tenant-urls.ts`; `TenantUrlsTest`; invite mails use the primary host (`HostnameJoinLinks`) | tracker itself says MailBranding, org notification kinds and mail wiring are not done | M | IMPORTANT: other org mails (reset, notices) are not tenant-branded or tenant-linked |
| X2.11 | E2E-A and E2E-B journeys | PARTIAL | `tenant-dashboard-v2.spec.ts`, `tenant-shell.spec.ts`, `tenant-login-layout.spec.ts`, `tenant-signout.spec.ts` | no `e2e-a`/`e2e-b` specs by name; 390 px + 1440 px runs, multi-role switcher journey and mutation checks unverified | M | IMPORTANT: closes the phase and gives CI evidence for the demo path |
| X2.12 | Contrast-safe tenant theme | DONE | `packages/ui/src/color/brand.ts`, `theme-tenant.css`, `TenantThemeProvider`; Java `BrandingColors` | Java/TS golden-table parity unverified | - | - |
| X2.13 | Public tenant assets | DONE | `PublicTenantAssetResource`, `app/tenant-assets/[kind]/route.ts`; `PublicTenantAssetResourceIT` | none | - | - |
| X2.14 | Org-enforced email MFA on tenant hosts | NOT BUILT | `AuthenticateController` only calls `AdminMfaService` (platform admins); `mfaRequired` appears only in `PublicTenantDTO` | `LoginMfaService`, org setting + toggle (needs X2.9), branded code mail, lockout | M | LATER: an enterprise security option, not needed to onboard the first customer |
| X2.15 | Enterprise UI kit | DONE | `packages/ui/src/enterprise/*`; `enterprise.test.tsx`, `kit.test.ts` | none | - | - |
| X2.16 | EnterpriseShell | DONE | `components/ent/shell/*`; `tenant-shell.spec.ts` | none | - | - |
| X2.17 | Admin Dashboard page | DONE | `components/ent/dashboard/*`; `tenant-dashboard-v2.spec.ts` | none | - | - |
| X2.18 | Branding page | DONE | `components/ent/branding/*`; `branding.test.ts` | none | - | - |

## X3 Domains (custom domains)

No domains resource, DNS verifier, dnsjava dependency, certificate-state job, edge runbook or rehearsal script exists. What exists: the `org_hostname` table/entity, `HostNames`, the ask endpoint (X1.3), and platform-admin subdomain provisioning (X1.11). Subdomains (`<slug>.kiwiply.com`) work without any of this.

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| X3.1 | Domains page + API (add hostname, DNS instructions) | NOT BUILT | only `OrgHostname`/`OrgHostnameRepository` | org API, TXT token, instructions, `/w/admin/domains` page | M | LATER unless a customer insists on its own domain at launch |
| X3.2 | Ownership verification job (dnsjava) | NOT BUILT | no dnsjava in gradle, no job | verifier, schedule, grace/suspend | M | same as X3.1 |
| X3.3 | Activation and certificates | PARTIAL | ask endpoint answers 200/404 by hostname status (`InternalTenantHostResource`, `InternalTenantHostResourceIT`, `TenantHostSecretIT`) | `cert_state` from ask hits + HTTPS probe, troubleshooting panel, platform Domains page / health rows | M | same as X3.1 |
| X3.4 | Primary domain and redirects | NOT BUILT | `is_primary` column exists; link building honours it (`HostnameJoinLinks`, `TenantUrls`) | make-primary API, 308 redirect, subdomain mode setting | S | LATER |
| X3.5 | Suspension and removal lifecycle | NOT BUILT | `hid` claim exists (X1.5) | org-side suspend/remove with typed confirmation, `TOKEN_HOST_REVOKED`, resume re-verify; whether `hid` is revoked on status change is unverified | M | LATER |
| X3.6 | Edge snippet + runbook + dev rehearsal | NOT BUILT | snippet only in `10-domain-routing.md` section 5.3 | runbook, `local_certs` rehearsal script, ask-404 alert | S + user action | BLOCKER only if custom domains are sold at launch; the user applies the Caddy change |
| X3.7 | Google sign-in per tenant host + tenant security headers | NOT BUILT | `GoogleAuthController` only honours tid; no tenant CSP/frame-deny found | per-host Google opt-in, CSP with nonce, Permissions-Policy on tenant hosts | M | IMPORTANT: the headers apply to subdomain tenants too and should not wait for domains |
| X3.8 | Domain hardening tests + Playwright journey | NOT BUILT | none | `AskEndpointIT`, `SuspendedHostnameIT`, domains journey | S | LATER (follows X3.1-X3.5) |

## X4 Roles, employees, teams, assignments

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| X4.1 | Roles & Permissions API | DONE | `OrgPermissionCatalogService`, `OrgRoleWriteService`, `OrgPermissionCatalogResource` | none | - | - |
| X4.2 | Workspace nav as data + per-org prefs + landing | PARTIAL | `workspaces.json`, `OrgMember.landingWorkspace`, nav prefs in `OrgBrandingService`/`OrgBrandingDTO` | "hidden item leaves sidebar but route still renders", member landing-preference UI and unknown-nav-key 422 unverified | S | LATER |
| X4.3 | Members API on real data | DONE | `OrgMemberQueryService`, `OrgMemberBulkService`, `OrgMemberResource`; `OrgMemberBulkIT`, `OrgMemberEditIT` | none | - | - |
| X4.4 | Employee lifecycle | DONE | `OrgMemberLifecycleService`, `OrgOffboardingService`, `OrgMemberLifecycleResource`; `EnterpriseOffboardingIT`, `OffboardingHooksTest` | none | - | - |
| X4.5 | Departments and teams | DONE | `OrgGroupService`, `OrgGroupResource`; `OrgGroupEnterpriseIT`; `tenant-groups.spec.ts` | none | - | - |
| X4.6 | Employee detail sheet | DONE | `DetailSheet`, `AccessRolesTab`, `ActivityTab` | none | - | - |
| X4.7 | Assignments foundation (`org_assignment` lifecycle) | FIXED (c94ffdbd..f84c6c38: ONE authoritative model, `marketer_assignment`; `org_assignment` is its projection for seated consultants, written only by `AssignmentLifecycleService`, with a Liquibase backfill; create/end/reassign = the existing `/marketing-assignments/assign|unassign|restore` with a reason, a history table and `GET .../consultants/{id}/history`; no second create/end API on `org_assignment` by design) | table, entity, repository, `ScopeEvaluator`/step 9 read it (X1.7); `OrgAssignments` | no create/end API with `PRIMARY_EXISTS`, no notifications; the working marketing UI runs on the separate `marketer_assignment` table (`MarketingAssignmentsService`, `OrgMarketingAssignmentsResource`), so ASSIGNED scope and real assignments can disagree (how they reconcile is unverified) | L | IMPORTANT: marketer visibility needs one source of truth |
| X4.8 | Workload balancing view | FIXED for reassign history, undo (RESTORE line) and handover (c94ffdbd..f84c6c38); the entitlement cap `consultants.max` is still not wired (the marketer capacity of the board and the new per-consultant open limit apply) | `/marketing-assignments/workload`, `/assign`, `/unassign`, `/restore`; `MarketingAssignmentsPage`; `tenant-marketing-assignments.spec.ts` | built on `marketer_assignment`; drag/reassign with undo and entitlement caps unverified | M | LATER |
| X4.9 | Org audit log viewer + Reports exports | PARTIAL | `OrgAuditEventsResource` (GET only), `AuditPage`, `OrgReportsResource`, `ReportsPage`; `OrgAuditEventsIT`, `OrgReportsIT` | CSV export (and its audited EXPORT row); FINANCE-limited family filter unverified | S | IMPORTANT: audit export is a standard enterprise ask |
| X4.10 | `org_member_role` authoritative | FIXED for enterprise (SEPARATE) orgs (24e745e5); enum fallback kept only for legacy SHARED orgs | `OrgAccessService.java:98` still falls back to the legacy enum answer; `LegacyRoleMirror` dual-write live | remove fallback, flip `flag.enterprise.roles` default, test that a stale enum grants nothing | S | IMPORTANT: a drifted enum can grant access the role grid does not show |
| X4.11 | Roles & Permissions page | DONE | `components/ent/roles/*`; `tenant-roles.spec.ts` | none | - | - |
| X4.12 | Employees page | DONE | `components/ent/employees/*`; `tenant-employees.spec.ts`, `tenant-invitations.spec.ts` | none | - | - |
| X4.13 | Assignment lifecycle (reassign chain, DELEGATE, handover job, history) | FIXED for the marketer assignment: atomic reassign with history (who, when, reason), `replaced_by_assignment_id` chain on the projection, handover of open opportunities, tasks and follow-ups with audit and notices (c94ffdbd..f84c6c38); NOT built: DELEGATE kind with end date, scheduled (future-dated) handovers, the consent re-point prompt, the nightly role re-check, the Reassign sheet UI | no `AssignmentHandoverJob`, no `/reassign`; `replaced_by_assignment_id` unused | all of it; the marketing page reassigns via `/assign` + `/update` on the other table | L | LATER (BLOCKER only if marketers must rotate with an audit chain) |

## X5 and X6

DEFERRED: every X5.x and X6.x story (billing, subscription, org commercial). Not audited.

## Top 10 real gaps (priority order)

1. X1.13 Prometheus and internal endpoints exposed on the public host (S, BLOCKER). `permitAll` is still in `SecurityConfiguration`.
2. X4.10 Legacy enum fallback in `OrgAccessService` (S). Authorization has two sources of truth.
3. X1.9 Named, mutation-checked isolation gate (HostMismatch, ForgedHost, CrossTenantSweep, Playwright spec) (M). Coverage exists but is unnamed and unproven.
4. X3.7 Tenant security headers (CSP, frame-deny, noindex) (M). Applies to subdomain tenants as well.
5. X2.9 Org Settings beyond resume policy (name, timezone, security policy with reason) (M).
6. X4.7 / X4.13 One assignment model: reconcile `marketer_assignment` with `org_assignment`, then the reassign history chain (L).
7. X2.10 Tenant-branded, tenant-linked mails other than invites (M).
8. X4.9 Audit and report CSV export, itself audited (S).
9. X2.7 Profile photo upload and server-side sensitive-text checks (S).
10. X3.1-X3.6 Custom domains end to end (L in total). Only when a customer asks for their own domain.

Also open: X2.11 named E2E-A/E2E-B specs (M), X2.14 org-enforced MFA (M).

## Needs a decision or action from the user

- Do we sell custom domains at launch, or subdomains only? This decides whether X3.1-X3.8 are BLOCKERS or LATER.
- Caddy edge (X3.6, decision E5): custom domains need the on-demand TLS `ask`, catch-all block and DNS records applied by the user on `beecompete-edge-caddy`. Never free :80/:443 (that takes BeeCompete down). Not needed until X3.1-X3.5 ship.
- Edge path rules for E12: deny `/management/*` and `/api/internal/*` on `api.kiwiply.com` in `~/beecompete-edge/Caddyfile` (the user's file). The code half of X1.13 does not need this and should be done first.
- B1: the edge passes the ask token as query param `t` (a secret in the BeeCompete edge env). Confirm before X3.6.
- E14: Google sign-in on a tenant host needs each origin registered in the Google console (manual, by the user).
- Production: the nightly off-box `mysqldump` (DEPLOY.md section 5) must really run before any paying tenant (prod data was lost 2026-09-17). Not verified here.
