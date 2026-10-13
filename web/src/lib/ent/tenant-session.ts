/**
 * The signed-in state of a visitor on a tenant host (X2.6), as the API sees it.
 *
 * !! CONTRACT STUB !! `GET /api/me/tenant` is built by X2.2 (doc 12 section 3). Until it lands this module reads only the two
 * fields the routing needs (`landing`, `org.displayName`), tolerates every status the real endpoint will answer, and treats a
 * 404 (the route does not exist yet) as `NO_CONTRACT`: signed in, destination unknown. X2.2 REPLACES the body of
 * `readMeTenant` with the typed `getMeTenant()` (full `MeTenantDTO`, ETag) and keeps the `TenantSession` union below.
 *
 * Why the page asks the API and the proxy does not: the proxy only knows that a cookie holds a tid-bound token, not that the
 * tid is THIS host's organization (the API's `TokenTenantBinding` checks that on every call and answers 401
 * `TOKEN_TENANT_MISMATCH`). A session of tenant A presented on host B therefore ends here as `UNAUTHENTICATED`.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import { safeReturnTo } from "@/lib/tenant-urls";

export type TenantSession =
  /** No cookie at all, or the API refused the token (expired, another tenant's, revoked): show the sign-in. */
  | { status: "UNAUTHENTICATED" }
  /** Signed in and the API named where this member lands (a same-host path). */
  | { status: "OK"; landing: string; orgName: string | null }
  /** Signed in, but the member's seat is paused (403 MEMBER_SUSPENDED). */
  | { status: "SUSPENDED" }
  /** Signed in as a non-member of this workspace (404 on the contract). */
  | { status: "NOT_A_MEMBER" }
  /** STUB: the API has no /api/me/tenant yet (X2.2): signed in, landing unknown. */
  | { status: "NO_CONTRACT" }
  /** The API was unreachable or erroring: do not guess. */
  | { status: "UNAVAILABLE" };

async function readMeTenant(): Promise<TenantSession> {
  if (!(await getAccessToken())) return { status: "UNAUTHENTICATED" };
  let res: Response;
  try {
    res = await serverApiFetch("/api/me/tenant", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
  } catch {
    return { status: "UNAVAILABLE" };
  }
  if (res.status === 401) return { status: "UNAUTHENTICATED" };
  if (res.status === 403) return { status: "SUSPENDED" };
  if (res.status === 404) {
    // 404 is "not a member" once the route exists and "no such route" before X2.2: the API's body tells them apart.
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    return body?.code === "NOT_A_MEMBER" ? { status: "NOT_A_MEMBER" } : { status: "NO_CONTRACT" };
  }
  if (!res.ok) return { status: "UNAVAILABLE" };
  const data = (await res.json().catch(() => null)) as { landing?: unknown; org?: { displayName?: unknown } } | null;
  if (!data) return { status: "UNAVAILABLE" };
  // The API names the landing; the web only ever follows a plain same-host path (never builds a cross-host URL, never trusts "//x").
  const landing = safeReturnTo(typeof data.landing === "string" ? data.landing : undefined);
  const orgName = typeof data.org?.displayName === "string" ? data.org.displayName : null;
  return landing ? { status: "OK", landing, orgName } : { status: "NO_CONTRACT" };
}

/** The visitor's session on this tenant host, asked once per request. */
export const getTenantSession = cache(readMeTenant);

/**
 * Where a signed-in visitor goes from `/` and `/login`: `next` when it is a safe same-host path, else the API's landing.
 * Null when there is nowhere to send them (show the page).
 */
export function destinationFor(session: TenantSession, next?: string | string[] | null): string | null {
  if (session.status !== "OK") return null;
  return safeReturnTo(next) ?? session.landing;
}

/** For tenant pages that need a member: signed out (or another tenant's token) goes to the sign-in with a return-to. */
export async function requireTenantSession(returnTo: string): Promise<Exclude<TenantSession, { status: "UNAUTHENTICATED" }>> {
  const s = await getTenantSession();
  if (s.status === "UNAUTHENTICATED") {
    const next = safeReturnTo(returnTo);
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return s;
}
