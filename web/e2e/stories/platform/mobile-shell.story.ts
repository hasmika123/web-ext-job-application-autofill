import { test, expect, narrate } from "../_support/story";
import { PERSONAS, type PersonaKey } from "../_support/personas";
import { ACME, expectNoSideScroll, expectOnTheWay } from "./_platform";

/** PLT: the shell at phone width (390 x 844). Same code at every width; the sidebar becomes a top bar, bottom tabs and a menu sheet. */
const PHONE = { width: 390, height: 844 };

test("PLT-40 At 390px the sidebar becomes a top bar, quick tabs and a menu sheet, with no sideways scroll", async ({ as }) => {
  const { page, go } = await as("sarah");
  await page.setViewportSize(PHONE);
  await go("/w/admin");
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
  await narrate(page, "On a phone the sidebar is gone; a top bar and quick tabs take over");
  await expect(page.locator("[data-shell-sidebar]")).toBeHidden();
  await expect(page.locator("[data-shell-topbar-phone]")).toBeVisible();
  const tabs = page.locator("[data-shell-tabs] a");
  const n = await tabs.count();
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(4);
  await expect(page.locator("[data-shell-tabs]")).toContainText("More");
  await expectNoSideScroll(page);
  await narrate(page, "Open menu shows the whole menu in a sheet");
  await page.getByLabel("Open menu").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Employees");
  await expect(sheet).toContainText("Organization Branding");
  await expect(sheet).toContainText("Sign out");
  await narrate(page, "Choosing a page closes the sheet and opens it");
  await sheet.getByRole("link", { name: "Employees" }).click();
  await page.waitForURL("**/w/admin/employees");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoSideScroll(page);
});

test("PLT-41 On a phone Sarah switches workspace from the top-bar chip (bottom sheet)", async ({ as }) => {
  const { page, go } = await as("sarah");
  await page.setViewportSize(PHONE);
  await go("/w/admin");
  await narrate(page, "Two workspaces: the top bar shows a chip with the current one");
  const chip = page.locator("[data-workspace-switcher=bar]");
  await expect(chip).toContainText("Administration");
  await chip.click();
  await expect(page.getByRole("dialog")).toContainText("Switch workspace");
  const rows = page.getByRole("menuitemradio");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).click();
  await page.waitForURL("**/w/marketing-mgmt");
  await expect(page.locator("[data-workspace-switcher=bar]")).toContainText("Marketing management");
  await expectNoSideScroll(page);
});

test("PLT-42 Every role's home fits a phone without sideways scrolling", async ({ as }) => {
  const who: PersonaKey[] = ["omar", "anika", "hana", "felix", "amara", "eve"];
  for (const key of who) {
    const { page, go } = await as(key);
    await page.setViewportSize(PHONE);
    await go(`/w/${PERSONAS[key].home}`);
    await expect(page.locator("[data-shell-topbar-phone]")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await narrate(page, `${PERSONAS[key].name} at 390px`, 600);
    await expectNoSideScroll(page);
    await expect(page.locator("[data-shell-tabs]")).toBeVisible();
  }
});

test("PLT-43 A denied page and an 'on the way' page also fit a phone", async ({ as }) => {
  const { page, go } = await as("hana");
  await page.setViewportSize(PHONE);
  await go("/w/admin");
  await expect(page.locator("[data-not-your-role]")).toBeVisible();
  await narrate(page, "The denied state on a phone");
  await expectNoSideScroll(page);
  await go("/w/hr");
  await expectOnTheWay(page);
  await expectNoSideScroll(page);
});

test("PLT-44 Signing in from a phone: the Demo accounts tab opens as a drawer and lands on the workspace", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`${ACME}/login`);
  await narrate(page, "The branded sign-in on a 390px screen");
  await expectNoSideScroll(page);
  await expect(page.getByRole("button", { name: /^Sign In/ })).toBeVisible();
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await expect(page.locator("[data-tenant-demo-panel]")).toBeVisible();
  await page.getByRole("button", { name: "Sign in as Anika Rao" }).click();
  await page.waitForURL("**/w/consultant");
  await expect(page.locator("[data-consultant-home]")).toBeVisible();
  await narrate(page, "Anika is in her workspace, still without sideways scroll");
  await expectNoSideScroll(page);
});
