import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * X4.5 against the REAL stack (docs/enterprise-v2/real-stack-runbook.md): Spring API on 18183, database dossier_ent_demo, the web app as
 * a production build on 3200, the demo tenants seeded with DEMO_ENABLED=true ENT_DEMO_SEED=true (plus DEMO_ALLOW_WRITES=true: the demo
 * members write in this run). Run with `npm run test:e2e:real -w web` (config `playwright.realstack.config.ts`; it starts nothing).
 *
 * Sarah Chen signs in through the Demo accounts tab, sees the real departments and teams the seeder planted, creates a department and
 * a team under it, moves a person, changes a lead, hits the delete guard, and beta.localhost proves it cannot see Acme's groups.
 * Screenshots go to design/enterprise-admin/built/ at 1440, 768 and 390.
 */
const ACME = process.env.REAL_ACME_URL ?? "http://acme.localhost:3200";
const BETA = process.env.REAL_BETA_URL ?? "http://beta.localhost:3200";
const SHOTS = process.env.SHOTS_DIR ?? "../design/enterprise-admin/built";
const stamp = Date.now().toString(36).slice(-5);

async function signInAs(page: Page, base: string, name: string) {
  await page.goto(`${base}/login`);
  await page.locator("[data-tenant-demo-tab]").click();
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
  await page.waitForSelector("[data-enterprise-shell]", { timeout: 30_000 });
}


/** Calls the BFF from inside the page (the browser resolves *.localhost; Playwright's own request client does not). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the BFF's JSON is whatever the page under test sends
async function api(page: Page, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  return page.evaluate(
    async ({ method, path, body, headers }) => {
      const res = await fetch(path, { method, headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    },
    { method, path, body, headers },
  );
}
const getJson = async (page: Page, path: string) => (await api(page, "GET", path)).json;

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe.configure({ mode: "serial" });

test.describe("departments and teams on the real stack", () => {
  const dept = `Legal ${stamp}`;
  const team = `Contracts ${stamp}`;
  let orgId = 0;

  test("Sarah sees the real departments, teams and counts", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, ACME, "Sarah Chen");
    const me = await getJson(page, "/api/me/tenant");
    orgId = me.org.id;

    await page.goto(`${ACME}/w/admin/departments`);
    const cards = page.getByRole("list", { name: "Departments", exact: true });
    await expect(cards.getByText("Consulting", { exact: true })).toBeVisible({ timeout: 30_000 });
    for (const d of ["Marketing", "HR", "Finance", "Operations"]) await expect(cards.getByText(d, { exact: true })).toBeVisible();
    // the counts on the page are the API's counts
    const api = await getJson(page, `/api/orgs/${orgId}/groups/structure`);
    const consulting = api.departments.find((n: { group: { name: string } }) => n.group.name === "Consulting");
    await expect(page.getByRole("button", { name: new RegExp(`Consulting\\s+${consulting.group.activeCount} employee`) })).toBeVisible();
    await expect(page.getByText("Total Departments")).toBeVisible();
    await expect(page.getByText(/open positions/i)).toHaveCount(0); // no recruiting data: no tile
    await shot(page, "departments-1440");

    await page.goto(`${ACME}/w/admin/teams`);
    await expect(page.getByRole("list", { name: "Teams", exact: true }).getByText("Bench East")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Nothing measures team performance yet/)).toBeVisible();
    await expect(page.getByText(/workload/i)).toHaveCount(0);
    await shot(page, "teams-1440");
  });

  test("creates a department, then a team under it with a lead and a person", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, ACME, "Sarah Chen");
    await page.goto(`${ACME}/w/admin/departments`);
    await page.getByRole("button", { name: "Create Department", exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: "Create Department" });
    await sheet.getByLabel(/Department name/).fill(dept);
    await sheet.getByRole("combobox", { name: "Department lead" }).fill("Hana");
    await sheet.getByRole("option", { name: /Hana Petrov/ }).getByRole("button").click();
    await sheet.getByRole("button", { name: "shield" }).click();
    await sheet.getByRole("button", { name: "Amber" }).click();
    await shot(page, "departments-create-1440");
    await sheet.getByRole("button", { name: "Create Department", exact: true }).click();
    await expect(page.getByRole("list", { name: "Departments", exact: true }).getByText(dept)).toBeVisible({ timeout: 30_000 });

    await page.goto(`${ACME}/w/admin/teams`);
    await page.getByRole("button", { name: "Create Team", exact: true }).first().click();
    const tsheet = page.getByRole("dialog", { name: "Create Team" });
    await tsheet.getByLabel(/Team name/).fill(team);
    await tsheet.getByRole("button", { name: "Department" }).click();
    await page.getByRole("option", { name: dept }).click();
    await tsheet.getByRole("combobox", { name: "Team lead" }).fill("Omar");
    await tsheet.getByRole("option", { name: /Omar Haddad/ }).getByRole("button").click();
    await tsheet.getByRole("combobox", { name: "Add people to the team" }).fill("Ben");
    await tsheet.getByRole("option", { name: /Ben Okafor/ }).getByRole("button").click();
    await tsheet.getByRole("button", { name: "Create Team", exact: true }).click();
    const teamCard = page.locator(`[data-team-card="${team}"]`);
    await expect(teamCard).toBeVisible({ timeout: 30_000 });
    await expect(teamCard.getByText("1 member")).toBeVisible();
    await expect(teamCard.getByText(dept)).toBeVisible();
    // the API agrees: Ben carries both links
    const dir = await getJson(page, `/api/orgs/${orgId}/groups/directory?kind=TEAM&q=${encodeURIComponent(team)}`);
    expect(dir.items[0].parentName).toBe(dept);
    expect(dir.items[0].lead.name).toBe("Omar Haddad");
  });

  test("moves a person to another team, changes a lead with undo, and the delete guard explains itself", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, ACME, "Sarah Chen");
    await page.goto(`${ACME}/w/admin/teams`);
    await page.locator(`[data-team-card="${team}"] button`).first().click();
    const sheet = page.getByRole("dialog", { name: team });
    await expect(sheet.getByRole("list", { name: "People in this group" }).getByText("Ben Okafor")).toBeVisible({ timeout: 30_000 });

    // delete guard: the team has a person, so Delete is disabled and says why
    await expect(sheet.getByRole("button", { name: "Delete" })).toBeDisabled();

    // move Ben to Bench East
    await sheet.getByRole("button", { name: "Move Ben Okafor to" }).click();
    await page.getByRole("option", { name: "Bench East" }).click();
    await expect(sheet.getByText("Nobody is in this team yet.")).toBeVisible({ timeout: 30_000 });
    const bench = await getJson(page, `/api/orgs/${orgId}/groups/directory?kind=TEAM&q=Bench`);
    expect(bench.items[0].activeCount).toBeGreaterThanOrEqual(2);

    // change the lead to Hana, then undo it
    await sheet.getByRole("combobox", { name: "Change lead" }).fill("Hana");
    await sheet.getByRole("option", { name: /Hana Petrov/ }).getByRole("button").click();
    await expect(page.getByText(/Hana Petrov now leads/)).toBeVisible({ timeout: 30_000 });
    let d = await getJson(page, `/api/orgs/${orgId}/groups/directory?kind=TEAM&q=${encodeURIComponent(team)}`);
    expect(d.items[0].lead.name).toBe("Hana Petrov");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await getJson(page, `/api/orgs/${orgId}/groups/directory?kind=TEAM&q=${encodeURIComponent(team)}`)).items[0].lead.name, { timeout: 30_000 }).toBe("Omar Haddad");

    // now the team is empty: delete it (with its version), and the department can follow
    await expect(sheet.getByRole("button", { name: "Delete" })).toBeEnabled();
    await shot(page, "teams-detail-1440");
    await sheet.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete team" }).click();
    await expect(page.locator(`[data-team-card="${team}"]`)).toHaveCount(0, { timeout: 30_000 });
    d = await getJson(page, `/api/orgs/${orgId}/groups/directory?kind=TEAM&q=${encodeURIComponent(team)}`);
    expect(d.total).toBe(0);
  });

  test("the layout holds at 768 and 390", async ({ page }) => {
    test.setTimeout(240_000);
    await signInAs(page, ACME, "Sarah Chen");
    for (const [w, h] of [
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      for (const p of ["departments", "teams"]) {
        await page.goto(`${ACME}/w/admin/${p}`);
        await page.waitForSelector(`[data-page="${p}"]`, { timeout: 30_000 });
        await shot(page, `${p}-${w}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${p} at ${w}px must not scroll sideways`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("another organization cannot see Acme's groups, and a consultant gets nothing", async ({ browser, page }) => {
    test.setTimeout(240_000);
    await signInAs(page, ACME, "Sarah Chen");
    const acmeStructure = await getJson(page, `/api/orgs/${orgId}/groups/structure`);
    expect(acmeStructure.departments.length).toBeGreaterThanOrEqual(5);

    const betaCtx = await browser.newContext();
    const bp = await betaCtx.newPage();
    await signInAs(bp, BETA, "Bea Turner");
    // Beta's own organization has no groups; Acme's id is a plain 404 from Beta's session, for every route
    const betaMe = await getJson(bp, "/api/me/tenant");
    expect(betaMe.org.id).not.toBe(orgId);
    for (const path of ["", "/directory", "/structure", `/${acmeStructure.departments[0].group.id}`]) {
      const r = await api(bp, "GET", `/api/orgs/${orgId}/groups${path}`);
      expect(r.status, `beta reading acme groups${path}`).toBe(404);
    }
    const own = await getJson(bp, `/api/orgs/${betaMe.org.id}/groups/structure`);
    expect(own.departments).toHaveLength(0);
    const write = await api(bp, "POST", `/api/orgs/${orgId}/groups`, { name: "Planted", kind: "DEPARTMENT" });
    expect(write.status).toBe(404);
    await bp.goto(`${BETA}/w/admin/departments`);
    await expect(bp.getByText("Group people into departments and teams")).toBeVisible({ timeout: 30_000 });
    await betaCtx.close();

    // a consultant (no structure permission) is told the page is not theirs, and the API says 404
    const cCtx = await browser.newContext();
    const cp = await cCtx.newPage();
    await signInAs(cp, ACME, "Anika Rao");
    expect((await api(cp, "GET", `/api/orgs/${orgId}/groups`)).status).toBe(404);
    await cp.goto(`${ACME}/w/consultant/departments`);
    await expect(cp.getByText("This isn't part of your role").first()).toBeVisible({ timeout: 30_000 });
    await cCtx.close();

    // the demo department made earlier is tidied up so the run can repeat
    const left = await getJson(page, `/api/orgs/${orgId}/groups/directory?kind=DEPARTMENT&q=${encodeURIComponent(dept)}`);
    if (left.items[0]) {
      const del = await api(page, "DELETE", `/api/orgs/${orgId}/groups/${left.items[0].id}`, undefined, { "if-match": left.items[0].version });
      expect(del.status).toBe(204);
    }
  });
});
