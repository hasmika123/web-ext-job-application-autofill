import type { Metadata } from "next";
import TeamsPage from "@/components/ent/groups/TeamsPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/** Teams (X4.5) at `/w/{workspace}/teams`, inside the EnterpriseShell. Same rules as Departments: read for anyone who may see the structure, controls with `groups.manage`. */
export const metadata: Metadata = { title: "Teams", robots: { index: false, follow: false } };

const READ_KEYS = ["groups.manage", "members.group.set", "members.invite", "member.view_summary", "hr.view", "dashboard.view_org"];

export default async function WorkspaceTeamsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null;
  const { me } = session;
  if (!READ_KEYS.some((k) => can(me, k))) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Teams" subtitle="Organize your people into high-performing teams." />
      <TeamsPage orgId={me.org.id} canManage={can(me, "groups.manage")} />
    </>
  );
}
