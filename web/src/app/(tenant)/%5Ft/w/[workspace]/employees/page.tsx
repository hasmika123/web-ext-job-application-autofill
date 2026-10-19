import type { Metadata } from "next";
import EmployeesPage from "@/components/ent/employees/EmployeesPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Employees (X4.12) at `/w/{workspace}/employees`, inside the EnterpriseShell (X2.16): the workspace layout draws the frame, this page takes
 * the organization and the member from the tenant session and renders the board. The menu lists Employees for `member.view_summary` or
 * `members.invite`; a member who types the URL without either gets "This isn't part of your role" (the API refuses the calls regardless,
 * and shows only the people inside the caller's scope).
 */
export const metadata: Metadata = { title: "Employees", robots: { index: false, follow: false } };

export default async function WorkspaceEmployeesRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  const ws = me.workspaces.find((w) => w.key === workspace);
  const listed = !!ws && ws.nav.some((n) => n.href.split("?")[0] === `/w/${workspace}/employees`);
  if (!listed && !can(me, "member.view_summary") && !can(me, "members.invite") && !can(me, "hr.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <EmployeesPage orgId={me.org.id} orgName={me.org.displayName} selfMemberId={me.member.id} permissions={me.permissions} />;
}
