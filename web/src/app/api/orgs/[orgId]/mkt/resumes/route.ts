import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/resumes: the Resumes board (one call; filters, sort and paging ride in the query). The API owns scope, permission and the tenant wall. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/resumes${new URL(req.url).search}`, { headers: { accept: "application/json" } });
}
