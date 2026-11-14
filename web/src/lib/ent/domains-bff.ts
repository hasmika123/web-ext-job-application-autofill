import { badBody, forward, readObject } from "@/lib/admin-proxy";
import { notFound, orgOk } from "@/lib/ent/members-bff";

/**
 * The BFF half of the Domains page (CUSTOM-DOMAINS-BUILD.md, A4): one handler for `/api/orgs/{orgId}/hostnames/**`. It checks the SHAPE (numeric ids, a
 * known route, a JSON object body where one is expected) and forwards; the API owns every rule. Anything not listed is a 404 from this layer.
 */
const ID = "\\d{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^$/, body: false },
  { method: "POST", pattern: /^$/, body: true },
  { method: "GET", pattern: new RegExp(`^${ID}/instructions$`), body: false },
  { method: "POST", pattern: new RegExp(`^${ID}/(verify|activate|resume)$`), body: false },
  { method: "POST", pattern: new RegExp(`^${ID}/(suspend|remove)$`), body: true },
];

export async function handle(request: Request, ctx: { params: Promise<{ orgId: string; path?: string[] }> }): Promise<Response> {
  const { orgId, path } = await ctx.params;
  if (!orgOk(orgId)) return notFound();
  const rest = (path ?? []).join("/");
  const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(rest));
  if (!route) return notFound();
  const init: RequestInit = { method: request.method };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  return forward(`/api/orgs/${orgId}/hostnames${rest ? `/${rest}` : ""}`, init);
}
