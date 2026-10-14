import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The ten consultant pages after Home (Profile, Resumes, Marketer, Job Discovery, Job Matches, Applications, Interviews, Interview Prep, Submissions, Assigned Opportunities) against the REAL stack: Anika Rao
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
];

async function signInAs(page: Page, who: string) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

test.describe("consultant pages (real stack)", () => {
  for (const p of PAGES) {
    test(`${p.slug}: Anika's own page at 1440 and 390`, async ({ page }) => {
      mkdirSync(shots, { recursive: true });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInAs(page, "Anika Rao");
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
      expect(errors, "uncaught page errors").toEqual([]);
    });
  }

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
