import { test, expect, narrate } from "../_support/story";
import { ACME, BETA } from "./_platform";

/** PLT: signing in through the Demo accounts tab, who cannot, and what a signed-out visitor gets. Fresh (signed-out) browsers only. */

async function openDemoTab(page: import("@playwright/test").Page, base: string) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await expect(page.locator("[data-tenant-demo-panel]")).toBeVisible();
}

test("PLT-05 The Demo accounts tab lists Acme's roster; paused and invited members cannot sign in", async ({ page }) => {
  await narrate(page, "On the sign-in page, the Demo accounts tab slides out Acme's roster");
  await openDemoTab(page, ACME);
  const members = page.locator("[data-demo-member]");
  await expect(members).toHaveCount(11);
  await narrate(page, "Nine active people have a sign-in button");
  for (const name of ["Sarah Chen", "Omar Haddad", "Anika Rao", "Ben Okafor", "Hana Petrov", "Felix Ng", "Amara Silva", "Tomas Berg", "Eve Lindqvist"]) {
    await expect(page.getByRole("button", { name: `Sign in as ${name}` })).toBeVisible();
  }
  await expect(page.locator("[data-demo-member]", { hasText: "Sarah Chen" }).locator("[data-demo-roles]")).toContainText("Org Admin");
  await narrate(page, "Sam is paused and Nina is only invited: listed, but with no button");
  const sam = page.locator("[data-demo-member][data-status=SUSPENDED]");
  await expect(sam).toContainText("Sam Whitfield");
  await expect(sam).toContainText("can't sign in");
  await expect(sam.getByRole("button")).toHaveCount(0);
  const nina = page.locator("[data-demo-member][data-status=INVITED]");
  await expect(nina).toContainText("Nina Vogel");
  await expect(nina).toContainText("no account yet");
  await expect(nina.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in as Sam Whitfield" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in as Nina Vogel" })).toHaveCount(0);
});

test("PLT-06 Beta's Demo accounts tab shows only Beta's person", async ({ page }) => {
  await openDemoTab(page, BETA);
  await narrate(page, "Beta's tab holds one person, Bea Turner");
  await expect(page.locator("[data-demo-member]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sign in as Bea Turner" })).toBeVisible();
  await expect(page.getByText(/Sarah Chen|Anika Rao|Omar Haddad/)).toHaveCount(0);
});

test("PLT-07 A wrong password shows one calm message and stays on the sign-in", async ({ page }) => {
  await page.goto(`${ACME}/login`);
  await narrate(page, "Someone types Sarah's address with a wrong password");
  await page.getByLabel("User Name").fill("sarah.chen@acme.example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await page.getByRole("button", { name: /^Sign In/ }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await narrate(page, "No hint about which half was wrong, and no session was created");
  await expect(page).toHaveURL(/\/login/);
  await page.goto(`${ACME}/w/admin`);
  await expect(page).toHaveURL(/\/login/);
});

test("PLT-08 A signed-out visitor to a deep link is sent to the sign-in with a return path", async ({ page }) => {
  await narrate(page, "A signed-out visitor opens an Acme page directly");
  await page.goto(`${ACME}/w/admin/employees`);
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "")).toBe("/w/admin/employees");
  await expect(page.locator("[data-enterprise-shell]")).toHaveCount(0);
  await narrate(page, "Only a same-host path is accepted as the return path");
  await page.goto(`${ACME}/login?next=${encodeURIComponent("https://evil.example/steal")}`);
  await expect(page.getByRole("button", { name: /^Sign In/ })).toBeVisible();
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: "Sign in as Hana Petrov" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
  expect(new URL(page.url()).hostname).toBe("acme.localhost");
});

test("PLT-09 Signing in as a marketer lands on the Marketing workspace, not on a generic home", async ({ page }) => {
  await openDemoTab(page, ACME);
  await narrate(page, "Omar Haddad signs in from the Demo accounts tab");
  await page.getByRole("button", { name: "Sign in as Omar Haddad" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
  expect(new URL(page.url()).pathname).toBe("/w/marketing");
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
  await expect(page.locator("[data-account-menu]")).toHaveAttribute("aria-label", "Account menu for Omar Haddad");
});
