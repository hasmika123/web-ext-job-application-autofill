import { expect, test as setup } from "@playwright/test";
import { FRESH, STATE } from "./fixtures/accounts";

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
