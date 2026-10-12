import { expect, request as pwRequest, test as setup } from "@playwright/test";
import { FRESH, ORG_LOGINS, STATE, orgCreds } from "./fixtures/accounts";

/**
 * Signs each journey account in once and saves its cookies (the login routes are rate limited, and a fresh sign-in
 * per test would hit that). The demo logins use the one-click demo route; `fresh` uses the real login route with
 * the fixture's test credentials.
 */
for (const login of ["demo", "demo-org"] as const) {
  setup(`sign in as ${login}`, async ({ request }) => {
    const res = await request.post("/api/auth/demo", { data: { login } });
    expect(res.ok(), `demo sign-in for ${login}`).toBeTruthy();
    await request.storageState({ path: STATE[login] });
  });
}

setup("sign in as the fresh (non-demo) account", async ({ request }) => {
  const res = await request.post("/api/auth/login", { data: FRESH });
  expect(res.ok(), "fixture sign-in").toBeTruthy();
  await request.storageState({ path: STATE.fresh });
});

/**
 * The org console's people (`scripts/fixtures/org-roles.mjs`). Nine more sign-ins would blow the login route's
 * 10-per-5-minutes limit, so these ask the mock API for a token pair directly (the same call the login route makes)
 * and write the two httpOnly session cookies themselves.
 */
const mockPort = process.env.E2E_MOCK_PORT ?? 8180;
for (const login of ORG_LOGINS) {
  setup(`sign in as ${login}`, async ({ request }) => {
    const res = await request.post(`http://localhost:${mockPort}/api/authenticate`, { data: orgCreds(login) });
    expect(res.ok(), `mock sign-in for ${login}`).toBeTruthy();
    const { accessToken, refreshToken } = (await res.json()) as { accessToken: string; refreshToken: string };
    const cookie = (name: string, value: string) => ({ name, value, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const });
    const jar = await pwRequest.newContext({ storageState: { cookies: [cookie("kiwiply_access", accessToken), cookie("kiwiply_refresh", refreshToken)], origins: [] } });
    await jar.storageState({ path: STATE[login] });
    await jar.dispose();
  });
}
