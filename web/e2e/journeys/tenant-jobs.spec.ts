import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Jobs page against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing job board (24 jobs, 13 open), Sarah Chen
 * signed in through the Demo accounts tab. Run with `playwright.real.config.ts` (docs/enterprise-v2/real-stack-runbook.md) and the talent demo
 * data on (`DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true`). The journey writes (it creates a job, changes a status, assigns one
 * consultant): reset the database to run it again from the seed.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const betaBase = `http://beta.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-talent/built");

async function signIn(page: Page, host: string, person: string) {
  await page.goto(`${host}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${person}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const rows = (page: Page) => page.locator("li[data-row-id]");

test.describe("jobs (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await signIn(page, base, "Sarah Chen");
    await page.goto(`${base}/w/admin/jobs`);
    await expect(page.locator("[data-jobs-page]")).toBeVisible();

    // the four tiles come from the seeded rows
    const kpi = (k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
    await expect(kpi("openJobs")).toHaveText("13");
    await expect(kpi("newThisWeek")).toHaveText("6");
    await expect(page.locator("[data-kpi=openJobs] [data-kpi-delta]")).toContainText("vs last month");
    await expect(rows(page)).toHaveCount(10);
    await expect(page.locator("[data-showing]")).toHaveText("1-10 of 24 jobs");
    await page.screenshot({ path: resolve(shots, "jobs-list.png") });

    // filter by status through the dropdown: the address and the count follow
    await page.locator('[data-filters] button[aria-label="Status"]').click();
    await page.getByRole("option", { name: /^Open \(/ }).click();
    await expect(page.locator("[data-showing]")).toHaveText("1-10 of 13 jobs");
    expect(page.url()).toContain("status=OPEN");
    // search narrows further (and a shared link would reproduce it)
    await page.getByLabel("Search jobs").fill("react");
    await expect(page.locator("[data-showing]")).not.toHaveText("1-10 of 13 jobs");
    const filteredCount = await rows(page).count();
    expect(filteredCount).toBeGreaterThan(0);
    await expect(rows(page).first()).toContainText(/react/i);
    const filteredUrl = page.url();
    expect(filteredUrl).toContain("q=react");

    // open the first job: the drawer, its URL and its top matches
    await rows(page).first().click();
    const drawer = page.locator("[data-detail-body]");
    await expect(drawer).toBeVisible();
    expect(page.url()).toContain("job=");
    const jobId = await drawer.getAttribute("data-job-id");
    await expect(drawer.locator("[data-top-matches] [data-match-row]").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "jobs-drawer.png") });

    // a link to the filtered view with the drawer open reproduces it in a fresh page
    const fresh = await page.context().newPage();
    await fresh.goto(page.url());
    await expect(fresh.locator("[data-detail-body]")).toBeVisible();
    await expect(fresh.locator('[data-filters] button[aria-label="Status"]')).toContainText("Open");
    await fresh.close();

    // one mutation: assign the best SUGGESTED match, the application code comes back and the match shows as assigned
    const assign = drawer.getByRole("button", { name: /^Assign / }).first();
    await expect(assign).toBeVisible();
    await assign.click();
    await expect(page.locator("[data-match-assigned]").first()).toContainText("APP-");
    await expect(page.getByText(/assigned$/).first()).toBeVisible();
    await page.getByRole("tab", { name: /Submissions/ }).click();
    await expect(page.locator("[data-submissions-list] li").first()).toBeVisible();

    // status from the drawer autosaves, and Undo puts it back
    await page.getByRole("tab", { name: "Overview" }).click();
    await drawer.getByRole("button", { name: "Status" }).click();
    await page.getByRole("option", { name: "On Hold" }).click();
    await expect(page.getByText("Status is now On Hold")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone")).toBeVisible();
    await expect(drawer.locator("[data-job-status], button[aria-label=Status]").first()).toContainText("Open");

    // create a job: it opens in the drawer and the list shows it first
    await page.locator("[data-clear-filters]").click();
    await page.getByRole("button", { name: /Create Job/ }).click();
    await page.getByLabel(/Job title/).fill("Journey Platform Engineer");
    await page.locator("[data-create-form]").getByRole("button", { name: "Choose a client" }).click();
    await page.getByRole("option").first().click();
    await page.locator("[data-create-submit]").click();
    await expect(page.getByText("Journey Platform Engineer was created")).toBeVisible();
    await expect(page.locator("[data-detail-body] h1, [data-detail-body]").first()).toBeVisible();
    await expect(rows(page).first()).toContainText("Journey Platform Engineer");
    await expect(kpi("newThisWeek")).toHaveText("7");
    await page.screenshot({ path: resolve(shots, "jobs-created.png") });

    // a phone gets cards and a bottom sheet
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/w/admin/jobs`);
    await expect(rows(page).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(shots, "jobs-phone.png") });
    await rows(page).first().click();
    await expect(page.locator("#ent-job-sheet")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "jobs-phone-sheet.png") });
    expect(jobId).toBeTruthy();

    // the other tenant: Beta sees only its own jobs, and Acme's ids are the generic 404 through either organization
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await signIn(beta, betaBase, "Bea Turner");
    await beta.goto(`${betaBase}/w/admin/jobs`);
    await expect(beta.locator("[data-jobs-page]")).toBeVisible();
    await expect(rows(beta).first()).toBeVisible();
    await expect(beta.locator("[data-jobs-page]")).not.toContainText("Journey Platform Engineer");
    const out = await beta.evaluate(async (acmeJob) => {
      const me = (await (await fetch("/api/me/tenant")).json()) as { org: { id: number } };
      const mine = (await (await fetch(`/api/orgs/${me.org.id}/jobs?size=100`)).json()) as { total: number; items: { title: string }[] };
      const acmeOrg = me.org.id === 1 ? 2 : 1;
      const viaOwn = await fetch(`/api/orgs/${me.org.id}/jobs/${acmeJob}`);
      const viaAcme = await fetch(`/api/orgs/${acmeOrg}/jobs`);
      const create = await fetch(`/api/orgs/${acmeOrg}/jobs/bulk/status`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ ids: [Number(acmeJob)], status: "CLOSED" }) });
      return { total: mine.total, titles: mine.items.map((i) => i.title), viaOwn: viaOwn.status, viaAcme: viaAcme.status, bulk: create.status };
    }, jobId!);
    expect(out.total).toBeGreaterThan(0);
    expect(out.titles).not.toContain("Journey Platform Engineer");
    expect(out.viaOwn).toBe(404);
    expect(out.viaAcme).toBe(404);
    expect(out.bulk).toBe(404);
    await betaCtx.close();
  });
});
