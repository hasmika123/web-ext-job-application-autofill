import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingPageFor } from "@/components/ent/marketer-ws/registry";
import SubmissionsRecordsPage from "@/components/ent/accounts-submissions/SubmissionsRecordsPage";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Submissions at `/w/{workspace}/submissions`. The Marketing workspace's own Submissions page (where a marketer prepares and records packages) is mounted from
 * its registry; every other workspace that lists Submissions (the Accounts workspace) gets the read-only RECORDS page: who, which requirement and client,
 * status. This folder shadows the catch-all, so it hands Marketing its own page (the D5 rule of the 2026-10-16 audit). No submit control exists on either
 * route of this folder's records page: the consultant submits, Kiwiply never does.
 */
export const metadata: Metadata = { title: "Submissions", robots: { index: false, follow: false } };

export default async function WorkspaceSubmissionsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace === "marketing") {
    if (catchAllPage(me, "marketing", ["submissions"]).kind !== "page") return <NotYourRole />;
    return marketingPageFor(me, ["submissions"]) ?? <ComingSoon title="Submissions" />;
  }
  if (!can(me, "submissions.record")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <Suspense fallback={null}>
      <SubmissionsRecordsPage orgId={me.org.id} orgName={me.org.displayName} />
    </Suspense>
  );
}
