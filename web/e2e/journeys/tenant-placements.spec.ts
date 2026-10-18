import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Placements page and its drawer against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing placements, Sarah Chen signed
 * in through the Demo accounts tab. Run with `playwright.real-placements.config.ts` (docs/enterprise-v2/real-stack-runbook.md, page-placements.md).
 * Re-runnable: every change is undone from its toast, and the placement it adds is completed again so its consultant is free for the next run.
 */
const port = process.env.E2E_REAL_PORT ?? "3215";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-more/built");

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
const drawer = (page: Page) => page.locator("[data-docked-drawer] [data-detail-body]");
const num = async (loc: ReturnType<Page["locator"]>) => Number((await loc.innerText()).replace(/,/g, ""));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "Dec 20, 2026 (in 45 days)" to a Date (UTC). */
function dayOf(text: string): Date {
  const m = /([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(text);
  if (!m) throw new Error(`no date in "${text}"`);
  return new Date(`${m[1]} UTC`);
}

test.describe("placements (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    test.slow(); // a loaded shared machine: triple the timeout
    mkdirSync(shots, { recursive: true });
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/placements`);
    await expect(page.locator("[data-placements-page]")).toBeVisible();

    // the real tiles, the four tabs and the first page of the table agree with each other
    await expect(kpi(page, "active")).not.toHaveText("");
    const active = await num(kpi(page, "active"));
    expect(active).toBeGreaterThanOrEqual(50);
    await expect(page.getByRole("tab", { name: `Active (${active})` })).toBeVisible();
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
    await expect(page.locator("[data-showing-top]")).toContainText(`of ${active.toLocaleString("en-US")} active placements`);
    await expect(page.locator("[data-kpi=active] [data-kpi-delta]")).toContainText("vs last month");
    await expect(page.locator("[data-help-card]")).toBeVisible();
    // the board opens with its first row selected, docked in the right column
    await expect(drawer(page)).toBeVisible();
    await expect(page).toHaveURL(/pl=\d+/);
    await expect(drawer(page).locator("[data-extension-status]")).toBeVisible();
    await expect(drawer(page).locator("[data-availability]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "placements-1440.png") });

    // the other tabs show their own rows and the same numbers
    for (const [tab, status] of [["Upcoming", "UPCOMING"], ["Completed", "ENDED"]] as const) {
      await page.getByRole("tab", { name: new RegExp(`^${tab} \\(`) }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`));
      await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
      for (const s of await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))) expect(s).toBe(status);
    }
    await page.getByRole("tab", { name: /^Extensions \(/ }).click();
    await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "placements-extensions-1440.png") });
    await page.getByRole("tab", { name: /^Active \(/ }).click();
    await expect(page).not.toHaveURL(/tab=/);

    // filter by "Ending soon": every row carries an end-date pill; then the search; then clear
    await page.locator('button[aria-label="Status"]').click();
    await page.getByRole("option", { name: "Ending soon" }).click();
    await expect(page).toHaveURL(/status=ENDING_SOON/);
    await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
    for (const k of await page.locator("tr[data-row-id] [data-next-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-next-action")))) expect(["ENDS_IN", "ENDED_AGO"]).toContain(k);
    const ending = await num(kpi(page, "endingSoon"));
    await expect(page.locator("[data-showing-top]")).toContainText(`of ${ending} active placements`);
    await page.locator('button[aria-label="Status"]').click();
    await page.getByRole("option", { name: "All Statuses" }).click();
    const search = page.getByRole("searchbox", { name: "Search placements" });
    await search.fill("zzzz-nobody");
    await expect(page.getByText("No placements match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
    await expect(page).not.toHaveURL(/q=/);

    // sort by bill rate, high to low
    await page.locator('button[aria-label="Sort by"]').click();
    await page.getByRole("option", { name: "Bill Rate (High to Low)" }).click();
    await expect(page).toHaveURL(/sort=rate%2Cdesc/);
    const rates = await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => Number(/\$([\d,.]+)\//.exec(e.textContent ?? "")?.[1]?.replace(/,/g, "") ?? "0")));
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    await page.locator('button[aria-label="Sort by"]').click();
    await page.getByRole("option", { name: "End Date (Soonest)" }).click();

    // grid view and More Filters
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect(page.locator("[data-placement-cards=grid] li").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "placements-grid-1440.png") });
    await page.getByRole("button", { name: "List view" }).click();
    await page.locator("[data-more-filters]").click();
    await expect(page.locator("[data-more-filters-panel]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "placements-filters-1440.png") });
    await page.keyboard.press("Escape");

    // a placement with nothing to do: open it, then record, undo, record, undo
    const quiet = page.locator('tr[data-row-id]:has([data-next-action=NONE])').first();
    await expect(quiet).toBeVisible();
    const id = await quiet.getAttribute("data-row-id");
    await quiet.click();
    await expect(page).toHaveURL(new RegExp(`pl=${id}`));
    await expect(drawer(page).locator(`[data-placement-id="${id}"]`)).toBeVisible().catch(() => undefined);
    await expect(drawer(page).locator("[data-field=end]")).toBeVisible();
    const endText = await drawer(page).locator("[data-field=end]").innerText();
    const end = dayOf(endText);
    const later = new Date(end.getTime() + 30 * 86400_000);

    // request an extension from the card; Undo takes it back
    await drawer(page).locator("[data-request-extension]").click();
    const dialog = page.locator("[data-extension-dialog=request]");
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-extension-submit]")).toBeDisabled();
    await dialog.getByLabel("Requested end date").fill(iso(later));
    await page.locator("[data-extension-submit]").click();
    await expect(page.getByText("Extension requested", { exact: true }).first()).toBeVisible();
    const undo = page.getByRole("button", { name: "Undo" }).last();
    await expect(undo).toBeVisible();
    await expect(drawer(page).locator("[data-extension-status]")).toContainText("An extension to");
    await expect(drawer(page).locator("[data-decide]").first()).toBeVisible();
    await undo.click();
    await expect(page.getByText("Undone", { exact: true })).toBeVisible();
    await expect(drawer(page).locator("[data-extension-status]")).toContainText("No extension requested yet");

    // extend it for real (the end date moves), then undo
    await drawer(page).locator("[data-quick=extend]").click();
    await page.locator("[data-extension-dialog=extend]").getByLabel("New end date").fill(iso(later));
    await page.locator("[data-extension-submit]").click();
    await expect(drawer(page).locator("[data-field=end]")).toContainText(dayOf(iso(later) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }));
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(page.getByText("Undone", { exact: true })).toBeVisible();
    await expect(drawer(page).locator("[data-field=end]")).toContainText(endText.split(" (")[0]);

    // redeployment and completion, each undone from its toast
    await drawer(page).locator("[data-quick=redeploy]").click();
    await expect(drawer(page).locator("[data-availability]")).toContainText("In the redeployment pool");
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(drawer(page).locator("[data-availability]")).not.toContainText("In the redeployment pool");
    await drawer(page).locator("[data-quick=complete]").click();
    await expect(drawer(page).locator("[data-status-label]")).toHaveText("Completed");
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(drawer(page).locator("[data-status-label]")).toHaveText("Active");

    // timeline and a note (no Save button anywhere)
    await drawer(page).getByRole("tab", { name: "Timeline" }).click();
    await expect(drawer(page)).toContainText("Change undone");
    await drawer(page).getByRole("tab", { name: "Notes" }).click();
    const before = await drawer(page).locator("[data-note-id]").count();
    await drawer(page).getByRole("textbox", { name: "Add a note" }).fill("Client prefers a Friday call");
    await drawer(page).getByRole("button", { name: "Add note" }).click();
    await expect(drawer(page).locator("[data-note-id]")).toHaveCount(before + 1);
    await expect(drawer(page).getByRole("button", { name: /^Save/ })).toHaveCount(0);

    // Add Placement: a consultant who is free, a client, a role and a start date; then complete it so the next run finds the consultant free again
    await page.locator("[data-add-placement]").click();
    const add = page.locator("[data-add-dialog]");
    await expect(add).toBeVisible();
    await add.getByLabel("Consultant", { exact: true }).click();
    await page.getByRole("listbox", { name: "Consultant results" }).getByRole("option").first().click();
    await add.getByLabel("Client", { exact: true }).click();
    await page.getByRole("listbox", { name: "Client results" }).getByRole("option").first().click();
    await add.getByLabel("Role", { exact: true }).fill("Journey Analyst");
    await add.getByLabel("Start date").fill(iso(new Date()));
    await add.getByLabel("Bill rate").fill("99");
    await page.locator("[data-add-submit]").click();
    await expect(page.getByText("Placement added")).toBeVisible();
    await expect(drawer(page).locator("[data-field=role]")).toContainText("Journey Analyst");
    await expect(drawer(page).locator("[data-field=rate]")).toContainText("$99/hr");
    await drawer(page).locator("[data-quick=complete]").click();
    await expect(drawer(page).locator("[data-status-label]")).toHaveText("Completed");

    // another organization cannot read Acme's placements, and sees only its own
    const orgId = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await beta.goto(`http://beta.localhost:${port}/login`);
    await beta.getByRole("button", { name: /Demo accounts/ }).first().click();
    await beta.getByRole("button", { name: "Sign in as Bea Turner" }).click();
    await beta.waitForURL((u) => u.pathname.startsWith("/w/"));
    for (const path of ["", "/counts", `/${id}`, "/filters"]) {
      // from inside the page: Node cannot resolve *.localhost, the browser can
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/placements${path}`);
      expect(status, path).toBe(404);
    }
    const betaOrg = await beta.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const own = await beta.evaluate(async (o) => ((await (await fetch(`/api/orgs/${o}/placements?size=1`)).json()) as { total: number }).total, betaOrg);
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(active);
    expect(await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${betaOrg}/placements/${id}`)).toBe(404); // Acme's id inside Beta's own org
    expect(await beta.evaluate(async (u) => (await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, `/api/orgs/${orgId}/placements/${id}/complete`)).toBe(404);
    await betaCtx.close();
  });

  test("a phone gets cards and a bottom sheet", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/placements`);
    await expect(page.locator("[data-placement-cards] li").first()).toBeVisible();
    await expect(page.locator("[data-placement-table]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(shots, "placements-390.png") });
    await page.locator("[data-placement-cards] li button").first().click();
    await expect(page.locator("[data-detail-body]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "placements-sheet-390.png") });
  });
});
