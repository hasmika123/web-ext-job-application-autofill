# 05 — Permission model: evaluation order, role templates, scopes, actor vs beneficiary

> Status: design, 2026-10-12. Implements ADR-005 (roles as data), ADR-008 (assignments), ADR-021
> (entitlement order). Build-ready for X1.6, X1.7 and the Phase 4/5 stories that extend them.
> Existing code this grows from: `domain/enumeration/OrgPermission`, `OrgRole`, `OrgScope`,
> `service/org/OrgAccessService`, `OrgMembership`, `config/OrgPermissionInterceptor`,
> `web/rest/org/OrgPermissionRequired`.

## 1. The nine things we keep separate (requirements §8)

| Concept | Where it lives | Example |
|---|---|---|
| System role | `jhi_authority` (`ROLE_ADMIN`, `ROLE_USER`) | platform super admin |
| Organization role | `org_role` + `org_member_role` | Org Admin, Marketing Manager |
| Job title | `org_member.title` (display only, no rights) | "Senior Recruiter" |
| Team / Department | `org_group` (kind TEAM/DEPARTMENT) via `org_member.team_group_id`, `department_group_id` | Bench team / Delivery dept |
| Reporting manager | `org_member.manager_member_id` | used by MANAGER scope and approvals |
| Permission | `org_role_permission.permission_key` | `resumes.edit_for` |
| Resource scope | `org_role_permission.scope` | ASSIGNED |
| Consultant assignment | `org_assignment` | Sarah PRIMARY for Anika |
| Feature entitlement | `consultant_license` + `license_feature` (+ `org_module`) | Anika has `ai.resume_tailoring` |

A *permission* answers "may this kind of action happen"; a *scope* answers "on whose records";
an *assignment* answers "is this specific person mine"; an *entitlement* answers "is this feature
paid for and available for this beneficiary"; *consent* answers "did the person allow it".

## 2. Central evaluation order (one function, every protected operation)

`AuthorizationService.authorize(AuthzRequest)` → `AuthzDecision`. Called by the interceptor for
annotated handlers and by services for everything else. Steps **stop at the first failure**; the
failure code maps to an HTTP status in one place.

| Step | Check | Source | Failure code → HTTP |
|---|---|---|---|
| 1 | **Active tenant** resolved; if the token has `tid`, it equals the tenant; path `{orgId}` equals the tenant on tenant hosts | `TenantContext`, JWT | `TENANT_UNKNOWN` / `TENANT_MISMATCH` → 404 (401 for the token case) |
| 2 | **Active membership** of the actor in that org (`status = ACTIVE`, role not reserved) | `OrgAccessService.resolve` | `NOT_MEMBER` → 404 |
| 3 | **Organization status** allows the operation: ACTIVE → all; PAST_DUE → reads + billing + account actions; SUSPENDED/CLOSED/DRAFT/PENDING_SETUP_FEE → only the operations allowed for that state (`OrgStateRules`) | `organization.status` | `ORG_INACTIVE` → 404 on org routes (409 `ORG_STATE` on explicit state actions) |
| 4 | **Actor permission**: effective permission set contains the key | `org_member_role` ⨝ `org_role_permission` (cached per request) | `PERMISSION_DENIED` → 404 |
| 5 | **Resource scope**: the target record is within the actor's effective scope for that permission | `ScopeEvaluator` (§4) | `OUT_OF_SCOPE` → 404 |
| 6 | **Module availability**: the module behind the operation is enabled for the org (flag allow-list + org-level entitlement for commercially restricted modules) | `EnterpriseFlags`, `org_module` | `MODULE_OFF` → 404 |
| 7 | **Beneficiary feature entitlement**: when the operation consumes a licensed feature, the beneficiary's license is ACTIVE and carries the feature, effective now | `consultant_license`, `license_feature` | `FEATURE_NOT_LICENSED` → 402 |
| 8 | **Allowance**: remaining usage ≥ requested quantity (reservation created) | `usage_event` ledger | `FEATURE_ALLOWANCE_EXHAUSTED` → 402 |
| 9 | **Acting-for relationship**: if actor ≠ beneficiary, an open `org_assignment` (kind per permission: PRIMARY/BACKUP for act-for; MANAGER for approvals) exists, or the actor's scope is TEAM/DEPARTMENT/ORG for a *read* | `org_assignment` | `NOT_ASSIGNED` → 404 |
| 10 | **Consent / delegated authority**: the beneficiary's `data_share` scope allows the access (SUMMARY for summaries, FULL naming the actor for full reads/edits) and any `org_feature_consent` the feature's CONSENT dependency requires is granted to the actor | `data_share`, `org_feature_consent` | `CONSENT_REQUIRED` → 403 with `{beneficiary, consentKind}` (the only non-404 refusal, because the consultant must be able to see the request) |
| 11 | **Subscription state**: no pending suspension of the license or org billing (`license_change` PENDING SUSPEND/CANCEL effective now) | billing mirrors | `SUBSCRIPTION_STATE` → 402 |

Steps 7–8 and 11 are skipped for operations that consume no feature. Steps 9–10 are skipped when
actor = beneficiary. The decision records `(actor, beneficiary, org, feature, permission, scope,
reservationId)` and is attached to the request for audit and usage commit.

**404 everywhere on org routes** keeps the existing isolation promise: an outsider cannot tell
"doesn't exist" from "not yours". 402 is used only after membership and permission passed, so it
leaks nothing about other tenants.

## 3. Role templates (seeded system rows in `org_role`, `org_id = NULL`)

Permission keys are listed by family; scope in parentheses. `*` = every key in the family. New keys are **bold**; existing keys are plain (`OrgPermission`).

| Template key | Workspace | Grants |
|---|---|---|
| `OWNER` (immutable) | ADMIN | everything the org can do (ORG) incl. `org.close`, `org.transfer_ownership`; `self.*` (OWN) |
| `ORG_ADMIN` | ADMIN | `org.settings.manage`, **`branding.manage`**, **`domains.manage`**, **`roles.manage`**, `members.*`, `groups.manage`, **`departments.manage`**, **`teams.manage`**, `assignments.manage`, **`consultants.view`**, **`consultants.edit`**, **`resumes.view_for`**, **`resumes.approve_request`**, **`licenses.view`**, **`licenses.manage`**, `billing.view`, `billing.manage`, **`usage.view`**, **`pipeline.view`**, **`clients.view`**, **`placements.view`**, **`hr.view`**, **`finance.view`**, `reports.view`, `reports.export`, `audit.view`, `integrations.manage` — all (ORG). No `org.close`/transfer. |
| `CONSULTANT` | CONSULTANT | `self.*` (OWN), **`opportunities.respond`** (OWN), **`submissions.authorize`** (OWN), **`applications.manage`** (OWN), **`interviews.manage`** (OWN), **`offers.respond`** (OWN), **`resumes.manage`** (OWN), **`features.view`** (OWN) |
| `MARKETING_SPECIALIST` (= MARKETER +) | MARKETING | `member.view_summary` (ASSIGNED), `member.view_full` (ASSIGNED, consent), `member.act_for` (ASSIGNED), **`consultants.view`** (ASSIGNED), **`resumes.view_for`** (ASSIGNED), **`resumes.edit_for`** (ASSIGNED, consent), **`opportunities.manage`** (ASSIGNED), **`matches.run`** (ASSIGNED), **`submissions.prepare`** (ASSIGNED), **`submissions.record`** (ASSIGNED), **`followups.manage`** (ASSIGNED), **`interviews.coordinate`** (ASSIGNED), **`pipeline.view`** (ASSIGNED), `reports.view` (ASSIGNED) |
| `MARKETING_MANAGER` | MARKETING_MGMT | all of MARKETING_SPECIALIST at (TEAM), `assignments.manage` (TEAM), **`approvals.decide`** (TEAM), **`workload.view`** (TEAM), **`escalations.manage`** (TEAM), `reports.view` (TEAM), `reports.export` (TEAM) |
| `HR_SPECIALIST` | HR | `members.invite` (ORG), `members.suspend` (ORG), **`hr.view`** (ORG), **`hr.manage`** (ORG), **`departments.manage`**, **`teams.manage`** (ORG), **`lifecycle.manage`** (ORG), `reports.view` (ORG, HR rows) |
| `FINANCE_SPECIALIST` (= FINANCE +) | FINANCE | `billing.view`, `billing.manage`, **`licenses.view`**, **`usage.view`**, **`finance.view`**, **`finance.manage`**, **`placements.view`**, `ops.*` (timesheets, product H), `reports.view`, `reports.export`, `audit.view` (ORG, billing/ops rows) |
| `ACCOUNT_MANAGER` | ACCOUNTS | **`clients.view`**, **`clients.manage`**, **`requirements.manage`**, **`submissions.record`** (ORG), **`interviews.coordinate`** (ORG), **`offers.manage`**, **`placements.manage`** (ORG), `reports.view` (ORG) |
| `TALENT_ACQUISITION` | HR | `members.invite` (ORG), **`candidates.manage`** (ORG), **`talent_pools.manage`** (ORG), **`consultants.view`** (ORG, summary), **`onboarding.coordinate`** (ORG) |
| `EXECUTIVE_VIEWER` | EXEC | **`dashboard.view_org`**, `reports.view` (ORG, aggregates with k-anonymity from org analytics design), **`pipeline.view`** (ORG, counts only), `billing.view` (ORG, totals only) |
| `STAFF`, `MEMBER` | (existing) | unchanged grants (school/bootcamp flows) |

Rules:
- `OWNER` and `ORG_ADMIN` are **not** consultant roles: holding them never creates a consultant
  license or a career-profile prompt (ADR-006, ADR-012).
- An org may **clone** any non-OWNER template into an org role (`org_id` set), rename it and edit its
  permission rows within the **ceiling rule**: the editor's effective permissions ⊇ the role's, scope
  by scope. System rows are read-only; a clone is independent (later template changes do not
  propagate, but the admin UI can show a diff and offer to re-sync).
- Every member has exactly one `is_primary` role → landing workspace. `org_member.role` mirrors the
  primary template key for compatibility (ADR-023).
- `COACH` stays reserved.

### 3.1 Keys added by Sessions B and D (09 row 8) — folded into the templates above

| Key | Granted to (scope) | Notes |
|---|---|---|
| `dashboard.view_org` | OWNER, ORG_ADMIN, EXECUTIVE_VIEWER (ORG) | Org Admin Dashboard read (14 §2.2; X2.4 seeds it) |
| `members.group.set` | ORG_ADMIN, HR_SPECIALIST (ORG) | department/team assignment (15 §2) |
| `members.manager.set` | ORG_ADMIN, HR_SPECIALIST (ORG); MARKETING_MANAGER (TEAM) | manager link with the cycle guard (15 §2) |
| `departments.manage`, `teams.manage` | — | **aliases** of `groups.manage` in `EntPermissions` (same row; the Roles page shows one key) |
| `applications.view` | — | **not a key.** Org Applications pages use `member.view_summary` (consent projection, 32 §3) and the pipeline board uses `pipeline.view` |
| marketer profile proposals (30 §2, X7.2) | `member.act_for` (ASSIGNED) | not `consultants.edit` (that key is admin-side editing of the overlay) |
| `finance.view` / `finance.manage` | FINANCE_SPECIALIST (ORG) | `finance.view` ⇒ `ops.finance` read; `finance.manage` ⇒ `ops.finance` + `ops.placements` write (36 §4) — H's `OpsGate` unchanged |

## 4. Scopes

| Scope | Meaning | `ScopeEvaluator` rule (target = record's subject member) |
|---|---|---|
| `OWN` | the actor's own records | `target.memberId == actor.memberId` |
| `ASSIGNED` | consultants assigned to the actor | open `org_assignment` where `assignee = actor` and `consultant = target` (kinds per permission: PRIMARY, BACKUP for act-for; + DELEGATE while valid) |
| `TEAM` | members of the actor's team(s) incl. assignments held by those members | `target.team_group_id ∈ actor.teams` ∪ ASSIGNED-of-team-members; team leads (`org_group.lead_member_id`) count as members |
| `DEPARTMENT` | members of the actor's department(s) and their teams | `target.department_group_id ∈ actor.departments` ∪ TEAM |
| `ORG` | everyone in the organization | always true inside the tenant |

Scopes are **ordered** OWN < ASSIGNED < TEAM < DEPARTMENT < ORG; the effective scope for a
permission held through several roles is the widest. Reads with TEAM/DEPARTMENT/ORG still obey
consent (step 10): scope says *which rows*, consent says *which fields* (`ShareField` projection at
SUMMARY vs FULL).

Mapping of legacy `OrgScope` values (backfill, X1.7): ALL → ORG; OWN_MEMBERS, OWN_CONSULTANTS,
PAIRED → ASSIGNED; SELF, OWN_HOURS → OWN; MEMBER_ROLE_ONLY and BELOW_ADMIN_ROLES → ORG + a
*role-ceiling* attribute on the permission row (`ceiling_role_key`); BILLING_AND_OPS_ROWS → ORG +
`row_filter = BILLING_OPS`; SELF_AFTER_TRANSFER → OWN + the existing OWNER-must-transfer guard.

## 5. Actor vs beneficiary

Every operation that touches a person's data or spends a person's entitlement names both:

```
AuthzRequest { actorMemberId, beneficiaryMemberId?, permissionKey, featureKey?, quantity?, targetRef }
```
- **Self-service** (consultant tailoring her own resume): actor = beneficiary; steps 9–10 skipped;
  usage charged to her license.
- **Acting for** (Sarah tailors Anika's resume): actor Sarah, beneficiary Anika; needs
  `resumes.edit_for` with ASSIGNED scope, an open PRIMARY/BACKUP assignment, Anika's FULL consent
  naming Sarah, Anika's license with `ai.resume_tailoring`, allowance on **Anika's** entitlement
  (unless the feature is `ORG_POOL`); recorded `usage_event(actor=Sarah, member=Anika)` and
  `ai_call(login=sarah, beneficiary_login=anika, org_id=acme)`; audit `MARKETER_AI_TAILOR` with
  `beneficiary_login`.
- **Approvals** (Marketing Manager approves a submission request): actor manager, beneficiary the
  consultant; permission `approvals.decide` at TEAM; no feature consumed.
- **Platform admin** reading tenant data: not a membership path at all — admin console only, typed
  reason, MFA re-auth, `OrgAuditEvent(actor_login=admin, action=ADMIN_READ, risk=HIGH)` written
  into the tenant's own audit log (escalation E8).

## 6. Annotations and code shape (for Sonnet)

```java
@OrgPermissionRequired(value = {RESUMES_EDIT_FOR}, beneficiary = Beneficiary.PATH_MEMBER)   // step 1–5, 9–10
@RequiresFeature(value = "ai.resume_tailoring", beneficiary = Beneficiary.PATH_MEMBER, quantity = 1) // step 6–8, 11
@PostMapping("/api/orgs/{orgId}/consultants/{memberId}/resumes/{resumeId}/tailor")
```
- **One `Beneficiary` enum** (X1.7, 09 row 12) is shared by both annotations — there is no `@ActFor`:
  `NONE` (no beneficiary; org-level records), `SELF` (actor = beneficiary), `PATH_MEMBER` (`{memberId}`),
  `BODY_MEMBER` (field `beneficiaryMemberId`), `QUERY_MEMBER` (`?for=` / `?memberId=`, used by job
  discovery and other list endpoints). The interceptor resolves it once and both checks see the same id.
- `OrgPermissionInterceptor` stays the single entry point; it builds `AuthzRequest` from the
  annotations and path variables (`orgId`, `memberId`) and calls `AuthorizationService.authorize`.
  The decision is stored under `OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE` (existing) plus
  `AuthzDecision.ATTRIBUTE`.
- Services that are not HTTP handlers (schedulers, AI router, mail) call
  `authorizationService.authorize(…)` explicitly; `AuthzCoverageTest` (reflection, modelled on
  `OrgIsolationIT.everyOrgRouteIsListedInTheCoverageRegistry`) fails if a handler under
  `/api/orgs/**` references a feature key without `@RequiresFeature`.
- Permission keys live in one registry class `EntPermissions` (constants + metadata: family,
  description, default scope, "dangerous" flag) so the Roles & Permissions admin page is generated
  from code, with a doc-sync test like `ShareMatrixTest`.

## 7. UI consequences (for the shell, Session B)
- Navigation is derived from the effective permission set (branch A's `needs[]` model).
- Pages render the "not part of your role" empty state on 404 from the BFF — never a redirect to
  another workspace or the public site.
- A `CONSENT_REQUIRED` (403) renders an honest card: "Anika hasn't shared this with you yet" with a
  one-tap "Ask Anika" that notifies the consultant (no nagging: one request per 7 days per feature,
  setting `org.consent.request_cooldown_days`).
