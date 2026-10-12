/**
 * The org console's navigation as data (O1.7): which pages exist and which permission keys open each one. The shell filters
 * it by the `permissions[]` of `GET /api/orgs/{id}` (tenant-model.md section 8); the server checks every call again, so this is
 * what a person is SHOWN, never what they are ALLOWED.
 *
 * `needs` is any-of: the page shows when the role holds at least one key; an empty list means every console role.
 *   - Team, Applications, Interviews and AI Resume Support are about people: `member.view_summary` (owners, admins, a support
 *     owner for their own members, a marketer for their own consultants).
 *   - Job Opportunities is where jobs are handed to people: `assignments.manage` (owners, admins) or `member.act_for` (a marketer).
 *   - Analytics & Reports is the org-wide view: `reports.export` (owners, admins, finance), not a support owner's own-members slice.
 *   - Integrations, Billing and Settings follow their manage / view keys.
 * So a support owner sees Dashboard, Team, Applications, Interviews and Resumes; finance sees Dashboard, Analytics and Billing.
 */
export type NavKey = "dashboard" | "team" | "opportunities" | "applications" | "interviews" | "analytics" | "resumes" | "integrations" | "billing" | "settings";

export interface NavSpec {
  key: NavKey;
  href: string;
  label: string;
  needs: readonly string[];
}

export const ORG_NAV: readonly NavSpec[] = [
  { key: "dashboard", href: "/org", label: "Dashboard", needs: [] },
  { key: "team", href: "/org/team", label: "Team Management", needs: ["member.view_summary", "members.invite"] },
  { key: "opportunities", href: "/org/opportunities", label: "Job Opportunities", needs: ["assignments.manage", "member.act_for"] },
  { key: "applications", href: "/org/applications", label: "Applications", needs: ["member.view_summary"] },
  { key: "interviews", href: "/org/interviews", label: "Interviews", needs: ["member.view_summary"] },
  { key: "analytics", href: "/org/analytics", label: "Analytics & Reports", needs: ["reports.export"] },
  { key: "resumes", href: "/org/resumes", label: "AI Resume Support", needs: ["member.view_summary"] },
  { key: "integrations", href: "/org/integrations", label: "Integrations", needs: ["integrations.manage"] },
  { key: "billing", href: "/org/billing", label: "Billing & Subscription", needs: ["billing.view"] },
  { key: "settings", href: "/org/settings", label: "Settings", needs: ["org.settings.manage"] },
];

export function isAllowed(spec: NavSpec, permissions: readonly string[]): boolean {
  return spec.needs.length === 0 || spec.needs.some((k) => permissions.includes(k));
}

/** The pages this role is shown, in order. */
export function navFor(permissions: readonly string[]): NavSpec[] {
  return ORG_NAV.filter((n) => isAllowed(n, permissions));
}

/** The nav entry a path belongs to (`/org/team/anything` -> Team), or undefined for a path that is not a nav page (`/org/new`). */
export function navSpecFor(pathname: string): NavSpec | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/org") return ORG_NAV[0];
  return ORG_NAV.slice(1).find((n) => path === n.href || path.startsWith(`${n.href}/`));
}

/** True when a person with these permissions may open this console path (a path outside the nav is not blocked here). */
export function pathAllowed(pathname: string, permissions: readonly string[]): boolean {
  const spec = navSpecFor(pathname);
  return !spec || isAllowed(spec, permissions);
}
