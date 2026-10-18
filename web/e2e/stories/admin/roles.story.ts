import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, openRowMenu, orgIdOf } from "./_helpers";

const SYSTEM = ["Owner", "Organization Admin", "Staff", "Member", "Consultant", "Marketing Specialist", "Marketing Manager", "HR Specialist", "Finance Specialist", "Account Manager", "Talent Acquisition", "Executive Viewer"];
const rowOf = (page: Page, name: string) => page.locator("tr", { has: page.getByText(name, { exact: true }) }).first();

async function openRoles(page: Page, go: (p: string) => Promise<void>) {
  await go("/w/admin/roles");
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  await expect(page.locator("[data-kpi-value]").first()).not.toHaveText("–");
}

test("ADM-30 Org admin reviews the twelve system roles with real user counts", async ({ as }) => {
  const { page, go } = await as("sarah");
  await narrate(page, "Sarah opens Roles & Permissions");
  await openRoles(page, go);
  await expect(page.getByRole("heading", { name: "Roles & Permissions", level: 1 })).toBeVisible();
  await expect(page.getByText("Role Templates & Custom Roles")).toBeVisible();
  for (const name of SYSTEM) await expect(rowOf(page, name), name).toBeVisible();

  await narrate(page, "The numbers on screen are the API's numbers");
  const orgId = await orgIdOf(page);
  const api = await bff(page, "GET", `/api/orgs/${orgId}/roles/overview`);
  expect(api.status).toBe(200);
  const roles = api.json.roles as { name: string; assignedUsers: number; system: boolean }[];
  expect(roles.filter((r) => r.system)).toHaveLength(12);
  for (const r of roles.filter((x) => x.system)) {
    const shown = await rowOf(page, r.name).locator("[data-assigned-users]").getAttribute("data-assigned-users");
    expect(Number(shown), `${r.name} users`).toBe(r.assignedUsers);
  }
  const byName = Object.fromEntries(roles.map((r) => [r.name, r.assignedUsers]));
  expect(byName["Organization Admin"]).toBeGreaterThanOrEqual(1); // Sarah
  expect(byName["Consultant"]).toBeGreaterThanOrEqual(2); // Anika, Ben
  await expect(page.locator('[data-kpi="Total Roles"] [data-kpi-value]')).toHaveText(String(roles.length));
  await expect(page.locator('[data-kpi="Active Users"] [data-kpi-value]')).toHaveText(String(api.json.activeUsers));
  await expect(page.getByText(/vs last month/i)).toHaveCount(0); // no invented trend
});

test("ADM-31 Org admin builds a custom role from a template, trims a permission, hits the Owner-only ceiling, and deletes it", async ({ as }) => {
  const { page, go } = await as("sarah");
  const roleName = `Story Night Desk ${Date.now().toString(36)}`;
  await openRoles(page, go);
  const orgId = await orgIdOf(page);

  await narrate(page, "Create Role, starting from the Marketing Specialist template");
  await page.getByRole("button", { name: /Create Role/ }).click();
  await page.getByLabel(/Role name/).fill(roleName);
  await page.getByRole("radio", { name: "A template" }).click();
  await page.getByRole("combobox", { name: "Template" }).or(page.getByRole("button", { name: /Template/ })).first().click();
  await page.getByRole("option", { name: "Marketing Specialist" }).click();
  await page.locator("[data-create-submit]").click();

  const editor = page.locator("[data-role-editor]");
  await expect(editor).toBeVisible();
  await expect(page.getByText(`${roleName} created`)).toBeVisible();
  await expect(editor.locator('[data-diff-chip="match"]')).toContainText("Matches Marketing Specialist");

  await narrate(page, "Remove one permission and review the change summary");
  const row = editor.locator('[data-perm-row="followups.manage"]');
  await expect(row).toHaveAttribute("data-perm-scope", "ASSIGNED");
  await row.getByRole("radio", { name: "Not granted" }).click();
  await expect(page.locator("[data-editor-footer]")).toContainText("1 permission change");
  await page.locator("[data-review-changes]").click();
  await expect(page.locator("[data-change-list]")).toContainText("Removed (1)");
  await page.locator("[data-confirm-go]").click();
  await expect(page.getByText("Role updated")).toBeVisible();
  await expect(editor.locator('[data-diff-chip="differs"]')).toContainText("Differs from Marketing Specialist");

  await narrate(page, "Organization-closing is the Owner's alone: the control is locked for an admin");
  const close = editor.locator('[data-perm-row="org.close"]');
  await expect(close).toHaveAttribute("data-perm-locked", "true");
  await expect(close).toContainText("Only the Owner holds this");
  await expect(close.getByRole("radio", { name: "Organization" })).toBeDisabled();

  await narrate(page, "Even by API, adding it is refused with the reason");
  const overview = (await bff(page, "GET", `/api/orgs/${orgId}/roles/overview`)).json.roles as { id: number; name: string }[];
  const mine = overview.find((r) => r.name === roleName)!;
  const got = (await bff(page, "GET", `/api/orgs/${orgId}/roles/${mine.id}`)).json;
  const perms = (got.permissions as { key: string; scope: string }[]).map((p) => ({ key: p.key, scope: p.scope }));
  const refused = await bff(page, "PATCH", `/api/orgs/${orgId}/roles/${mine.id}`, { permissions: [...perms, { key: "org.close", scope: "ORG" }] }, { "if-match": String(got.version) });
  expect(refused.status).toBe(422);
  expect(refused.json.code).toBe("ROLE_CEILING");

  await narrate(page, "The unused custom role is deleted again");
  await page.keyboard.press("Escape");
  await openRoles(page, go);
  await expect(rowOf(page, roleName).locator("[data-scope-pill]")).toHaveText("Custom");
  await openRowMenu(page, rowOf(page, roleName), /^Delete$/);
  await page.getByRole("menuitem", { name: /^Delete$/ }).click();
  await expect(page.getByText(`${roleName} deleted`)).toBeVisible();
  await expect(rowOf(page, roleName)).toHaveCount(0);

  await narrate(page, "History records the creation, the change and the deletion");
  await page.locator("[data-quick=audit]").click();
  const drawer = page.locator("#roles-history");
  await expect(drawer).toContainText("Role created");
  await expect(drawer).toContainText("Role deleted");
});

test("ADM-32 Beta's owner sees only Beta's roles and cannot read Acme's", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/roles");
  const acmeOrg = await orgIdOf(sarah.page);

  const { page, go } = await as("bea");
  await narrate(page, "Bea opens Beta's Roles & Permissions");
  await openRoles(page, go);
  const own = await bff(page, "GET", `/api/orgs/${await orgIdOf(page)}/roles/overview`);
  expect(own.status).toBe(200);
  expect((own.json.roles as unknown[]).length).toBeGreaterThanOrEqual(12);
  await narrate(page, "Acme's role APIs answer Beta with 404");
  for (const path of ["/roles/overview", "/permissions", "/roles/history"]) expect((await bff(page, "GET", `/api/orgs/${acmeOrg}${path}`)).status, path).toBe(404);
});
