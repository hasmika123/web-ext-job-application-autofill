import type { Metadata } from "next";
import JobsPage from "@/components/ent/jobs/JobsPage";
import { marketingPage } from "@/components/ent/marketer-ws/registry";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { firstNameOf } from "@/lib/ent/dashboard";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Jobs at `/w/admin/jobs`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the organization from the
 * tenant session and renders the board. The menu lists Jobs for `pipeline.view`; a member who types the URL without `pipeline.view` or
 * `clients.view` gets "This isn't part of your role" (the API refuses the calls regardless). The Marketing workspace's "Job Discovery"
 * is a different page (components/ent/marketer-ws/jobs); this sibling route would otherwise shadow the catch-all, so it hands over to it.
 */
export const metadata: Metadata = { title: "Jobs", robots: { index: false, follow: false } };

export default async function WorkspaceJobsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace === "marketing" && me.org.id) {
    const ws = me.workspaces.find((w) => w.key === "marketing");
    const hrefs = Object.fromEntries((ws?.nav ?? []).map((n) => [n.key, n.href]));
    const page = marketingPage(["jobs"], { orgId: me.org.id, orgName: me.org.displayName, firstName: firstNameOf(me.person.name), hrefs, selfMemberId: me.member.id });
    if (page) return page;
  }
  if (workspace !== "admin") return <ComingSoon title="Job Discovery" />;
  if (!can(me, "pipeline.view") && !can(me, "clients.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <JobsPage orgId={me.org.id} orgName={me.org.displayName} supportEmail={null} />;
}
