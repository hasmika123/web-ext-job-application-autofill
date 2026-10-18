import { badBody, forward, passthrough, readObject } from "@/lib/admin-proxy";
import { serverApiFetch } from "@/lib/api";

/**
 * The BFF half of the Employees page (X4.12): ONE handler file serves every `/api/orgs/{orgId}/members/**` route. It validates the
 * SHAPE of the call (numeric ids, a known route, a JSON object body) and forwards to the API, which owns every rule (permission,
 * tenant wall, scope, ceiling, If-Match, Idempotency-Key). The API answers the same generic 404 for a person outside the caller's
 * reach, a foreign organization and a missing id, so nothing here can leak which it was.
 *
 * Only the routes below are forwarded; anything else is a 404 from this layer, never an open proxy.
 */
const ID = "\\d{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^$/, body: false },
  { method: "GET", pattern: /^counts$/, body: false },
  { method: "GET", pattern: /^offboarding$/, body: false },
  { method: "DELETE", pattern: new RegExp(`^offboarding/${ID}$`), body: false },
  { method: "GET", pattern: new RegExp(`^${ID}$`), body: false },
  { method: "PATCH", pattern: new RegExp(`^${ID}$`), body: true },
  { method: "GET", pattern: new RegExp(`^${ID}/(activity|offboard-preview)$`), body: false },
  { method: "PUT", pattern: new RegExp(`^${ID}/roles$`), body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/(suspend|reinstate|offboard)$`), body: true },
  { method: "POST", pattern: /^bulk\/(roles|groups|manager|status)$/, body: true },
  // Direct account creation with a temporary password (employee onboarding): the answers carry a one-time password, so no-store.
  { method: "GET", pattern: /^temp-password$/, body: false },
  { method: "POST", pattern: /^account$/, body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/reset-password$`), body: true },
];

/** Routes whose answer may hold a password: never cacheable. */
const SECRET_ANSWER = [/^temp-password$/, /^account$/, new RegExp(`^${ID}/reset-password$`)];

export const orgOk = (orgId: string): boolean => /^\d{1,18}$/.test(orgId);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** The headers the API reads on these routes; nothing else of the browser's request is passed on. */
function passedHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const ifMatch = request.headers.get("if-match");
  if (ifMatch) out["If-Match"] = ifMatch;
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
  const target = `/api/orgs/${orgId}/members${rest ? `/${rest}` : ""}${url.search}`;
  const init: RequestInit = { method: request.method, headers: passedHeaders(request) };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  if (request.method === "DELETE") {
    // 204 has no body: the shared passthrough would try to build a JSON answer for it
    let res: Response;
    try {
      res = await serverApiFetch(target, init);
    } catch {
      return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
    }
    return res.status === 204 ? new Response(null, { status: 204 }) : passthrough(res);
  }
  const res = await forward(target, init);
  if (SECRET_ANSWER.some((p) => p.test(rest))) res.headers.set("cache-control", "no-store");
  return res;
}
