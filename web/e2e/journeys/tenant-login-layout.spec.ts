import { expect, test } from "@playwright/test";

/**
 * Demo bug P1: the tenant sign-in looked like a phone at laptop and tablet widths (a huge hero above the form, the form below
 * the fold). The split layout (scene behind, heading + form in a panel on the right) now starts at 768 px. Mock API, acme.localhost.
 */
const base = `http://acme.localhost:${process.env.E2E_PORT ?? 3100}`;

for (const { width, height, split } of [
  { width: 390, height: 844, split: false },
  { width: 800, height: 700, split: true },
  { width: 1024, height: 768, split: true },
  { width: 1280, height: 800, split: true },
  { width: 1440, height: 900, split: true },
]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height } });

    test(`no sideways scroll; ${split ? "the form is in a right-hand panel and above the fold" : "stacked, the form still reachable"}; the Demo accounts tab opens`, async ({ page }) => {
      await page.goto(`${base}/login`);
      const user = page.locator('input[name="username"]');
      await expect(user).toBeVisible();
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
      const box = (await user.boundingBox())!;
      const submit = (await page.locator('button[type="submit"]').boundingBox())!;
      expect(box.y + box.height, "the username field is above the fold").toBeLessThanOrEqual(height);
      if (split) {
        expect(submit.y, "the Sign in button starts above the fold").toBeLessThan(height);
        expect(box.x, "the form sits on the right half").toBeGreaterThan(width * 0.4);
      }
      // the Demo accounts tab (a dev aid on the mock) stays usable at this width
      await page.locator("[data-tenant-demo-tab]").click();
      await expect(page.locator('[data-demo-member="demo-ent-acme-sarah"]')).toBeVisible();
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  });
}

test("at 768 px the page is the split layout, below it the stacked one", async ({ browser }) => {
  for (const [width, panelIsRight] of [[767, false], [768, true]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height: 700 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/login`);
    const panelX = await page.locator('section[aria-label="Sign in"]').evaluate((el) => el.getBoundingClientRect().left);
    if (panelIsRight) expect(panelX).toBeGreaterThan(width * 0.4);
    else expect(panelX).toBeLessThan(width * 0.2);
    await ctx.close();
  }
});
