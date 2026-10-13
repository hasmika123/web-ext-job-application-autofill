import { serverApiFetch } from "@/lib/api";
import { badBody, forward, passthrough, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Departments and Teams pages (X4.5): every `app/api/orgs/[orgId]/groups/**` handler validates the SHAPE of the
 * path (numeric ids) and forwards to the API, which owns every rule (permission, tenant wall, scope, If-Match, idempotency, the
 * tree rules). Spring's ProblemDetail comes back as `{ error, code, field, count, currentVersion, ... }`.
 */
export const groupsPath = (orgId: string): string | null => (/^\d{1,18}$/.test(orgId) ? `/api/orgs/${orgId}/groups` : null);

export const isId = (v: string): boolean => /^\d{1,18}$/.test(v);

export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** The request headers the API reads on writes: the version being edited and the key that makes a bulk move safe to retry. */
export function writeHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const ifMatch = request.headers.get("if-match");
  if (ifMatch) headers["If-Match"] = ifMatch;
  const key = request.headers.get("idempotency-key");
  if (key) headers["Idempotency-Key"] = key;
  return headers;
}

/** A DELETE: the API answers 204 with no body, which `Response.json` can not carry, so it is passed on empty. Any refusal is the usual `{ error, code }`. */
export async function forwardDelete(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await serverApiFetch(path, { ...init, method: "DELETE" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return res.status === 204 ? new Response(null, { status: 204 }) : passthrough(res);
}

export { badBody, forward, readObject };
