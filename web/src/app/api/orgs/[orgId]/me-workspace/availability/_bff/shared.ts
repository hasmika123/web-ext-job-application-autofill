import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Availability page: validates only the SHAPE of the path (numeric ids) and of the body (a JSON
 * object), then forwards to the API, which owns every rule (permission, tenant wall, "only your own entry", date rules, the PII scanner).
 * Spring's ProblemDetail comes back as `{ error, code, field, ... }`. Nothing here is sent to a marketer.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export const availabilityPath = (orgId: string, tail = ""): string | null => (isId(orgId) ? `/api/orgs/${orgId}/me-workspace/availability${tail}` : null);

export async function getAvailability(params: Promise<{ orgId: string }>): Promise<Response> {
  const p = availabilityPath((await params).orgId);
  return p ? forward(p, { headers: { accept: "application/json" } }) : notFound();
}

/** PUT or POST a JSON object body to `tail` (or `tail/{id}` when `idKey` names a path parameter). */
export async function sendBody(request: Request, params: Promise<{ orgId: string; id?: string }>, method: "PUT" | "POST", tail: string, withId = false): Promise<Response> {
  const q = await params;
  if (withId && (!q.id || !isId(q.id))) return notFound();
  const p = availabilityPath(q.orgId, withId ? `${tail}/${q.id}` : tail);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(p, { method, body: JSON.stringify(body), headers: { accept: "application/json" } });
}

export async function removeBlock(params: Promise<{ orgId: string; id: string }>): Promise<Response> {
  const q = await params;
  if (!isId(q.id)) return notFound();
  const p = availabilityPath(q.orgId, `/blocks/${q.id}`);
  return p ? forward(p, { method: "DELETE", headers: { accept: "application/json" } }) : notFound();
}
