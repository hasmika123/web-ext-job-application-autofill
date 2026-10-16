import { badBody, forward, readObject } from "@/lib/admin-proxy";
import { notFound, orgOk } from "@/lib/ent/members-bff";

/**
 * The BFF half of the Consultants page: ONE handler file serves every `/api/orgs/{orgId}/consultants/**` route. It validates the SHAPE of the call
 * (numeric ids, a known route, a JSON object body) and forwards to the API, which owns every rule (permission, tenant wall, scope, If-Match,
 * Idempotency-Key). The API answers the same generic 404 for a consultant outside the caller's reach, a foreign organization and a missing id.
 *
 * Only the routes below are forwarded; anything else is a 404 from this layer, never an open proxy.
 */
const ID = "\\d{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^$/, body: false },
  { method: "GET", pattern: /^(counts|filters|linkable-members)$/, body: false },
  { method: "GET", pattern: new RegExp(`^${ID}$`), body: false },
  { method: "GET", pattern: new RegExp(`^${ID}/(assignments|applications|activity|job-options)$`), body: false },
  { method: "POST", pattern: /^$/, body: true },
  { method: "PATCH", pattern: new RegExp(`^${ID}$`), body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/(marketer|deactivate|reactivate|applications|member)$`), body: true },
  { method: "POST", pattern: /^bulk\/(availability|marketer|status)$/, body: true },
];

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
  const target = `/api/orgs/${orgId}/consultants${rest ? `/${rest}` : ""}${url.search}`;
  const init: RequestInit = { method: request.method, headers: passedHeaders(request) };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  return forward(target, init);
}
