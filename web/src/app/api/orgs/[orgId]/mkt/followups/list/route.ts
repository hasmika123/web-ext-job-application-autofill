import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/followups/list?bucket=&page=&size=&q=&sort=: one bucket as a page (Tasks page, "View all"). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/followups/list${new URL(request.url).search}`, { headers: { accept: "application/json" } });
}
