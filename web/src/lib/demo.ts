/**
 * Demo accounts (phase demo, APP-V2-SPEC section 9): the fixed logins, the copy, and the
 * shapes shared by the login page, the in-app shells and the admin card.
 *
 * No server-only imports here, so client components can use it. The server-side fetches live in
 * `demo-server.ts`.
 */

/** The fixed demo logins (the API's `DemoAccountService`; `demo-admin` exists only in the local mock API). */
export const DEMO_LOGINS = ["demo", "demo-org", "demo-admin"] as const;
export type DemoLogin = (typeof DEMO_LOGINS)[number];

/** True when `login` (from `GET /api/account`) is a demo account. */
export function isDemoLogin(login?: string | null): boolean {
  return !!login && (DEMO_LOGINS as readonly string[]).includes(login.trim().toLowerCase());
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

/** `GET /api/public/demo`. */
export interface DemoInfo {
  enabled: boolean;
  accounts: DemoAccount[];
}

/** `GET /api/admin/settings/demo`. */
export interface DemoAdminState extends DemoInfo {
  updatedBy: string | null;
  updatedDate: string | null;
}
