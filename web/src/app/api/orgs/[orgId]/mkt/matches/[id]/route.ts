import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/matches/{id}: one match with its explanation and insights (the Review drawer). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/matches/${id}`, { headers: { accept: "application/json" } });
}
