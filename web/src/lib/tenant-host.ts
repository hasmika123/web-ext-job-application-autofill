/**
 * Host helpers for tenant resolution (X1.4). Pure and edge-safe: used by `proxy.ts` and by `lib/tenant.ts`.
 *
 * A "platform host" is one of ours (kiwiply.com, localhost, ...): it keeps today's marketing/app/admin/org
 * behaviour. Every other host is a candidate tenant host (acme.kiwiply.com, careers.acme.com) and is only
 * ever served when the API confirms it; see `lib/tenant.ts`.
 */
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";

/** The header the proxy sets on the request (never trusted from the browser: the proxy always overwrites it). */
export const TENANT_HOST_HEADER = "x-kiwiply-host";

/** The internal route-group prefix tenant pages live under; the proxy rewrites tenant-host paths to it. */
export const TENANT_ROUTE_PREFIX = "/_t";

/** Lower-case, first value of a comma list, no port, no trailing dot. Empty string when nothing usable. */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  let host = raw.split(",")[0].trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(0, end + 1) : "";
  }
  const colon = host.indexOf(":");
  if (colon >= 0) host = host.slice(0, colon);
  return host.replace(/\.+$/, "");
}

/**
 * Is `x-forwarded-host` believed? `TRUST_PROXY_HOST` (default "true"): production runs behind the shared edge Caddy, which
 * always sets `X-Forwarded-Host` to the host the visitor typed (and overwrites anything the visitor sent). Set it to
 * "false" when the web container is reachable directly with no such proxy (a bare `next start` on a public port): then a
 * visitor could send `X-Forwarded-Host: acme.kiwiply.com` and only the plain `Host` header is used.
 */
export function trustProxyHost(env: string | undefined = process.env.TRUST_PROXY_HOST): boolean {
  return !/^(false|0|no|off)$/i.test((env ?? "true").trim());
}

/** The host a request was addressed to: `x-forwarded-host` (set by the edge Caddy, when trusted) before `host`. */
export function requestHost(headers: { get(name: string): string | null }, trustProxy: boolean = trustProxyHost()): string {
  return normalizeHost((trustProxy ? headers.get("x-forwarded-host") : null) ?? headers.get("host"));
}

/**
 * Headers that make a web-server to API call tenant-aware (X1.3 hardening). The API only believes `X-Kiwiply-Host` together
 * with the shared secret `X-Kiwiply-Host-Secret` (`DOSSIER_TENANT_HOST_SECRET`, the same value as the API's), so a stranger
 * calling the API directly can not name a tenant. The visitor's address travels as `X-Forwarded-For` (just the one hop we
 * trust) so the API's per-visitor rate limits and miss bounds see the visitor, not this server. A blank host sends nothing.
 */
export function tenantApiHeaders(host: string, ip?: string | null, secret: string | undefined = process.env.DOSSIER_TENANT_HOST_SECRET): Record<string, string> {
  if (!host) return {};
  const out: Record<string, string> = { "X-Kiwiply-Host": host };
  if (secret && secret.trim()) out["X-Kiwiply-Host-Secret"] = secret.trim();
  if (ip && ip !== "unknown") out["X-Forwarded-For"] = ip;
  return out;
}

const DEFAULT_PLATFORM_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Hosts that are the platform itself. Defaults: loopback, the canonical site host and its www/app/api siblings;
 * `PLATFORM_HOSTS` (comma separated) adds more (staging, preview, the container's own name). An empty host is the
 * platform too (an internal call with no Host header).
 *
 * This is a FAST PATH only (a platform host never costs an API call). The API's `enterprise.hosts.platform` setting
 * (admin, default kiwiply.com + www/app/api) is the single source of truth for what is platform, and a host this list
 * does not know is simply asked about: keep `PLATFORM_HOSTS` (staging, preview, the container's own name) in step with it.
 */
export function platformHosts(env: string | undefined = process.env.PLATFORM_HOSTS): Set<string> {
  const site = normalizeHost(new URL(SITE_URL).host);
  const hosts = new Set<string>([...DEFAULT_PLATFORM_HOSTS, site, `www.${site}`, `app.${site}`, `api.${site}`]);
  for (const h of (env ?? "").split(",")) {
    const n = normalizeHost(h);
    if (n) hosts.add(n);
  }
  return hosts;
}

export function isPlatformHost(host: string, env?: string): boolean {
  return host === "" || platformHosts(env ?? process.env.PLATFORM_HOSTS).has(host);
}

/** Paths a tenant host must NOT have rewritten: the BFF, Next internals, tenant assets and plain static files. */
export function isRewriteExempt(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/tenant-assets/")) return true;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return /\.[a-z0-9]{1,8}$/i.test(last);
}

/** The header the proxy sets on every request it handles: `tenant` or `platform`. The root layout reads it to decide whether Kiwiply's own chrome (cookie consent, bug report) mounts. Always overwritten. */
export const SURFACE_HEADER = "x-kiwiply-surface";

/**
 * The organization's policy pages (docs/enterprise-v2/62): public on a tenant host so a legal link never needs a sign-in and never
 * leaves the host. The platform's own /privacy and /terms are served on platform hosts only.
 */
export const TENANT_POLICY_PATHS = ["/privacy", "/terms", "/acceptable-use", "/support", "/policies"] as const;

const TENANT_PUBLIC_PATHS: readonly string[] = ["/login", "/forgot-password", "/reset-password", "/account/activate", "/join", ...TENANT_POLICY_PATHS];

/**
 * Tenant paths a signed-out visitor may open (X2.6): the sign-in and its helpers. Everything else on a tenant host is login-first.
 * `/join/...` (the invite pages, X2.6 wrappers) are listed now so they work signed out when they land.
 */
export function isTenantPublicPath(pathname: string): boolean {
  return TENANT_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isTenantRoutePath(pathname: string): boolean {
  return pathname === TENANT_ROUTE_PREFIX || pathname.startsWith(`${TENANT_ROUTE_PREFIX}/`);
}

/**
 * The `X-Kiwiply-Host` header an auth BFF call must carry so the API can bind the session to the tenant (X1.5).
 * `proxy.ts` does not run on `/api/auth/*`, so the browser's `x-kiwiply-host` is NEVER trusted here: the host is
 * recomputed from the raw request (`x-forwarded-host` / `host`). A platform host (or none) sends nothing, so
 * today's sign-in is byte-for-byte unchanged and an unlisted staging host can not turn into a 404.
 */
export function authHostHeader(headers: { get(name: string): string | null }): Record<string, string> {
  const host = requestHost(headers);
  return host && !isPlatformHost(host) ? tenantApiHeaders(host, clientIpFromHeaders(headers)) : {};
}
