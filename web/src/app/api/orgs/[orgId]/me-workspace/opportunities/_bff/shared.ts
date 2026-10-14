import { forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Assigned Opportunities page: validates only the SHAPE of the ids (numeric) and of the action
 * name, then forwards to the API, which owns every rule (permission, tenant wall, "only your own opportunity").
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export const ACTIONS: readonly string[] = ["express-interest", "need-more-info", "decline", "reopen", "request-resume-update"];

export async function opportunitiesCall(
  params: Promise<{ orgId: string; matchId?: string; action?: string }>,
  init: RequestInit = {},
  request?: Request,
  query = "",
): Promise<Response> {
  const { orgId, matchId, action } = await params;
  if (!isId(orgId) || (matchId !== undefined && !isId(matchId)) || (action !== undefined && !ACTIONS.includes(action))) return notFound();
  let body: string | undefined;
  if (request) {
    const obj = await readObject(request);
    body = JSON.stringify(obj ?? {});
  }
  const path = `/api/orgs/${orgId}/me-workspace/opportunities${matchId === undefined ? "" : `/${matchId}`}${action === undefined ? "" : `/${action}`}${query}`;
  return forward(path, { ...init, headers: { accept: "application/json" }, ...(body === undefined ? {} : { body, headers: { accept: "application/json", "content-type": "application/json" } }) });
}
