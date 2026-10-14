import { test, expect, narrate } from "../_support/story";
import { bff, orgIdOf, stamp } from "./_helpers";

test("ADM-20 Org admin sees the real departments and teams with live counts", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/departments");
  const orgId = await orgIdOf(page);
  await narrate(page, "Sarah opens Departments");
  const cards = page.getByRole("list", { name: "Departments", exact: true });
  await expect(cards.getByText("Consulting", { exact: true })).toBeVisible({ timeout: 30_000 });
  for (const d of ["Marketing", "HR", "Finance", "Operations"]) await expect(cards.getByText(d, { exact: true })).toBeVisible();
  await narrate(page, "The employee count on the Consulting card is the API's count");
  const structure = (await bff(page, "GET", `/api/orgs/${orgId}/groups/structure`)).json;
  const consulting = structure.departments.find((n: { group: { name: string } }) => n.group.name === "Consulting");
  await expect(page.getByRole("button", { name: new RegExp(`Consulting\\s+${consulting.group.activeCount} employee`) })).toBeVisible();
  await expect(page.getByText("Total Departments")).toBeVisible();
  await expect(page.getByText(/open positions/i)).toHaveCount(0); // no recruiting data: no invented tile

  await narrate(page, "Teams: Bench East is there, and the page is honest that nothing measures performance yet");
  await go("/w/admin/teams");
  await expect(page.getByRole("list", { name: "Teams", exact: true }).getByText("Bench East")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Nothing measures team performance yet/)).toBeVisible();
});

test("ADM-21 Org admin creates a department and a team under it, moves a person, and deletes the team", async ({ as }) => {
  const { page, go } = await as("sarah");
  const dept = `Legal ${stamp()}`;
  const team = `Contracts ${stamp()}`;
  await go("/w/admin/departments");
  const orgId = await orgIdOf(page);

  await narrate(page, "Sarah creates a department with hana as its lead");
  await page.getByRole("button", { name: "Create Department", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Create Department" });
  await sheet.getByLabel(/Department name/).fill(dept);
  await sheet.getByRole("combobox", { name: "Department lead" }).fill("Hana");
  await sheet.getByRole("option", { name: /Hana Petrov/ }).getByRole("button").click();
  await sheet.getByRole("button", { name: "shield" }).click();
  await sheet.getByRole("button", { name: "Amber" }).click();
  await sheet.getByRole("button", { name: "Create Department", exact: true }).click();
  await expect(page.getByRole("list", { name: "Departments", exact: true }).getByText(dept)).toBeVisible({ timeout: 30_000 });

  await narrate(page, "Then a team under it, led by Omar, with Ben as a member");
  await go("/w/admin/teams");
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
  const card = page.locator(`[data-team-card="${team}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("1 member")).toBeVisible();
  await expect(card.getByText(dept)).toBeVisible();

  await narrate(page, "Open the team: it cannot be deleted while Ben is in it");
  await card.locator("button").first().click();
  const detail = page.getByRole("dialog", { name: team });
  await expect(detail.getByRole("list", { name: "People in this group" }).getByText("Ben Okafor")).toBeVisible({ timeout: 30_000 });
  await expect(detail.getByRole("button", { name: "Delete" })).toBeDisabled();

  await narrate(page, "Sarah moves Ben back to Bench East");
  await detail.getByRole("button", { name: "Move Ben Okafor to" }).click();
  await page.getByRole("option", { name: "Bench East" }).click();
  await expect(detail.getByText("Nobody is in this team yet.")).toBeVisible({ timeout: 30_000 });

  await narrate(page, "The empty team can now be deleted");
  await expect(detail.getByRole("button", { name: "Delete" })).toBeEnabled();
  await detail.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete team" }).click();
  await expect(page.locator(`[data-team-card="${team}"]`)).toHaveCount(0, { timeout: 30_000 });

  // tidy the throwaway department so the story can repeat
  const left = (await bff(page, "GET", `/api/orgs/${orgId}/groups/directory?kind=DEPARTMENT&q=${encodeURIComponent(dept)}`)).json;
  if (left.items?.[0]) {
    const del = await bff(page, "DELETE", `/api/orgs/${orgId}/groups/${left.items[0].id}`, undefined, { "if-match": String(left.items[0].version) });
    expect(del.status).toBe(204);
  }
});

test("ADM-22 Beta has no departments of its own yet and cannot read Acme's; a consultant gets nothing", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/departments");
  const acmeOrg = await orgIdOf(sarah.page);
  const acmeStructure = (await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/groups/structure`)).json;
  expect(acmeStructure.departments.length).toBeGreaterThanOrEqual(5);

  const bea = await as("bea");
  await bea.go("/w/admin/departments");
  await narrate(bea.page, "Bea sees Beta's empty state, not Acme's departments");
  await expect(bea.page.getByText("Group people into departments and teams")).toBeVisible({ timeout: 30_000 });
  for (const path of ["", "/directory", "/structure", `/${acmeStructure.departments[0].group.id}`]) {
    expect((await bff(bea.page, "GET", `/api/orgs/${acmeOrg}/groups${path}`)).status, `groups${path}`).toBe(404);
  }
  expect((await bff(bea.page, "POST", `/api/orgs/${acmeOrg}/groups`, { name: "Planted", kind: "DEPARTMENT" })).status).toBe(404);

  const anika = await as("anika");
  await anika.go("/w/admin/departments");
  await narrate(anika.page, "Anika (consultant) is told this is not part of her role");
  await expect(anika.page.locator("[data-not-your-role]").first()).toBeVisible({ timeout: 30_000 });
  expect((await bff(anika.page, "GET", `/api/orgs/${acmeOrg}/groups`)).status).toBe(404);
});
