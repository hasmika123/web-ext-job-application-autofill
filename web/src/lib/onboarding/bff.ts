/**
 * Shared bits of the onboarding BFF routes (`/api/profile/onboarding/**`, Onboarding v2 R1.9, DESIGN 9): the rate
 * limits. The routes themselves are thin proxies in the `profile/items` pattern (`forward` in
 * `resume-doc-proxy.ts`): cookie auth, Spring's refusals relayed verbatim with their JSON `code`.
 */
import { rateLimit } from "@/lib/rate-limit";

/**
 * The BFF's limits (DESIGN 9): draft saves 60 a minute, everything else 20. Spring's `onboarding.rate.draftPerMin`
 * setting (10..600, default 60) is not on the builder config yet, so the declared defaults are mirrored here.
 */
export const DRAFT_PER_MIN = 60; // config-literal-ok: mirrors the API default of onboarding.rate.draftPerMin
export const OTHER_PER_MIN = 20; // config-literal-ok: DESIGN 9 "others 20/min"
const WINDOW_MS = 60_000; // config-literal-ok: one minute

/** A 429 (with `retry-after` and a `code` the client branches on) when this client is over the limit, else null. */
export function limited(request: Request, bucket: "onboarding-draft" | "onboarding", limit: number): Response | null {
  const r = rateLimit(request, bucket, limit, WINDOW_MS);
  if (r.ok) return null;
  return Response.json(
    { error: "Too many saves - give it a moment.", code: "RATE_LIMITED" },
    { status: 429, headers: { "retry-after": String(r.retryAfter), "cache-control": "no-store" } },
  );
}
