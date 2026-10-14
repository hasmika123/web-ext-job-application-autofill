import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/**
 * The eighteen consultant pages after Home (all the sidebar pages the boards cover) against the REAL stack: Anika Rao
 * (Consultant) signs in through the Demo accounts tab; each page loads its data (status=ready), shows its own cards at 1440 and does not
 * scroll sideways at 390; an Org Admin is not shown them and the API answers 404. Run with `playwright.real.consultant.config.ts`.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-consultant/built");

const PAGES = [
  { slug: "profile", root: "[data-consultant-profile]", api: "profile" },
  { slug: "resumes", root: "[data-consultant-resumes]", api: "resumes" },
  { slug: "marketer", root: "[data-consultant-marketer]", api: "marketer" },
  { slug: "job-discovery", root: "[data-job-discovery]", api: "job-discovery/overview" },
  { slug: "matches", root: "[data-consultant-matches]", api: "matches" },
  { slug: "applications", root: "[data-consultant-applications]", api: "applications" },
  { slug: "interviews", root: "[data-consultant-interviews]", api: "interviews" },
  { slug: "interview-prep", root: "[data-consultant-interview-prep]", api: "interview-prep" },
  { slug: "submissions", root: "[data-consultant-submissions]", api: "submissions" },
  { slug: "opportunities", root: "[data-consultant-opportunities]", api: "opportunities" },
  { slug: "tasks", root: "[data-consultant-tasks]", api: "tasks" },
  { slug: "availability", root: "[data-consultant-availability]", api: "availability" },
  { slug: "offers", root: "[data-consultant-offers]", api: "offers" },
  { slug: "placements", root: "[data-consultant-placements]", api: "placements" },
  { slug: "notifications", root: "[data-consultant-notifications]", api: "notifications" },
  { slug: "activity-timeline", root: "[data-consultant-activity-timeline]", api: "activity-timeline" },
  { slug: "features", root: "[data-consultant-features]", api: "features" },
  { slug: "settings", root: "[data-consultant-settings]", api: "settings" },
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
    test(`${p.slug}: Anika's own page at 1440 and 390`, async ({ browser }) => {
      mkdirSync(shots, { recursive: true });
      const context = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/w/consultant/${p.slug}`);
      const root = page.locator(`${p.root}[data-status=ready]`);
      await expect(root).toBeVisible();
      await page.screenshot({ path: resolve(shots, `${p.slug}-1440.png`), fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(root).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${p.slug} scrolls sideways on a phone`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: resolve(shots, `${p.slug}-390.png`), fullPage: true });
      await context.close();
      expect(errors, "uncaught page errors").toEqual([]);
    });
  }

  test("the sidebar lists all 19 pages in the boards' order and each one opens", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/w/consultant`);
    await expect(page.locator("[data-consultant-home][data-status=ready]")).toBeVisible();
    const items = page.locator('aside a[href^="/w/consultant"]');
    await expect(items.filter({ hasText: /\S/ })).toHaveCount(19);
    const labels = (await items.allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    expect(labels).toEqual([
      "Home", "My Career Profile", "My Resumes", "My Marketer", "Job Discovery", "Job Matches", "Assigned Opportunities", "My Applications",
      "Submissions & Approvals", "Interviews", "Interview Prep", "Offers", "My Placement", "Availability", "Tasks & Follow-ups", "Activity Timeline",
      "My Features", "Notifications", "Settings",
    ]);
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
      await page.goto(`${base}/w/consultant/${p.slug}`);
      await expect(page.locator(p.root)).toHaveCount(0);
    }
  });
});
