/**
 * Server-side org plumbing (O1.6): which organization the console is showing, and how a server component or route
 * reaches that org's API without ever being handed an org id by the browser.
 *
 *  - `loadOrgGate()` reads `GET /api/orgs/mine` and the `kiwiply_org` cookie, decides the branch (none / member-only /
 *    render, `decideOrgGate`) and, for a render, reads `GET /api/orgs/{id}` for the role and `permissions[]`. It is cached
 *    for the request, so the layout and a page that asks again share one round trip.
 *  - `orgFetch(path)` calls `/api/orgs/{current}{path}` through `forward()` (status, body and problem JSON relayed, a
 *    demo write refusal mapped). The org id comes from the gate above, never from the caller.
 *
 * Server only (it reads cookies). Types and the pure decision live in `lib/org-types.ts`.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { hasSession } from "@/lib/auth";
import { ORG_COOKIE } from "@/lib/cookies";
import { getPublicConfig } from "@/lib/public-config";
import { forward } from "@/lib/resume-doc-proxy";
import { decideOrgGate, type CurrentOrg, type OrgDetail, type OrgMine } from "@/lib/org-types";
import type { AppAccount } from "@/components/app-shell/AppShell";

/**
 * The session half of every org layout: no cookie -> /login; a 401/403 from the account probe (expired or forged token)
 * -> /login; the org feature flag off -> /dashboard (the whole area is dark, E2E-O1.9). Any other probe failure renders
 * without a name rather than treating the person as signed out. Returns the account for the shell's avatar.
 */
export async function requireOrgSession(): Promise<AppAccount | null> {
  if (!(await hasSession())) redirect("/login");

  let account: AppAccount | null = null;
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) redirect("/login");
  if (res.ok) account = (await res.json().catch(() => null)) as AppAccount | null;

  if (!(await getPublicConfig()).orgs) redirect("/dashboard");
  return account;
}

export type OrgGate =
  | { kind: "none" }
  | { kind: "member-only" }
  | { kind: "render"; current: CurrentOrg; orgs: OrgMine[] }
  /** The org API is off (404: the flag flipped since the web last asked) - treat like the flag being off. */
  | { kind: "off" }
  /** The API failed or answered something unreadable; show a retry, never guess a branch. */
  | { kind: "error"; status: number };

/** `GET /api/orgs/mine`, or the status that stopped it. Never throws. */
export async function getMyOrgs(): Promise<{ ok: true; orgs: OrgMine[] } | { ok: false; status: number }> {
  let res: Response;
  try {
    res = await serverApiFetch("/api/orgs/mine");
  } catch {
    return { ok: false, status: 502 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json().catch(() => null)) as OrgMine[] | null;
  return Array.isArray(data) ? { ok: true, orgs: data } : { ok: false, status: 502 };
}

async function resolveOrgGate(): Promise<OrgGate> {
  const mine = await getMyOrgs();
  if (!mine.ok) return mine.status === 404 ? { kind: "off" } : { kind: "error", status: mine.status };

  const cookie = (await cookies()).get(ORG_COOKIE)?.value;
  const decision = decideOrgGate(mine.orgs, cookie);
  if (decision.kind !== "render") return decision;

  let res: Response;
  try {
    res = await serverApiFetch(`/api/orgs/${decision.current.orgId}`);
  } catch {
    return { kind: "error", status: 502 };
  }
  // 404 for an org just listed means the seat changed (or the flag flipped) between the two calls: start again from the top.
  if (res.status === 404) return { kind: "off" };
  if (!res.ok) return { kind: "error", status: res.status };
  const detail = (await res.json().catch(() => null)) as OrgDetail | null;
  if (!detail?.org || !detail.me) return { kind: "error", status: 502 };
  return {
    kind: "render",
    orgs: decision.orgs,
    current: { org: detail.org, role: detail.me.role, permissions: detail.me.permissions ?? [], memberCount: detail.memberCount },
  };
}

/** The gate for this request (cached per request). */
export const loadOrgGate = cache(resolveOrgGate);

/** The org the console is showing, or null when the caller is not inside a console (the layout has redirected by then). */
export async function currentOrg(): Promise<CurrentOrg | null> {
  const gate = await loadOrgGate();
  return gate.kind === "render" ? gate.current : null;
}

/**
 * Calls `/api/orgs/{current org}{path}` for a server component or route, e.g. `orgFetch("/onboarding")`. A caller with
 * no console answers a plain 404 (what the API itself would say), so nothing downstream has to special-case it.
 */
export async function orgFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const gate = await loadOrgGate();
  if (gate.kind !== "render") return Response.json({ error: "Not found" }, { status: 404 });
  return forward(`/api/orgs/${gate.current.org.id}${path.startsWith("/") ? path : `/${path}`}`, init);
}
