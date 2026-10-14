import { forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Interviews page: validates only the SHAPE of the ids (numeric) and forwards to the API,
 * which owns every rule (permission, tenant wall, "only your own interview", validation, the sensitive-data guard). Tenant host
 * headers come with `serverApiFetch`.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export async function interviewsCall(
  params: Promise<{ orgId: string; interviewId?: string }>,
  suffix: string,
  init: RequestInit = {},
  request?: Request,
): Promise<Response> {
  const { orgId, interviewId } = await params;
  if (!isId(orgId) || (interviewId !== undefined && !isId(interviewId))) return notFound();
  let body: string | undefined;
  if (request) {
    const obj = await readObject(request);
    body = JSON.stringify(obj ?? {});
  }
  const path = `/api/orgs/${orgId}/me-workspace/interviews${interviewId === undefined ? "" : `/${interviewId}`}${suffix}`;
  return forward(path, { ...init, headers: { accept: "application/json" }, ...(body === undefined ? {} : { body, headers: { accept: "application/json", "content-type": "application/json" } }) });
}
