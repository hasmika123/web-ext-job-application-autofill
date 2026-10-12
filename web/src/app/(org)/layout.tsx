import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadOrgGate, requireOrgSession } from "@/lib/org";
import OrgShell from "@/components/org-v2/shell/OrgShell";
import OrgLoadError from "@/components/org-v2/shell/OrgLoadError";
import { ORG_THEME_CLASS } from "@/components/org-v2/shell/org-fonts";

// Keep the console out of search results (also in NON_INDEXABLE_PATHS).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Shell and gate for the organization console (`/org/*`; APP-E2E-PLAN section 2.2, tenant-model.md section 8).
 *
 * Three checks, in order:
 *  1. the session (no cookie / a rejected token -> /login) and the org feature flag (off -> /dashboard), `requireOrgSession`;
 *  2. the caller's memberships, `GET /api/orgs/mine`: none -> `/org/new` (the create flow); only plain MEMBER seats ->
 *     `/dashboard?toast=org_member` (members' org surface is /settings/organizations); an admin-ish seat -> render;
 *     several -> the `kiwiply_org` cookie picks one, the switcher changes it;
 *  3. the role and permission keys of the chosen org (`GET /api/orgs/{id}`), handed to `OrgShell` and from there to every
 *     page through `useOrg()`. No page reads an org id from the client.
 *
 * The create flow itself lives outside this layout (`(org-flow)/org/new`), so "no orgs -> /org/new" cannot loop.
 */
export default async function OrgGroupLayout({ children }: { children: React.ReactNode }) {
  const account = await requireOrgSession();
  const gate = await loadOrgGate();

  if (gate.kind === "off") redirect("/dashboard");
  if (gate.kind === "none") redirect("/org/new");
  if (gate.kind === "member-only") redirect("/dashboard?toast=org_member");

  if (gate.kind === "error") {
    return (
      <div className={ORG_THEME_CLASS}>
        <OrgLoadError />
      </div>
    );
  }

  return (
    <div className={ORG_THEME_CLASS}>
      <OrgShell account={account} current={gate.current} orgs={gate.orgs}>
        {children}
      </OrgShell>
    </div>
  );
}
