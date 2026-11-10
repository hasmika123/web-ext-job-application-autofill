import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/mkt/matches/{id}/assign [{confirmDuplicate, duplicateReason}]: record that the marketer puts this match forward (SUGGESTED to ASSIGNED).
 * A record only (E1): nothing is submitted for the consultant. The optional body answers a 409 DUPLICATE_WARNING (confirm with a reason); no body = a plain assign.
 * The API checks opportunities.manage, the tenant wall and every duplicate rule.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const target = `/api/orgs/${orgId}/mkt/matches/${id}/assign`;
  if (!(await req.clone().text()).trim()) return forward(target, { method: "POST", headers: { accept: "application/json" } });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["confirmDuplicate", "duplicateReason"]);
  if (bad) return badBody(bad);
  return forward(target, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
