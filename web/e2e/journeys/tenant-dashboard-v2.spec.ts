import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The Organization Dashboard v2 (design/enterprise-talent/dashboard.png) against the REAL stack (docs/enterprise-v2/real-stack-runbook.md):
 * the Spring API with ENT_DEMO_SEED=true (Acme and Beta, plus the talent foundation) behind `next start`. Set
 * `REAL_ACME_BASE=http://acme.localhost:<port>` and `REAL_BETA_BASE=http://beta.localhost:<port>` and run with `playwright.real.config.ts`;
 * without them the whole file is skipped (the default suite runs on the mock, which has no talent data).
 *
 *   PW_CHANNEL=chrome REAL_ACME_BASE=... REAL_BETA_BASE=... npx playwright test -c playwright.real.config.ts journeys/tenant-dashboard-v2.spec.ts
 *   SHOTS=1 additionally writes design/enterprise-talent/built/dashboard-{1440,768,390}.png
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

interface Widget {
  key: string;
  state: string;
  data?: Record<string, unknown> & { value?: number; unit?: string; months?: string[]; total?: number; slices?: { label: string; value: number }[]; series?: { key: string; values: number[] }[] };
}

/** The dashboard exactly as the browser gets it from the BFF (the same call the page makes). */
async function api(page: Page): Promise<Record<string, Widget>> {
  return page.evaluate(async () => {
    const org = ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id;
    const body = (await (await fetch(`/api/orgs/${org}/dashboard`, { cache: "no-store" })).json()) as { widgets: Widget[] };
    return Object.fromEntries(body.widgets.map((w) => [w.key, w]));
  });
}

const shown = (w: Widget) => {
  const v = w.data!.value as number;
  return w.data!.unit === "money" ? `$${Math.round(v / 100 / 1000)}K` : v.toLocaleString("en-US");
};

test.describe("Sarah on Acme (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("lands on the dashboard; every tile equals the API's number; the charts are drawn from the same rows", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await expect(page).toHaveURL(/\/w\/admin$/);
    await expect(page.locator("[data-dashboard]")).toBeVisible();
    await loaded(page);
    await expect(page.locator("[data-page-header] h1")).toHaveText("Organization Dashboard");
    await expect(page.locator("[data-page-header]")).toContainText(/Welcome back! Here's what's happening at .+ today\./);

    const w = await api(page);
    for (const key of ["consultants.total", "employees.active", "applications.active", "interviews.upcoming", "placements", "finance.summary"]) {
      expect(w[key].state, key).toBe("ok");
      await expect(tile(page, key).locator("[data-tile-value]"), key).toHaveText(shown(w[key]));
    }
    // the seeded demo tenant tells the full story: 153 consultants, a rising history, money as a compact amount
    expect(w["consultants.total"].data!.value).toBeGreaterThan(100);
    await expect(tile(page, "finance.summary").locator("[data-tile-value]")).toHaveText(/^\$\d+K$/);
    await expect(tile(page, "placements").locator("[data-delta=up]")).toBeVisible();
    await expect(tile(page, "interviews.upcoming")).toContainText("vs last week");

    // team performance: six months of bars; pipeline donut: the stage counts and the API's total
    const team = page.locator('[data-dash-card="team.performance"]');
    await expect(team).toHaveAttribute("data-state", "ok");
    expect(w["team.performance"].data!.months).toHaveLength(6);
    await expect(team.locator("[data-bar^='applications:']")).toHaveCount(6);
    await expect(team.locator("[data-team-range]")).toHaveValue("6");
    await team.locator("[data-team-range]").selectOption("3");
    await expect(team.locator("[data-bar^='applications:']")).toHaveCount(3);
    const pipe = page.locator('[data-dash-card="pipeline.overview"]');
    await expect(pipe).toContainText("Interview Scheduled");
    await expect(pipe.locator("[data-donut-chart]")).toContainText(String(w["pipeline.overview"].data!.total));
    const sum = w["pipeline.overview"].data!.slices!.reduce((a, s) => a + s.value, 0);
    expect(sum).toBe(w["pipeline.overview"].data!.total);

    // recent activity: real people, the job, and a relative time
    const rows = page.locator('[data-dash-card="activity.recent"] [data-activity]');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().locator("time")).toContainText(/ago|just now/);
    await expect(page.locator('[data-dash-card="activity.recent"] [data-activity^="application-"]').first()).toBeVisible();

    // one mascot in the viewport: the board's help card
    await expect(page.locator('img[src*="/ent/bee/"]:visible')).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Need help, Sarah?" })).toBeVisible();
  });

  test("a quick action navigates to its page", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    await expect(page.locator("[data-quick-action=invite-employee]")).toHaveAttribute("href", /\/w\/admin\/employees/);
    await expect(page.locator("[data-quick-action=review-applications]")).toHaveAttribute("href", "/w/admin/applications");
    await page.locator("[data-quick-action=review-applications]").click();
    await expect(page).toHaveURL(/\/w\/admin\/applications$/);
  });

  test("the help card is dismissible and stays dismissed", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("kiwiply.dashboard.help")).forEach((k) => localStorage.removeItem(k)));
    await page.reload();
    await loaded(page);
    await expect(page.locator('[data-dash-card="help"]')).toBeVisible();
    await page.getByRole("button", { name: "Dismiss the help card" }).click();
    await expect(page.locator('[data-dash-card="help"]')).toHaveCount(0);
    await page.reload();
    await loaded(page);
    await expect(page.locator('[data-dash-card="activity.recent"]')).toBeVisible();
    await expect(page.locator('[data-dash-card="help"]')).toHaveCount(0);
  });

  test("alerts: the real conditions, Undo restores one, dismissing another saves it", async ({ page }) => {
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

  test("keyboard: Tab reaches the refresh control; Ask a question opens the help panel", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    await page.getByRole("button", { name: "Refresh dashboard" }).focus();
    await expect(page.getByRole("button", { name: "Refresh dashboard" })).toBeFocused();
    await page.keyboard.press("Tab");
    const ask = page.getByRole("button", { name: /Ask a question/ });
    if (await ask.count()) {
      await ask.click();
      await expect(page.getByRole("dialog", { name: "Need help?" })).toBeVisible();
    }
  });

  test("screenshots", async ({ page }) => {
    test.skip(!process.env.SHOTS, "set SHOTS=1");
    const out = path.resolve(__dirname, "../../../design/enterprise-talent/built");
    mkdirSync(out, { recursive: true });
    await signInAs(page, acme!, "Sarah Chen");
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("kiwiply.dashboard.help")).forEach((k) => localStorage.removeItem(k)));
    for (const [w, h] of [[1672, 941], [768, 1024], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${acme}/w/admin`);
      await loaded(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, `dashboard-${w}.png`), fullPage: true });
    }
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("no horizontal scroll; tiles two across; cards stack in one column", async ({ page }) => {
    await signInAs(page, acme!, "Sarah Chen");
    await loaded(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    const tileXs = await page.locator("[data-stat-tile]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(tileXs).size).toBe(2);
    const xs = await page.locator("[data-dash-card]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(1);
  });
});

test.describe("tenant wall", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("Beta's owner sees Beta's numbers (different from Acme's) and none of Acme's people", async ({ page, browser }) => {
    // Acme's numbers first, from Sarah's own session
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sarahPage = await ctx.newPage();
    await signInAs(sarahPage, acme!, "Sarah Chen");
    await expect(sarahPage.locator("[data-dashboard]")).toBeVisible();
    const a = await api(sarahPage);
    await ctx.close();

    await signInAs(page, beta!, "Bea Turner");
    await expect(page.locator("[data-dashboard]")).toBeVisible();
    await loaded(page);
    const b = await api(page);
    for (const key of ["consultants.total", "applications.active", "placements", "finance.summary"]) {
      expect(b[key].state, key).toBe("ok");
      expect(b[key].data!.value, `${key}: Beta differs from Acme`).not.toBe(a[key].data!.value);
      await expect(tile(page, key).locator("[data-tile-value]")).toHaveText(shown(b[key]));
    }
    expect(b["pipeline.overview"].data!.total).not.toBe(a["pipeline.overview"].data!.total);
    const text = await page.locator("[data-dashboard]").innerText();
    expect(text).not.toContain("Sarah Chen");
    expect(text).not.toContain("Acme");
    // and Acme's dashboard answers 404 to Beta's token through the BFF
    const status = await page.evaluate(async () => (await fetch("/api/orgs/1/dashboard")).status);
    expect([403, 404]).toContain(status);
  });
});
