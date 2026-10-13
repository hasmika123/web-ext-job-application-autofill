import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * X4.11: the Roles & Permissions page against the REAL stack (Spring API + MySQL + `next start`), not the mock. Setup is in
 * docs/enterprise-v2/real-stack-runbook.md; this spec only runs when it is switched on:
 *
 *   E2E_REAL_STACK=1 E2E_PORT=3205 E2E_DB=dossier_ent_roles PW_CHANNEL=chrome \
 *     npx playwright test e2e/journeys/tenant-roles.spec.ts --project=chromium --no-deps
 *
 * The API runs with DEMO_ENABLED + ENT_DEMO_SEED, and with DEMO_ALLOW_WRITES=true for THIS run only (demo members are read only
 * otherwise, and this journey writes roles). Sign-in goes through the "Demo accounts" tab like a person would.
 */
const real = process.env.E2E_REAL_STACK === "1";
const port = process.env.E2E_PORT ?? "3205";
const acme = `http://acme.localhost:${port}`;
const beta = `http://beta.localhost:${port}`;
const db = process.env.E2E_DB ?? "dossier_ent_roles";
const shots = path.resolve(__dirname, "../../../design/enterprise-admin/built");

const SYSTEM = ["Owner", "Organization Admin", "Staff", "Member", "Consultant", "Marketing Specialist", "Marketing Manager", "HR Specialist", "Finance Specialist", "Account Manager", "Talent Acquisition", "Executive Viewer"];
const ROLE_NAME = `E2E Night Desk ${Date.now().toString(36)}`;

function sql(query: string): string {
  return execFileSync("docker", ["exec", "rb-demo-mysql", "mysql", "-uroot", "-pdemotest", "-N", "-B", "-e", query, db], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

async function signInAs(page: Page, base: string, login: string) {
  await page.goto(`${base}/login`);
  await page.locator("[data-tenant-demo-tab]").click();
  await page.locator(`[data-demo-member="${login}"] button`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openRoles(page: Page, base: string) {
  await page.goto(`${base}/w/admin/roles`);
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  await expect(page.locator("[data-kpi-value]").first()).not.toHaveText("–");
}

/** The JSON of a BFF call made from the page (its own session cookie). */
async function bff(page: Page, method: string, url: string, body?: unknown, ifMatch?: string) {
  return page.evaluate(
    async ({ method, url, body, ifMatch }) => {
      const res = await fetch(url, { method, headers: { "content-type": "application/json", ...(ifMatch ? { "if-match": ifMatch } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json: json as Record<string, unknown> & unknown[] };
    },
    { method, url, body, ifMatch },
  );
}

async function orgIdOf(page: Page): Promise<number> {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.reload();
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  const hit = urls.map((u) => /\/api\/orgs\/(\d+)\/roles\/overview/.exec(u)).find(Boolean);
  expect(hit, "the page asked for the overview").toBeTruthy();
  return Number(hit![1]);
}

/** Opens a row's actions menu (scrolls first: the menu closes on scroll). */
async function openRowMenu(page: Page, name: string) {
  const row = rowOf(page, name);
  await row.scrollIntoViewIfNeeded();
  await expect(async () => {
    if ((await page.getByRole("menu").count()) === 0) await row.getByRole("button", { name: /row actions/i }).click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

const rowOf = (page: Page, name: string) =>page.locator("tr", { has: page.getByText(name, { exact: true }) }).first();

test.describe("Roles & Permissions on the real stack", () => {
  test.skip(!real, "needs the real stack: set E2E_REAL_STACK=1 (see the header of this file)");
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1440, height: 900 } });

  let context: BrowserContext;
  let page: Page;
  let acmeId = 0;
  let roleId = 0;

  test.beforeAll(async ({ browser }) => {
    mkdirSync(shots, { recursive: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    await signInAs(page, acme, "demo-ent-acme-sarah");
    await openRoles(page, acme);
    acmeId = await orgIdOf(page);
    // a clean slate when an earlier run was interrupted
    const left = await bff(page, "GET", `/api/orgs/${acmeId}/roles/overview`);
    const all = left.json.roles as { id: number; key: string; name: string; system: boolean; assignedUsers: number; version: string }[];
    const stale = all.filter((x) => !x.system && x.name.startsWith("E2E Night Desk"));
    if (stale.some((r) => r.assignedUsers > 0)) {
      const eve = Number(sql("SELECT m.id FROM org_member m JOIN jhi_user u ON u.id = m.user_id WHERE u.login = 'demo-ent-acme-eve'"));
      await bff(page, "PUT", `/api/orgs/${acmeId}/members/${eve}/roles`, { roleIds: [all.find((x) => x.key === "EXECUTIVE_VIEWER")!.id] });
    }
    for (const r of stale) {
      const fresh = await bff(page, "GET", `/api/orgs/${acmeId}/roles/${r.id}`);
      await bff(page, "DELETE", `/api/orgs/${acmeId}/roles/${r.id}`, undefined, String(fresh.json.version));
    }
  });
  test.afterAll(async () => {
    await context.close();
  });

  test("Sarah sees the twelve real system roles with the real user counts", async () => {
    await openRoles(page, acme);
    await expect(page.getByRole("heading", { name: "Roles & Permissions", level: 1 })).toBeVisible();
    await expect(page.getByRole("banner").getByText("Manage roles, permission sets, and access control for your organization.")).toBeVisible();
    await expect(page.getByText("Role Templates & Custom Roles")).toBeVisible();
    for (const name of SYSTEM) await expect(rowOf(page, name), name).toBeVisible();

    const api = await bff(page, "GET", `/api/orgs/${acmeId}/roles/overview`);
    expect(api.status).toBe(200);
    const roles = api.json.roles as { name: string; assignedUsers: number; system: boolean }[];
    expect(roles.filter((r) => r.system)).toHaveLength(12);
    // the page shows exactly what the API counts
    for (const r of roles.filter((x) => x.system)) {
      const shown = await rowOf(page, r.name).locator("[data-assigned-users]").getAttribute("data-assigned-users");
      expect(Number(shown), `${r.name} users`).toBe(r.assignedUsers);
    }
    const byName = Object.fromEntries(roles.map((r) => [r.name, r.assignedUsers]));
    // the demo roster: Sarah is the only Organization Admin and Marketing Manager, Anika and Ben are the consultants (Sam is suspended, Nina invited)
    expect(byName["Organization Admin"]).toBe(1);
    expect(byName["Marketing Manager"]).toBe(1);
    expect(byName["Marketing Specialist"]).toBe(1);
    expect(byName["Consultant"]).toBeGreaterThanOrEqual(2);
    expect(byName["HR Specialist"]).toBe(1);
    expect(byName["Finance Specialist"]).toBe(1);
    await expect(page.locator('[data-kpi="Total Roles"] [data-kpi-value]')).toHaveText(String(roles.length));
    await expect(page.locator('[data-kpi="Active Users"] [data-kpi-value]')).toHaveText(String(api.json.activeUsers));
    await expect(page.locator("[data-slice]")).toHaveCount(5);
    await expect(page.getByText(/vs last month/i)).toHaveCount(0);
    await page.screenshot({ path: path.join(shots, "roles-1440.png"), fullPage: true });
  });

  test("create a custom role from Marketing Specialist, remove one permission, confirm the summary", async () => {
    await page.getByRole("button", { name: /Create Role/ }).click();
    await page.getByLabel(/Role name/).fill(ROLE_NAME);
    await page.getByRole("radio", { name: "A template" }).click();
    await page.getByRole("combobox", { name: "Template" }).or(page.getByRole("button", { name: /Template/ })).first().click();
    await page.getByRole("option", { name: "Marketing Specialist" }).click();
    await page.locator("[data-create-submit]").click();

    const editor = page.locator("[data-role-editor]");
    await expect(editor).toBeVisible();
    await expect(page.getByText(`${ROLE_NAME} created`)).toBeVisible();
    await expect(editor.locator('[data-diff-chip="match"]')).toContainText("Matches Marketing Specialist");
    const row = editor.locator('[data-perm-row="followups.manage"]');
    await expect(row).toHaveAttribute("data-perm-scope", "ASSIGNED");
    await row.getByRole("radio", { name: "Not granted" }).click();
    await expect(page.locator("[data-editor-footer]")).toContainText("1 permission change");
    await expect(editor.locator('[data-diff-chip="match"]')).toBeVisible(); // the chip reflects the SAVED role until the save
    await page.locator("[data-review-changes]").click();
    const summary = page.locator("[data-change-list]");
    await expect(summary).toContainText("Removed (1)");
    await expect(summary).toContainText("Followups manage");
    await page.screenshot({ path: path.join(shots, "roles-confirm-1440.png") });
    await page.locator("[data-confirm-go]").click();
    await expect(page.getByText("Role updated")).toBeVisible();
    await expect(editor.locator('[data-diff-chip="differs"]')).toContainText("Differs from Marketing Specialist");
    await expect(editor.locator('[data-perm-row="followups.manage"]')).toHaveAttribute("data-perm-scope", "NONE");
    await page.screenshot({ path: path.join(shots, "roles-editor-1440.png") });

    // the ceiling: Sarah is an Organization Admin, so org.close is the Owner's alone and says so
    const close = editor.locator('[data-perm-row="org.close"]');
    await expect(close).toHaveAttribute("data-perm-locked", "true");
    await expect(close).toContainText("Only the Owner holds this");
    await expect(close.getByRole("radio", { name: "Organization" })).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-role-editor]")).toHaveCount(0, { timeout: 5000 }).catch(() => undefined);
    const overview = await bff(page, "GET", `/api/orgs/${acmeId}/roles/overview`);
    const mine = (overview.json.roles as { id: number; name: string }[]).find((r) => r.name === ROLE_NAME)!;
    expect(mine).toBeTruthy();
    roleId = mine.id;
    await openRoles(page, acme);
    await expect(rowOf(page, ROLE_NAME)).toBeVisible();
    await expect(rowOf(page, ROLE_NAME).locator("[data-scope-pill]")).toHaveText("Custom");
  });

  test("adding org.close is refused by the API with the reason; the role is unchanged", async () => {
    const got = await bff(page, "GET", `/api/orgs/${acmeId}/roles/${roleId}`);
    const perms = (got.json.permissions as { key: string; scope: string }[]).map((p) => ({ key: p.key, scope: p.scope }));
    const refused = await bff(page, "PATCH", `/api/orgs/${acmeId}/roles/${roleId}`, { permissions: [...perms, { key: "org.close", scope: "ORG" }] }, String(got.json.version));
    expect(refused.status).toBe(422);
    expect(refused.json.code).toBe("ROLE_CEILING");
    expect(refused.json.key).toBe("org.close");
    const again = await bff(page, "GET", `/api/orgs/${acmeId}/roles/${roleId}`);
    expect(again.json.version).toBe(got.json.version);
    // and the Owner role is not assignable by an admin
    const owner = (await bff(page, "GET", `/api/orgs/${acmeId}/roles/overview`)).json.roles as { id: number; key: string }[];
    const ownerId = owner.find((r) => r.key === "OWNER")!.id;
    const eve = Number(sql("SELECT m.id FROM org_member m JOIN jhi_user u ON u.id = m.user_id WHERE u.login = 'demo-ent-acme-eve'"));
    const handOver = await bff(page, "PUT", `/api/orgs/${acmeId}/members/${eve}/roles`, { roleIds: [ownerId] });
    expect(handOver.status).toBe(422);
    expect(handOver.json.code).toBe("ROLE_CEILING");
  });

  test("assign it to a member: the count moves and Delete says who still holds it", async () => {
    const eve = Number(sql("SELECT m.id FROM org_member m JOIN jhi_user u ON u.id = m.user_id WHERE u.login = 'demo-ent-acme-eve'"));
    const assigned = await bff(page, "PUT", `/api/orgs/${acmeId}/members/${eve}/roles`, { roleIds: [roleId] });
    expect(assigned.status).toBe(200);
    await openRoles(page, acme);
    await expect(rowOf(page, ROLE_NAME).locator("[data-assigned-users]")).toHaveAttribute("data-assigned-users", "1");
    await openRowMenu(page, ROLE_NAME);
    const del = page.getByRole("menuitem", { name: /Delete \(used by 1\)/ });
    await expect(del).toBeVisible();
    await expect(del).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("menuitem", { name: /Assign users/ }).click();
    await page.waitForURL(/\/w\/admin\/employees\?role=/);
    const assignLink = page.url();
    expect(assignLink).toContain(`/w/admin/employees?role=${roleId}`);
    // give Eve her own role back (the Executive Viewer template)
    const roles = (await bff(page, "GET", `/api/orgs/${acmeId}/roles/overview`)).json.roles as { id: number; key: string }[];
    const back = await bff(page, "PUT", `/api/orgs/${acmeId}/members/${eve}/roles`, { roleIds: [roles.find((r) => r.key === "EXECUTIVE_VIEWER")!.id] });
    expect(back.status).toBe(200);
  });

  test("delete the unused custom role, with Undo", async () => {
    await openRoles(page, acme);
    await openRowMenu(page, ROLE_NAME);
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await expect(page.getByText(`${ROLE_NAME} deleted`)).toBeVisible();
    await expect(rowOf(page, ROLE_NAME)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rowOf(page, ROLE_NAME)).toBeVisible();
    // the undo made a new role with the same permissions (minus the one removed): the audit trail has all of it
    await page.locator("[data-quick=audit]").click();
    const drawer = page.locator("#roles-history");
    await expect(drawer).toContainText("Role deleted");
    await expect(drawer).toContainText("Role created");
    await expect(drawer).toContainText("Role changed");
    await page.screenshot({ path: path.join(shots, "roles-history-1440.png") });
    await page.keyboard.press("Escape");
    // clean up for a re-run
    await openRowMenu(page, ROLE_NAME);
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await expect(rowOf(page, ROLE_NAME)).toHaveCount(0);
    const final = (await bff(page, "GET", `/api/orgs/${acmeId}/roles/overview`)).json.roles as { name: string }[];
    expect(final.some((r) => r.name === ROLE_NAME)).toBe(false);
  });

  test("Beta's Bea cannot see Acme's roles, and sees her own organization's", async ({ browser }) => {
    const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bpage = await bctx.newPage();
    await signInAs(bpage, beta, "demo-ent-beta-bea");
    await openRoles(bpage, beta);
    await expect(bpage.getByText(ROLE_NAME)).toHaveCount(0);
    const own = await bff(bpage, "GET", `/api/orgs/${await orgIdOf(bpage)}/roles/overview`);
    expect(own.status).toBe(200);
    expect((own.json.roles as unknown[]).length).toBeGreaterThanOrEqual(12);
    const hostile = await bff(bpage, "GET", `/api/orgs/${acmeId}/roles/overview`);
    expect(hostile.status).toBe(404);
    expect((await bff(bpage, "GET", `/api/orgs/${acmeId}/permissions`)).status).toBe(404);
    expect((await bff(bpage, "GET", `/api/orgs/${acmeId}/roles/history`)).status).toBe(404);
    await bctx.close();
  });

  for (const [w, h] of [
    [768, 1024],
    [390, 844],
  ] as const) {
    test(`screenshots at ${w}`, async () => {
      await page.setViewportSize({ width: w, height: h });
      await openRoles(page, acme);
      await page.screenshot({ path: path.join(shots, `roles-${w}.png`), fullPage: true });
      await page.locator("[data-roles-page] tbody tr, [data-roles-page] ul[aria-label=Roles] li button").first().click();
      await expect(page.locator("[data-role-editor]")).toBeVisible();
      await expect(page.locator('[data-perm-row="reports.view"]')).toBeVisible();
      await page.screenshot({ path: path.join(shots, `roles-editor-${w}.png`) });
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1440, height: 900 });
    });
  }
});
