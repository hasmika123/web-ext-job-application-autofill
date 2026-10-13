import { expect, test, type Page } from "@playwright/test";

/**
 * X2.16: the EnterpriseShell over the mock API (acme.localhost, password demo1234). Real hostnames (*.localhost resolves to the
 * loopback in Chromium); the shell is the same code at every width, so each test picks its viewport.
 */
const base = `http://acme.localhost:${process.env.E2E_PORT ?? 3100}`;

async function signIn(page: Page, login: string) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="username"]', login);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 800 } });

  test("the sidebar scrolls independently of the page", async ({ page }) => {
    await signIn(page, "owner@acme.com");
    await page.goto(`${base}/w/admin/jobs`);
    await page.waitForSelector("[data-enterprise-shell]");
    // make the page and the menu both scrollable
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "4000px";
      document.querySelector("[data-shell-main]")!.appendChild(spacer);
      const nav = document.querySelector("[data-shell-scroll]") as HTMLElement;
      nav.style.maxHeight = "300px"; // a short window: the 26-item menu overflows
    });
    const scroller = page.locator("[data-shell-scroll]");
    const before = await scroller.evaluate((el) => el.scrollTop);
    await page.evaluate(() => window.scrollTo(0, 2000));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before); // the page scrolled, the menu did not
    const top = await page.locator("[data-shell-sidebar]").evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBe(0); // and the sidebar stays put under the viewport's top edge
    await page.evaluate(() => window.scrollTo(0, 0));
    await scroller.evaluate((el) => (el.scrollTop = 200));
    expect(await page.evaluate(() => window.scrollY)).toBe(0); // scrolling the menu does not move the page
  });

  test("a single-workspace owner has no switcher; every menu page resolves (no 404 from the sidebar)", async ({ page }) => {
    await signIn(page, "owner@acme.com");
    await page.goto(`${base}/w/admin`);
    await expect(page.locator("[data-workspace-switcher]")).toHaveCount(0);
    const hrefs = await page.locator("[data-shell-sidebar] a[data-nav-item]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(15);
    for (const href of new Set(hrefs.map((h) => h.split("#")[0]))) {
      const res = await page.goto(`${base}${href}`);
      expect(res?.status(), href).toBe(200);
      await expect(page.locator("[data-coming-soon], [data-branding-page], [data-dashboard]").first(), href).toBeVisible();
    }
  });

  test("Sarah: two workspaces, the switcher (and Ctrl+Shift+W), the second workspace's menu, a refused workspace", async ({ page }) => {
    await signIn(page, "sarah@acme.com");
    await page.goto(`${base}/w/admin`);
    await expect(page.locator("[data-workspace-switcher=sidebar]")).toContainText("Administration");
    const rows = page.getByRole("menuitemradio");
    // the shortcut is a client listener: retry until the page has hydrated
    await expect(async () => {
      await page.keyboard.press("Control+Shift+W");
      await expect(rows).toHaveCount(2, { timeout: 1500 });
    }).toPass({ timeout: 20000 });
    await rows.nth(1).click();
    await page.waitForURL("**/w/marketing-mgmt");
    await expect(page.locator("[data-shell-sidebar] a[data-nav-item]").first()).toBeVisible();
    await page.goto(`${base}/w/hr`);
    await expect(page.locator("[data-not-your-role]")).toBeVisible();
  });

  test("Organization Branding opens inside the shell", async ({ page }) => {
    await signIn(page, "owner@acme.com");
    await page.goto(`${base}/w/admin/branding`);
    await expect(page.locator("[data-branding-page]")).toBeVisible();
    await expect(page.locator("[data-shell-sidebar] [aria-current=page]")).toContainText("Organization Branding");
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("top bar, bottom tabs (first four + More), the menu sheet, no horizontal scroll", async ({ page }) => {
    await signIn(page, "owner@acme.com");
    await page.goto(`${base}/w/admin`);
    await page.waitForSelector("[data-enterprise-shell]");
    await expect(page.locator("[data-shell-sidebar]")).toBeHidden();
    const tabs = page.locator("[data-shell-tabs] a");
    await expect(tabs).toHaveCount(4);
    await expect(page.locator("[data-shell-tabs]")).toContainText("More");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel("Open menu").click();
    await expect(page.getByRole("dialog")).toContainText("Organization Branding");
  });
});
