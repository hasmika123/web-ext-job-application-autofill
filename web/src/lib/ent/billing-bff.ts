import { forward } from "@/lib/admin-proxy";
import { notFound, orgOk } from "@/lib/ent/members-bff";

/**
 * The BFF half of the billing pages (docs/enterprise-v2/ORG-BILLING-BUILD.md steps 1a and 2): `/api/orgs/{orgId}/billing/**` and
 * `/api/orgs/{orgId}/usage/**`: reads, plus POST `billing/portal` (no body) for the Stripe billing portal. It checks the SHAPE of the call (numeric ids, a known route, only the known query parameters with plain values) and forwards to the API,
 * which owns every rule (the billing module, billing.view / usage.view, the tenant wall). Anything else is a 404 from this layer, never an open proxy.
 */
const ID = "\\d{1,18}";

const BILLING: { pattern: RegExp; params: string[]; method?: "POST" }[] = [
  { pattern: /^$/, params: [] },
  { pattern: /^portal$/, params: [], method: "POST" },
  { pattern: /^overview$/, params: [] },
  { pattern: /^invoices$/, params: ["status", "page"] },
  { pattern: new RegExp(`^invoices/${ID}$`), params: [] },
];

const USAGE: { pattern: RegExp; params: string[] }[] = [
  { pattern: /^$/, params: ["period"] },
  { pattern: /^history$/, params: ["months"] },
];

const PLAIN = /^[A-Za-z0-9_-]{1,20}$/;

/** Only the route's own parameters, each a short plain word or number; anything else is dropped. */
export function cleanQuery(search: string, allowed: string[]): string {
  const src = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of allowed) {
    const v = src.get(k);
    if (v != null && PLAIN.test(v)) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

function handler(prefix: "billing" | "usage", routes: { pattern: RegExp; params: string[]; method?: "POST" }[]) {
  return async (request: Request, ctx: { params: Promise<{ orgId: string; path?: string[] }> }): Promise<Response> => {
    const { orgId, path } = await ctx.params;
    if (!orgOk(orgId)) return notFound();
    const rest = (path ?? []).join("/");
    const route = routes.find((r) => r.pattern.test(rest) && (r.method ?? "GET") === request.method);
    if (!route) return notFound();
    if (route.method === "POST") return forward(`/api/orgs/${orgId}/${prefix}/${rest}`, { method: "POST" });
    const query = cleanQuery(new URL(request.url).search, route.params);
    return forward(`/api/orgs/${orgId}/${prefix}${rest ? `/${rest}` : ""}${query}`, { method: "GET" });
  };
}

export const handleBilling = handler("billing", BILLING);
export const handleUsage = handler("usage", USAGE);
