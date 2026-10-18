/**
 * The tenant session on the web, server part (X2.2): the per-request `getTenantSession()` and the redirects built on it. The pure
 * contract (types, parse, fetch, accessChanged) lives in `tenant-session-core.ts` so client components can import it; everything
 * is re-exported here so existing imports keep working.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { TENANT_HOST_HEADER } from "@/lib/tenant-host";
import { safeReturnTo } from "@/lib/tenant-urls";
import { fetchTenantSession, type TenantSession } from "@/lib/ent/tenant-session-core";
import { createSharedCalls } from "@/lib/ent/share-calls";

export * from "@/lib/ent/tenant-session-core";

/**
 * One session call for the burst of renders a single page view causes (the page, and every menu link's prefetch): same host + same token =
 * one `GET /api/me/tenant`. Only a good answer is kept (2 s); a failure is always asked afresh. See `share-calls.ts`.
 */
const sessionCalls = createSharedCalls<TenantSession>({ ttlMs: 2000, isShareable: (s) => s.kind === "OK" });

/** Test hook. */
export function clearSharedTenantSessions() {
  sessionCalls.clear();
}

/** The tenant session for the current request (server components and route handlers), resolved once per request. */
export const getTenantSession = cache(async (): Promise<TenantSession> => {
  const call = async (): Promise<TenantSession> => {
    const r = await fetchTenantSession((path, init) => serverApiFetch(path, init));
    return r.kind === "NOT_MODIFIED" ? { kind: "UNAVAILABLE" } : r; // a 304 can only follow our own If-None-Match: never here
  };
  const key = await sessionKey();
  return key ? sessionCalls.share(key, call) : call(); // no token (signed out) or no request: nothing to share
});

/** host + bearer token: everything that decides the answer. Null when there is no token or no request (then the call is made directly). */
async function sessionKey(): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const host = (await headers()).get(TENANT_HOST_HEADER);
    return token && host ? `${host}|${token}` : null;
  } catch {
    return null; // not inside a request
  }
}

/**
 * Where a signed-in visitor goes from `/` and `/login` (X2.6): `next` when it is a safe same-host path, else the API's landing
 * workspace home (only ever a plain same-host path). Null when there is nowhere to send them (show the page).
 */
export function destinationFor(session: TenantSession, next?: string | string[] | null): string | null {
  if (session.kind !== "OK") return null;
  return safeReturnTo(next) ?? safeReturnTo(session.me.landing ?? undefined) ?? null;
}

/** For tenant pages that need a member: signed out (or another tenant's token) goes to the sign-in with a return-to. */
export async function requireTenantSession(returnTo: string): Promise<Exclude<TenantSession, { kind: "UNAUTHENTICATED" }>> {
  const s = await getTenantSession();
  if (s.kind === "UNAUTHENTICATED") {
    const next = safeReturnTo(returnTo);
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return s as Exclude<TenantSession, { kind: "UNAUTHENTICATED" }>;
}
