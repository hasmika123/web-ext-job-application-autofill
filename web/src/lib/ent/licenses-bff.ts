import { badBody, forward, readObject } from "@/lib/admin-proxy";
import { notFound, orgOk } from "@/lib/ent/members-bff";

/**
 * The BFF half of the Consultant Licenses page: ONE handler serves every `/api/orgs/{orgId}/licenses/**` route. It checks the SHAPE of the call
 * (numeric ids, a known route, a JSON object body) and forwards to the API, which owns every rule (licenses.view / licenses.manage, the tenant wall,
 * one live licence per consultant). Anything not listed is a 404 from this layer, never an open proxy.
 */
const ID = "\\d{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^$/, body: false },
  { method: "GET", pattern: /^catalog$/, body: false },
  { method: "GET", pattern: new RegExp(`^${ID}$`), body: false },
  { method: "POST", pattern: new RegExp(`^${ID}$`), body: true },
  { method: "PUT", pattern: new RegExp(`^${ID}/features$`), body: true },
  { method: "POST", pattern: new RegExp(`^${ID}/(suspend|reactivate|end)$`), body: true },
];

export async function handle(request: Request, ctx: { params: Promise<{ orgId: string; path?: string[] }> }): Promise<Response> {
  const { orgId, path } = await ctx.params;
  if (!orgOk(orgId)) return notFound();
  const rest = (path ?? []).join("/");
  const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(rest));
  if (!route) return notFound();
  const target = `/api/orgs/${orgId}/licenses${rest ? `/${rest}` : ""}`;
  const init: RequestInit = { method: request.method };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  return forward(target, init);
}
