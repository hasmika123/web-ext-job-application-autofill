import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Interviews page and its drawer against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing interviews,
 * Sarah Chen signed in through the Demo accounts tab. Run with `playwright.real-interviews.config.ts`
 * (docs/enterprise-v2/real-stack-runbook.md, page-interviews.md). Re-runnable: the status change is undone, the reminder window and
 * the feedback row are the only leftovers.
 */
const port = process.env.E2E_REAL_PORT ?? "3213";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-more/built");

async function signInAsSarah(page: Page) {
  // the Demo accounts tab asks the API with a 4 s limit, which a loaded shared machine can miss: post the same sign-in the tab's button posts
  await page.goto(`${base}/login`);
  await expect(async () => {
    const ok = await page.evaluate(async () => (await fetch("/api/auth/tenant-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: "demo-ent-acme-sarah" }) })).ok);
    expect(ok).toBe(true);
  }).toPass({ timeout: 120_000 });
}

/** A cold API can miss the shell's first call ("We couldn't load your workspace"): load the page again until the board shows. */
async function openBoard(page: Page, marker: string) {
  await expect(async () => {
    await page.goto(`${base}/w/admin/interviews`);
    await expect(page.locator(marker).first()).toBeVisible({ timeout: 20_000 });
  }).toPass({ timeout: 120_000 });
}

const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
const dock = (page: Page) => page.locator("[data-drawer-dock]");
const num = async (loc: ReturnType<Page["locator"]>) => Number((await loc.innerText()).replace(/,/g, ""));

test.describe("interviews (real stack)", () => {
  test.use({ viewport: { width: 1448, height: 1086 } });

  test("the journey", async ({ page }) => {
    test.slow(); // a loaded shared machine: triple the timeout
    mkdirSync(shots, { recursive: true });
    await signInAsSarah(page);
    await openBoard(page, "[data-interviews-page]");

    // the real tiles, the first page of the table, the bee card and the first interview already open in the drawer
    await expect(kpi(page, "total")).not.toHaveText("");
    const total = await num(kpi(page, "total"));
    expect(total).toBeGreaterThanOrEqual(50);
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
    await expect(page.locator("[data-showing]")).toContainText(`of ${total.toLocaleString("en-US")} interviews`);
    await expect(page.locator("[data-kpi=total] [data-kpi-delta]")).toContainText("vs last month");
    await expect(page.locator("[data-kpi=scheduledThisWeek] [data-kpi-delta]")).toContainText("vs last week");
    await expect(page.locator("[data-help-bee]")).toBeVisible();
    await expect(dock(page).locator("[data-detail-body]")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: resolve(shots, "interviews-1448.png") });

    // filter by status: the table and the tile agree
    await page.locator('[role=search] button[aria-label="Status"]').click();
    await page.getByRole("option", { name: "Completed" }).click();
    await expect(page).toHaveURL(/status=COMPLETED/);
    const completed = await num(kpi(page, "completed"));
    await expect(page.locator("[data-showing]")).toContainText(`of ${completed}`);
    for (const s of await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))) expect(s).toBe("COMPLETED");

    // search narrows further, then clear
    await page.getByRole("searchbox", { name: "Search interviews" }).fill("zzzz-nobody");
    await expect(page.getByText("No interviews match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
    await expect(page).not.toHaveURL(/status=/);

    // a SCHEDULED interview: open it, record "In Progress", undo it
    await page.locator('[role=search] button[aria-label="Status"]').click();
    await page.getByRole("option", { name: "Scheduled" }).click();
    const row = page.locator("tr[data-row-id]").first();
    await expect(row).toHaveAttribute("data-status", "SCHEDULED");
    const id = await row.getAttribute("data-row-id");
    await row.click();
    await expect(page).toHaveURL(new RegExp(`iv=${id}`));
    await expect(dock(page).locator(`[data-interview-id="${id}"]`)).toBeVisible();
    await expect(dock(page).locator("[data-step-state=CURRENT]")).toBeVisible();
    await expect(dock(page).locator("[data-meeting-link], [data-section=meeting]").first()).toBeVisible();

    // the open interview survives a reload (shareable link)
    await page.reload();
    await expect(dock(page).locator("[data-detail-body]")).toBeVisible();

    await dock(page).locator("[data-status-trigger]").click();
    await page.getByRole("menuitem", { name: "Record as In Progress" }).click();
    const undo = page.getByRole("button", { name: "Undo" }).last();
    await expect(undo).toBeVisible();
    await expect(page.getByText(/recorded as In Progress/)).toBeVisible();
    await undo.click();
    await expect(page.getByText("Undone", { exact: true })).toBeVisible();

    // a reminder is a record, and says so (a second run inside the cool-down is told it was just recorded)
    await dock(page).locator('[data-action="remind"]').click();
    await expect(page.getByText(/Reminder recorded|reminder was just recorded/).first()).toBeVisible();

    // edit the notes: autosaved, no Save button
    await dock(page).locator("[data-edit-toggle]").click();
    const notes = dock(page).getByRole("textbox", { name: "Notes" });
    await notes.fill(`Bring a portfolio ${Date.now() % 100000}`);
    await expect(dock(page).locator("[data-autosave=notes][data-autosave-status=saved]")).toBeVisible();
    await expect(dock(page).getByRole("button", { name: /^Save/ })).toHaveCount(0);

    // reschedule through the dialog
    await dock(page).locator('[data-action="reschedule"]').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("[data-reschedule-dialog]")).toBeVisible();
    await dialog.locator('input[type="time"]').fill("16:30");
    await dialog.locator("[data-reschedule-submit]").click();
    await expect(page.getByText(/is recorded for a new time|Rescheduled/).first()).toBeVisible();
    await dock(page).getByRole("tab", { name: "Timeline" }).click();
    await expect(dock(page)).toContainText("Rescheduled");

    // feedback on a completed interview
    await page.locator('[role=search] button[aria-label="Status"]').click();
    await page.getByRole("option", { name: "Completed" }).click();
    const done = page.locator('tr[data-row-id][data-status="COMPLETED"]').first();
    await expect(done).toBeVisible();
    const doneId = await done.getAttribute("data-row-id");
    await done.click();
    await expect(dock(page).locator(`[data-interview-id="${doneId}"]`)).toBeVisible();
    await dock(page).locator('[data-action="feedback"]').click();
    const fb = page.getByRole("dialog");
    await fb.getByRole("radio", { name: "4 of 5" }).click();
    await fb.getByRole("radio", { name: "Advance" }).click();
    await fb.getByRole("textbox").fill("Strong communicator");
    await fb.locator("[data-feedback-submit]").click();
    await dock(page).getByRole("tab", { name: /^Feedback/ }).click();
    await expect(dock(page).locator("[data-feedback-list]")).toContainText("Strong communicator");

    // the calendar, the pipeline and the analytics
    await page.getByRole("tab", { name: /Calendar View/ }).click();
    await expect(page.locator("[data-calendar]")).toBeVisible();
    await expect(page.locator("[data-calendar-chip]").first()).toBeVisible();
    await page.screenshot({ path: resolve(shots, "interviews-calendar-1448.png") });
    await page.getByRole("tab", { name: /Pipeline/ }).click();
    await expect(page.locator("[data-kanban-column]")).toHaveCount(4);
    await expect(page.locator("[data-kanban-column=COMPLETED] [data-card-id]").first()).toBeVisible();
    await page.getByRole("tab", { name: /Analytics/ }).click();
    await expect(page.locator("[data-analytics-tab]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "interviews-analytics-1448.png") });

    // another organization cannot read Acme's interviews, and sees only its own
    const orgId = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await beta.goto(`http://beta.localhost:${port}/login`);
    await expect(async () => {
      expect(await beta.evaluate(async () => (await fetch("/api/auth/tenant-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: "demo-ent-beta-bea" }) })).ok)).toBe(true);
    }).toPass({ timeout: 120_000 });
    for (const path of ["", "/counts", `/${id}`, "/analytics", "/pipeline"]) {
      // from inside the page: Node cannot resolve *.localhost, the browser can
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/interviews${path}`);
      expect(status, path).toBe(404);
    }
    const betaOrg = await beta.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const own = await beta.evaluate(async (o) => ((await (await fetch(`/api/orgs/${o}/interviews?size=1`)).json()) as { total: number }).total, betaOrg);
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(total);
    await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${betaOrg}/interviews/${id}`).then((s) => expect(s).toBe(404)); // Acme's id inside Beta's own org
    await betaCtx.close();
  });

  test("a phone gets cards and a bottom sheet", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsSarah(page);
    await openBoard(page, "[data-interview-cards] li");
    await expect(page.locator("[data-interview-table]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(shots, "interviews-390.png") });
    await page.locator("[data-interview-cards] li button").first().click();
    await expect(page.locator("[data-detail-body]")).toBeVisible();
    await page.screenshot({ path: resolve(shots, "interviews-sheet-390.png") });
  });
});
