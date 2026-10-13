/**
 * The tenant session on the web (X2.2): `GET /api/me/tenant` (12-identity.md section 3) for the signed-in member of the
 * organization on this host.
 *
 * `fetchTenantSession` is the pure part (takes the fetcher, so it is testable without Next); `getTenantSession()` is the
 * per-request server helper (`cache()`, the tenant host headers and the bearer token come from `serverApiFetch`).
 *
 * FAILS CLOSED. The only way to get `{ kind: "OK" }` is a 200 whose body has the shape of the contract. Every other outcome is a
 * named refusal and carries no organization data:
 *   UNAUTHENTICATED  401 (no session on this host, a personal token, a token for another tenant): the page sends the visitor to /login
 *   SUSPENDED        403 MEMBER_SUSPENDED: the "Your access is paused" panel with sign-out
 *   NOT_A_MEMBER     404 and any other refusal: the "not a member" panel (the API answers the same 404 for every cause)
 *   UNAVAILABLE      5xx, 429, a timeout, a network error or a body that is not the contract: "try again", never a default menu
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/tenant-urls";
import { MODULE_KEYS, type MeTenant } from "@/lib/ent/workspaces";

export type TenantSession =
  | { kind: "OK"; me: MeTenant; etag: string | null }
  | { kind: "UNAUTHENTICATED" }
  | { kind: "SUSPENDED" }
  | { kind: "NOT_A_MEMBER" }
  | { kind: "UNAVAILABLE" };

export type SessionFetcher = (path: string, init?: RequestInit) => Promise<Response>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates the parts of the body the shell relies on. Returns null for anything that is not the contract (never a partial object). */
export function parseMeTenant(data: unknown): MeTenant | null {
  if (!isObj(data)) return null;
  const { org, member, person, roles, permissions, modules, workspaces, consent, features } = data;
  if (!isObj(org) || typeof org.id !== "number" || typeof org.displayName !== "string") return null;
  if (!isObj(member) || typeof member.status !== "string") return null;
  if (!isObj(person) || typeof person.name !== "string") return null;
  if (!Array.isArray(roles) || !isObj(permissions) || !isObj(modules) || !Array.isArray(workspaces)) return null;
  if (!isObj(consent) || !isObj(features) || !Array.isArray(features.licensed)) return null;
  for (const k of MODULE_KEYS) if (typeof modules[k] !== "boolean") return null;
  for (const w of workspaces) {
    if (!isObj(w) || typeof w.key !== "string" || typeof w.home !== "string" || !Array.isArray(w.nav) || !Array.isArray(w.bottomTabs)) return null;
    if (!w.home.startsWith("/w/")) return null;
    for (const n of w.nav) if (!isObj(n) || typeof n.key !== "string" || typeof n.href !== "string" || !n.href.startsWith("/w/")) return null;
  }
  const landing = typeof data.landing === "string" ? data.landing : null;
  if (landing !== null && !landing.startsWith("/w/")) return null;
  return { ...(data as unknown as MeTenant), landing, landingKey: typeof data.landingKey === "string" ? data.landingKey : null };
}

/** One call, one classified answer. Never throws. `etag` is the validator for the focus re-check (`revalidateTenantSession`). */
export async function fetchTenantSession(fetcher: SessionFetcher, init: RequestInit = {}): Promise<TenantSession | { kind: "NOT_MODIFIED" }> {
  try {
    const res = await fetcher("/api/me/tenant", { ...init, headers: { accept: "application/json", ...(init.headers as Record<string, string> | undefined) }, signal: init.signal ?? AbortSignal.timeout(4000) });
    if (res.status === 304) return { kind: "NOT_MODIFIED" };
    if (res.status === 401) return { kind: "UNAUTHENTICATED" };
    if (res.status === 429 || res.status >= 500) return { kind: "UNAVAILABLE" };
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      return body?.code === "MEMBER_SUSPENDED" ? { kind: "SUSPENDED" } : { kind: "NOT_A_MEMBER" };
    }
    if (!res.ok) return { kind: "NOT_A_MEMBER" };
    const me = parseMeTenant(await res.json().catch(() => null));
    return me ? { kind: "OK", me, etag: res.headers.get("etag") } : { kind: "UNAVAILABLE" };
  } catch {
    return { kind: "UNAVAILABLE" };
  }
}

/**
 * The shell's focus check (every 5 minutes): has this member's access changed? `true` when the ETag differs (show "Your access
 * changed - reload"). Anything that is not a clean 304 or a 200 with the same tag is "changed" (fail towards re-checking).
 */
export async function accessChanged(fetcher: SessionFetcher, etag: string | null): Promise<boolean> {
  if (!etag) return true;
  const r = await fetchTenantSession(fetcher, { headers: { "If-None-Match": etag } });
  if (r.kind === "NOT_MODIFIED") return false;
  if (r.kind === "OK") return r.etag !== etag;
  return r.kind !== "UNAVAILABLE"; // unreachable is not a change: keep the shell, try again next time
}

/** The tenant session for the current request (server components and route handlers), resolved once per request. */
export const getTenantSession = cache(async (): Promise<TenantSession> => {
  const { serverApiFetch } = await import("@/lib/api");
  const r = await fetchTenantSession((path, init) => serverApiFetch(path, init));
  return r.kind === "NOT_MODIFIED" ? { kind: "UNAVAILABLE" } : r; // a 304 can only follow our own If-None-Match: never here
});

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
