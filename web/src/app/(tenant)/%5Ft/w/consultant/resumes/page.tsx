import type { Metadata } from "next";
import ConsultantResumesPage from "@/components/ent/consultant-ws/ResumesPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * Consultant My Resumes at `/w/consultant/resumes` (design/enterprise-consultant/resumes.webp), inside the EnterpriseShell via the
 * sibling `layout.tsx`. The API is the gate (404 for anyone who is not a consultant of this organization); a member whose menu does
 * not list the workspace gets "This isn't part of your role".
 */
export const metadata: Metadata = { title: "My Resumes", robots: { index: false, follow: false } };

export default async function ConsultantResumesRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantResumesPage orgId={me.org.id} firstName={me.person.name} />;
}
