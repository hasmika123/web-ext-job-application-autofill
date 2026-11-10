import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/tasks/{id}/assignees: who the task can be handed to. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/tasks/${id}/assignees`, { headers: { accept: "application/json" } });
}
