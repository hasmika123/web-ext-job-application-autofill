import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/mkt/applications/{id}/stage: RECORD the stage the consultant's application reached (submissions.record). An
 * event on the timeline only (E1): the consultant owns the real submission, nothing here submits or acts as a consultant.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["stage", "reason"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/applications/${id}/stage`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
