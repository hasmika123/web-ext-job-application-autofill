import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** PUT /api/orgs/{orgId}/org-settings/security: shape only (numeric org id, the three known fields); the API checks the bounds and the reason. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["sessionTimeoutMinutes", "passwordMinLength", "reason"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/org-settings/security`, { method: "PUT", body: JSON.stringify(body) });
}
