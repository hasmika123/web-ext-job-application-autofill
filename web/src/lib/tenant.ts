/**
 * Tenant resolution for the web app (X1.4, enterprise-v2 ADR-003).
 *
 * The browser never names a tenant: the host it arrived on does. `proxy.ts` puts that host on the request as
 * `x-kiwiply-host`; this module asks the API (`GET /api/public/tenant`, X1.3) what the host is:
 *   TENANT   an ACTIVE-or-otherwise-served workspace  -> render the tenant tree
 *   PLATFORM a host of ours                            -> the normal Kiwiply app
 *   UNKNOWN  the API said 404 (or any other refusal)   -> the generic "workspace isn't available" page
 *   UNAVAILABLE the API was slow, down, 5xx or rate-limited (429) -> a "try again in a moment" page: NEVER the
 *            "doesn't exist" page, so an outage or a throttled visitor is not told their workspace is gone
 * Nothing is ever served for a host the API did not confirm. The whole thing is inert while the enterprise master flag
 * is off (then every host behaves exactly as before X1.4), including when the API can not be reached and the flag was
 * never seen on: a container hostname or preview host must not turn into a tenant 404 because the API is slow.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { apiUrl } from "@/lib/config";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { isPlatformHost, normalizeHost, TENANT_HOST_HEADER, tenantApiHeaders } from "@/lib/tenant-host";

/** Mirrors the API's PublicTenantDTO (colours `#rrggbb`; every branding field may be null). */
export interface PublicTenant {
  kind: "TENANT";
  displayName: string;
  branding?: {
    logoUrl?: string | null;
    faviconUrl?: string | null;
    bannerUrl?: string | null;
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    theme?: "LIGHT" | "DARK" | "SYSTEM" | null;
    welcomeTitle?: string | null;
    welcomeMessage?: string | null;
    supportEmail?: string | null;
    featureChips?: string[] | null;
    terminology?: Record<string, string> | null;
  } | null;
  login?: { password: boolean; google: boolean; mfaRequired: boolean; microsoft?: boolean } | null;
}

export type TenantResolution = { kind: "PLATFORM" } | { kind: "UNKNOWN" } | { kind: "UNAVAILABLE" } | { kind: "TENANT"; tenant: PublicTenant };

export type EnterpriseSwitch = "on" | "off" | "unreachable";

/** The last flag value the API actually told us (this process only). null = never heard. */
let lastKnownSwitch: "on" | "off" | null = null;

/**
 * Is the enterprise master flag on? Read from the cached public config (`enterprise`, booleans only).
 * An answer that is missing the key (older API) or an old API (404) reads "off". A network error or 5xx reads
 * "unreachable" ONLY when the last answer we ever got was "on" (fail closed: a tenant host is never silently served as the
 * platform); when the flag was never seen on it reads "off", so with enterprise dark a slow or restarting API can not turn
 * a non-platform host (a container name, a raw IP, a preview host) into the tenant 404.
 */
export async function getEnterpriseSwitch(): Promise<EnterpriseSwitch> {
  const unreachable = (): EnterpriseSwitch => (lastKnownSwitch === "on" ? "unreachable" : "off");
  try {
    const res = await fetch(apiUrl("/api/config/public"), { next: { revalidate: 300 }, signal: AbortSignal.timeout(2500) });
    if (res.status === 404) return (lastKnownSwitch = "off");
    if (!res.ok) return unreachable();
    const data = (await res.json().catch(() => null)) as { enterprise?: unknown } | null;
    if (!data) return unreachable();
    return (lastKnownSwitch = data.enterprise === true ? "on" : "off");
  } catch {
    return unreachable();
  }
}

const TTL_MS = 15_000;
const hostCache = new Map<string, { at: number; value: TenantResolution }>();
/** Test hook. */
export function clearTenantCache() {
  hostCache.clear();
  lastKnownSwitch = null;
}

/**
 * Ask the API what `host` is. Never throws; never caches a failure. `ip` is the visitor's address, forwarded so the API's
 * per-visitor-and-host limit counts the visitor rather than this server (otherwise every visitor shares one bucket).
 * 404 and other refusals are UNKNOWN; 429, 5xx, timeouts and network errors are UNAVAILABLE (retry), never "doesn't exist".
 */
export async function resolveTenantForHost(host: string, ip?: string | null): Promise<TenantResolution> {
  try {
    const res = await fetch(apiUrl("/api/public/tenant"), {
      headers: { ...tenantApiHeaders(host, ip), accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (res.status === 429 || res.status >= 500) return { kind: "UNAVAILABLE" };
    if (!res.ok) return { kind: "UNKNOWN" };
    const data = (await res.json().catch(() => null)) as { kind?: string; displayName?: string } | null;
    if (!data) return { kind: "UNKNOWN" };
    if (data.kind === "PLATFORM") return { kind: "PLATFORM" };
    if (data.kind === "TENANT" && typeof data.displayName === "string") return { kind: "TENANT", tenant: data as PublicTenant };
    return { kind: "UNKNOWN" };
  } catch {
    return { kind: "UNAVAILABLE" };
  }
}

/** Host-level decision shared by the proxy and `getTenant()` (the proxy has no React cache). */
export async function resolveHost(host: string, ip?: string | null): Promise<TenantResolution> {
  const h = normalizeHost(host);
  if (isPlatformHost(h)) return { kind: "PLATFORM" };
  const flag = await getEnterpriseSwitch();
  if (flag === "off") return { kind: "PLATFORM" };
  if (flag === "unreachable") return { kind: "UNAVAILABLE" }; // enterprise was on when last seen: serve nothing, but say "try again"
  const hit = hostCache.get(h);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await resolveTenantForHost(h, ip);
  // Only a positive answer is remembered (a few seconds): failures and 404s are re-asked, so a fixed host recovers at once.
  if (value.kind === "TENANT" || value.kind === "PLATFORM") {
    if (hostCache.size > 500) hostCache.clear();
    hostCache.set(h, { at: Date.now(), value });
  }
  return value;
}

/** The tenant for the current request, resolved once per request. */
export const getTenant = cache(async (): Promise<TenantResolution> => {
  let host = "";
  let ip: string | null = null;
  try {
    const incoming = await headers();
    host = normalizeHost(incoming.get(TENANT_HOST_HEADER));
    ip = clientIpFromHeaders(incoming);
  } catch {
    host = ""; // outside a request (build time): the platform
  }
  return resolveHost(host, ip);
});
