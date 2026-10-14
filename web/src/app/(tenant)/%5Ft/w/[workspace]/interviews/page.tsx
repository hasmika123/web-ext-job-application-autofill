import type { Metadata } from "next";
import { Suspense } from "react";
import InterviewsPage from "@/components/ent/interviews/InterviewsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Interviews at `/w/{workspace}/interviews`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the
 * organization and the member from the tenant session and renders the board. The menu lists it for `member.view_summary`; the API gate is
 * `pipeline.view` at the scope the member holds it at (a member who types the URL without it gets "This isn't part of your role", and the
 * API answers 404 to every call regardless). Everything on the page is a record: nobody attends or runs an interview from here.
 */
export const metadata: Metadata = { title: "Interviews", robots: { index: false, follow: false } };

export default async function WorkspaceInterviewsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  const ws = me.workspaces.find((w) => w.key === workspace);
  const listed = !!ws && ws.nav.some((n) => n.href.split("?")[0] === `/w/${workspace}/interviews`);
  if (!listed && !can(me, "pipeline.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <Suspense fallback={null}>
      <InterviewsPage orgId={me.org.id} orgName={me.org.displayName} workspace={workspace} permissions={me.permissions} supportEmail={null} />
    </Suspense>
  );
}
