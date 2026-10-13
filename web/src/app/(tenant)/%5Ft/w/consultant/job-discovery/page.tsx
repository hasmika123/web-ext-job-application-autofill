import type { Metadata } from "next";
import JobDiscoveryPage from "@/components/ent/consultant-ws/JobDiscoveryPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * Consultant Job Discovery at `/w/consultant/job-discovery` (design/enterprise-consultant/job-discovery.webp), inside the
 * EnterpriseShell: the sibling layout draws the frame, this page takes the organization and the member from the tenant session. The API is
 * the gate (404 for anyone who is not a consultant of this organization).
 */
export const metadata: Metadata = { title: "Job Discovery", robots: { index: false, follow: false } };

export default async function ConsultantJobDiscoveryRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <JobDiscoveryPage orgId={me.org.id} firstName={me.person.name} />;
}
