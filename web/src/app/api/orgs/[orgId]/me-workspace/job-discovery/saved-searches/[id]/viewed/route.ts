import { base, isId, notFound, send } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** POST /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches/{id}/viewed: restart the "new results" counter. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const b = base(orgId);
  return b && isId(id) ? send(`${b}/saved-searches/${id}/viewed`, "POST") : notFound();
}
