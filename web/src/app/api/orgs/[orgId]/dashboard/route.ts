import { forward } from "@/lib/admin-proxy";

/**
 * GET /api/orgs/{orgId}/dashboard: the Organization Dashboard's widgets (X2.4), one call. The BFF checks only the SHAPE of the id
 * (numeric); the API owns every rule (permission, tenant wall, scope), and the tenant host headers come with `serverApiFetch`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/dashboard`, { headers: { accept: "application/json" } });
}
