import { test, expect, narrate } from "../_support/story";
import { PORT } from "../_support/personas";
import { ACME, BETA } from "./_platform";

/** PLT: how a host becomes a tenant (name, colours, logo, welcome copy) and what an unserved host shows. */

async function brandVars(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("[data-tenant-root]")!);
    return { primary: cs.getPropertyValue("--brand-solid").trim(), secondary: cs.getPropertyValue("--brand-2-solid").trim() };
  });
}

test("PLT-01 A visitor reaches Acme Staffing's branded sign-in", async ({ page }) => {
  await narrate(page, "A visitor opens acme.localhost and meets Acme's own sign-in");
  await page.goto(`${ACME}/login`);
  await expect(page).toHaveTitle(/Acme Staffing/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to Acme Staffing");
  await expect(page.getByText("Sign in to your consultant bench, placements and team workspace.")).toBeVisible();
  await narrate(page, "The logo, welcome copy and support address are all Acme's");
  await expect(page.locator("[data-tenant-logo]").first()).toBeVisible();
  await expect(page.locator('a[href="mailto:support@acme.example.com"]')).toBeVisible();
  await narrate(page, "Nothing here says Kiwiply, and the form asks for a user name and password");
  await expect(page.getByLabel("User Name")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sign In/ })).toBeVisible();
});

test("PLT-02 Beta Talent gets its own colours and copy from the same code", async ({ page }) => {
  await page.goto(`${ACME}/login`);
  const acme = await brandVars(page);
  await narrate(page, "Acme's theme variables are read first");
  await page.goto(`${BETA}/login`);
  await narrate(page, "Now the same page on beta.localhost");
  await expect(page).toHaveTitle(/Beta Talent/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to Beta Talent");
  await expect(page.getByText("Sign in to your people workspace.")).toBeVisible();
  await expect(page.locator('a[href="mailto:help@beta.example.com"]')).toBeVisible();
  const beta = await brandVars(page);
  expect(beta.primary).not.toBe("");
  expect(beta.primary).not.toBe(acme.primary); // indigo, not Acme's blue
  expect(beta.secondary).not.toBe(acme.secondary); // pink, not Acme's amber
  await narrate(page, "Different organization, different colours, nothing shared");
  await expect(page.getByText("Acme Staffing")).toHaveCount(0);
});

test("PLT-03 An unknown host is a plain 404 with no cookie and no hint", async ({ page }) => {
  const res = await page.goto(`http://nobody.localhost:${PORT}/`);
  await narrate(page, "nobody.localhost is not a workspace anyone owns");
  expect(res?.status()).toBe(404);
  expect(res?.headers()["set-cookie"]).toBeUndefined();
  await expect(page.locator("[data-tenant-unavailable]")).toBeVisible();
  await expect(page.getByText("This workspace isn't available")).toBeVisible();
  await narrate(page, "The page does not say whether the workspace ever existed");
  await expect(page.getByText(/Acme|Beta|Kiwiply/)).toHaveCount(0);
  const deep = await page.goto(`http://nobody.localhost:${PORT}/w/admin`);
  expect(deep?.status()).toBe(404);
});

test("PLT-04 The platform host never serves the tenant tree", async ({ page }) => {
  await narrate(page, "The Kiwiply site itself is not a tenant");
  const res = await page.goto(`http://localhost:${PORT}/_t`);
  expect(res?.status()).toBe(404);
  await page.goto(`http://localhost:${PORT}/w/admin`); // a tenant path: whatever the platform answers, it is never the enterprise shell
  await expect(page.locator("[data-enterprise-shell]")).toHaveCount(0);
});
