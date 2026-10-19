import type { Metadata } from "next";
import TeamsDepartmentsPage from "@/components/ent/groups/TeamsDepartmentsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/** Teams & Departments (X4.5) at `/w/{workspace}/teams` (the Departments tab is `?tab=departments`), inside the EnterpriseShell: read for anyone who may see the structure, controls with `groups.manage`. */
export const metadata: Metadata = { title: "Teams & Departments", robots: { index: false, follow: false } };

const READ_KEYS = ["groups.manage", "members.group.set", "members.invite", "member.view_summary", "hr.view", "dashboard.view_org"];

export default async function WorkspaceTeamsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null;
  const { me } = session;
  if (!READ_KEYS.some((k) => can(me, k))) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <TeamsDepartmentsPage orgId={me.org.id} orgName={me.org.displayName} canManage={can(me, "groups.manage")} />;
}
