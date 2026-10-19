import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";

/**
 * `/w/admin/policies` (docs/enterprise-v2/62) became the Policies tab of Settings in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s4): the old address keeps working and opens that tab, which checks
 * `org.settings.manage` like Settings itself. Another workspace's `/policies` keeps its "on the way" / not-your-role answer.
 */
export const metadata: Metadata = { title: "Policies", robots: { index: false, follow: false } };

export default async function WorkspacePoliciesRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["policies"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  redirect("/w/admin/settings?tab=policies");
}
