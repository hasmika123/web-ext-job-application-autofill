import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * PUT /api/orgs/{orgId}/mkt/performance/goals: the marketer's own monthly targets (reports.view). Records numbers only (E1): nothing here submits
 * anything for a consultant. The BFF validates only the id shape and the field names; the API owns permission, scope and the 0..100000 range.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["submissions", "interviews", "offers", "placements"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/performance/goals`, { method: "PUT", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
