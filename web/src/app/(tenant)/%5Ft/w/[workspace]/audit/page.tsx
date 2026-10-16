import type { Metadata } from "next";
import AuditPage from "@/components/ent/audit/AuditPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Audit Logs at `/w/admin/audit`, inside the EnterpriseShell: the organization audit trail, read only (D9, 2026-10-16 audit). The menu lists it for
 * `audit.view`; the API is the real gate (ORG scope, not row-filtered) and answers the generic 404 otherwise. Other workspaces keep what the catch-all shows.
 */
export const metadata: Metadata = { title: "Audit Logs", robots: { index: false, follow: false } };

export default async function WorkspaceAuditRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["audit"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  if (!can(me, "audit.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Who did what in your organization, and when." />
      <AuditPage orgId={me.org.id} />
    </>
  );
}
