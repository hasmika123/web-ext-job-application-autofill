import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Settings page: validates only the SHAPE of the path (a numeric org id) and of the body (a JSON
 * object), then forwards to the API, which owns every rule (permission, tenant wall, allowed values). Spring's ProblemDetail comes back as
 * `{ error, code, field, ... }`. No password, token or phone number passes through here: none exists in this contract.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export const settingsPath = (orgId: string, tail = ""): string | null => (isId(orgId) ? `/api/orgs/${orgId}/me-workspace/settings${tail}` : null);

export async function getSettings(params: Promise<{ orgId: string }>): Promise<Response> {
  const p = settingsPath((await params).orgId);
  return p ? forward(p, { headers: { accept: "application/json" } }) : notFound();
}

export async function putSettings(request: Request, params: Promise<{ orgId: string }>, tail: string): Promise<Response> {
  const p = settingsPath((await params).orgId, tail);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(p, { method: "PUT", body: JSON.stringify(body), headers: { accept: "application/json" } });
}
