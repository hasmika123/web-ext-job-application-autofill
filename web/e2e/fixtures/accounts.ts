import fresh from "../../scripts/fixtures/fresh.mjs";
import orgRoles from "../../scripts/fixtures/org-roles.mjs";

/**
 * The accounts the journeys sign in as. The demo logins are the mock API's own; `fresh` is the brand-new, non-demo
 * account from `scripts/fixtures/fresh.mjs`, and the `org.*` accounts are the org console's people from
 * `scripts/fixtures/org-roles.mjs` (test credentials that exist only in the local mock).
 */
export const ORG_LOGINS = ["org.none", "org.creator", "org.member", "org.owner", "org.admin", "org.staff", "org.finance", "org.draft", "org.multi"] as const;
export type OrgLogin = (typeof ORG_LOGINS)[number];
export type Who = "demo" | "demo-org" | "fresh" | OrgLogin;

const freshAccount = fresh.accounts["fresh.user"];

export const FRESH = { username: freshAccount.login, password: freshAccount.password };

/** The sign-in credentials of an `org.*` account. */
export function orgCreds(login: OrgLogin) {
  const a = (orgRoles.accounts as Record<string, { login: string; password: string }>)[login];
  return { username: a.login, password: a.password };
}

/** Where each account's signed-in browser state is saved by `auth.setup.ts`. */
export const STATE = {
  demo: "e2e/.auth/demo.json",
  "demo-org": "e2e/.auth/demo-org.json",
  fresh: "e2e/.auth/fresh.json",
  ...Object.fromEntries(ORG_LOGINS.map((l) => [l, `e2e/.auth/${l}.json`])),
} as Record<Who, string>;
