import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The Invitations tab of Employees (`/w/admin/employees?tab=invitations`; the old `/w/admin/invitations` redirects there) against the
 * REAL stack (docs/enterprise-v2/real-stack-runbook.md): Spring API on 18183 with the demo tenants seeded (DEMO_ENABLED, ENT_DEMO_SEED,
 * DEMO_ALLOW_WRITES so a demo member may send), the web production build on 3200.
 *
 *   E2E_REAL_STACK=1 E2E_PORT=3200 PW_CHANNEL=chrome npx playwright test e2e/journeys/tenant-invitations.spec.ts --project=chromium --no-deps
 *
 * It signs in as Sarah (Acme's Organization Admin) through the Demo accounts tab, reads the seeded invited member in the real
 * table with the real pending count on the tab, sends an invitation from the "Add employee" dialog, resends and revokes it, and checks
 * that Beta's host cannot see Acme's invitations. Screenshots go to design/enterprise-admin/built/.
 */
test.skip(!process.env.E2E_REAL_STACK, "needs the real stack (E2E_REAL_STACK=1): the API on 18183 and the web build on 3200");

const PORT = process.env.E2E_PORT ?? 3200;
const acme = `http://acme.localhost:${PORT}`;
const beta = `http://beta.localhost:${PORT}`;
const SHOTS = path.resolve(__dirname, "../../../design/enterprise-admin/built");

async function demoSignIn(page: Page, base: string, name: string) {
  await page.goto(`${base}/login`);
  await page.locator("[data-tenant-demo-tab]").click();
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 30_000 });
}

const INVITATIONS = `${acme}/w/admin/employees?tab=invitations`;
const invitationsTab = (page: Page) => page.getByRole("tab", { name: /^Invitations/ });
/** The pending count the Invitations tab carries ("Invitations (2)"; no number when none is pending). */
const pending = async (page: Page) => Number(/\((\d+)\)/.exec(await invitationsTab(page).innerText())?.[1] ?? 0);
/** The "Add employee" dialog, switched to "Send invitation" (it opens in "Create account now"; these stories are the invitation flow). */
async function openInvite(page: Page) {
  await page.locator("[data-add-employee]").click();
  const panel = page.getByRole("dialog", { name: "Add employee" });
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true });
  return panel;
}

test.describe.configure({ mode: "serial" });

test.describe("Sarah on Acme", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  let orgId = "";
  let email = "";

  test("sees the seeded invitation and the real pending count, sends, resends and revokes one", async ({ page }) => {
    await demoSignIn(page, acme, "Sarah Chen");
    const counts = page.waitForRequest((r) => /\/api\/orgs\/\d+\/invitations\/counts/.test(r.url()));
    // the old address opens the Invitations tab of Employees
    await page.goto(`${acme}/w/admin/invitations`);
    await expect(page).toHaveURL(/\/w\/admin\/employees\?tab=invitations$/);
    orgId = /\/api\/orgs\/(\d+)\//.exec((await counts).url())![1];
    await expect(page.locator("[data-invitations-page]")).toBeVisible();
    await expect(invitationsTab(page)).toHaveAttribute("aria-selected", "true");

    // the seeded member who has not accepted yet (Nina Vogel) is in the real table, as Pending
    const table = page.getByRole("table", { name: "Invitations" });
    const nina = table.locator("tr", { hasText: /nina/i });
    await expect(nina).toBeVisible();
    await expect(nina.locator('[data-invitation-status="PENDING"]')).toBeVisible();
    await expect(invitationsTab(page)).toHaveText(/\(\d+\)/);
    const pending0 = await pending(page);
    expect(pending0).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: path.join(SHOTS, "invitations-1440.png"), fullPage: true });

    // send one
    email = `e2e.invite.${Date.now()}@example.com`;
    const panel = await openInvite(page);
    await panel.getByLabel(/Email address/).fill(email);
    await panel.getByLabel(/Full name/).fill("Eli Example");
    await panel.getByRole("button", { name: /^Role/ }).click();
    await panel.getByRole("checkbox", { name: /^Consultant/ }).check();
    const dept = panel.getByRole("button", { name: "Department" });
    if (await dept.isEnabled()) {
      await dept.evaluate((el) => el.scrollIntoView({ block: "center" })); // the list opens under the trigger and closes on scroll
      await dept.click();
      await page.getByRole("option").first().click();
    }
    await panel.getByLabel(/Personal message/).fill("Welcome to the team.");
    await panel.getByRole("button", { name: /Send invitation/ }).click();
    await expect(page.getByText("Invite sent")).toBeVisible({ timeout: 20_000 });
    await expect(panel).toHaveCount(0); // sending closes the dialog

    // the count on the tab and the table change
    await expect.poll(() => pending(page)).toBe(pending0 + 1);
    const row = table.locator("tr", { hasText: email });
    await expect(row).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "invitations-1440-sent.png"), fullPage: true });

    // resend
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: /Resend/ }).click();
    await expect(page.getByText("Invitation sent again")).toBeVisible();

    // revoke: the chip changes, the pending count moves back, and the toast offers Undo
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: /Revoke/ }).click();
    await expect(row.locator('[data-invitation-status="REVOKED"]')).toBeVisible();
    await expect(page.getByText("Invitation revoked")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" }).last()).toBeVisible();
    await expect.poll(() => pending(page)).toBe(pending0);

    // the status filter is asked of the server
    await page.getByRole("button", { name: "Status" }).click();
    await page.getByRole("option", { name: "Revoked" }).click();
    await expect(table.locator("tr", { hasText: email })).toBeVisible();
    await expect(table.locator("tr", { hasText: /nina/i })).toHaveCount(0);
  });

  test("Undo of 'Invite sent' cancels the invitation", async ({ page }) => {
    await demoSignIn(page, acme, "Sarah Chen");
    await page.goto(INVITATIONS);
    const table = page.getByRole("table", { name: "Invitations" });
    await expect(table).toBeVisible();
    await expect(invitationsTab(page)).toHaveText(/\(\d+\)/);
    const pending0 = await pending(page);
    const undoEmail = `e2e.undo.${Date.now()}@example.com`;
    const panel = await openInvite(page);
    await panel.getByLabel(/Email address/).fill(undoEmail);
    await panel.getByRole("button", { name: /^Role/ }).click();
    await panel.getByRole("checkbox", { name: /^Consultant/ }).check();
    const dept = panel.getByRole("button", { name: "Department" });
    if (await dept.isEnabled()) {
      await dept.evaluate((el) => el.scrollIntoView({ block: "center" })); // the list opens under the trigger and closes on scroll
      await dept.click();
      await page.getByRole("option").first().click();
    }
    await panel.getByRole("button", { name: /Send invitation/ }).click();
    await expect(page.getByText("Invite sent")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => pending(page)).toBe(pending0 + 1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Invitation cancelled")).toBeVisible();
    await expect.poll(() => pending(page)).toBe(pending0);
    await expect(table.locator("tr", { hasText: undoEmail }).locator('[data-invitation-status="REVOKED"]')).toBeVisible();
  });

  test("an incomplete form is refused field by field, nothing is sent", async ({ page }) => {
    await demoSignIn(page, acme, "Sarah Chen");
    await page.goto(INVITATIONS);
    const panel = await openInvite(page);
    await expect(panel).toBeVisible();
    await panel.getByLabel(/Email address/).fill("not-an-email");
    await panel.getByRole("button", { name: /Send invitation/ }).click();
    await expect(panel.getByText("That doesn't look like an email address.")).toBeVisible();
    await expect(panel.getByText("Pick at least one role.")).toBeVisible();
  });

  test("a second tenant can not see Acme's invitations (generic 404), and has its own empty state", async ({ browser }) => {
    expect(orgId, "the first test learned Acme's organization id").not.toBe("");
    const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await demoSignIn(page, beta, "Bea Turner");
    for (const suffix of ["", "/counts", "/activity"]) {
      // from the browser (the cookie and the host are Beta's): Acme's organization id on Beta's host
      const res = await page.evaluate(async (u) => {
        const r = await fetch(u);
        return { status: r.status, text: await r.text() };
      }, `/api/orgs/${orgId}/invitations${suffix}`);
      expect(res.status, suffix).toBe(404);
      expect(res.text).not.toContain("@");
    }
    await page.goto(`${beta}/w/admin/employees?tab=invitations`);
    await expect(page.locator("[data-invitations-page]")).toBeVisible();
    await expect(page.getByText("No invitations yet")).toBeVisible();
    await expect(page.getByRole("button", { name: /Invite your first teammate/ })).toBeVisible();
    await expect(page.getByText("e2e.invite")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "invitations-empty-1440.png"), fullPage: true });
    await ctx.close();
  });
});

for (const [name, width, height] of [
  ["768", 768, 1100],
  ["390", 390, 900],
] as const) {
  test(`screenshot at ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await demoSignIn(page, acme, "Sarah Chen");
    await page.goto(INVITATIONS);
    await expect(page.locator("[data-invitations-page]")).toBeVisible();
    await expect(page.locator('[data-invitations-page] :is(table, ul)[aria-label="Invitations"]').first()).toBeVisible(); // a table, or cards on a phone
    await page.waitForTimeout(800);
    // nothing may scroll sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(SHOTS, `invitations-${name}.png`), fullPage: true });
    if (width < 768) {
      await page.locator("[data-add-employee]").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `invitations-${name}-sheet.png`) });
    }
    await ctx.close();
  });
}
