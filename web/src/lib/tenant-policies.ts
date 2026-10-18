/**
 * Server-side reads of a tenant host's policy pages (docs/enterprise-v2/62): `GET /api/public/tenant/policies[/{kind}]`. The tenant is the one
 * the forwarded host resolved to; the browser never names an organization. A kind the host does not offer, an unknown host and enterprise
 * being off are all NOT_FOUND (the generic tenant 404); a slow or throttled API is UNAVAILABLE (try again), never "doesn't exist".
 */
import { cache } from "react";
import { headers } from "next/headers";
import { apiUrl } from "@/lib/config";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { DEFAULT_LINKS } from "@/components/ent/policy/PolicyLinks";
import { normalizeHost, TENANT_HOST_HEADER, tenantApiHeaders } from "@/lib/tenant-host";

export interface PublicPolicy {
  kind: string;
  title: string;
  body: string;
  /** PUBLISHED = the organization's approved text; TEMPLATE = the neutral text shown until it publishes one. */
  source: "PUBLISHED" | "TEMPLATE";
  version?: number | null;
  publishedAt?: string | null;
  orgName: string;
  supportEmail?: string | null;
}

export interface PolicyLink {
  kind: string;
  title: string;
  path: string;
}

/** What the footers show when the index cannot be read: the four default kinds (the default of `enterprise.policies.kinds`). */
export const DEFAULT_POLICY_LINKS: readonly PolicyLink[] = DEFAULT_LINKS;

export type PolicyResult = { kind: "OK"; policy: PublicPolicy } | { kind: "NOT_FOUND" } | { kind: "UNAVAILABLE" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parsePolicy(json: unknown): PublicPolicy | null {
  if (!isObj(json)) return null;
  if (typeof json.kind !== "string" || typeof json.title !== "string" || typeof json.body !== "string" || typeof json.orgName !== "string") return null;
  return {
    kind: json.kind,
    title: json.title,
    body: json.body,
    source: json.source === "PUBLISHED" ? "PUBLISHED" : "TEMPLATE",
    version: typeof json.version === "number" ? json.version : null,
    publishedAt: typeof json.publishedAt === "string" ? json.publishedAt : null,
    orgName: json.orgName,
    supportEmail: typeof json.supportEmail === "string" ? json.supportEmail : null,
  };
}

export function parseLinks(json: unknown): PolicyLink[] | null {
  if (!Array.isArray(json)) return null;
  const out: PolicyLink[] = [];
  for (const x of json) {
    if (!isObj(x) || typeof x.kind !== "string" || typeof x.title !== "string" || typeof x.path !== "string") return null;
    if (!x.path.startsWith("/") || x.path.startsWith("//")) return null; // only same-host paths: a link list can never leave the tenant host
    out.push({ kind: x.kind, title: x.title, path: x.path });
  }
  return out;
}

async function requestContext(): Promise<{ host: string; ip: string | null }> {
  try {
    const incoming = await headers();
    return { host: normalizeHost(incoming.get(TENANT_HOST_HEADER)), ip: clientIpFromHeaders(incoming) };
  } catch {
    return { host: "", ip: null };
  }
}

async function get(path: string): Promise<Response | null> {
  const { host, ip } = await requestContext();
  if (!host) return null;
  try {
    return await fetch(apiUrl(path), { headers: { ...tenantApiHeaders(host, ip), accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(2500) });
  } catch {
    return null;
  }
}

/** One policy of the current tenant host (the slug is a kind: `privacy`, `acceptable-use`, `PRIVACY` ...). */
export const getTenantPolicy = cache(async (kind: string): Promise<PolicyResult> => {
  const res = await get(`/api/public/tenant/policies/${encodeURIComponent(kind)}`);
  if (!res) return { kind: "UNAVAILABLE" };
  if (res.status === 429 || res.status >= 500) return { kind: "UNAVAILABLE" };
  if (!res.ok) return { kind: "NOT_FOUND" };
  const policy = parsePolicy(await res.json().catch(() => null));
  return policy ? { kind: "OK", policy } : { kind: "UNAVAILABLE" };
});

/** The policy pages this host offers, for footers; the four defaults when the index cannot be read. Never throws. */
export const getTenantPolicyLinks = cache(async (): Promise<PolicyLink[]> => {
  const res = await get("/api/public/tenant/policies");
  if (!res || !res.ok) return [...DEFAULT_POLICY_LINKS];
  return parseLinks(await res.json().catch(() => null)) ?? [...DEFAULT_POLICY_LINKS];
});
