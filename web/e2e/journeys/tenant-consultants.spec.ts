import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Consultants page and its drawer against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing directory (153 consultants),
 * Sarah Chen signed in through the Demo accounts tab. Run with `playwright.real.config.ts` (docs/enterprise-v2/real-stack-runbook.md,
 * docs/enterprise-v2/page-consultants.md). The journey adds one consultant and deactivates it again (a fresh name each run, so it can be re-run).
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

const rowsOf = (page: Page) => page.locator("tr[data-row-id]");
const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
const num = async (page: Page, k: string) => Number((await kpi(page, k).innerText()).replace(/,/g, ""));
/** The list header's "153 consultants" (the page has no Total tile since the UI refresh). */
const count = async (page: Page) => Number((await page.locator("[data-consultant-count]").innerText()).replace(/[^\d]/g, ""));

test.describe("consultants (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await signIn(page, base, "Sarah Chen");

    // the sidebar lists Consultants and the page opens from it
    await page.getByRole("link", { name: "Consultants", exact: true }).first().click();
    await page.waitForURL(/\/w\/admin\/consultants/);
    await expect(page.locator("[data-consultants-page]")).toBeVisible();
    await expect(rowsOf(page)).toHaveCount(10);

    // the real counts of the seed: three plain tiles and the count in the list header
    await expect(page.locator("[data-consultant-count]")).toHaveText(/^[\d,]+ consultants?$/);
    await expect(kpi(page, "available")).not.toHaveText("");
    const total = await count(page);
    expect(total).toBeGreaterThanOrEqual(150);
    expect(await num(page, "available")).toBeGreaterThan(0);
    expect(await num(page, "onProject")).toBeGreaterThan(0);
    await expect(page.locator("[data-showing]")).toContainText(`of ${total.toLocaleString("en-US")}`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(shots, "consultants-1440.png") });

    // filter by availability: the address carries it, a reload keeps it
    await page.locator('[role=search] button[aria-label="Availability"]').click();
    await page.getByRole("option", { name: "On project" }).click();
    await expect(page).toHaveURL(/availability=ON_PROJECT/);
    await expect(rowsOf(page).first()).toBeVisible();
    const pills = await rowsOf(page).locator("[data-state-pill=consultant-availability]").allInnerTexts();
    expect(pills.length).toBeGreaterThan(0);
    expect(new Set(pills)).toEqual(new Set(["On project"]));
    await page.reload();
    await expect(page.locator('[role=search] button[aria-label="Availability"]')).toContainText("On project");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/availability=/);

    // search by a name taken from the table
    const firstName = (await rowsOf(page).first().locator("td").nth(1).innerText()).split("\n")[0].trim();
    const search = page.getByRole("searchbox", { name: "Search consultants" });
    await search.fill(firstName);
    await expect(rowsOf(page).first()).toContainText(firstName);
    await expect(page).toHaveURL(/q=/);
    await search.fill("");
    await expect(rowsOf(page)).toHaveCount(10);

    // open the drawer: the address names the consultant; each tab answers from rows
    await rowsOf(page).first().click();
    const sheet = page.locator("#ent-consultant-sheet");
    await expect(sheet.locator("[data-detail-body]")).toBeVisible();
    await expect(page).toHaveURL(/c=\d+/);
    await expect(sheet.locator("[data-checklist] li")).toHaveCount(5);
    await expect(sheet.locator("[data-quick-actions]")).toContainText("Assign marketer");
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(shots, "consultants-drawer-1440.png") });
    for (const tab of ["Assignments", "Applications", "Activity"]) {
      await sheet.getByRole("tab", { name: tab }).click();
      await expect(sheet.locator(`[data-tab-panel=${tab.toLowerCase()}]`)).toBeVisible();
    }
    await expect(page).toHaveURL(/tab=activity/);
    await sheet.getByRole("tab", { name: "Overview" }).click();

    // an autosaved edit with Undo: flip availability, see it in the row after a reload, then put it back
    const id = await sheet.locator("[data-detail-body]").getAttribute("data-consultant-id");
    const row = page.locator(`tr[data-row-id="${id}"]`);
    const before = (await row.locator("[data-state-pill=consultant-availability]").innerText()).trim();
    const target = before === "Unavailable" ? "Available" : "Unavailable";
    await sheet.getByRole("button", { name: "Availability" }).click();
    await page.getByRole("option", { name: target, exact: true }).click();
    await expect(page.getByText(`Availability set to ${target}`)).toBeVisible();
    await expect(row.locator("[data-state-pill=consultant-availability]")).toHaveText(target);
    await page.reload();
    await expect(page.locator(`tr[data-row-id="${id}"] [data-state-pill=consultant-availability]`)).toHaveText(target);
    await page.getByRole("button", { name: "Availability" }).last().click();
    await page.getByRole("option", { name: before, exact: true }).click();
    await expect(page.getByText(`Availability set to ${before}`)).toBeVisible();
    await sheet.getByRole("button", { name: /^Close / }).click();
    await expect(page).not.toHaveURL(/c=/);

    // add a consultant, see the totals move and the drawer open on them, then deactivate with a reason and Undo
    const stamp = String(Date.now() % 1_000_000);
    await page.getByRole("button", { name: /Add consultant/ }).first().click();
    const add = page.getByRole("dialog", { name: "Add consultant" });
    await add.getByLabel("Full name").fill(`Eve Journey${stamp}`);
    await add.getByLabel("Work email").fill(`eve.journey${stamp}@acme-journey.example.org`);
    await add.getByLabel("Job title").fill("QA Engineer");
    await add.getByRole("button", { name: "Add consultant" }).click();
    await expect(page.getByText(`Eve Journey${stamp} was added`)).toBeVisible();
    await expect(sheet).toContainText(`Eve Journey${stamp}`);
    await expect.poll(() => count(page)).toBe(total + 1);
    await sheet.locator("[data-quick-action=deactivate]").click();
    const off = page.getByRole("dialog", { name: /Deactivate Eve Journey/ });
    await off.getByLabel("Reason (required)").fill("Journey test clean-up of the added consultant");
    await off.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(`Eve Journey${stamp} is deactivated`)).toBeVisible();
    await expect.poll(() => count(page)).toBe(total);

    // another organization cannot read Acme's consultants
    const orgId = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const ids = await page.evaluate(async (o) => ((await (await fetch(`/api/orgs/${o}/consultants?size=3`)).json()) as { items: { id: number }[] }).items.map((i) => i.id), orgId);
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await signIn(beta, `http://beta.localhost:${port}`, "Bea Turner");
    for (const path of ["", "/counts", "/filters", `/${ids[0]}`, `/${ids[0]}/applications`]) {
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/consultants${path}`);
      expect(status, path || "list").toBe(404);
    }
    const betaOrg = await beta.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const own = await beta.evaluate(async (o) => (await fetch(`/api/orgs/${o}/consultants?size=100`)).json(), betaOrg);
    expect((own as { total: number }).total).toBeLessThan(total);
    expect((own as { items: { id: number }[] }).items.map((i) => i.id)).not.toContain(ids[0]);
    await beta.goto(`http://beta.localhost:${port}/w/admin/consultants?c=${ids[0]}`);
    await expect(beta.locator("[data-consultants-page]")).toBeVisible();
    await expect(beta.locator("#ent-consultant-sheet [data-detail-body]")).toHaveCount(0);
    await betaCtx.close();
  });

  test("a phone gets cards and a bottom sheet", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, base, "Sarah Chen");
    await page.goto(`${base}/w/admin/consultants`);
    await expect(page.locator("[data-consultant-cards] > li").first()).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 8)
        .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)} ${Math.round(e.getBoundingClientRect().right)}`),
    );
    expect(overflow, `elements wider than the phone: ${wide.join(" | ")}`).toBeLessThanOrEqual(1);
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(shots, "consultants-390.png") });
    await page.locator("[data-consultant-cards] > li button.min-h-11").first().click();
    await expect(page.locator("#ent-consultant-sheet [data-detail-body]")).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(shots, "consultants-drawer-390.png") });
  });
});
