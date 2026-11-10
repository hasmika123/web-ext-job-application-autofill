import { test, expect, narrate } from "../_support/story";
import { expectOnTheWay } from "./_platform";

/** PLT: licensing and entitlement surfaces as they are built today, and the E1 rule (Kiwiply prepares, the consultant submits; nothing auto-submits). */

test("PLT-25 The Org Admin's Plan & Billing page is not built yet and says so honestly", async ({ as }) => {
  const { page, go } = await as("sarah");
  // Subscription Overview, Consultant Licenses and Feature Usage left the menu in the Phase 1 refresh; Plan & Billing is its one "Soon" row
  await go("/w/admin/billing");
  await narrate(page, "Plan & Billing: a calm placeholder, not an error", 600);
  await expectOnTheWay(page);
  await expect(page.locator("[data-page-header]")).toContainText("Plan & Billing");
  await expect(page.locator("[data-shell-sidebar]")).toBeVisible();
});

test("PLT-26 A consultant sees which features their organization has enabled for them", async ({ as }) => {
  const { page, go } = await as("anika");
  await go("/w/consultant");
  await narrate(page, "Anika opens Settings from her menu, then the Plan & features tab");
  await page.locator("[data-shell-sidebar] [data-nav-item=settings]").click();
  await page.waitForURL("**/w/consultant/settings**");
  await page.getByRole("tab", { name: "Plan & features" }).click();
  await expect(page).toHaveURL(/[?&]tab=features/);
  await expect(page.locator("[data-consultant-features][data-status=ready]")).toBeVisible();
  await expect(page.locator("[data-page-header]")).toContainText("Settings");
  await narrate(page, "Each enabled feature shows its status, allowance and usage");
  await expect(page.locator("[data-features-table]")).toBeVisible();
  expect(await page.locator("[data-feature-row]").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-features-filter]")).toBeVisible();
});

test("PLT-27 A consultant cannot see the organization's licensing or billing", async ({ as }) => {
  const { page, go } = await as("anika");
  await go("/w/consultant/settings?tab=features");
  await expect(page.locator("[data-shell-sidebar] [data-nav-item=billing]")).toHaveCount(0);
  await go("/w/admin/billing");
  await expect(page.locator("[data-not-your-role]")).toBeVisible();
  await narrate(page, "The consultant's Plan & Billing address is refused, and nothing about prices shows");
  await expect(page.getByText(/\$\d/)).toHaveCount(0);
});

const SUBMIT_SURFACE = /auto[- ]?(apply|submit)|submit (it )?(for|on behalf)|apply for me|submit all/i;

test("PLT-28 No page offers to submit an application on a consultant's behalf (E1)", async ({ as }) => {
  const checks: [Parameters<typeof as>[0], string, string][] = [
    ["omar", "/w/marketing/submissions", "marketer"],
    ["omar", "/w/marketing/opportunities", "marketer"],
    ["sarah", "/w/admin/applications", "admin"],
    ["anika", "/w/consultant/submissions", "consultant"],
    ["anika", "/w/consultant/opportunities", "consultant"],
  ];
  for (const [who, path, role] of checks) {
    const { page, go } = await as(who);
    await go(path);
    await narrate(page, `${role} page ${path}: looking for any submit-for-me control`, 700);
    await expect(page.locator("[data-shell-main]")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.getByRole("button", { name: SUBMIT_SURFACE })).toHaveCount(0);
    await expect(page.getByRole("link", { name: SUBMIT_SURFACE })).toHaveCount(0);
  }
});

test("PLT-29 The Marketing Manager home has no approve-everything switch", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/marketing-mgmt");
  await narrate(page, "The Marketing Manager home has approvals to decide, never an 'approve everything' control");
  await expect(page.locator("[data-shell-main]")).toBeVisible();
  await expect(page.getByRole("button", { name: /approve all|auto[- ]?approve/i })).toHaveCount(0);
});
