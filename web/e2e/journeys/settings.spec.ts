import { expect, test } from "@playwright/test";
import { STATE } from "../fixtures/accounts";

/**
 * E2E-U7.0 / E2E-U14.0: Settings is real. A switch autosaves (no Save button) and is still there after a reload; the
 * Privacy panel lists what is stored; Help opens the one bug-report dialog; a demo account sees it all but cannot change it.
 */
test.describe("a real account", () => {
  test.use({ storageState: STATE.fresh, viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ request }) => {
    // the mock keeps preferences in memory for the whole run
    await request.post(`http://localhost:${process.env.E2E_MOCK_PORT ?? 8180}/mock/notification-preferences/reset`);
  });

  test("a notification switch saves by itself and survives a reload", async ({ page }) => {
    await page.goto("/settings#notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^save/i })).toHaveCount(0);

    const row = page.locator("li", { hasText: "Application updates" });
    const email = row.getByRole("switch", { name: "Email" });
    await expect(email).toHaveAttribute("aria-checked", "true");
    await email.click();
    await expect(page.getByText("Application updates: email off")).toBeVisible(); // the Undo toast
    await expect(row.getByRole("img", { name: "Saved" })).toBeVisible(); // the inline tick

    await page.reload();
    await expect(page.locator("li", { hasText: "Application updates" }).getByRole("switch", { name: "Email" })).toHaveAttribute("aria-checked", "false");
  });

  test("billing and security cannot be switched off", async ({ page }) => {
    await page.goto("/settings#notifications");
    const row = page.locator("li", { hasText: "Billing" });
    await expect(row.getByText("Always on")).toBeVisible();
    await expect(row.getByRole("switch", { name: "Email" })).toBeDisabled();
  });

  test("the time zone on Account is a real select", async ({ page }) => {
    await page.goto("/settings#account");
    await expect(page.getByText("Automatic (from your browser)")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Time zone" }).or(page.getByLabel("Time zone")).first()).toBeVisible();
  });

  test("Privacy says what is stored, and Help opens the bug report", async ({ page }) => {
    await page.goto("/settings#privacy");
    await expect(page.getByRole("heading", { name: "What we store" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What we never collect" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download my data/ })).toBeVisible();

    await page.goto("/settings#help");
    await page.getByRole("button", { name: "Report a problem" }).click();
    await expect(page.getByRole("dialog", { name: "Report a bug" })).toBeVisible();
  });
});

test.describe("a demo account", () => {
  test.use({ storageState: STATE.demo, viewport: { width: 390, height: 844 } });

  test("sees the notification settings but cannot change them, with no sideways scroll", async ({ page }) => {
    await page.goto("/settings#notifications");
    await expect(page.getByText(/Demo account/).first()).toBeVisible();
    await expect(page.locator("li", { hasText: "Kiwiply news" }).getByRole("switch", { name: "Email" })).toBeDisabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
