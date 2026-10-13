import { apiUrl } from "@/lib/config";
import { authHostHeaders } from "@/lib/auth-host";
import { NO_TENANT_DEMO, parseTenantDemo } from "@/lib/ent/demo";

/**
 * GET /api/ent/demo (X1.12) - the demo members of the tenant on THIS host, for the sign-in's "Demo accounts" tab.
 *
 * A platform host (or no host) answers "off" without calling the API: this tab never exists outside a tenant. On a tenant host
 * the API answers (`GET /api/public/tenant/demo`, which is empty unless DEMO_ENABLED and ENT_DEMO_SEED are on); anything odd
 * (API down, an older API, a body that is not the contract) reads "off". Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = await authHostHeaders();
  if (!headers["X-Kiwiply-Host"]) return Response.json(NO_TENANT_DEMO, { headers: { "cache-control": "no-store" } });
  try {
    const res = await fetch(apiUrl("/api/public/tenant/demo"), { headers: { accept: "application/json", ...headers }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return Response.json(NO_TENANT_DEMO, { headers: { "cache-control": "no-store" } });
    return Response.json(parseTenantDemo(await res.json().catch(() => null)), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(NO_TENANT_DEMO, { headers: { "cache-control": "no-store" } });
  }
}
