import type { Metadata } from "next";
import { Suspense } from "react";
import OrgSettingsPage from "@/components/ent/settings/OrgSettingsPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Settings at `/w/admin/settings` (General, Security, Autopilot, Resumes and Policies tabs), inside the EnterpriseShell: the workspace layout draws the frame, this page takes the organization
 * and the permission (`org.settings.manage`) from the tenant session. The menu lists Settings only for that permission; a member who types the URL
 * anyway gets "This isn't part of your role" (the API refuses the calls regardless). The Consultant workspace has its own Settings folder and wins
 * over this one; any other workspace keeps what the catch-all shows for `/settings`.
 */
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function WorkspaceSettingsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["settings"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  if (!can(me, "org.settings.manage")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Settings" subtitle="Defaults and policies for your organization." />
      <Suspense fallback={null}>
        <OrgSettingsPage orgId={me.org.id} />
      </Suspense>
    </>
  );
}
