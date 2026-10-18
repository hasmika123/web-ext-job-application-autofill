import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Resumes page (/w/admin/resumes) against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme talent data (121 resumes),
 * Sarah Chen signed in through the Demo accounts tab. Run with `playwright.real.resumes.config.ts` (docs/enterprise-v2/page-resumes.md).
 * The journey changes data and puts it back (primary and visibility are undone); it also adds one resume record.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const shots = resolve(__dirname, "../../../design/enterprise-talent/built");

async function signInAsSarah(page: Page) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const rows = (page: Page) => page.locator("tr[data-row-id]");
const drawer = (page: Page) => page.locator("#ent-resume-sheet");

test.describe("resumes (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the journey", async ({ page }) => {
    mkdirSync(shots, { recursive: true });
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/resumes`);
    await expect(page.locator("[data-resumes-page]")).toBeVisible();

    // the real tiles and the first page of the real table
    const kpi = (k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
    await expect(kpi("total")).not.toHaveText("");
    const total = Number((await kpi("total").innerText()).replace(/,/g, ""));
    expect(total).toBeGreaterThan(50);
    expect(Number(await kpi("primary").innerText())).toBeGreaterThan(0);
    await expect(page.locator("[data-kpi=total] [data-kpi-delta]")).toContainText("vs last month");
    await expect(page.locator("[data-kpi=primary] [data-kpi-delta]")).toHaveCount(0); // the primary flag is not versioned: no invented delta
    await expect(rows(page)).toHaveCount(10);
    await expect(page.locator("[data-range]")).toContainText(`of ${total}`);
    await expect(page.getByRole("tab", { name: /All Resumes/ })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(shots, "resumes-1440.png") });

    // tab: Pending Approval keeps only pending rows and writes the tab to the URL
    const pendingList = page.waitForResponse((r) => r.url().includes("/resumes?") && r.url().includes("tab=pending"));
    await page.getByRole("tab", { name: /Pending Approval/ }).click();
    await expect(page).toHaveURL(/tab=pending/);
    await pendingList;
    await expect(rows(page).first()).toBeVisible();
    for (const r of await rows(page).all()) await expect(r).toContainText("Pending");
    const recentList = page.waitForResponse((r) => r.url().includes("/resumes?") && r.url().includes("tab=recent"));
    await page.getByRole("tab", { name: /Recent Updates/ }).click();
    await expect(page).toHaveURL(/tab=recent/);
    await recentList;
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole("tab", { name: /All Resumes/ }).click();
    await expect(page).not.toHaveURL(/tab=/);

    // filter by visibility, then search, then clear
    await page.locator('[role=search] button[aria-label="Visibility"]').click();
    await page.getByRole("option", { name: "Private" }).click();
    await expect(page).toHaveURL(/vis=PRIVATE/);
    await expect(rows(page).first()).toBeVisible();
    for (const r of await rows(page).all()) await expect(r).toContainText("Private");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/vis=/);
    const search = page.getByRole("searchbox", { name: "Search resumes" });
    const someone = (await rows(page).first().locator("td").nth(2).innerText()).split(/\s+/)[0].trim();
    await search.fill(someone);
    await expect(page).toHaveURL(new RegExp(`q=${someone}`));
    await expect(rows(page).first()).toContainText(someone);
    await search.fill("");
    await expect(page).not.toHaveURL(/q=/);

    // an approved, non-primary resume: open it in the drawer (the id lands in the URL and survives a reload)
    await page.goto(`${base}/w/admin/resumes?status=APPROVED&primary=no`);
    await expect(rows(page).first()).toBeVisible();
    const target = rows(page).first();
    const targetId = await target.getAttribute("data-row-id");
    const targetName = (await target.locator("td").nth(2).locator("span.font-semibold").innerText()).trim();
    await target.click();
    await expect(drawer(page).locator("[data-detail-body]")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`open=${targetId}`));
    await expect(drawer(page).locator("[data-resume-paper]")).toBeVisible();
    await expect(drawer(page)).toContainText("File Name");
    await expect(drawer(page).getByRole("button", { name: "Preview" })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(shots, "resumes-drawer-1440.png") });
    await page.reload();
    await expect(drawer(page).locator(`[data-detail-body][data-resume-id="${targetId}"]`)).toBeVisible();

    // set primary: saves at once, the row shows it, Undo takes it back
    const toggle = drawer(page).getByRole("switch", { name: "Primary resume" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page.getByText(/is now the primary resume/)).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(`tr[data-row-id="${targetId}"]`)).toHaveCount(0); // the list filter is "not primary": it leaves the table
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(page.getByText("Undone")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // visibility: change with the select, then Undo
    const visibility = drawer(page).locator('button[aria-label="Visibility"]');
    const before = (await visibility.innerText()).trim();
    const choose = before.startsWith("Private") ? "Public (Shareable with clients)" : "Private (Owner and marketer only)";
    await visibility.scrollIntoViewIfNeeded();
    await expect(async () => {
      await page.waitForTimeout(500); // a menu closes when the page scrolls: settle first, then open it
      await visibility.click();
      await expect(page.getByRole("option", { name: choose })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await page.getByRole("option", { name: choose }).click();
    await expect(page.getByText(/Visibility is now/)).toBeVisible();
    await expect(visibility).not.toContainText(before);
    await page.getByRole("button", { name: "Undo" }).last().click();
    await expect(page.getByText("Undone")).toBeVisible();
    await expect(visibility).toContainText(before);

    // download is a generated file; print is a hidden frame; preview is the large generated page
    const href = await drawer(page).getByRole("link", { name: "Download" }).getAttribute("href");
    expect(href).toContain(`/resumes/${targetId}/export?format=txt`);
    const [download] = await Promise.all([page.waitForEvent("download"), drawer(page).getByRole("link", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.txt$/);
    await drawer(page).getByRole("button", { name: "Preview" }).click();
    const dlg = page.getByRole("dialog", { name: targetName });
    await expect(dlg.locator("[data-resume-paper]")).toBeVisible();
    await page.keyboard.press("Escape");

    // add a resume record: it starts pending and the person who prepared it cannot approve it
    await page.goto(`${base}/w/admin/resumes`);
    await page.locator("[data-upload-open]").click();
    const up = page.getByRole("dialog", { name: "Upload Resume" });
    await up.locator('button[aria-label="Consultant"]').click();
    await page.getByRole("option").first().click();
    const newName = `E2E Resume ${Date.now() % 100000}`;
    await up.getByLabel("Resume name").fill(newName);
    await up.getByLabel("Target role").fill("QA Engineer");
    await up.getByLabel("Professional summary").fill("My SSN is 123-45-6789");
    await expect(up.getByRole("alert").first()).toContainText(/never store/i);
    await expect(up.getByRole("button", { name: "Add resume" })).toBeDisabled();
    await up.getByLabel("Professional summary").fill("Writes tests that find real problems.");
    await up.getByRole("button", { name: "Add resume" }).click();
    await expect(page.getByText(`${newName} was added`)).toBeVisible();
    await expect(drawer(page)).toContainText(newName);
    await expect(drawer(page).getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(drawer(page)).toContainText("cannot approve it");
    await page.screenshot({ path: resolve(shots, "resumes-created-1440.png") });

    // another organization cannot read Acme's resumes
    const orgId = await page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
    const betaCtx = await page.context().browser()!.newContext();
    const beta = await betaCtx.newPage();
    await beta.goto(`http://beta.localhost:${port}/login`);
    await beta.getByRole("button", { name: /Demo accounts/ }).first().click();
    await beta.getByRole("button", { name: "Sign in as Bea Turner" }).click();
    await beta.waitForURL((u) => u.pathname.startsWith("/w/"));
    for (const path of ["", "/counts", "/filters", `/${targetId}`, `/${targetId}/export`]) {
      // from inside the page: Node cannot resolve *.localhost, the browser can
      const status = await beta.evaluate(async (u) => (await fetch(u)).status, `/api/orgs/${orgId}/resumes${path}`);
      expect(status, path).toBe(404);
    }
    const betaStatus = await beta.evaluate(async (u) => (await fetch(u, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ primary: true }) })).status, `/api/orgs/${orgId}/resumes/${targetId}/primary`);
    expect(betaStatus).toBe(404);
    await betaCtx.close();
  });

  test("a phone gets cards and a bottom sheet", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await signInAsSarah(page);
    await page.goto(`${base}/w/admin/resumes`);
    await expect(page.locator("[data-resume-cards]")).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(shots, "resumes-390.png"), fullPage: true });
    await page.locator("[data-resume-cards] li button").first().click();
    await expect(page.locator("#ent-resume-sheet [data-detail-body]")).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(shots, "resumes-sheet-390.png") });
    await ctx.close();
  });
});
