import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * Shared by the `app/api/orgs/[orgId]/consultant/opportunities/**` route handlers (the folder is `consultant`, not `con`: `con` is a reserved device name on Windows, where git cannot check it out; the forwarded API path is still `/con/`). The BFF validates only the SHAPE of the ids (digits) and of the
 * body (a JSON object with the action's known fields); scope, permission, the lifecycle matrix and the tenant wall are the API's job, and a
 * refusal arrives as the generic 404. `Idempotency-Key` and `If-Match` are passed through untouched. E1: nothing here can submit or apply
 * for anyone; the consultant's actions only record what they did.
 */
const ID = /^\d{1,18}$/;
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const base = (orgId: string) => `/api/orgs/${orgId}/con/opportunities`;

/** The two request headers the API understands on a write. */
function writeHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  for (const name of ["idempotency-key", "if-match"]) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  return h;
}

/** GET the list (query string forwarded as is) or one opportunity. */
export async function proxyGet(req: Request, orgId: string, id?: string): Promise<Response> {
  if (!ID.test(orgId) || (id !== undefined && !ID.test(id))) return notFound();
  const search = id === undefined ? new URL(req.url).search : "";
  return forward(`${base(orgId)}${id ? `/${id}` : ""}${search}`, { headers: { accept: "application/json" } });
}

/** POST one action. `allowed` are the body fields the action takes; anything else is a 400 here, before the API sees it. */
export async function proxyAction(req: Request, orgId: string, id: string, action: string, allowed: readonly string[]): Promise<Response> {
  if (!ID.test(orgId) || !ID.test(id)) return notFound();
  const obj = await readObject(req);
  if (!obj) return badBody("Send a JSON object.");
  const extra = Object.keys(obj).find((k) => !allowed.includes(k));
  if (extra) return badBody(`Unknown field: ${extra}.`);
  return forward(`${base(orgId)}/${id}/${action}`, { method: "POST", headers: writeHeaders(req), body: JSON.stringify(obj) });
}
