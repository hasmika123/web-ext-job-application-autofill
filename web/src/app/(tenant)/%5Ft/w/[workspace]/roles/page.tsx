import type { Metadata } from "next";
import RolesPage from "@/components/ent/roles/RolesPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { getTenant } from "@/lib/tenant";

/**
 * Roles & Permissions (X4.11) at `/w/{workspace}/roles`, mounted inside the EnterpriseShell (X2.16): the workspace layout draws the
 * frame, this page takes the organization and the permission from the tenant session (`GET /api/me/tenant`). The menu lists the page
 * for `roles.manage`; anyone else who types the URL still gets the read-only list (the API lets every active member read roles and
 * refuses every write), so there is nothing to hide and nothing a hidden button could protect.
 */
export const metadata: Metadata = { title: "Roles & Permissions", robots: { index: false, follow: false } };

export default async function WorkspaceRolesRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  const t = await getTenant();
  const supportEmail = t.kind === "TENANT" ? (t.tenant.branding?.supportEmail ?? null) : null;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Manage roles, permission sets, and access control for your organization." />
      <RolesPage orgId={me.org.id} orgName={me.org.displayName} workspace={workspace} canManage={me.permissions["roles.manage"] === "ORG"} supportEmail={supportEmail} />
    </>
  );
}
