/**
 * Mock API fixture `fresh` (U19.3 / U0.5): a brand-new, NON-demo account with nothing in it - no applications, no
 * resumes, no profile, no notifications. It is what a real user sees on day one, so pages must show honest empty
 * states for it (never a sample row). Use: `MOCK_FIXTURE=fresh npm run dev:demo -w web`, then sign in on /login with
 * the username and password below (test values that exist only in this mock; the Playwright journeys read them from
 * `web/e2e/fixtures/accounts.ts`, which re-exports this file).
 */
const fixture = {
  name: "fresh",
  accounts: {
    "fresh.user": {
      login: "fresh.user",
      email: "fresh.user@example.test",
      firstName: "Sam",
      lastName: "Rivera",
      authorities: ["ROLE_USER"],
      activated: true,
      // test-only credentials for the local mock
      password: "fixture-pass-1",
      // answers every per-user list with an empty one
      empty: true,
    },
  },
};

export default fixture;
