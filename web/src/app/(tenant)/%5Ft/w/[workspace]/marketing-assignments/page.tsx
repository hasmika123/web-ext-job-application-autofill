import type { Metadata } from "next";
import MarketingAssignmentsPage from "@/components/ent/marketing/MarketingAssignmentsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Marketing Assignments at `/w/{workspace}/marketing-assignments`, inside the EnterpriseShell: the workspace layout draws the frame, this
 * page takes the organization and the permissions from the tenant session. The menu lists it for `assignments.manage` or `workload.view`; a
 * member who types the URL without either gets "This isn't part of your role" (the API refuses every call regardless, and a team-scoped
 * manager only ever sees their own team). The URL's search string seeds the page, so a shared link opens on the same marketer and filters.
 */
export const metadata: Metadata = { title: "Assignments", robots: { index: false, follow: false } };

export default async function WorkspaceMarketingAssignmentsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace } = await params;
  const search = await searchParams;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  const ws = me.workspaces.find((w) => w.key === workspace);
  const listed = !!ws && ws.nav.some((n) => n.href.split("?")[0] === `/w/${workspace}/marketing-assignments`);
  if (!listed && !can(me, "assignments.manage") && !can(me, "workload.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <MarketingAssignmentsPage orgId={me.org.id} workspace={workspace} permissions={me.permissions} initialSearch={search} />;
}
