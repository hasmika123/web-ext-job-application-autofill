# ADR-007 — One enterprise shell, permission-driven navigation, data-defined workspaces

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §7
- **Reversibility:** see Consequences

## Context
Branch A proved a permission-keyed nav (org-nav.ts needs[]) and a switcher; requirements §25 lists eight role surfaces; §7 wants Org Admins to land on their dashboard and the profile in the avatar menu.

## Decision
- One EnterpriseShell (tenant-themed) renders a sidebar from workspace definitions: workspace_key → ordered nav items → any-of permission needs. Workspaces: ADMIN, MARKETING, MARKETING_MGMT, CONSULTANT, HR, FINANCE, ACCOUNTS, EXEC. A member sees the workspaces whose first item they may open.
- Landing = the home of the primary role's workspace (Org Admin → Org Admin Dashboard). A compact switcher appears only when the member has more than one workspace.
- The basic profile and organization settings are separate destinations: profile in the avatar menu; org settings a nav item under ADMIN.
- Every page re-checks permission on the server; the nav is presentation. Pages not allowed render the "not part of your role" empty state (no redirect).
- One branded login component (BrandedLogin) and one shell are reused by every tenant; branding is runtime data (ADR-003 public tenant DTO).
- The Kiwiply character is used via a packages/ui MascotPose wrapper with a fixed pose map: login welcome, dashboard greeting, empty states, interview-prep encouragement, placement celebration, warning. Compact sizes only.

## Consequences
Sample-data org-v2 pages are replaced page by page; the admin page kit (filter bar, table→cards, reason sheet, autosave) is promoted to packages/ui where the enterprise shell needs it.

## Security note
None beyond server re-checks.
