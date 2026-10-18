import type { Metadata } from "next";
import ConsultantOpportunitiesPage from "@/components/ent/consultant-ws/OpportunitiesPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * `/w/consultant/opportunities/{matchId}`: the same Assigned Opportunities page with that job's details open. The id is the opportunity's match id
 * (the one every row of the page and of the marketer's board carries). A job that is not this consultant's is the API's generic 404, shown as "isn't available".
 */
export const metadata: Metadata = { title: "Assigned Opportunities", robots: { index: false, follow: false } };

export default async function ConsultantOpportunityDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  const matchId = /^\d{1,15}$/.test(id) ? Number(id) : null;
  return <ConsultantOpportunitiesPage orgId={me.org.id} firstName={me.person.name} initialOpenId={matchId} />;
}
