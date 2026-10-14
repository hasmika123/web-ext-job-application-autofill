import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Applications page and its drawer against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing pipeline
 * (120 applications), Sarah Chen signed in through the Demo accounts tab. Run with `playwright.real-applications.config.ts`
 * (docs/enterprise-v2/real-stack-runbook.md, page-applications.md). Re-runnable: the stage move is undone, the note is the only leftover.
 */
const port = process.env.E2E_REAL_PORT ?? "3204";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-talent/built");

async function signInAsSarah(page: Page) {
  // the first click can land before the page is hydrated: reload and click again until the demo roster is open
  await expect(async () => {
    await page.goto(`${base}/login`);
    await page.getByRole("button", { name: /Demo accounts/ }).first().click();
    await expect(page.getByRole("button", { name: "Sign in as Sarah Chen" })).toBeVisible({ timeout: 8000 });
  }).toPass({ timeout: 90_000 });
  await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
const drawer = (page: Page) => page.locator("#ent-application-sheet");
const num = async (loc: ReturnType<Page["locator"]>) => Number((await loc.innerText()).replace(/,/g, ""));

test.describe("applications (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    test.slow(); // a loaded shared machine: triple the timeout
    mkdirSync(shots, { recursive: true });
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/applications`);
    await expect(page.locator("[data-applications-page]")).toBeVisible();

    // the real tiles and the first page of the table
    await expect(kpi(page, "total")).not.toHaveText("");
    const total = await num(kpi(page, "total"));
    expect(total).toBeGreaterThanOrEqual(100);
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
    await expect(page.locator("[data-showing]")).toContainText(`of ${total.toLocaleString("en-US")} applications`);
    await expect(page.locator("[data-kpi=total] [data-kpi-delta]")).toContainText("vs last month");
    await expect(page.locator("[data-help-bee=promo]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "applications-1440.png") });

    // filter by stage: the table, the pager and the tile agree
    await page.locator('[role=search] button[aria-label="Stage"]').click();
    await page.getByRole("option", { name: "Interviewing" }).click();
    await expect(page).toHaveURL(/stage=INTERVIEWING/);
    const interviewing = await num(kpi(page, "interviewing"));
    await expect(page.locator("[data-showing]")).toContainText(`of ${interviewing}`);
    for (const stage of await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-stage")))) expect(stage).toBe("INTERVIEWING");

    // search narrows further, then clear
    const search = page.getByRole("searchbox", { name: "Search applications" });
    await search.fill("zzzz-nobody");
    await expect(page.getByText("No applications match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
    await expect(page).not.toHaveURL(/stage=/);

    // an application still in ASSIGNED: open it, record a move, undo it
    await page.locator('[role=search] button[aria-label="Stage"]').click();
    await page.getByRole("option", { name: "Assigned" }).click();
    const row = page.locator("tr[data-row-id]").first();
    await expect(row).toHaveAttribute("data-stage", "ASSIGNED");
    const id = await row.getAttribute("data-row-id");
    await row.click();
    await expect(page).toHaveURL(new RegExp(`app=${id}`));
    await expect(drawer(page).locator("[data-detail-body]")).toBeVisible();
    await expect(drawer(page).locator("[data-step=ASSIGNED][data-step-state=CURRENT]")).toBeVisible();
    await expect(drawer(page).locator("[data-field=code]")).toContainText(/APP-\d{4}-\d+/);
    await page.screenshot({ path: resolve(shots, "applications-drawer-1440.png") });

    // the open application survives a reload (shareable link)
    await page.reload();
    await expect(drawer(page).locator("[data-detail-body]")).toBeVisible();

    await drawer(page).locator("[data-move-trigger]").click();
    await expect(page.getByRole("menuitem", { name: "Record as Submitted" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Record as Submitted" }).click();
    // the Undo toast is short-lived: act on it first, check the rest afterwards
    const undo = page.getByRole("button", { name: "Undo" }).last();
    await expect(undo).toBeVisible();
    await expect(page.getByText(/recorded as Submitted/)).toBeVisible();
    await undo.click();
    await expect(page.getByText("Undone", { exact: true })).toBeVisible();
    await expect(drawer(page).locator("[data-step=ASSIGNED][data-step-state=CURRENT]")).toBeVisible();

    // edit the next action: autosaved, no Save button
    await drawer(page).locator("[data-edit-toggle]").click();
    const action = drawer(page).getByRole("textbox", { name: "Next action" });
    const text = `Call the client ${Date.now() % 100000}`;
    await action.fill(text);
    await expect(drawer(page).locator("[data-autosave=nextAction][data-autosave-status=saved]")).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: /^Save/ })).toHaveCount(0);

    // add a note
    await drawer(page).getByRole("tab", { name: /^Notes/ }).click();
    await expect(drawer(page).locator("[data-notes]")).toBeVisible();
    const before = await drawer(page).locator("[data-note-id]").count();
    await drawer(page).getByRole("textbox", { name: "Add a note" }).fill("Client prefers a Friday call");
    await drawer(page).getByRole("button", { name: "Add note" }).click();
    await expect(drawer(page).locator("[data-note-id]")).toHaveCount(before + 1);
    await expect(drawer(page).getByRole("tab", { name: `Notes (${before + 1})` })).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Activity" }).click();
    await expect(drawer(page)).toContainText("Note added");
    await page.keyboard.press("Escape");

    // the pipeline view and the analytics
    await page.getByRole("tab", { name: /Pipeline View/ }).click();
    await expect(page.locator("[data-kanban-column]")).toHaveCount(6);
    await expect(page.locator("[data-kanban-column=OFFER] [data-card-id]").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "applications-pipeline-1440.png") });
    await page.getByRole("tab", { name: /Analytics/ }).click();
    await expect(page.locator("[data-analytics-tab]")).toBeVisible();
    await expect(page.locator("[data-analytics=funnel]")).toContainText("Hired");
    await page.screenshot({ path: resolve(shots, "applications-analytics-1440.png") });

    // another organization cannot read Acme's applications, and sees only its own
    const orgId = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await beta.goto(`http://beta.localhost:${port}/login`);
    await beta.getByRole("button", { name: /Demo accounts/ }).first().click();
    await beta.getByRole("button", { name: "Sign in as Bea Turner" }).click();
    await beta.waitForURL((u) => u.pathname.startsWith("/w/"));
    for (const path of ["", "/counts", `/${id}`, "/analytics", "/pipeline"]) {
      // from inside the page: Node cannot resolve *.localhost, the browser can
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/applications${path}`);
      expect(status, path).toBe(404);
    }
    const betaOrg = await beta.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const own = await beta.evaluate(async (o) => ((await (await fetch(`/api/orgs/${o}/applications?size=1`)).json()) as { total: number }).total, betaOrg);
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(total);
    await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${betaOrg}/applications/${id}`).then((s) => expect(s).toBe(404)); // Acme's id inside Beta's own org
    await betaCtx.close();
  });

  test("a phone gets cards and a bottom sheet", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/applications`);
    await expect(page.locator("[data-application-cards] li").first()).toBeVisible();
    await expect(page.locator("[data-application-table]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(shots, "applications-390.png") });
    await page.locator("[data-application-cards] li button").first().click();
    await expect(page.locator("[data-detail-body]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "applications-sheet-390.png") });
  });
});
