import { test, expect, narrate } from "../_support/story";
import { apiGet, expectNotYourRole, orgIdOf } from "./_platform";

/**
 * PLT: the second wall. The menu hides what a role cannot use, a typed URL shows "This isn't part of your role" (no redirect, no data),
 * and the API behind it answers a generic 404 (never 403) so a refused call reveals nothing.
 */

test("PLT-16 A consultant typing an admin or marketing address is refused inside their own shell", async ({ as }) => {
  const { page, go } = await as("anika");
  await go("/w/consultant");
  await expect(page.locator("[data-consultant-home]")).toBeVisible();
  for (const path of ["/w/admin", "/w/admin/employees", "/w/admin/billing", "/w/marketing", "/w/marketing/talent"]) {
    await go(path);
    await narrate(page, `Anika types ${path}`, 600);
    await expectNotYourRole(page);
    await expect(page.locator("[data-dashboard], [data-employees-page], [data-coming-soon]")).toHaveCount(0);
  }
  await narrate(page, "The way back is her own workspace");
  await go("/w/admin");
  await page.getByRole("link", { name: /^Open My workspace/ }).click();
  await expect(page).toHaveURL(/\/w\/consultant$/);
});

test("PLT-17 A marketing specialist cannot reach Administration, billing, HR or Finance", async ({ as }) => {
  const { page, go } = await as("omar");
  for (const path of ["/w/admin", "/w/admin/billing", "/w/admin/roles", "/w/hr", "/w/finance", "/w/marketing-mgmt"]) {
    await go(path);
    await narrate(page, `Omar types ${path}`, 600);
    await expectNotYourRole(page);
  }
  await go("/w/marketing");
  await expect(page.locator("[data-shell-sidebar]")).toContainText("My Talent");
});

test("PLT-18 Inside a workspace you hold, a page your role lacks is still refused", async ({ as }) => {
  const cases: [Parameters<typeof as>[0], string][] = [
    ["omar", "/w/marketing/clients"],
    ["hana", "/w/hr/clients"],
    ["amara", "/w/accounts/employees"],
  ];
  for (const [who, path] of cases) {
    const { page, go } = await as(who);
    await go(path);
    await narrate(page, `${who} opens ${path}: the workspace is theirs, the page is not`, 700);
    await expectNotYourRole(page);
    await expect(page.locator("[data-clients-page], [data-employees-page]")).toHaveCount(0);
  }
});

test("PLT-19 The API refuses with a generic 404, never 403, and a stranger learns nothing", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin");
  const org = await orgIdOf(sarah.page);
  const ok = await apiGet(sarah.page, `/api/orgs/${org}/dashboard`);
  await narrate(sarah.page, "Sarah (Org Admin) can read the organization dashboard");
  expect(ok.status).toBe(200);
  for (const who of ["omar", "anika", "felix"] as const) {
    const s = await as(who);
    await s.go(`/w/${who === "felix" ? "finance" : who === "omar" ? "marketing" : "consultant"}`);
    const denied = await apiGet(s.page, `/api/orgs/${org}/dashboard`);
    await narrate(s.page, `${who} asks for the same dashboard and gets a plain 404`, 700);
    expect(denied.status, who).toBe(404);
    expect(denied.body, who).not.toMatch(/permission|forbidden|dashboard\.view_org|Acme/i);
  }
  const nothing = await apiGet(sarah.page, `/api/orgs/987654321/dashboard`);
  expect(nothing.status).toBe(404); // an organization that does not exist looks exactly like one you may not read
});
