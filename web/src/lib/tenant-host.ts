/**
 * Host helpers for tenant resolution (X1.4). Pure and edge-safe: used by `proxy.ts` and by `lib/tenant.ts`.
 *
 * A "platform host" is one of ours (kiwiply.com, localhost, ...): it keeps today's marketing/app/admin/org
 * behaviour. Every other host is a candidate tenant host (acme.kiwiply.com, careers.acme.com) and is only
 * ever served when the API confirms it; see `lib/tenant.ts`.
 */
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

/** The host a request was addressed to: `x-forwarded-host` (set by the edge Caddy) before `host`. */
export function requestHost(headers: { get(name: string): string | null }): string {
  return normalizeHost(headers.get("x-forwarded-host") ?? headers.get("host"));
}

const DEFAULT_PLATFORM_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Hosts that are the platform itself. Defaults: loopback, the canonical site host and its www/app/api siblings;
 * `PLATFORM_HOSTS` (comma separated) adds more (staging, preview, the container's own name). An empty host is the
 * platform too (an internal call with no Host header).
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

export function isTenantRoutePath(pathname: string): boolean {
  return pathname === TENANT_ROUTE_PREFIX || pathname.startsWith(`${TENANT_ROUTE_PREFIX}/`);
}
