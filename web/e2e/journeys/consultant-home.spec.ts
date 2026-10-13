import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Consultant Home against the REAL stack: Anika Rao (Consultant) signed in through the Demo accounts tab sees HER pipeline (the
 * demo seed gives the linked consultants matches, applications, three interviews and tasks), Sarah (Org Admin) does not get the
 * workspace, and another tenant's host cannot read Acme's data. Run with `playwright.real.consultant.config.ts`.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-consultant/built");

async function signInAs(page: Page, who: string) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

test.describe("consultant home (real stack)", () => {
  test("Anika sees her own home at 1440", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, "Anika Rao");
    await expect(page).toHaveURL(/\/w\/consultant$/);
    await expect(page.locator("[data-consultant-home][data-status=ready]")).toBeVisible();

    for (const key of ["jobMatches", "assignedOpportunities", "activeApplications", "upcomingInterviews", "submissionsPending", "activePlacement"]) {
      await expect(page.locator(`[data-stat-tile=${key}] [data-tile-value]`)).toBeVisible();
    }
    await expect(page.locator("[data-stat-tile=upcomingInterviews] [data-tile-value]")).toHaveText("3");
    await expect(page.locator("[data-stat-tile=submissionsPending] [data-sample]")).toBeVisible(); // honest: placeholder, marked

    for (const id of ["home-matches", "home-assigned", "home-applications", "home-interviews", "home-resume", "home-tasks", "home-focus", "home-quick", "home-messages", "help"]) {
      await expect(page.locator(`[data-home-card=${id}]`)).toBeVisible();
    }
    await expect(page.locator("[data-interview]")).toHaveCount(3);
    await expect(page.locator("[data-home-card=home-tasks] [data-task]").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "home-1440.png"), fullPage: true });
  });

  test("a phone does not scroll sideways", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, "Anika Rao");
    await expect(page.locator("[data-consultant-home][data-status=ready]")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: resolve(shots, "home-390.png"), fullPage: true });
  });

  test("an Org Admin is not shown the consultant home, and the API says 404 to them", async ({ page }) => {
    await signInAs(page, "Sarah Chen");
    await page.goto(`${base}/w/consultant`);
    await expect(page.locator("[data-consultant-home]")).toHaveCount(0);
    const status = await page.evaluate(async () => {
      const org = ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id;
      return (await fetch(`/api/orgs/${org}/me-workspace/home`)).status;
    });
    expect(status).toBe(404);
  });

  test("beta.localhost cannot read Acme's consultant data", async ({ page }) => {
    await signInAs(page, "Anika Rao");
    const org = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const res = await page.goto(`http://beta.localhost:${port}/api/orgs/${org}/me-workspace/home`); // the browser resolves *.localhost, Node's client does not
    expect([401, 403, 404]).toContain(res?.status());
    await page.goto(`http://beta.localhost:${port}/w/consultant`);
    await expect(page.locator("[data-consultant-home]")).toHaveCount(0);
  });
});
