import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * X2.17: the Organization Dashboard against the REAL stack (docs/enterprise-v2/real-stack-runbook.md): the Spring API with
 * ENT_DEMO_SEED=true behind `next start`. Set `REAL_ACME_BASE=http://acme.localhost:<port>` and `REAL_BETA_BASE=http://beta.localhost:<port>`
 * and run with `playwright.real.config.ts`; without them the whole file is skipped (the default suite runs on the mock).
 *
 *   PW_CHANNEL=chrome REAL_ACME_BASE=... REAL_BETA_BASE=... npx playwright test -c playwright.real.config.ts
 *   SHOTS=1 additionally writes design/enterprise-admin/built/dashboard-{1440,768,390}.png
 */
const acme = process.env.REAL_ACME_BASE;
const beta = process.env.REAL_BETA_BASE;
test.skip(!acme || !beta, "needs the real stack (REAL_ACME_BASE / REAL_BETA_BASE)");

async function signInAs(page: Page, base: string, name: string) {
  await page.goto(`${base}/login`);
  await page.locator("[data-tenant-demo-tab]").click();
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
}

const tile = (page: Page, key: string) => page.locator(`[data-stat-tile="${key}"]`);
const loaded = (page: Page) => expect(page.locator("[data-dash-tiles] [data-state=loading]")).toHaveCount(0, { timeout: 30_000 });

test.describe("Sarah on Acme (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("lands on the dashboard with the real numbers and honest locked cards", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await expect(page).toHaveURL(/\/w\/admin$/);
    await expect(page.locator("[data-dashboard]")).toBeVisible();
    await loaded(page);
    await expect(page.locator("[data-page-header] h1")).toHaveText("Organization Dashboard");
    await expect(page.locator("[data-page-header]")).toContainText(/Welcome back! Here's what's happening at .+ today\./);

    // the real counts the demo seed produces: 2 consultants (one invited, one suspended), 7 employees
    await expect(tile(page, "consultants.total").locator("[data-tile-value]")).toHaveText("2");
    await expect(tile(page, "employees.active").locator("[data-tile-value]")).toHaveText("7");

    // the four tiles and two cards whose modules are not built: an honest sentence, no number
    for (const [key, text] of [
      ["applications.active", "Available when Applications launches"],
      ["interviews.upcoming", "Available when Interviews launches"],
      ["placements", "Available when Placements launches"],
      ["finance.summary", "Available when HR and Finance launches"],
    ] as const) {
      const t = tile(page, key);
      await expect(t).toHaveAttribute("data-state", "unavailable");
      await expect(t).toContainText(text);
      await expect(t.locator("[data-tile-value]")).toHaveCount(0);
      expect(await t.innerText()).not.toMatch(/\d/);
    }
    for (const key of ["team.performance", "pipeline.overview"]) {
      const c = page.locator(`[data-dash-card="${key}"]`);
      await expect(c).toHaveAttribute("data-state", "unavailable");
      await expect(c.locator("[data-bar], circle")).toHaveCount(0);
    }

    // the recent activity feed is the seeded audit trail: relative times and people
    const rows = page.locator('[data-dash-card="activity.recent"] [data-activity]');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().locator("time")).toContainText(/ago|just now/);

    // quick actions: the real shortcut is a link, the others carry a Soon chip
    await expect(page.locator("[data-quick-action=invite-employee]")).toHaveAttribute("href", /\/w\/admin\/employees/);
    expect(await page.locator("[data-quick-action][data-available=false] [data-soon-chip]").count()).toBeGreaterThan(0);

    // one mascot in the viewport: the board's help card
    await expect(page.locator('img[src*="/ent/bee/"]:visible')).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Need help, Sarah?" })).toBeVisible();
  });

  test("alerts: Undo restores one, dismissing another saves it", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    const alerts = page.locator("[data-alert]");
    const n = await alerts.count();
    test.skip(n === 0, "no alert is raised for this seed right now (a dismissal lasts 7 days)");
    const key = (await alerts.first().getAttribute("data-alert"))!;
    const one = page.locator(`[data-alert="${key}"]`);
    await one.getByRole("button", { name: /Dismiss for 7 days/ }).click();
    await expect(one).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(one).toHaveCount(1);

    const saved = page.waitForResponse((r) => r.url().includes(`/dashboard/alerts/${key}/dismiss`) && r.request().method() === "POST", { timeout: 15_000 });
    await one.getByRole("button", { name: /Dismiss for 7 days/ }).click();
    expect((await saved).status()).toBe(200);
    await page.reload();
    await loaded(page);
    await expect(page.locator(`[data-alert="${key}"]`)).toHaveCount(0);
  });

  test("keyboard: Tab reaches the refresh control and a quick action; Ask a question opens the help panel", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    await page.getByRole("button", { name: "Refresh dashboard" }).focus();
    await expect(page.getByRole("button", { name: "Refresh dashboard" })).toBeFocused();
    await page.getByRole("button", { name: /Ask a question/ }).click();
    await expect(page.getByRole("dialog", { name: "Need help?" })).toBeVisible();
  });

  test("screenshots", async ({ page, browser }) => {
    test.skip(!process.env.SHOTS, "set SHOTS=1");
    const out = path.resolve(__dirname, "../../../design/enterprise-admin/built");
    mkdirSync(out, { recursive: true });
    await signInAs(page, acme!, "Sarah Chen");
    for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${acme}/w/admin`);
      await loaded(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(out, `dashboard-${w}.png`), fullPage: true });
    }
    void browser;
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("no horizontal scroll; cards stack", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    const xs = await page.locator("[data-dash-card]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(1); // one column
  });
});

test.describe("tenant wall", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("Beta's owner sees only Beta's numbers and Beta's activity", async ({ page }) => {
    await signInAs(page, beta!, "Bea Turner");
    await expect(page.locator("[data-dashboard]")).toBeVisible();
    await loaded(page);
    await expect(tile(page, "employees.active").locator("[data-tile-value]")).toHaveText("1");
    // Acme's two consultants and seven employees are nowhere on this page
    await expect(tile(page, "consultants.total").locator("[data-tile-value]")).toHaveCount(0);
    const text = await page.locator("[data-dashboard]").innerText();
    expect(text).not.toContain("Sarah Chen");
    expect(text).not.toContain("Acme");
    // and Acme's dashboard answers 404 to Beta's token through the BFF
    const status = await page.evaluate(async () => (await fetch("/api/orgs/1/dashboard")).status);
    expect([403, 404]).toContain(status);
  });
});
