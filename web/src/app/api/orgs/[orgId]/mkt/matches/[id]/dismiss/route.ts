import { forward } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/matches/{id}/dismiss: the suggestion is not a fit (SUGGESTED to DISMISSED). A record only. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/matches/${id}/dismiss`, { method: "POST", headers: { accept: "application/json" } });
}
