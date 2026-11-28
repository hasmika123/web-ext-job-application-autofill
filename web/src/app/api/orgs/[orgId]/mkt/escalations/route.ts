import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/escalations: raise a manual escalation for a manager. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["kind", "severity", "subjectType", "subjectId", "title", "detail"]);
  if (bad) return badBody(bad);
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  const key = req.headers.get("idempotency-key");
  if (key) headers["Idempotency-Key"] = key;
  return forward(`/api/orgs/${orgId}/mkt/escalations`, { method: "POST", headers, body: JSON.stringify(body) });
}
