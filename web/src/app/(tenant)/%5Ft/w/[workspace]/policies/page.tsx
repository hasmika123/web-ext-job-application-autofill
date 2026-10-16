import type { Metadata } from "next";
import PoliciesPage from "@/components/ent/policy/PoliciesPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Policies at `/w/admin/policies` (docs/enterprise-v2/62), inside the EnterpriseShell: the workspace layout draws the frame, this page takes the
 * organization and the permission (`org.settings.manage`, the same as Settings and Branding) from the tenant session. A member who types the URL
 * anyway gets "This isn't part of your role" (the API refuses the calls regardless).
 */
export const metadata: Metadata = { title: "Policies", robots: { index: false, follow: false } };

export default async function WorkspacePoliciesRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["policies"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  if (!can(me, "org.settings.manage")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Policies" subtitle="Your privacy policy, terms and support page, shown on your own address." />
      <PoliciesPage orgId={me.org.id} />
    </>
  );
}
