/**
 * Plumbing for the organization BFF routes (APP-E2E O2.2 / O6.2 / O2.3 / O5.1 / O13.1): `/api/join/**`,
 * `/api/me/orgs/**`, `/api/orgs/[orgId]/members/**`, `/api/orgs/[orgId]/logo|admins`. Thin proxies over `forward()`:
 * they relay Spring's status and problem JSON (`code`s such as `ALREADY_MEMBER`, `INVITE_EXPIRED`, `SEAT_STATE`,
 * `ORG_LIMIT_REACHED`, `SHARE_SCOPE`), map a demo write refusal, and add the visitor's address as `X-Forwarded-For` on the
 * public join lookups so Spring can rate limit the person, not the web server. Nothing here decides what is valid; Spring
 * does, and answers one generic 404 for anything that is not the caller's.
 */
import { forward } from "@/lib/tracker-proxy";

export { badId, forward, forwardJson, search } from "@/lib/tracker-proxy";

/** A numeric path id (org, member). */
export const NUM = /^\d+$/;

/** An invite token: 32 letters and digits. Anything else cannot be one, so it never reaches Spring. */
export const TOKEN = /^[A-Za-z0-9]{32}$/;

/** A join code: 6 to 8 Crockford characters, as typed (case and look-alikes are folded by Spring). */
export const CODE = /^[0-9A-Za-z-]{6,10}$/;

export function badInput(what: string): Response {
  return Response.json({ error: `Invalid ${what}.` }, { status: 400 });
}

/** The visitor's address as the edge saw it, or null when there is none to forward. */
export function visitorIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return null;
  return xff.split(",")[0]?.trim() || null;
}

/** `forward()` for the public join lookups, carrying the visitor's address and user agent. */
export function forwardAsVisitor(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const ip = visitorIp(request);
  if (ip) headers.set("x-forwarded-for", ip);
  const ua = request.headers.get("user-agent");
  if (ua) headers.set("user-agent", ua);
  return forward(path, { ...init, headers });
}
