import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Accounts Offers page: ONE handler serves every `/api/orgs/{orgId}/offers/**` route. It validates the SHAPE of the call (numeric ids, a known
 * route, a JSON object body) and forwards to the API, which owns every rule (permission, tenant wall, the state of an offer, Idempotency-Key). There is no accept or
 * decline route: only the consultant answers an offer, in their own workspace. Anything not listed is a 404 from this layer, never an open proxy.
 */
const ID = "\\d{1,18}";
export const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^$/, body: false },
  { method: "POST", pattern: /^$/, body: true },
  { method: "GET", pattern: /^(counts|pickers)$/, body: false },
  { method: "GET", pattern: new RegExp(`^${ID}$`), body: false },
  { method: "PUT", pattern: new RegExp(`^${ID}$`), body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/withdraw$`), body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/(extend|placement)$`), body: false },
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
  const target = `/api/orgs/${orgId}/offers${rest ? `/${rest}` : ""}${url.search}`;
  const init: RequestInit = { method: request.method, headers: passedHeaders(request) };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  return forward(target, init);
}
