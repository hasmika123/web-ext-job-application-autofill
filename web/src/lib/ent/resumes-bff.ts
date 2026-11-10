import { badBody, forward, passthrough, readObject } from "@/lib/admin-proxy";
import { serverApiFetch } from "@/lib/api";

/**
 * The BFF half of the Resumes board: ONE handler file serves every `/api/orgs/{orgId}/resumes/**` route. It validates the SHAPE of the call (numeric
 * ids, a known route, a JSON object body) and forwards to the API, which owns every rule (permission, tenant wall, scope, Idempotency-Key). The API
 * answers the same generic 404 for a resume outside the caller's reach, another organization's id and a missing id, so nothing here can leak which it was.
 *
 * Only the routes below are forwarded; anything else is a 404 from this layer, never an open proxy. The export is a file: it is streamed back with its
 * content type and disposition instead of being wrapped as JSON.
 */
const ID = "[0-9]{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean; file?: boolean }[] = [
  { method: "GET", pattern: /^$/, body: false },
  { method: "GET", pattern: /^(counts|filters|consultants)$/, body: false },
  { method: "GET", pattern: new RegExp(`^${ID}$`), body: false },
  { method: "GET", pattern: new RegExp(`^${ID}/export$`), body: false, file: true },
  { method: "PUT", pattern: new RegExp(`^${ID}/(primary|visibility)$`), body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/decision$`), body: true },
  { method: "POST", pattern: /^$/, body: true },
  { method: "POST", pattern: /^bulk$/, body: true },
];

export const orgOk = (orgId: string): boolean => /^\d{1,18}$/.test(orgId);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** The headers the API reads on these routes; nothing else of the browser's request is passed on. */
function passedHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const key = request.headers.get("idempotency-key");
  if (key) out["Idempotency-Key"] = key;
  return out;
}

export async function handle(request: Request, ctx: { params: Promise<{ orgId: string; path?: string[] }> }): Promise<Response> {
  const { orgId, path } = await ctx.params;
  if (!orgOk(orgId)) return notFound();
  const rest = (path ?? []).join("/");
  const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(rest));
  if (!route) return notFound();
  const url = new URL(request.url);
  const target = `/api/orgs/${orgId}/resumes${rest ? `/${rest}` : ""}${url.search}`;
  const init: RequestInit = { method: request.method, headers: passedHeaders(request) };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  if (route.file) return file(target, init);
  return forward(target, init);
}

async function file(target: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await serverApiFetch(target, init);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return passthrough(res);
  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "content-security-policy", "x-content-type-options"]) {
    const v = res.headers.get(name);
    if (v) headers.set(name, v);
  }
  headers.set("cache-control", "no-store");
  return new Response(await res.arrayBuffer(), { status: 200, headers });
}
