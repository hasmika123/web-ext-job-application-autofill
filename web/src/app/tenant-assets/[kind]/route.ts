import { apiUrl } from "@/lib/config";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { isPlatformHost, normalizeHost, TENANT_HOST_HEADER, tenantApiHeaders } from "@/lib/tenant-host";

/**
 * GET/HEAD /tenant-assets/{logo|favicon|banner}?v={config_version} (X2.13).
 *
 * A same-origin proxy for the API's host-scoped public asset route, so the browser never calls the API host. The tenant
 * is the host this request arrived on (`x-kiwiply-host`, always overwritten by `proxy.ts`): there is no parameter that
 * names an organization, and `v` is only a cache-buster (it is never forwarded). Cache headers and the ETag of the API
 * are passed through unchanged; `If-None-Match` is forwarded so a revalidation is a cheap 304. A platform host, an
 * unknown kind or any API refusal is the same bare 404 (never a hint about whether the workspace exists).
 */
const KINDS = new Set(["logo", "favicon", "banner"]);

async function handle(request: Request, ctx: { params: Promise<{ kind: string }> }, method: "GET" | "HEAD") {
  const { kind } = await ctx.params;
  const host = normalizeHost(request.headers.get(TENANT_HOST_HEADER));
  if (!KINDS.has(kind) || !host || isPlatformHost(host)) return notFound();

  const headers: Record<string, string> = { ...tenantApiHeaders(host, clientIpFromHeaders(request.headers)) };
  const inm = request.headers.get("if-none-match");
  if (inm) headers["If-None-Match"] = inm;
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/public/tenant/assets/${kind}`), { method, headers, cache: "no-store", signal: AbortSignal.timeout(4000) });
  } catch {
    return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
  }
  if (res.status === 429) return new Response(null, { status: 429, headers: { "retry-after": res.headers.get("retry-after") ?? "60" } });
  if (res.status !== 200 && res.status !== 304) return notFound();

  const out = new Headers();
  for (const name of ["content-type", "cache-control", "etag", "vary", "x-content-type-options", "content-security-policy"]) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  out.set("x-content-type-options", "nosniff");
  return new Response(res.status === 304 || method === "HEAD" ? null : res.body, { status: res.status, headers: out });
}

function notFound() {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

export const GET = (request: Request, ctx: { params: Promise<{ kind: string }> }) => handle(request, ctx, "GET");
export const HEAD = (request: Request, ctx: { params: Promise<{ kind: string }> }) => handle(request, ctx, "HEAD");
