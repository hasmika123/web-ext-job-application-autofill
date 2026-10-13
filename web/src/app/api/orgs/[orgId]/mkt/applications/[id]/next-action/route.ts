import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * PATCH /api/orgs/{orgId}/mkt/applications/{id}/next-action: set or clear the next action and its due date (followups.manage). A
 * RECORD only (E1): nothing here submits an application or acts as a consultant. The API owns permission, scope, consent and the scan.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["nextAction", "dueDate"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/applications/${id}/next-action`, { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
