import type { Metadata } from "next";
import JobsPage from "@/components/ent/jobs/JobsPage";
import { marketingPageFor } from "@/components/ent/marketer-ws/registry";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Jobs at `/w/admin/jobs`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the organization from the
 * tenant session and renders the board. The menu lists Jobs for `pipeline.view`; a member who types the URL without `pipeline.view` or
 * `clients.view` gets "This isn't part of your role" (the API refuses the calls regardless). The Marketing workspace's "Job Discovery"
 * (`/w/marketing/jobs`) is a different page: this route mounts it from the Marketing registry.
 */
export const metadata: Metadata = { title: "Jobs", robots: { index: false, follow: false } };

export default async function WorkspaceJobsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace === "marketing") {
    // This folder shadows the catch-all for `/w/marketing/jobs`, so it hands the Marketing workspace its own Job Discovery page (D5, 2026-10-16 audit).
    if (catchAllPage(me, "marketing", ["jobs"]).kind !== "page") return <NotYourRole />; // the menu lists it for `matches.run`; the API is the real gate
    return marketingPageFor(me, ["jobs"]) ?? <ComingSoon title="Job Discovery" />;
  }
  if (workspace !== "admin") return <ComingSoon title="Job Discovery" />;
  if (!can(me, "pipeline.view") && !can(me, "clients.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <JobsPage orgId={me.org.id} orgName={me.org.displayName} supportEmail={null} />;
}
