import type { Metadata } from "next";
import ConsultantApplicationsPage from "@/components/ent/consultant-ws/ApplicationsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * Consultant My Applications at `/w/consultant/applications` (design/enterprise-consultant/applications.webp), inside the EnterpriseShell
 * (the sibling layout draws the frame). Read-only; the API is the gate (404 for anyone who is not a consultant of this organization).
 */
export const metadata: Metadata = { title: "My Applications", robots: { index: false, follow: false } };

export default async function ConsultantApplicationsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantApplicationsPage orgId={me.org.id} firstName={me.person.name} selfMemberId={me.member.id} />;
}
