import { badBody, forward, readObject } from "@/lib/admin-proxy";
import { serverApiFetch } from "@/lib/api";

/**
 * Shared by the `app/api/orgs/[orgId]/mkt/opportunities/**` route handlers. The BFF validates only the SHAPE of the ids (digits); scope,
 * permission and the tenant wall are the API's job, and a refusal arrives as the generic 404. E1: these routes only forward the
 * page's prepare/request calls; none of them can set a consultant's interest or submit anything.
 */
const ID = /^\d{1,18}$/;
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const base = (orgId: string) => `/api/orgs/${orgId}/mkt/opportunities`;

/** GET (optionally with the request's query string) or a body-less POST. */
export async function proxyGet(req: Request, orgId: string, sub = "", id?: string): Promise<Response> {
  if (!ID.test(orgId) || (id !== undefined && !ID.test(id))) return notFound();
  const search = new URL(req.url).search;
  return forward(`${base(orgId)}${id ? `/${id}` : ""}${sub}${search}`, { headers: { accept: "application/json" } });
}

export async function proxyPost(orgId: string, sub = "", id?: string, req?: Request, allowed?: readonly string[], optionalBody = false): Promise<Response> {
  if (!ID.test(orgId) || (id !== undefined && !ID.test(id))) return notFound();
  let body: string | undefined;
  if (req) {
    // An optional body may be missing altogether (a plain call); when it is there it must still be a JSON object.
    const text = optionalBody ? await req.clone().text() : "x";
    if (optionalBody && !text.trim()) return forward(`${base(orgId)}${id ? `/${id}` : ""}${sub}`, { method: "POST" });
    const obj = await readObject(req);
    if (!obj) return badBody("Send a JSON object.");
    if (allowed) {
      const extra = Object.keys(obj).find((k) => !allowed.includes(k));
      if (extra) return badBody(`Unknown field: ${extra}.`);
    }
    body = JSON.stringify(obj);
  }
  return forward(`${base(orgId)}${id ? `/${id}` : ""}${sub}`, { method: "POST", body });
}

export async function proxyPatch(orgId: string, sub: string, id: string, req: Request, allowed: readonly string[]): Promise<Response> {
  if (!ID.test(orgId) || !ID.test(id)) return notFound();
  const obj = await readObject(req);
  if (!obj) return badBody("Send a JSON object.");
  const extra = Object.keys(obj).find((k) => !allowed.includes(k));
  if (extra) return badBody(`Unknown field: ${extra}.`);
  return forward(`${base(orgId)}/${id}${sub}`, { method: "PATCH", body: JSON.stringify(obj) });
}

/** The CSV download: streamed through as a file (the shared `forward` expects JSON). */
export async function proxyCsv(req: Request, orgId: string): Promise<Response> {
  if (!ID.test(orgId)) return notFound();
  let res: Response;
  try {
    res = await serverApiFetch(`${base(orgId)}/export${new URL(req.url).search}`, { headers: { accept: "text/csv" } });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (!res.ok) return Response.json({ error: res.status === 404 ? "Not found." : "The export failed." }, { status: res.status === 404 ? 404 : 502 });
  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="opportunities.csv"', "cache-control": "no-store" },
  });
}
