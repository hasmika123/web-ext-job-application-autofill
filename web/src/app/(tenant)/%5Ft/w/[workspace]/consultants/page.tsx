import type { Metadata } from "next";
import { Suspense } from "react";
import ConsultantsPage from "@/components/ent/consultants/ConsultantsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Consultants at `/w/{workspace}/consultants`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the organization
 * from the tenant session and renders the board. The menu lists Consultants for `consultants.view`; a member who types the URL without it gets
 * "This isn't part of your role" (the API refuses the calls regardless and shows only the consultants inside the caller's reach).
 */
export const metadata: Metadata = { title: "Consultants", robots: { index: false, follow: false } };

export default async function WorkspaceConsultantsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  const ws = me.workspaces.find((w) => w.key === workspace);
  const listed = !!ws && ws.nav.some((n) => n.href.split("?")[0] === `/w/${workspace}/consultants`);
  if (!listed && !can(me, "consultants.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <Suspense fallback={null}>
      <ConsultantsPage orgId={me.org.id} permissions={me.permissions} />
    </Suspense>
  );
}
