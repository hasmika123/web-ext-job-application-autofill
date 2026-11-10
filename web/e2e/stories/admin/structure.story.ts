import { test, expect, narrate } from "../_support/story";
import { bff, orgIdOf, pickOption, stamp } from "./_helpers";

test("ADM-20 Org admin sees the real departments and teams with live counts", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/teams?tab=departments");
  const orgId = await orgIdOf(page);
  await narrate(page, "Sarah opens Teams & Departments, Departments tab");
  const tree = page.getByRole("region", { name: "Structure", exact: true });
  await expect(tree.getByText("Consulting", { exact: true })).toBeVisible({ timeout: 30_000 });
  for (const d of ["Marketing", "HR", "Finance", "Operations"]) await expect(tree.getByText(d, { exact: true })).toBeVisible();
  await narrate(page, "The employee count on the Consulting row is the API's count");
  const structure = (await bff(page, "GET", `/api/orgs/${orgId}/groups/structure`)).json;
  const consulting = structure.departments.find((n: { group: { name: string } }) => n.group.name === "Consulting");
  const row = page.getByRole("table", { name: "Departments" }).getByRole("row").filter({ has: page.getByText("Consulting", { exact: true }) });
  await expect(row.getByRole("cell").nth(1)).toHaveText(String(consulting.group.activeCount)); // Department name | Employees | ...
  await expect(page.locator("[data-group-counts]")).toContainText(/\d+ departments · \d+ people/);
  await expect(page.getByText(/open positions/i)).toHaveCount(0); // no recruiting data: no invented tile

  await narrate(page, "Teams tab: Bench East is there");
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await expect(page.getByRole("table", { name: "Team directory" }).getByText("Bench East")).toBeVisible({ timeout: 30_000 });
});

test("ADM-21 Org admin creates a department and a team under it, moves a person, and deletes the team", async ({ as }) => {
  const { page, go } = await as("sarah");
  const dept = `Legal ${stamp()}`;
  const team = `Contracts ${stamp()}`;
  await go("/w/admin/teams?tab=departments");
  const orgId = await orgIdOf(page);

  await narrate(page, "Sarah creates a department with hana as its lead");
  await page.locator('[data-create-group="departments"]').click();
  const sheet = page.getByRole("dialog", { name: "Create department" });
  await sheet.getByLabel(/Department name/).fill(dept);
  await sheet.getByRole("combobox", { name: "Department lead" }).fill("Hana");
  await sheet.getByRole("option", { name: /Hana Petrov/ }).getByRole("button").click();
  await sheet.getByRole("button", { name: "shield" }).click();
  await sheet.getByRole("button", { name: "Amber" }).click();
  await sheet.getByRole("button", { name: "Create department", exact: true }).click();
  await expect(page.getByRole("region", { name: "Structure", exact: true }).getByText(dept)).toBeVisible({ timeout: 30_000 });

  await narrate(page, "Then a team under it, led by Omar, with Ben as a member");
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await page.locator('[data-create-group="teams"]').click();
  const tsheet = page.getByRole("dialog", { name: "Create team" });
  await tsheet.getByLabel(/Team name/).fill(team);
  await tsheet.getByRole("button", { name: "Department" }).click();
  await page.getByRole("option", { name: dept }).click();
  await tsheet.getByRole("combobox", { name: "Team lead" }).fill("Omar");
  await tsheet.getByRole("option", { name: /Omar Haddad/ }).getByRole("button").click();
  await tsheet.getByRole("combobox", { name: "Add people to the team" }).fill("Ben");
  await tsheet.getByRole("option", { name: /Ben Okafor/ }).getByRole("button").click();
  await tsheet.getByRole("button", { name: "Create team", exact: true }).click();
  const teams = page.getByRole("table", { name: "Team directory" });
  const teamRow = () => teams.getByRole("row").filter({ has: page.getByText(team, { exact: true }) });
  await page.getByRole("searchbox", { name: "Search the directory" }).fill(team); // the directory pages 8 at a time
  await expect(teamRow()).toBeVisible({ timeout: 30_000 });
  await expect(teamRow().getByRole("cell").nth(1)).toHaveText(dept); // Team name | Department | Team lead | Members | ...
  await expect(teamRow().getByRole("cell").nth(3)).toHaveText("1");

  await narrate(page, "Open the team: it cannot be deleted while Ben is in it");
  await teamRow().click();
  const detail = page.getByRole("dialog", { name: team });
  await expect(detail.getByRole("list", { name: "People in this group" }).getByText("Ben Okafor")).toBeVisible({ timeout: 30_000 });
  await expect(detail.getByRole("button", { name: "Delete" })).toBeDisabled();

  await narrate(page, "Sarah moves Ben back to Bench East");
  await pickOption(page, detail.getByRole("button", { name: "Move Ben Okafor to" }), page.getByRole("option", { name: "Bench East" }));
  await expect(detail.getByText("Nobody is in this team yet.")).toBeVisible({ timeout: 30_000 });

  await narrate(page, "The empty team can now be deleted");
  await expect(detail.getByRole("button", { name: "Delete" })).toBeEnabled();
  await detail.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete team" }).click();
  await expect(teamRow()).toHaveCount(0, { timeout: 30_000 });

  // tidy the throwaway department so the story can repeat
  const left = (await bff(page, "GET", `/api/orgs/${orgId}/groups/directory?kind=DEPARTMENT&q=${encodeURIComponent(dept)}`)).json;
  if (left.items?.[0]) {
    const del = await bff(page, "DELETE", `/api/orgs/${orgId}/groups/${left.items[0].id}`, undefined, { "if-match": String(left.items[0].version) });
    expect(del.status).toBe(204);
  }
});

test("ADM-22 Beta has no departments of its own yet and cannot read Acme's; a consultant gets nothing", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/teams?tab=departments");
  const acmeOrg = await orgIdOf(sarah.page);
  const acmeStructure = (await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/groups/structure`)).json;
  expect(acmeStructure.departments.length).toBeGreaterThanOrEqual(5);

  const bea = await as("bea");
  await bea.go("/w/admin/teams?tab=departments");
  await narrate(bea.page, "Bea sees Beta's empty state, not Acme's departments");
  await expect(bea.page.getByText("Group people into departments and teams")).toBeVisible({ timeout: 30_000 });
  for (const path of ["", "/directory", "/structure", `/${acmeStructure.departments[0].group.id}`]) {
    expect((await bff(bea.page, "GET", `/api/orgs/${acmeOrg}/groups${path}`)).status, `groups${path}`).toBe(404);
  }
  expect((await bff(bea.page, "POST", `/api/orgs/${acmeOrg}/groups`, { name: "Planted", kind: "DEPARTMENT" })).status).toBe(404);

  const anika = await as("anika");
  await anika.go("/w/admin/teams?tab=departments");
  await narrate(anika.page, "Anika (consultant) is told this is not part of her role");
  await expect(anika.page.locator("[data-not-your-role]").first()).toBeVisible({ timeout: 30_000 });
  expect((await bff(anika.page, "GET", `/api/orgs/${acmeOrg}/groups`)).status).toBe(404);
});
