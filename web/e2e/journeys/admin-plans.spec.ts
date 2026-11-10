import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectAccessible, noOverflow, shot, signInAdmin } from "../fixtures/admin";

/**
 * The plan builder (subscription module K4; docs/subscriptions/04 section 12) against the mock API's in-memory plan fixtures
 * (`scripts/mock-plans.mjs`, `scripts/fixtures/admin-plans.mjs`). The journey of the design: open Pro, price "Extra AI credits"
 * below the floor and read the lever, raise it, publish v3 with the typed version number, read the publish in History, and see that
 * Sunset is not available. Run at 1440 and at 390. Every spec resets the mock first (`POST /mock/plans/reset`), so they are independent.
 *
 * Written for `npm run test:e2e -w web`; it is not part of the unit run. ADMIN_SHOTS=<dir> also saves screenshots.
 */
const mockPort = Number(process.env.E2E_MOCK_PORT ?? 8180);

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post(`http://localhost:${mockPort}/mock/plans/reset`);
  expect(reset.ok(), "mock reset").toBeTruthy();
  await signInAdmin(page);
});

async function priceCredits(page: Page, amount: string) {
  const box = page.getByRole("textbox", { name: "Extra AI credits monthly price" });
  await box.fill(amount);
  return box;
}

const tickOf = async (page: Page, amount: string) => {
  const box = await priceCredits(page, amount);
  const id = await box.getAttribute("aria-describedby");
  return page.locator(`[id="${id}"]`);
};

test.describe("at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the list shows six plans with their statuses and a sunset plan whose row actions are disabled", async ({ page }) => {
    await page.goto("/admin/pricing/plans");
    await expect(page.getByRole("heading", { level: 1, name: "Plans" })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByText("Pro Student")).toBeVisible();
    await expect(table.getByText("Org Consultancy")).toBeVisible();
    await expect(page.getByText("On older versions")).toBeVisible();
    await expectAccessible(page, "plans list 1440");
    await noOverflow(page);
    await shot(page, "plans-list-1440");

    await page.getByRole("button", { name: "Status" }).click();
    await page.getByRole("option", { name: "Sunset" }).click();
    await expect(table.getByText("Org Consultancy")).toBeVisible();
    await expect(table.getByText("Pro Student")).toHaveCount(0);
    // K10.9: a retiring plan opens its progress; the retirement wizard itself is covered by admin-retirement.spec.ts
    await expect(page.getByRole("button", { name: "Retirement progress" }).first()).toBeEnabled();
  });

  test("price Extra AI credits below the floor, read the lever, raise it, publish with the typed version, see it in History", async ({ page }) => {
    await page.goto("/admin/pricing/plans");
    await page.getByRole("table").getByText("Pro", { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Pro · v3/ })).toBeVisible();
    await expect(page.getByText("All checks pass")).toBeVisible();

    const low = await tickOf(page, "3.99");
    await expect(low).toContainText("73.4 %");
    await expect(low).toContainText("min $5.50");
    await priceCredits(page, "5.50");
    await expect(page.getByRole("textbox", { name: "Extra AI credits monthly price" })).toHaveValue("5.50");
    await page.getByRole("textbox", { name: "Extra AI credits monthly price" }).blur();
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Run all checks" }).click();
    await expect(page.getByText("All checks pass")).toBeVisible();
    await expectAccessible(page, "plan editor 1440");
    await shot(page, "plan-editor-1440");

    await page.getByRole("button", { name: /^Publish…/ }).click();
    const sheet = page.getByRole("dialog", { name: "Publish Pro v3?" });
    await expect(sheet.getByText("Changes since v2")).toBeVisible();
    const go = sheet.getByRole("button", { name: "Publish v3" });
    await expect(go).toBeDisabled();
    await sheet.getByLabel("Reason", { exact: true }).fill("Launch the new credits add-on");
    await sheet.getByLabel("Type the version number").fill("2");
    await expect(go).toBeDisabled();
    await sheet.getByLabel("Type the version number").fill("3");
    await expectAccessible(page, "publish sheet 1440", '[role="dialog"]');
    await go.click();
    await expect(page.getByText("Pro v3 published").first()).toBeVisible();

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByText(/PLAN_PUBLISHED · catalog v18/)).toBeVisible();
    await expect(page.getByText("Published PRO v3")).toBeVisible();
  });

  test("a margin failure needs its own override reason and the API's refusal shows the lever inline", async ({ page }) => {
    await page.goto("/admin/pricing/plans/PRO/v/3");
    const box = page.getByRole("textbox", { name: "Extra AI credits monthly price" });
    await box.fill("3.99");
    await box.blur();
    await expect(page.getByText(/1 failing check|2 failing checks/).first()).toBeVisible();
    await page.getByRole("button", { name: /^Publish… \(\d failing\)/ }).click();
    const sheet = page.getByRole("dialog", { name: "Publish Pro v3?" });
    await expect(sheet.getByText(/an override reason is required/)).toBeVisible();
    await sheet.getByLabel("Reason", { exact: true }).fill("Launch the new credits add-on");
    await sheet.getByLabel("Type the version number").fill("3");
    await expect(sheet.getByRole("button", { name: "Publish v3" })).toBeDisabled();
    await sheet.getByLabel("Override reason").fill("Launch price, review in a week");
    await expect(sheet.getByRole("button", { name: "Publish v3" })).toBeEnabled();
  });

  test("compare two versions and read the subscribers by version", async ({ page }) => {
    await page.goto("/admin/pricing/plans/PRO/compare?a=2&b=3");
    await expect(page.getByRole("heading", { level: 1, name: /Pro: compare versions/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Subscribers by version" })).toContainText("1,038");
    await expect(page.getByRole("button", { name: "Retire…" })).toBeDisabled();
    await expectAccessible(page, "compare 1440");
  });

  test("the organization plan shows seat rules, the roster total and the setup fee", async ({ page }) => {
    await page.goto("/admin/pricing/plans/ORG_STANDARD/v/1");
    await expect(page.getByRole("heading", { name: "Seat rules and fees" })).toBeVisible();
    await expect(page.getByText("$499.00").first()).toBeVisible();
    await page.getByLabel("Sample roster").fill("[5]BASE,[3]RESUME_AI_SUPPORT");
    await expect(page.getByText("$161.83")).toBeVisible(); // 5 x $14.99 + 3 x $28.96, summed by the mock server (the page adds nothing)
  });
});

test.describe("at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the list is cards with one price line; nothing overflows", async ({ page }) => {
    await page.goto("/admin/pricing/plans");
    await expect(page.getByRole("heading", { level: 1, name: "Plans" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("$19.99").first()).toBeVisible();
    await noOverflow(page);
    await expectAccessible(page, "plans list 390");
    await shot(page, "plans-list-390");
  });

  test("the editor is a five-step stepper with the worst case in the bottom bar and the preview in a sheet", async ({ page }) => {
    await page.goto("/admin/pricing/plans/PRO/v/3");
    await expect(page.getByRole("navigation", { name: "Plan editor steps" })).toBeVisible();
    for (let i = 0; i < 2; i += 1) await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Included services/ })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Optional add-ons/ })).toBeVisible();
    await expect(page.getByText(/Worst case \d+\.\d %/)).toBeVisible();
    await noOverflow(page);
    await expectAccessible(page, "plan editor 390");
    await page.getByRole("button", { name: "Review" }).click();
    const sheet = page.getByRole("dialog", { name: "Preview" });
    await expect(sheet.getByRole("button", { name: "Run all checks" })).toBeVisible();
    await shot(page, "plan-editor-preview-390");
  });

  test("publish at 390 is a bottom sheet with the same typed confirmation", async ({ page }) => {
    await page.goto("/admin/pricing/plans/PRO/v/3");
    await page.getByRole("button", { name: /^Publish…/ }).click();
    const sheet = page.getByRole("dialog", { name: "Publish Pro v3?" });
    await expect(sheet.getByRole("button", { name: "Publish v3" })).toBeDisabled();
    await sheet.getByLabel("Type the version number").fill("3");
    await sheet.getByLabel("Reason", { exact: true }).fill("Launch the new credits add-on");
    await expect(sheet.getByRole("button", { name: "Publish v3" })).toBeEnabled();
    await expectAccessible(page, "publish sheet 390", '[role="dialog"]');
  });
});
