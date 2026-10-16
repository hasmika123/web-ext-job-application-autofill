import { expect, test, type Page } from "@playwright/test";

/**
 * Demo bug P0: sign out on a tenant host (acme.localhost over the mock API). The session cookies are `__Host-` cookies, which a
 * browser only removes through a Set-Cookie that is itself Secure + Path=/; the old bare delete was ignored, so the member stayed
 * signed in and `/login` bounced straight back to the dashboard. Also: signing in as someone else while signed in replaces the
 * session, and the Branding live preview (an iframe of the same origin) is allowed to render while other pages stay unframable.
 */
const base = `http://acme.localhost:${process.env.E2E_PORT ?? 3100}`;
const SESSION = ["__Host-kiwiply_access", "__Host-kiwiply_refresh"];

async function signIn(page: Page, login: string) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="username"]', login);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const sessionCookies = async (page: Page) => (await page.context().cookies()).filter((c) => SESSION.includes(c.name));
/** A same-origin fetch from inside the page (the test runner's own DNS does not resolve *.localhost). */
const pageFetch = (page: Page, url: string) =>
  page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: "same-origin", redirect: "manual" });
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), json: (await r.json().catch(() => null)) as { person?: { name?: string } } | null };
  }, url);
const whoAmI = async (page: Page) => (await pageFetch(page, "/api/me/tenant")).json?.person?.name;

test.describe("tenant sign out (P0)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Sign out ends the session: /login stays on sign-in and protected pages go to sign-in", async ({ page }) => {
    await signIn(page, "owner@acme.com");
    expect((await sessionCookies(page)).length).toBeGreaterThan(0);
    await page.goto(`${base}/w/admin`);
    await page.locator("[data-account-menu]").click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((u) => u.pathname === "/login");
    await expect(page.locator("[data-tenant-login]")).toBeVisible();
    // the browser really dropped both cookies (a __Host- cookie survives a Set-Cookie that is not Secure)
    expect(await sessionCookies(page)).toEqual([]);
    // and the sign-in is not bounced back to the dashboard
    await page.goto(`${base}/login`);
    await expect(page.locator("[data-tenant-login]")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
    // protected pages send a signed-out visitor to the sign-in
    for (const path of ["/", "/w/admin", "/w/admin/branding"]) {
      await page.goto(`${base}${path}`);
      await page.waitForURL((u) => u.pathname === "/login");
      await expect(page.locator("[data-tenant-login]"), path).toBeVisible();
    }
    // and the BFF no longer answers for the old session
    expect((await pageFetch(page, "/api/me/tenant")).status).toBe(401);
  });

  test("signing in as a different demo member while signed in replaces the session", async ({ page }) => {
    await signIn(page, "owner@acme.com");
    const before = await whoAmI(page);
    expect(before).toBeTruthy();
    // a plain /login bounces a signed-in member to their landing; /login?switch shows the form
    await page.goto(`${base}/login`);
    expect(new URL(page.url()).pathname).not.toBe("/login");
    await page.goto(`${base}/login?switch`);
    await expect(page.locator("[data-tenant-login]")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
    await page.locator("[data-tenant-demo-tab]").click();
    await page.locator('[data-demo-member="demo-ent-acme-sarah"] button').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    const cookies = await sessionCookies(page);
    expect(cookies.map((c) => c.name).sort()).toEqual([...SESSION].sort()); // replaced, not duplicated
    await expect.poll(() => whoAmI(page)).toBe("Sarah Chen");
    expect(before).not.toBe("Sarah Chen");
    // and signing out of THAT session works too
    await page.goto(`${base}/w/admin`);
    await page.locator("[data-account-menu]").click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((u) => u.pathname === "/login");
    expect(await sessionCookies(page)).toEqual([]);
  });
});

test.describe("Branding live preview framing (P1)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the same-origin preview renders; the headers allow only the same origin, and only on the preview page", async ({ page }) => {
    const refused: string[] = [];
    page.on("console", (m) => /refused to (display|frame)/i.test(m.text()) && refused.push(m.text()));
    await signIn(page, "owner@acme.com");
    await page.goto(`${base}/w/admin/branding`);
    await expect(page.locator("[data-branding-page]")).toBeVisible();
    const frame = page.frameLocator('iframe[title="Sign-in page preview"]');
    await expect(frame.locator("[data-tenant-login]")).toBeVisible({ timeout: 30_000 });
    expect(refused).toEqual([]);

    const preview = await pageFetch(page, "/preview/login");
    expect(preview.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(preview.headers["content-security-policy"]).toBe("frame-ancestors 'self'");
    for (const path of ["/login?switch", "/w/admin/branding"]) {
      const res = await pageFetch(page, path);
      expect(res.headers["x-frame-options"], path).toBe("DENY");
      expect(res.headers["content-security-policy"], path).toBeUndefined();
    }
  });
});
