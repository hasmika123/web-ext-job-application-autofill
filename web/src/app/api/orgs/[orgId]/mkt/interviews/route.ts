import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/interviews: the Interviews board (one call; the filters are query parameters). The API owns scope (ASSIGNED), permission and the tenant wall. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const search = new URL(request.url).search;
  return forward(`/api/orgs/${orgId}/mkt/interviews${search}`, { headers: { accept: "application/json" } });
}
