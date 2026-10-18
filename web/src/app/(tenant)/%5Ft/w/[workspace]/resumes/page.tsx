import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingPageFor } from "@/components/ent/marketer-ws/registry";
import ResumesPage from "@/components/ent/resumes/ResumesPage";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Resumes at `/w/{workspace}/resumes`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the organization from the
 * tenant session and renders the board. The menu lists Resumes for `resumes.view_for`; a member who types the URL without it gets "This isn't part
 * of your role" (the API refuses the calls regardless and shows only the resumes inside the caller's scope).
 */
export const metadata: Metadata = { title: "Resumes", robots: { index: false, follow: false } };

export default async function WorkspaceResumesRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace === "marketing") {
    // This folder shadows the catch-all for `/w/marketing/resumes`, so it hands the Marketing workspace its own page (the D5 rule of the 2026-10-16 audit); without this a marketer saw the Administration page.
    if (catchAllPage(me, "marketing", ["resumes"]).kind !== "page") return <NotYourRole />; // the menu lists it for the marketing roles; the API is the real gate
    return marketingPageFor(me, ["resumes"]) ?? <ComingSoon title="Resumes" />;
  }
  if (!can(me, "resumes.view_for")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <Suspense fallback={null}>
      <ResumesPage orgId={me.org.id} orgName={me.org.displayName} workspace={workspace} selfMemberId={me.member.id} permissions={me.permissions} supportEmail={null} />
    </Suspense>
  );
}
