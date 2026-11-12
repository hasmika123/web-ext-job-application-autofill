import type { Metadata } from "next";
import DomainsPage from "@/components/ent/domains/DomainsPage";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Domains at `/w/admin/domains` (docs/enterprise-v2/CUSTOM-DOMAINS-BUILD.md, gap A4), inside the EnterpriseShell. The menu lists it for `domains.manage`
 * when the domains module is on; the API is the real gate and answers the generic 404 otherwise.
 */
export const metadata: Metadata = { title: "Domains", robots: { index: false, follow: false } };

export default async function WorkspaceDomainsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["domains"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  if (!can(me, "domains.manage")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <DomainsPage orgId={me.org.id} />;
}
