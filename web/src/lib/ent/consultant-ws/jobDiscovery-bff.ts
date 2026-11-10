import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant Job Discovery page: every `app/api/orgs/[orgId]/me-workspace/job-discovery/**` handler checks only the
 * SHAPE of the ids (numeric) and forwards to the API, which owns every rule (permission, tenant wall, "only your own record", the PII
 * scan). Spring's ProblemDetail comes back as `{ error, code, ... }`.
 */
export const isId = (v: string): boolean => /^\d{1,18}$/.test(v);

export const base = (orgId: string): string | null => (isId(orgId) ? `/api/orgs/${orgId}/me-workspace/job-discovery` : null);

export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

const JSON_HEADERS = { accept: "application/json" };

export const get = (path: string) => forward(path, { headers: JSON_HEADERS });

export const send = (path: string, method: "POST" | "DELETE") => forward(path, { method, headers: JSON_HEADERS });

/** A POST whose body must be a JSON object (saved search, recent search). */
export async function sendObject(path: string, request: Request): Promise<Response> {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(path, { method: "POST", body: JSON.stringify(body), headers: { ...JSON_HEADERS, "content-type": "application/json" } });
}
