import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * Shared bits of the Submissions BFF routes (`/api/orgs/{orgId}/mkt/submissions/**`). The BFF validates the SHAPE of the ids and bodies
 * only; permission (`submissions.record`), scope and every rule are the API's. E1: every route here prepares, requests or records;
 * none of them submits for a consultant.
 */
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const ID = /^\d{1,18}$/;

/** `/api/orgs/{orgId}/mkt/submissions` for a well-formed org id, else null. */
export const basePath = (orgId: string): string | null => (ID.test(orgId) ? `/api/orgs/${orgId}/mkt/submissions` : null);

/** `…/submissions/{id}` for well-formed ids, else null. */
export const itemPath = (orgId: string, id: string): string | null => {
  const base = basePath(orgId);
  return base && ID.test(id) ? `${base}/${id}` : null;
};

/** Forward a JSON body that may only carry `allowed` fields. */
export async function forwardBody(request: Request, path: string, method: "POST" | "PATCH", allowed: readonly string[]): Promise<Response> {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, allowed);
  if (bad) return badBody(bad);
  return forward(path, { method, body: JSON.stringify(body) });
}

export { forward };
