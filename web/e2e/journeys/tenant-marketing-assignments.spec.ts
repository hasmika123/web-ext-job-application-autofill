import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Marketing Assignments page against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing talent data (8 marketers,
 * 153 consultants, 141 assigned, 12 unassigned, 3 overloaded), Sarah Chen signed in through the Demo accounts tab. Run with
 * `playwright.real.config.ts` (docs/enterprise-v2/real-stack-runbook.md, `DEMO_ALLOW_WRITES=true`). The journey changes data and puts it back
 * (every change is undone), so it can be run again; the other tenant (Beta) must not see any of it.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-talent/built");

async function signIn(page: Page, host: string, who: string) {
  await page.goto(`${host}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const tile = (page: Page, key: string) => page.locator(`[data-kpi=${key}] [data-kpi-value]`);
const card = (page: Page, name: string) => page.locator("[data-marketer]", { hasText: name });
const tableRow = (page: Page, name: string | RegExp) => page.getByRole("table", { name: "Assigned consultants" }).getByRole("row", { name });

test.describe("marketing assignments (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await signIn(page, base, "Sarah Chen");
    await page.goto(`${base}/w/admin/marketing-assignments`);
    await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();

    // the four tiles are the seeded counts, never typed in
    await expect(tile(page, "assigned")).toHaveText("141");
    await expect(tile(page, "marketers")).toHaveText("8");
    await expect(tile(page, "unassigned")).toHaveText("12");
    await expect(tile(page, "overloaded")).toHaveText("3");
    await expect(page.locator("[data-kpi=assigned] [data-kpi-delta]")).toContainText("vs last month");
    await expect(page.locator("[data-help-bee]")).toContainText("Need help with marketing assignments?");

    // the marketers by load: Michael Park (29 / 30) first, Jessica Davis 28 / 30
    await expect(page.locator("[data-marketer]")).toHaveCount(8);
    await expect(page.locator("[data-marketer]").first()).toContainText("Michael Park");
    await expect(page.locator("[data-marketer]").first().locator("[data-load]")).toHaveText("29 / 30");
    await expect(card(page, "Jessica Davis").locator("[data-load]")).toHaveText("28 / 30");
    await expect(card(page, "Jessica Davis").locator("[data-percent]")).toHaveText("93%");
    await expect(page.locator("[data-summary=total]")).toHaveText("141");
    await expect(page.locator("[data-summary=overloaded]")).toHaveText("3");
    await expect(page.locator("[data-marketers-summary]")).toContainText("8 Marketing Specialists");

    // pick Jessica: her 28 consultants, 10 to a page, and the URL names her
    await card(page, "Jessica Davis").getByRole("button", { name: /Show their consultants/ }).click();
    await expect(page.locator("[data-consultants-subtitle]")).toHaveText("Consultants assigned to Jessica Davis (28 total)");
    await expect(page.getByRole("table", { name: "Assigned consultants" }).getByRole("row")).toHaveCount(11); // header + 10
    await expect(page.locator("[data-showing]")).toHaveText("1-10 of 28 consultants");
    await expect(page).toHaveURL(/[?&]m=\d+/);
    await page.screenshot({ path: resolve(shots, "marketing-assignments-1440.png") });

    // filter by priority; the link keeps the filter, and a reload opens on the same view
    await page.locator('[data-consultants-panel] [role=search] button[aria-label="Priority"]').click();
    await page.getByRole("option", { name: "High" }).click();
    await expect(page).toHaveURL(/priority=HIGH/);
    const high = await page.locator("[data-showing]").innerText();
    const highTotal = Number(/of (\d+)/.exec(high)![1]);
    expect(highTotal).toBeGreaterThan(0);
    expect(highTotal).toBeLessThan(28);
    await page.reload();
    await expect(page.locator("[data-consultants-subtitle]")).toHaveText("Consultants assigned to Jessica Davis (28 total)");
    await expect(page.locator("[data-showing]")).toContainText(`of ${highTotal}`);
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.locator("[data-showing]")).toHaveText("1-10 of 28 consultants");

    // search by a name from the table
    const first = await page.getByRole("table", { name: "Assigned consultants" }).getByRole("row").nth(1).locator("td").nth(1).locator("span.truncate.font-bold").first().innerText();
    await page.getByRole("searchbox", { name: "Search consultants" }).fill(first.split(" ")[0]);
    await expect(tableRow(page, new RegExp(first))).toBeVisible();
    await page.getByRole("searchbox", { name: "Search consultants" }).fill("");
    await expect(page.locator("[data-showing]")).toHaveText("1-10 of 28 consultants");

    // assign two unassigned consultants to David Kim (16 / 25), then Undo
    await card(page, "David Kim").getByRole("button", { name: /Show their consultants/ }).click();
    await expect(card(page, "David Kim").locator("[data-load]")).toHaveText("16 / 25");
    await page.getByRole("button", { name: "Assign Consultants" }).first().click();
    const dlg = page.getByRole("dialog", { name: /Assign consultants to David Kim/ });
    const boxes = dlg.getByRole("checkbox");
    await expect(boxes.first()).toBeVisible();
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(dlg.locator("[data-picked-count]")).toHaveText("2 selected");
    await dlg.getByRole("button", { name: "Assign 2 consultants" }).click();
    await expect(page.getByText("Assigned 2 consultants")).toBeVisible();
    await expect(card(page, "David Kim").locator("[data-load]")).toHaveText("18 / 25");
    await expect(tile(page, "unassigned")).toHaveText("10");
    await expect(tile(page, "assigned")).toHaveText("143");
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(page.getByText("Undone")).toBeVisible();
    await expect(card(page, "David Kim").locator("[data-load]")).toHaveText("16 / 25");
    await expect(tile(page, "unassigned")).toHaveText("12");

    // bulk: two ticked rows get High priority, then Undo
    const rowsBefore = await page.getByRole("table", { name: "Assigned consultants" }).getByRole("row").count();
    expect(rowsBefore).toBeGreaterThan(2);
    const checks = page.getByRole("table", { name: "Assigned consultants" }).getByRole("checkbox", { name: /^Select / });
    await checks.nth(0).check();
    await checks.nth(1).check();
    await page.getByRole("button", { name: /Bulk Actions/ }).click();
    await page.getByRole("menuitem", { name: "High" }).click();
    await expect(page.getByText(/Set high priority on \d+ consultants?/)).toBeVisible();
    // rows that were already High change nothing and offer no Undo; otherwise Undo puts them back
    const undo = page.getByRole("button", { name: "Undo" });
    if (await undo.count()) {
      await undo.last().click();
      await expect(page.getByText("Undone")).toBeVisible();
    }

    // over capacity: Michael Park is at 29 / 30; three more is a warning first, and nothing changes
    await card(page, "Michael Park").getByRole("button", { name: /Show their consultants/ }).click();
    await page.getByRole("button", { name: "Assign Consultants" }).first().click();
    const over = page.getByRole("dialog", { name: /Assign consultants to Michael Park/ });
    const ob = over.getByRole("checkbox");
    await expect(ob.first()).toBeVisible();
    await ob.nth(0).check();
    await ob.nth(1).check();
    await expect(over.locator("[data-capacity-warning]")).toContainText("would have 31 of 30 consultants, 1 over");
    await over.getByRole("button", { name: "Assign 2 consultants" }).click();
    await expect(over.locator("[data-over-capacity]")).toContainText("over capacity");
    await expect(over.getByRole("button", { name: "Assign anyway" })).toBeVisible();
    await over.getByRole("button", { name: "Cancel" }).click();
    await expect(card(page, "Michael Park").locator("[data-load]")).toHaveText("29 / 30");

    // the workload report
    await page.getByRole("button", { name: /View Workload Report/ }).click();
    await expect(page.getByRole("table", { name: "Workload by marketer" })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).last().click();

    // another organization cannot read Acme's board
    const orgId = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await signIn(beta, `http://beta.localhost:${port}`, "Bea Turner");
    for (const path of ["/marketers", "/kpis", "/consultants", "/workload", "/filters", "/marketers/candidates"]) {
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/marketing-assignments${path}`);
      expect(status, path).toBe(404);
    }
    // and Beta's own board shows Beta's marketers only
    await beta.goto(`http://beta.localhost:${port}/w/admin/marketing-assignments`);
    await expect(beta.locator("[data-marketing-assignments-page]")).toBeVisible();
    await expect(beta.locator("[data-marketer]")).toHaveCount(3);
    await expect(beta.locator("[data-marketers-panel]")).not.toContainText("Jessica Davis");
    await expect(beta.locator("[data-marketers-panel]")).toContainText("Priya Nair");
    await betaCtx.close();

    // a phone: the panels stack, the table becomes cards, nothing scrolls sideways
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/w/admin/marketing-assignments`);
    await expect(page.locator("[data-marketer]").first()).toBeVisible();
    await expect(page.locator("[data-consultants-panel] li").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: resolve(shots, "marketing-assignments-390.png"), fullPage: true });
  });
});
