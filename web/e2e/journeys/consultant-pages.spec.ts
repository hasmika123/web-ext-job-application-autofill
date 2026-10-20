import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/**
 * The consultant pages after Home (every sidebar page, and every `?tab=` view of the merged Opportunities, Interviews, Activity and
 * Settings pages) against the REAL stack: Anika Rao (Consultant) signs in through the Demo accounts tab; each view loads its data
 * (status=ready), shows its own cards at 1440 and does not scroll sideways at 390; an Org Admin is not shown them and the API answers 404.
 * Run with `playwright.real.consultant.config.ts`.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-consultant/built");

/** `name` names the test and the screenshot (no `?` in a file name); `path` is what follows `/w/consultant/`. */
const PAGES = [
  { name: "profile", path: "profile", root: "[data-consultant-profile]", api: "profile" },
  { name: "resumes", path: "resumes", root: "[data-consultant-resumes]", api: "resumes" },
  { name: "availability", path: "availability", root: "[data-consultant-availability]", api: "availability" },
  { name: "opportunities", path: "opportunities", root: "[data-consultant-opportunities]", api: "opportunities" },
  { name: "opportunities-matches", path: "opportunities?tab=matches", root: "[data-consultant-matches]", api: "matches" },
  { name: "opportunities-browse", path: "opportunities?tab=browse", root: "[data-job-discovery]", api: "job-discovery/overview" },
  { name: "submissions", path: "submissions", root: "[data-consultant-submissions]", api: "submissions" },
  { name: "applications", path: "applications", root: "[data-consultant-applications]", api: "applications" },
  { name: "interviews", path: "interviews", root: "[data-consultant-interviews]", api: "interviews" },
  { name: "interviews-prepare", path: "interviews?tab=prepare", root: "[data-consultant-interview-prep]", api: "interview-prep" },
  { name: "offers", path: "offers", root: "[data-consultant-offers]", api: "offers" },
  { name: "placements", path: "placements", root: "[data-consultant-placements]", api: "placements" },
  { name: "tasks", path: "tasks", root: "[data-consultant-tasks]", api: "tasks" },
  { name: "activity", path: "activity", root: "[data-consultant-notifications]", api: "notifications" },
  { name: "activity-timeline", path: "activity?tab=timeline", root: "[data-consultant-activity-timeline]", api: "activity-timeline" },
  { name: "inbox", path: "inbox", root: "[data-consultant-inbox]", api: "inbox" },
  { name: "marketer", path: "marketer", root: "[data-consultant-marketer]", api: "marketer" },
  { name: "settings", path: "settings", root: "[data-consultant-settings]", api: "settings" },
  { name: "settings-features", path: "settings?tab=features", root: "[data-consultant-features]", api: "features" },
];

async function signInAs(page: Page, who: string) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

/** One demo sign-in for the whole file: the login page's demo-account list is rate-limited, and 20+ sign-ins in a few minutes trip it. */
const STATE = resolve(mkdtempSync(resolve(tmpdir(), "cws-pw-")), "anika.json");

test.describe("consultant pages (real stack)", () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInAs(page, "Anika Rao");
    await ctx.storageState({ path: STATE });
    await ctx.close();
  });

  for (const p of PAGES) {
    test(`${p.name}: Anika's own page at 1440 and 390`, async ({ browser }) => {
      mkdirSync(shots, { recursive: true });
      const context = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/w/consultant/${p.path}`);
      const root = page.locator(`${p.root}[data-status=ready]`);
      await expect(root).toBeVisible();
      await page.screenshot({ path: resolve(shots, `${p.name}-1440.png`), fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(root).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${p.name} scrolls sideways on a phone`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: resolve(shots, `${p.name}-390.png`), fullPage: true });
      await context.close();
      expect(errors, "uncaught page errors").toEqual([]);
    });
  }

  test("the sidebar lists all 15 pages in the menu's order", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/w/consultant`);
    await expect(page.locator("[data-consultant-home][data-status=ready]")).toBeVisible();
    const items = page.locator('aside nav[aria-label="Main"] a[href^="/w/consultant"]'); // the menu only (the brand link above it also points at the Home)
    await expect(items.filter({ hasText: /\S/ })).toHaveCount(15);
    const labels = (await items.allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    expect(labels).toEqual([
      "Home", "My Profile", "My Resumes", "Availability", "Opportunities", "Submissions", "My Applications", "Interviews", "Offers",
      "My Placement", "Tasks", "Activity", "Email Tracking", "My Marketer", "Settings",
    ]);
    await context.close();
  });

  test("the old addresses of the merged pages open their tab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const moved: [string, RegExp][] = [
      ["job-discovery", /\/w\/consultant\/opportunities\?tab=browse$/],
      ["matches", /\/w\/consultant\/opportunities\?tab=matches$/],
      ["interview-prep", /\/w\/consultant\/interviews\?tab=prepare$/],
      ["activity-timeline", /\/w\/consultant\/activity\?tab=timeline$/],
      ["notifications", /\/w\/consultant\/activity\?tab=attention$/],
      ["features", /\/w\/consultant\/settings\?tab=features$/],
    ];
    for (const [old, now] of moved) {
      await page.goto(`${base}/w/consultant/${old}`);
      await expect(page).toHaveURL(now);
    }
    await context.close();
  });

  test("Ben (on a project) sees his active placement, with no rate or amount anywhere", async ({ browser }) => {
    mkdirSync(shots, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await signInAs(page, "Ben Okafor");
    await page.goto(`${base}/w/consultant/placements`);
    await expect(page.locator("[data-consultant-placements][data-status=ready]")).toBeVisible();
    await expect(page.locator("[data-no-placement]")).toHaveCount(0);
    await expect(page.locator("[data-milestone]").first()).toBeVisible();
    await expect(page.locator("[data-meeting]").first()).toBeVisible();
    const text = await page.locator("[data-consultant-placements]").innerText();
    expect(text, "a consultant never sees a bill rate").not.toMatch(/\$\s?\d|per hour|\/hr|bill rate/i);
    await page.screenshot({ path: resolve(shots, "placements-ben-1440.png"), fullPage: true });
    await context.close();
  });

  test("an Org Admin gets 404 from every consultant API and no page", async ({ page }) => {
    await signInAs(page, "Sarah Chen");
    const statuses = await page.evaluate(async (paths) => {
      const org = ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id;
      return Promise.all(paths.map(async (p) => (await fetch(`/api/orgs/${org}/me-workspace/${p}`)).status));
    }, PAGES.map((p) => p.api));
    expect(statuses.every((s) => s === 404)).toBe(true);
    for (const p of PAGES) {
      await page.goto(`${base}/w/consultant/${p.path}`);
      await expect(page.locator(p.root)).toHaveCount(0);
    }
  });
});
