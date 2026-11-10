import type { Metadata } from "next";
import ConsultantProfilePage from "@/components/ent/consultant-ws/ProfilePage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * My Career Profile at `/w/consultant/profile` (design/enterprise-consultant/profile.webp), inside the EnterpriseShell: the sibling
 * layout draws the frame, this page takes the organization and the member from the tenant session. The API is the gate (404 for
 * anyone who is not a consultant of this organization); a member whose menu does not list the workspace gets "This isn't part of
 * your role".
 */
export const metadata: Metadata = { title: "My Profile", robots: { index: false, follow: false } };

export default async function ConsultantProfileRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantProfilePage orgId={me.org.id} firstName={me.person.name} />;
}
