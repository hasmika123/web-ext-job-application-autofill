import type { Metadata } from "next";
import DepartmentsPage from "@/components/ent/groups/DepartmentsPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Departments (X4.5) at `/w/{workspace}/departments`, inside the EnterpriseShell: the workspace layout draws the frame, this page
 * takes the organization and the permissions from the tenant session. Anyone who may read the structure sees it; the controls
 * (create, edit, change lead, archive, delete) appear only with `groups.manage`. The API re-checks every call.
 */
export const metadata: Metadata = { title: "Departments", robots: { index: false, follow: false } };

const READ_KEYS = ["groups.manage", "members.group.set", "members.invite", "member.view_summary", "hr.view", "dashboard.view_org"];

export default async function WorkspaceDepartmentsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!READ_KEYS.some((k) => can(me, k))) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Departments" subtitle="Manage your organization's departments, people, and structure." />
      <DepartmentsPage orgId={me.org.id} canManage={can(me, "groups.manage")} />
    </>
  );
}
