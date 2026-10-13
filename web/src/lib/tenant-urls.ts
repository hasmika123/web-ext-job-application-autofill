/**
 * Tenant-aware URL helpers for the web app (X2.10, mirrors the API's `TenantUrls`; threat model T12/T28).
 *
 * Rules, shared by the proxy, the login page and every redirect on a tenant host:
 *   - the web never builds a link to ANOTHER host. Cross-host links (join / verify / reset mails, a landing on a custom domain)
 *     come from the API, which builds them from the organization's hostname rows only. What the web builds is same-host:
 *     a path on the host the visitor is already on;
 *   - a return-to (`?next=`) is accepted only as a plain same-host path, so it can neither open-redirect (`//evil.com`,
 *     `/\evil.com`, `https://evil.com`, `/%2F/evil.com`, whitespace tricks) nor carry the visitor into another tenant's tree
 *     (`/_t/...`) or the BFF (`/api/...`);
 *   - a base URL is `https://host` (`http://` only for `localhost` / `*.localhost`), built from a host that was RESOLVED for
 *     this request, never from a header the browser chose.
 * Pure and edge-safe (used by `proxy.ts`).
 */
import { TENANT_ROUTE_PREFIX } from "@/lib/tenant-host";

const MAX_LENGTH = 2048;
/** Paths that are never a sensible place to return to (they would loop, or are not pages). */
const NEVER_RETURN = ["/login", "/forgot-password", "/logout"];

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000- \u007f\\]/;

function hasUnsafe(s: string): boolean {
  return UNSAFE_CHARS.test(s);
}

/**
 * `raw` as a same-host path (`/w/admin?tab=1`), or null when it is anything else. The hash is dropped. A value the browser could
 * read differently from us (control characters, backslashes, spaces, a second leading slash, a scheme, a double-encoded slash)
 * is refused whole rather than repaired.
 */
export function safeReturnTo(raw: string | string[] | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (raw[0] !== "/" || raw.startsWith("//")) return null;
  if (hasUnsafe(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.split("?")[0]); // the path only: a query value may legitimately decode to a space
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || hasUnsafe(decoded) || decoded.includes("://")) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://same-host.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://same-host.invalid" || url.pathname.startsWith("//")) return null;
  const path = url.pathname;
  if (path === TENANT_ROUTE_PREFIX || path.startsWith(`${TENANT_ROUTE_PREFIX}/`)) return null;
  if (path === "/api" || path.startsWith("/api/")) return null;
  if (NEVER_RETURN.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return path + url.search;
}

/** `/login?next=<path>` for a visitor who asked for `pathname` + `search` signed out; plain `/login` for the root or an unsafe path. */
export function loginRedirectPath(pathname: string, search = ""): string {
  const next = pathname === "/" ? null : safeReturnTo(pathname + search);
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

/** The `https://host` (`http://` for loopback names) origin of a resolved tenant host; empty string for a host that is not a plain hostname. */
export function tenantOrigin(host: string): string {
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h) || h.length > 253) return "";
  const dev = h === "localhost" || h.endsWith(".localhost");
  return `${dev ? "http" : "https"}://${h}`;
}

/** An absolute URL for a same-host path on a resolved tenant host ("" when either is unusable). */
export function tenantUrl(host: string, path: string): string {
  const origin = tenantOrigin(host);
  const safe = safeReturnTo(path);
  return origin && safe ? origin + safe : "";
}
