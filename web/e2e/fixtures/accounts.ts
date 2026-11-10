import fresh from "../../scripts/fixtures/fresh.mjs";

/**
 * The accounts the journeys sign in as. The demo logins are the mock API's own; `fresh` is the brand-new, non-demo
 * account from `scripts/fixtures/fresh.mjs` (test credentials that exist only in the local mock).
 */
export type Who = "demo" | "fresh";

const freshAccount = fresh.accounts["fresh.user"];

export const FRESH = { username: freshAccount.login, password: freshAccount.password };

/** Where each account's signed-in browser state is saved by `auth.setup.ts`. */
export const STATE: Record<Who, string> = {
  demo: "e2e/.auth/demo.json",
  fresh: "e2e/.auth/fresh.json",
};
