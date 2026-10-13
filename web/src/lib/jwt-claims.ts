/**
 * Unverified JWT claim reading for the proxy (edge-safe, no `next/headers`).
 *
 * The web app never VERIFIES a token: the API does, on every call. These helpers only decide cheap routing questions
 * ("is it about to expire?", "does it carry a tenant binding at all?") and must never be used to grant anything.
 */

export function jwtClaims(jwt: string | undefined): Record<string, unknown> | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as unknown;
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True if the JWT is missing or its `exp` is within 30s of now (treat as expired). */
export function isExpired(jwt: string | undefined): boolean {
  const claims = jwtClaims(jwt);
  if (!claims) return true; // missing or unparseable token: force a refresh attempt
  const exp = claims.exp;
  if (typeof exp !== "number") return true;
  return Date.now() >= (exp - 30) * 1000;
}

/** Does the token carry a tenant binding (`tid`, X1.5)? Says nothing about WHICH tenant: the API checks that against the host. */
export function hasTenantClaim(jwt: string | undefined): boolean {
  const tid = jwtClaims(jwt)?.tid;
  return (typeof tid === "number" && Number.isFinite(tid)) || (typeof tid === "string" && tid.length > 0);
}
