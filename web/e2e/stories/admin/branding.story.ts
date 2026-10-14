import { test, expect, narrate } from "../_support/story";

test("ADM-70 Org admin drafts new welcome copy on the Branding page, sees it differ from live, and discards the draft", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await narrate(page, "Sarah opens Organization Branding from the sidebar");
  await page.getByRole("link", { name: "Organization Branding", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/branding/);
  await expect(page.locator("[data-branding-page]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-shell-sidebar] [aria-current=page]")).toContainText("Organization Branding");

  await narrate(page, "The seeded Acme brand is live");
  await expect(page.locator('[data-branding-section="identity"]')).toBeVisible();
  await expect(page.getByLabel("Organization name")).toHaveValue(/Acme Staffing/);
  await expect(page.locator("[data-draft-badge]")).toBeVisible();
  await expect(page.getByLabel("Live preview of the sign-in page").or(page.locator('section[aria-label="Live preview of the sign-in page"]')).first()).toBeVisible();

  await narrate(page, "She types a new welcome title: it is saved as a draft, not published");
  const title = `Story welcome ${Date.now() % 100000}`;
  await page.getByLabel(/Welcome title/).fill(title);
  await expect(page.locator('[data-draft-badge="differs"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-publish]")).toBeEnabled();

  await narrate(page, "Publish would show exactly what changes; she looks and cancels");
  await page.locator("[data-publish]").click();
  await expect(page.locator("[data-publish-diff]")).toBeVisible();
  await expect(page.locator("[data-publish-diff]")).toContainText(title);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-publish-diff]")).toHaveCount(0);

  await narrate(page, "Discard draft puts the page back to what is live");
  await page.locator("[data-discard]").click();
  await page.locator("[data-discard-confirm]").click();
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/Welcome title/)).not.toHaveValue(title);
});

test("ADM-71 Beta's owner sees Beta's own branding, not Acme's", async ({ as }) => {
  const { page, go } = await as("bea");
  await go("/w/admin/branding");
  await narrate(page, "Bea opens Beta's Organization Branding");
  await expect(page.locator("[data-branding-page]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Organization name")).toHaveValue(/Beta Talent/);
  await expect(page.locator("[data-branding-page]")).not.toContainText("Acme");
});

test("ADM-72 Only people with the branding permission may open Branding", async ({ as }) => {
  const { page, go } = await as("omar");
  await go("/w/admin/branding");
  await narrate(page, "Omar (marketing specialist) types the Branding address");
  await expect(page.locator("[data-not-your-role]").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-branding-page]")).toHaveCount(0);
});
