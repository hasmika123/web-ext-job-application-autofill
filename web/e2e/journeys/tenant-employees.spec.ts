import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * X4.12 / X4.6: the Employees page and its detail sheet against the REAL stack (Spring API + MySQL + `next start`): the seeded
 * Acme Staffing roster (11 people), Sarah Chen signed in through the Demo accounts tab. Run with `playwright.real.config.ts`
 * (docs/enterprise-v2/real-stack-runbook.md). The journey changes data (it offboards Tomas Berg for good): reset the database
 * to run it again.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-admin/built");

async function signInAsSarah(page: Page) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const rowOf = (page: Page, name: string) => page.locator("tr[data-row-id]", { hasText: name });

/** The page scrolls smoothly and an open menu closes on scroll, so settle the scroll first and retry the click until the menu is up. */
async function openRowMenu(page: Page, name: string, item: string) {
  const kebab = rowOf(page, name).getByRole("button", { name: "Row actions" });
  await kebab.scrollIntoViewIfNeeded();
  await expect(async () => {
    await page.waitForTimeout(500);
    await kebab.click();
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
}

test.describe("employees (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/employees`);
    await expect(page.locator("[data-employees-page]")).toBeVisible();

    // earlier runs against this database may have left Felix and Hana with the extra Consultant role: start from the seed
    await page.evaluate(async () => {
      const org = ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id;
      const roles = (await (await fetch(`/api/orgs/${org}/roles`)).json()) as { id: number; name: string }[];
      const consultant = roles.find((r) => r.name === "Consultant");
      const people = ((await (await fetch(`/api/orgs/${org}/members?size=50`)).json()) as { items: { id: number; name: string }[] }).items;
      const ids = people.filter((p) => ["Felix Ng", "Hana Petrov"].includes(p.name)).map((p) => p.id);
      if (consultant) {
        await fetch(`/api/orgs/${org}/members/bulk/roles`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ memberIds: ids, remove: [consultant.id] }) });
      }
    });
    await page.reload();

    // the seeded roster and the real KPI counts (three tiles: Active, Invited, Suspended; the total is the list's own count)
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10); // first page of 12 seats (11 people + the owner seat)
    const kpi = (k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
    await expect(kpi("active")).not.toHaveText("");
    await expect(kpi("invited")).toHaveText("1");
    await expect(kpi("suspended")).toHaveText("1");
    await expect(page.locator("[data-showing]")).toHaveText(/^Showing 1-10 of \d+ employees$/);
    const total = Number(/of (\d+)/.exec(await page.locator("[data-showing]").innerText())![1]);
    expect(total).toBeGreaterThanOrEqual(11);
    await page.screenshot({ path: resolve(shots, "employees-1440.png") });

    // search, then filter by status
    const search = page.getByRole("searchbox", { name: "Search employees" });
    await search.fill("anika");
    await expect(page.locator("tr[data-row-id]")).toHaveCount(1);
    await expect(rowOf(page, "Anika Rao")).toBeVisible();
    await search.fill("");
    await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
    await page.locator('[role=search] button[aria-label="Status"]').click();
    await page.getByRole("option", { name: "Suspended" }).click();
    await expect(page.locator("tr[data-row-id]")).toHaveCount(1);
    await expect(rowOf(page, "Sam Whitfield")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);

    // Anika's sheet: change the title (autosave)
    await rowOf(page, "Anika Rao").click();
    const sheet = page.locator("#ent-employee-sheet");
    await expect(sheet.locator("[data-detail-body]")).toBeVisible();
    await expect(sheet).toContainText("Anika Rao");
    const title = sheet.getByRole("textbox", { name: "Job title" });
    const newTitle = `Senior Consultant ${Date.now() % 100000}`;
    await title.fill(newTitle);
    await expect(sheet.locator("[data-title-status=saved]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "employees-sheet-1440.png") });
    await page.reload();
    await rowOf(page, "Anika Rao").click();
    await expect(sheet.getByRole("textbox", { name: "Job title" })).toHaveValue(newTitle);
    await sheet.getByRole("button", { name: "Close Anika Rao" }).click();

    // suspend and reinstate Ben with a reason
    await openRowMenu(page, "Ben Okafor", "Suspend");
    await page.getByRole("menuitem", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: /Suspend Ben Okafor/ });
    await dialog.getByLabel("Reason (required)").fill("Access review pending for the quarter");
    await dialog.getByRole("button", { name: "Suspend" }).click();
    await expect(rowOf(page, "Ben Okafor")).toContainText("Suspended");
    await openRowMenu(page, "Ben Okafor", "Reinstate");
    await page.getByRole("menuitem", { name: "Reinstate" }).click();
    await expect(rowOf(page, "Ben Okafor")).toContainText("Active");

    // bulk-change a role, then Undo
    await page.getByRole("checkbox", { name: "Select Felix Ng" }).check();
    await page.getByRole("checkbox", { name: "Select Hana Petrov" }).check();
    await expect(page.locator("[data-bulk-bar]")).toContainText("2 selected");
    await page.getByRole("button", { name: "Change roles" }).click();
    const rolesDlg = page.getByRole("dialog", { name: "Change roles" });
    await rolesDlg.getByRole("group", { name: "Add these roles" }).getByLabel("Consultant", { exact: true }).check();
    await rolesDlg.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/Updated roles for 2 people/)).toBeVisible();
    await expect(rowOf(page, "Felix Ng")).toContainText("+1");
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(page.getByText("Undone")).toBeVisible();
    await expect(rowOf(page, "Felix Ng")).not.toContainText("+1");

    // offboard a throwaway member with the typed confirmation
    await openRowMenu(page, "Tomas Berg", "Delete employee");
    await page.getByRole("menuitem", { name: "Delete employee" }).click();
    const off = page.getByRole("dialog", { name: /Offboard Tomas Berg/ });
    await expect(off).toContainText("Their records are kept");
    await off.getByLabel("Type Tomas Berg to confirm").fill("Tomas Berg");
    await off.getByLabel("Reason (required)").fill("Left the company at the end of the term");
    await off.getByRole("button", { name: "Offboard", exact: true }).click();
    await expect(rowOf(page, "Tomas Berg")).toHaveCount(0);

    // another organization cannot read Acme's members
    const orgId = await page.evaluate(async () => {
      const r = await fetch("/api/me/tenant");
      return ((await r.json()) as { org: { id: number } }).org.id;
    });
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await beta.goto(`http://beta.localhost:${port}/login`);
    await beta.getByRole("button", { name: /Demo accounts/ }).first().click();
    await beta.getByRole("button", { name: "Sign in as Bea Turner" }).click();
    await beta.waitForURL((u) => u.pathname.startsWith("/w/"));
    for (const path of ["", "/counts", "/offboarding"]) {
      // from inside the page: Node cannot resolve *.localhost, the browser can
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/members${path}`);
      expect(status, path).toBe(404);
    }
    await betaCtx.close();
  });
});
