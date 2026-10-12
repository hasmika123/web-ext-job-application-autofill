# ADR-005 — Multi-role permissions: role templates as data, N roles per membership, five scopes

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §5
- **Reversibility:** see Consequences

## Context
OrgRole is a fixed enum with a compiled permission→scope matrix; org_member.role is one column; OrgScope values are ad-hoc. Requirements §6/§8 ask for templates, configurable permissions, multiple roles and scopes Own/Assigned/Team/Department/Org.

## Decision
- New tables: org_role (org_id NULL for system templates, key, name, description, template_key, system BOOLEAN, editable BOOLEAN), org_role_permission (role_id, permission_key, scope), org_member_role (member_id, role_id, is_primary, granted_by_member_id, granted_at, ends_at).
- System templates are seeded from the existing OrgRole enum matrix (OWNER, ADMIN, STAFF, MEMBER, MARKETER, FINANCE) plus the new enterprise templates (ORG_ADMIN=ADMIN, MARKETING_SPECIALIST=MARKETER, MARKETING_MANAGER, HR_SPECIALIST, FINANCE_SPECIALIST=FINANCE, ACCOUNT_MANAGER, TALENT_ACQUISITION, EXECUTIVE_VIEWER, CONSULTANT=MEMBER+). OWNER is immutable; other templates may be cloned per org and edited.
- Scopes are normalised to PermissionScope {OWN, ASSIGNED, TEAM, DEPARTMENT, ORG}; the legacy OrgScope values map: ALL→ORG, OWN_MEMBERS/OWN_CONSULTANTS/PAIRED→ASSIGNED, SELF/OWN_HOURS→OWN, MEMBER_ROLE_ONLY/BELOW_ADMIN_ROLES→ORG with a role-ceiling rule, BILLING_AND_OPS_ROWS→ORG with a row-kind filter.
- Effective permissions of a membership = union over its roles; effective scope per permission = the widest. A granter can assign or edit a role only if every permission in it is within the granter's own effective permissions and scope (no privilege escalation). The last OWNER/ADMIN guard applies.
- org_member.role stays as the primary role and is written through on every role change until Phase 4 removes the dependency; OrgMembership gains roles[] and a permission map; OrgAccessService resolves from org_member_role with a per-request cache.
- Permission keys stay strings (OrgPermission.key()) and the registry grows additively: roles.manage, departments.manage, teams.manage, assignments.manage (exists), consultants.view/edit, resumes.view_for/edit_for/approve, pipeline.*, clients.*, placements.*, hr.*, finance.*, licenses.view/manage, domains.manage, branding.manage, audit.view (exists).

## Consequences
Backfill changeset creates one org_member_role per live seat. The interceptor and OrgIsolationIT keep working unchanged because they only ask membership.can(permission).

## Security note
Role edits are audited (ROLE_CREATE/UPDATE/ASSIGN/REVOKE) with the diff; escalation E4 confirms the ceiling rule.
