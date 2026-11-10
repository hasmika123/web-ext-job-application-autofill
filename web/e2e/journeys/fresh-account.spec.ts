import { expect, test } from "@playwright/test";
import { STATE } from "../fixtures/accounts";

/**
 * U0.5: a brand-new, non-demo account sees an honest empty state on every page that has no API yet, and never a
 * sample row. The demo accounts keep the board look (the demo smoke journey covers that they still render).
 */
test.use({ storageState: STATE.fresh, viewport: { width: 1440, height: 900 } });

const PAGES = ["/jobs", "/applications", "/saved", "/alerts", "/messages", "/explore", "/interview-prep", "/analytics", "/assistant"];

/** Text that only the board's sample data contains. */
const SAMPLE_TEXT = [/1,234 jobs found/, /Frontend Developer/, /Google/, /Microsoft/];

for (const route of PAGES) {
  test(`${route} shows an empty state, not sample rows`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("[data-empty-state]").first()).toBeVisible();
    for (const rx of SAMPLE_TEXT) await expect(page.getByText(rx)).toHaveCount(0);
  });
}

test("/dashboard shows zeros and empty cards, not the sample board", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("[data-empty-state='inline']").first()).toBeVisible();
  await expect(page.getByText(/78%/)).toHaveCount(0);
  for (const rx of SAMPLE_TEXT) await expect(page.getByText(rx)).toHaveCount(0);
});

test("/profiles shows what the account has, and 'Not set' for the rest", async ({ page }) => {
  await page.goto("/profiles");
  await expect(page.getByText("Software Engineer")).toHaveCount(0);
  await expect(page.getByText("San Francisco")).toHaveCount(0);
  await expect(page.getByText("Not set").first()).toBeVisible();
});
