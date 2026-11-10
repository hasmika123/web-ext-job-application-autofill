/**
 * Demo accounts (phase demo, APP-V2-SPEC section 9): the fixed logins, the copy, and the
 * shapes shared by the login page, the in-app shells and the admin card.
 *
 * No server-only imports here, so client components can use it. The server-side fetches live in
 * `demo-server.ts`.
 */

import { tenantOrigin } from "@/lib/tenant-urls";

/**
 * The demo logins kiwiply.com can open (the API's `DemoAccountService`): the job seeker, and the app admin while the API's
 * `DEMO_ADMIN_ENABLED` is on. Organization accounts are NOT here (decision O4): they sign in on their own tenant host, through
 * that host's demo tab (`/api/auth/tenant-demo`), never from the personal site.
 */
export const DEMO_LOGINS = ["demo", "demo-admin"] as const;
export type DemoLogin = (typeof DEMO_LOGINS)[number];

/** `demo-org` is a retired account: nobody can open it, but a session that still carries it is a demo session. */
const RETIRED_DEMO_LOGINS = ["demo-org"] as const;

/** True when `login` (from `GET /api/account`) is a demo account. */
export function isDemoLogin(login?: string | null): boolean {
  const l = login?.trim().toLowerCase() ?? "";
  return !!l && ((DEMO_LOGINS as readonly string[]).includes(l) || (RETIRED_DEMO_LOGINS as readonly string[]).includes(l));
}

/** What a demo account sees when it tries to change something. Matches the API's message. */
export const DEMO_READ_ONLY_MESSAGE = "This is a demo account — changes aren't saved";

/** The short line shown under the name in the account menus and on Settings. */
export const DEMO_NOTE = "Demo account — changes aren't saved";

/** Header the BFF adds to a refused write, so the in-app toaster can spot it on any fetch. */
export const DEMO_READ_ONLY_HEADER = "x-demo-read-only";

/** One demo account as the API describes it. Never carries a password. */
export interface DemoAccount {
  login: string;
  label: string;
  description?: string;
  landing: string;
}

/** The demo company the personal site can point at: its host (from the API) and name. Null/absent when no demo company is seeded. */
export interface TenantDemoLink {
  host: string;
  name: string;
}

/** `GET /api/public/demo`. */
export interface DemoInfo {
  enabled: boolean;
  accounts: DemoAccount[];
  tenantDemo?: TenantDemoLink | null;
}

/**
 * The sign-in address of the demo company: the host the API names, as the app builds every tenant origin (`tenantOrigin`), plus the
 * visitor's own port when both sides are loopback (`acme.localhost` next to `localhost:3304` is `http://acme.localhost:3304/login`).
 * "" when the host is not a plain hostname.
 */
export function tenantDemoLoginUrl(tenant: TenantDemoLink, here: { hostname: string; port: string }): string {
  const origin = tenantOrigin(tenant.host);
  if (!origin) return "";
  const loopback = (h: string) => h === "localhost" || h.endsWith(".localhost");
  const port = loopback(tenant.host.toLowerCase()) && loopback(here.hostname.toLowerCase()) && here.port ? `:${here.port}` : "";
  return `${origin}${port}/login`;
}

/** `GET /api/admin/settings/demo`. */
export type DemoAdminState = DemoInfo;
