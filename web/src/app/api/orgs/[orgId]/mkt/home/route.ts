import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/home: the Marketing Home board (one call). The API owns scope (ASSIGNED), permission and the tenant wall. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/home`, { headers: { accept: "application/json" } });
}
