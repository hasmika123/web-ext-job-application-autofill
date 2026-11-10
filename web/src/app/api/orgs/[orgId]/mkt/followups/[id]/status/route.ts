import { badBody, forward, readObject } from "@/lib/admin-proxy";

/** PATCH /api/orgs/{orgId}/mkt/followups/{id}/status: update a follow-up's status (record only). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`/api/orgs/${orgId}/mkt/followups/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: body.status }) });
}
