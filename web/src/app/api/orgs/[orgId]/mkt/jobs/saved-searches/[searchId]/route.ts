import { forward } from "@/lib/admin-proxy";

/** DELETE /api/orgs/{orgId}/mkt/jobs/saved-searches/{searchId}: remove one of the caller's own saved searches (anyone else's is a 404). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; searchId: string }> }) {
  const { orgId, searchId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(searchId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/jobs/saved-searches/${searchId}`, { method: "DELETE", headers: { accept: "application/json" } });
}
