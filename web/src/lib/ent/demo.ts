/**
 * The enterprise demo accounts on a tenant host (X1.12): shapes shared by the tab, the BFF routes and the mock.
 *
 * No server-only imports, so the client tab can use it. The API (`GET /api/public/tenant/demo`) is the only source of the
 * list: the web never decides who is a demo member, and the list is empty unless the API's `DEMO_ENABLED` and `ENT_DEMO_SEED`
 * are both on (config-only, never an env var of the web).
 */

/** One demo member of THIS tenant. Never carries a password. `login` is null for an invitation that has no account yet. */
export interface TenantDemoMember {
  login: string | null;
  name: string;
  primaryRole: string | null;
  roles: string[];
  status: "ACTIVE" | "SUSPENDED" | "INVITED" | string;
  canSignIn: boolean;
}

/** `GET /api/ent/demo` (the BFF's cleaned copy of the API's `/api/public/tenant/demo`). */
export interface TenantDemoInfo {
  enabled: boolean;
  org?: string | null;
  accounts: TenantDemoMember[];
}

export const NO_TENANT_DEMO: TenantDemoInfo = { enabled: false, org: null, accounts: [] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates the API's body. Anything that is not the contract reads as "no demo": the tab simply does not appear. */
export function parseTenantDemo(data: unknown): TenantDemoInfo {
  if (!isObj(data) || data.enabled !== true || !Array.isArray(data.accounts)) return NO_TENANT_DEMO;
  const accounts: TenantDemoMember[] = [];
  for (const a of data.accounts) {
    if (!isObj(a) || typeof a.name !== "string" || typeof a.status !== "string") continue;
    const roles = Array.isArray(a.roles) ? a.roles.filter((r): r is string => typeof r === "string") : [];
    accounts.push({
      login: typeof a.login === "string" ? a.login : null,
      name: a.name,
      primaryRole: typeof a.primaryRole === "string" ? a.primaryRole : (roles[0] ?? null),
      roles,
      status: a.status,
      canSignIn: a.canSignIn === true && typeof a.login === "string",
    });
  }
  return { enabled: accounts.length > 0, org: typeof data.org === "string" ? data.org : null, accounts };
}

/** "Org Admin + Talent Marketing Manager": every role of the member, primary first. */
export function roleLine(m: Pick<TenantDemoMember, "roles" | "primaryRole">): string {
  const roles = m.roles.length > 0 ? m.roles : m.primaryRole ? [m.primaryRole] : [];
  return roles.join(" + ");
}

/** The line under a member's name: roles, plus why a row is not clickable. */
export function statusNote(m: Pick<TenantDemoMember, "status">): string | null {
  if (m.status === "SUSPENDED") return "Access paused - can't sign in";
  if (m.status === "INVITED") return "Invitation pending - no account yet";
  return null;
}
