import { forward } from "@/lib/admin-proxy";

/**
 * GET /api/orgs/{orgId}/me-workspace/resumes: the signed-in consultant's own My Resumes page. The BFF checks only the SHAPE of the
 * id (numeric); the API owns every rule (permission, tenant wall, "only your own record").
 */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/me-workspace/resumes`, { headers: { accept: "application/json" } });
}
