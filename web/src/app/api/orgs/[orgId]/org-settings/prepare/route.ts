import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/org-settings/prepare: the organization's Prepare selected openings switch and limits, with the platform maximums. The API owns every rule. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/org-settings/prepare`);
}

/** PUT /api/orgs/{orgId}/org-settings/prepare: shape only (numeric org id, the four known fields); the API checks the bounds against the platform maximum and audits. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["enabled", "dailyCap", "monthlyCap", "maxBatch"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/org-settings/prepare`, { method: "PUT", body: JSON.stringify(body) });
}
