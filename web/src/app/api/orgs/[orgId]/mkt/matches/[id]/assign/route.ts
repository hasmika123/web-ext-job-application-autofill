import { forward } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/mkt/matches/{id}/assign: record that the marketer puts this match forward (SUGGESTED to ASSIGNED).
 * A record only (E1): nothing is submitted for the consultant. The API checks opportunities.manage and the tenant wall.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/matches/${id}/assign`, { method: "POST", headers: { accept: "application/json" } });
}
