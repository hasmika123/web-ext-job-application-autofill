import type { Metadata } from "next";
import LicensesPage from "@/components/ent/licenses/LicensesPage";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Consultant Licenses at `/w/admin/licenses` (docs/enterprise-v2/LICENCES-BUILD.md L4), inside the EnterpriseShell. The menu lists it for
 * `licenses.view`; changing a licence needs `licenses.manage`. The API is the real gate and answers the generic 404 otherwise.
 */
export const metadata: Metadata = { title: "Consultant Licenses", robots: { index: false, follow: false } };

export default async function WorkspaceLicensesRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["licenses"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  if (!can(me, "licenses.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <LicensesPage orgId={me.org.id} canManage={can(me, "licenses.manage")} />;
}
