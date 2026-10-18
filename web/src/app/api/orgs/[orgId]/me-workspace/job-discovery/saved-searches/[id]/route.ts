import { base, isId, notFound, send } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** DELETE /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches/{id}: delete one of the caller's own saved searches. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const b = base(orgId);
  return b && isId(id) ? send(`${b}/saved-searches/${id}`, "DELETE") : notFound();
}
