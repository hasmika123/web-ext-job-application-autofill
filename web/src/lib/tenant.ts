/**
 * Tenant resolution for the web app (X1.4, enterprise-v2 ADR-003).
 *
 * The browser never names a tenant: the host it arrived on does. `proxy.ts` puts that host on the request as
 * `x-kiwiply-host`; this module asks the API (`GET /api/public/tenant`, X1.3) what the host is:
 *   TENANT   an ACTIVE-or-otherwise-served workspace  -> render the tenant tree
 *   PLATFORM a host of ours                            -> the normal Kiwiply app
 *   UNKNOWN  404 / error / anything else               -> the generic "workspace isn't available" page
 * Everything fails closed to UNKNOWN for a non-platform host, and the whole thing is inert while the enterprise
 * master flag is off (then every host behaves exactly as before X1.4).
 */
import { cache } from "react";
import { headers } from "next/headers";
import { apiUrl } from "@/lib/config";
import { isPlatformHost, normalizeHost, TENANT_HOST_HEADER } from "@/lib/tenant-host";

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
    terminology?: Record<string, string> | null;
  } | null;
  login?: { password: boolean; google: boolean; mfaRequired: boolean } | null;
  status?: string | null;
}

export type TenantResolution = { kind: "PLATFORM" } | { kind: "UNKNOWN" } | { kind: "TENANT"; tenant: PublicTenant };

export type EnterpriseSwitch = "on" | "off" | "unreachable";

/**
 * Is the enterprise master flag on? Read from the cached public config (`enterprise`, booleans only).
 * An answer that is missing the key (older API) or an old API (404) reads "off"; a network error or 5xx reads
 * "unreachable" so a non-platform host fails closed (UNKNOWN) instead of silently serving the platform.
 */
export async function getEnterpriseSwitch(): Promise<EnterpriseSwitch> {
  try {
    const res = await fetch(apiUrl("/api/config/public"), { next: { revalidate: 300 }, signal: AbortSignal.timeout(2500) });
    if (res.status === 404) return "off";
    if (!res.ok) return "unreachable";
    const data = (await res.json().catch(() => null)) as { enterprise?: unknown } | null;
    if (!data) return "unreachable";
    return data.enterprise === true ? "on" : "off";
  } catch {
    return "unreachable";
  }
}

const TTL_MS = 15_000;
const hostCache = new Map<string, { at: number; value: TenantResolution }>();
/** Test hook. */
export function clearTenantCache() {
  hostCache.clear();
}

/** Ask the API what `host` is. Never throws; never caches a failure. */
export async function resolveTenantForHost(host: string): Promise<TenantResolution> {
  try {
    const res = await fetch(apiUrl("/api/public/tenant"), {
      headers: { "X-Kiwiply-Host": host, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { kind: "UNKNOWN" };
    const data = (await res.json().catch(() => null)) as { kind?: string; displayName?: string } | null;
    if (!data) return { kind: "UNKNOWN" };
    if (data.kind === "PLATFORM") return { kind: "PLATFORM" };
    if (data.kind === "TENANT" && typeof data.displayName === "string") return { kind: "TENANT", tenant: data as PublicTenant };
    return { kind: "UNKNOWN" };
  } catch {
    return { kind: "UNKNOWN" };
  }
}

/** Host-level decision shared by the proxy and `getTenant()` (the proxy has no React cache). */
export async function resolveHost(host: string): Promise<TenantResolution> {
  const h = normalizeHost(host);
  if (isPlatformHost(h)) return { kind: "PLATFORM" };
  const flag = await getEnterpriseSwitch();
  if (flag === "off") return { kind: "PLATFORM" };
  if (flag === "unreachable") return { kind: "UNKNOWN" };
  const hit = hostCache.get(h);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await resolveTenantForHost(h);
  // Only a positive answer is remembered (a few seconds): failures and 404s are re-asked, so a fixed host recovers at once.
  if (value.kind !== "UNKNOWN") {
    if (hostCache.size > 500) hostCache.clear();
    hostCache.set(h, { at: Date.now(), value });
  }
  return value;
}

/** The tenant for the current request, resolved once per request. */
export const getTenant = cache(async (): Promise<TenantResolution> => {
  let host = "";
  try {
    host = normalizeHost((await headers()).get(TENANT_HOST_HEADER));
  } catch {
    host = ""; // outside a request (build time): the platform
  }
  return resolveHost(host);
});
