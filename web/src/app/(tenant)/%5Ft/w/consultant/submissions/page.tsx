import type { Metadata } from "next";
import ConsultantSubmissionsPage from "@/components/ent/consultant-ws/SubmissionsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * Consultant Submissions & Approvals at `/w/consultant/submissions` (design/enterprise-consultant/submissions.webp), inside the EnterpriseShell (the sibling
 * layout draws the frame). The API is the gate (404 for anyone who is not a consultant of this organization).
 */
export const metadata: Metadata = { title: "Submissions & Approvals", robots: { index: false, follow: false } };

export default async function ConsultantSubmissionsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantSubmissionsPage orgId={me.org.id} firstName={me.person.name} />;
}
