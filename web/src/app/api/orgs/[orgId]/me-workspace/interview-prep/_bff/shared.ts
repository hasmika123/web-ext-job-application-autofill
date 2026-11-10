import { forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Interview Prep page: validates only the SHAPE of the ids (numeric org and session id, a slug for
 * the checklist item) and forwards to the API, which owns every rule (permission, tenant wall, "only your own session", validation and the
 * sensitive-data scan). Tenant host headers come with `serverApiFetch`.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const isKey = (v: string): boolean => /^[a-z0-9-]{1,40}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export async function prepCall(
  params: Promise<{ orgId: string; sessionId?: string; itemKey?: string }>,
  suffix: string,
  init: RequestInit = {},
  request?: Request,
): Promise<Response> {
  const { orgId, sessionId, itemKey } = await params;
  if (!isId(orgId) || (sessionId !== undefined && !isId(sessionId)) || (itemKey !== undefined && !isKey(itemKey))) return notFound();
  let body: string | undefined;
  if (request) body = JSON.stringify((await readObject(request)) ?? {});
  const tail = sessionId !== undefined ? `/sessions/${sessionId}` : itemKey !== undefined ? `/checklist/${itemKey}` : suffix;
  const path = `/api/orgs/${orgId}/me-workspace/interview-prep${tail}`;
  return forward(path, {
    ...init,
    headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}
