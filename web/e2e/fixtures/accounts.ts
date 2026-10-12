import fresh from "../../scripts/fixtures/fresh.mjs";

/**
 * The accounts the journeys sign in as. The demo logins are the mock API's own; `fresh` is the brand-new, non-demo
 * account from `scripts/fixtures/fresh.mjs` (test credentials that exist only in the local mock).
 */
export type Who = "demo" | "demo-org" | "fresh" | "org-owner";

const freshAccount = fresh.accounts["fresh.user"];

export const FRESH = { username: freshAccount.login, password: freshAccount.password };

/** The non-demo owner of the writable "Brightside Bootcamp" the mock seeds (scripts/mock-org.mjs): journeys invite people to it. */
const ownerAccount = fresh.accounts["org.owner"];
export const ORG_OWNER = { username: ownerAccount.login, password: ownerAccount.password };

/** The mock API's own address (the journeys read its dev-only mail outbox and reset its org state). */
export const MOCK_URL = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 8180}`;

/** Where each account's signed-in browser state is saved by `auth.setup.ts`. */
export const STATE: Record<Who, string> = {
  demo: "e2e/.auth/demo.json",
  "demo-org": "e2e/.auth/demo-org.json",
  fresh: "e2e/.auth/fresh.json",
  "org-owner": "e2e/.auth/org-owner.json",
};
