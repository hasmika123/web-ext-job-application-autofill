import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/performance: the Performance board (one call; the card periods ride in the query). The API owns scope (ASSIGNED), permission and the tenant wall. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/performance${new URL(req.url).search}`, { headers: { accept: "application/json" } });
}
