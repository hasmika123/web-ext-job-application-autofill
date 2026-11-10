import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of My Career Profile: every `app/api/orgs/[orgId]/me-workspace/profile/**` handler checks only the SHAPE of the path
 * (numeric ids) and of the body (a JSON object), then forwards to the API, which owns every rule (permission, tenant wall, "only your
 * own record", validation, the PII scanner). Spring's ProblemDetail comes back as `{ error, code, field, ... }`.
 */
const ID = /^\d{1,18}$/;
export const isId = (v: string): boolean => ID.test(v);

const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export const profilePath = (orgId: string, tail = ""): string | null => (isId(orgId) ? `/api/orgs/${orgId}/me-workspace/profile${tail}` : null);

/** GET the profile. */
export async function getProfile(params: Promise<{ orgId: string }>): Promise<Response> {
  const p = profilePath((await params).orgId);
  return p ? forward(p, { headers: { accept: "application/json" } }) : notFound();
}

/** PUT or POST a JSON object body to `tail`. */
export async function sendBody(request: Request, params: Promise<{ orgId: string }>, method: "PUT" | "POST", tail: string): Promise<Response> {
  const p = profilePath((await params).orgId, tail);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(p, { method, body: JSON.stringify(body), headers: { accept: "application/json" } });
}

/** DELETE `tail/{id}`; the API answers with the fresh profile. */
export async function remove(params: Promise<{ orgId: string; [k: string]: string }>, idKey: string, tail: string): Promise<Response> {
  const q = await params;
  const id = q[idKey];
  if (!id || !isId(id)) return notFound();
  const p = profilePath(q.orgId, `${tail}/${id}`);
  return p ? forward(p, { method: "DELETE", headers: { accept: "application/json" } }) : notFound();
}
