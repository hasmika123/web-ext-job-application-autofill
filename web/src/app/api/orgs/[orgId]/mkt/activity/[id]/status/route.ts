import { badBody, forward, readObject } from "@/lib/admin-proxy";

/** PATCH /api/orgs/{orgId}/mkt/activity/{id}/status: mark a logged activity COMPLETED, SCHEDULED or CANCELLED (record only; `id` is the manual row's number). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`/api/orgs/${orgId}/mkt/activity/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: body.status }) });
}
