import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Marketing Assignments page: ONE handler file serves every `/api/orgs/{orgId}/marketing-assignments/**` route. It
 * validates the SHAPE of the call (numeric ids, a known route, a JSON object body) and forwards to the API, which owns every rule
 * (permission, tenant wall, scope, capacity, Idempotency-Key). The API answers the same generic 404 for a person outside the caller's
 * reach, a foreign organization and a missing id, so nothing here can leak which it was.
 *
 * Only the routes below are forwarded; anything else is a 404 from this layer, never an open proxy.
 */
const ID = "\\d{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^(marketers|marketers\/candidates|consultants|filters|kpis|workload)$/, body: false },
  { method: "POST", pattern: /^marketers$/, body: true },
  { method: "PATCH", pattern: new RegExp(`^marketers/${ID}$`), body: true },
  { method: "POST", pattern: /^(assign|update|unassign|restore)$/, body: true },
];

export const orgOk = (orgId: string): boolean => /^\d{1,18}$/.test(orgId);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** The only header the API reads on these routes; nothing else of the browser's request is passed on. */
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
  const target = `/api/orgs/${orgId}/marketing-assignments/${rest}${url.search}`;
  const init: RequestInit = { method: request.method, headers: passedHeaders(request) };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  return forward(target, init);
}
