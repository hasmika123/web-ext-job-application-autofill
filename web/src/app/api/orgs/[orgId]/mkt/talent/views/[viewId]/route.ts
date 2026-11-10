import { forward } from "@/lib/admin-proxy";

/** DELETE /api/orgs/{orgId}/mkt/talent/views/{viewId}: delete one of the caller's own saved views (404 for anyone else's). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; viewId: string }> }) {
  const { orgId, viewId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(viewId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/talent/views/${viewId}`, { method: "DELETE" });
}
