import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, openRowMenu, orgIdOf, pickFirstDepartment, stamp } from "./_helpers";

const rowOf = (page: Page, name: string) => page.locator("tr[data-row-id]", { hasText: name });
const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
const INVITATIONS = "/w/admin/employees?tab=invitations";
/** The pending-invitation count, as the Employees page's "Invitations (N)" tab label shows it (no number when there are none). */
const pendingInvites = async (page: Page) => {
  const m = (await page.getByRole("tab", { name: /^Invitations/ }).innerText()).match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
};
/** Opens the "Add employee" dialog from the Employees page header. */
const openAddEmployee = async (page: Page) => {
  await page.locator("[data-add-employee]").click();
  const dialog = page.getByRole("dialog", { name: "Add employee" });
  await expect(dialog).toBeVisible();
  return dialog;
};

test("ADM-10 Org admin reviews the employee roster with real counts, search and a status filter", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await narrate(page, "Sarah opens Employees from the sidebar");
  await page.locator('[data-shell-sidebar] [data-nav-item="employees"]').first().click();
  await page.waitForURL(/\/w\/admin\/employees/);
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await expect(page.locator("tr[data-row-id]").first()).toBeVisible();

  await narrate(page, "The tiles count the roster: one invited, one suspended");
  await expect(kpi(page, "active")).not.toHaveText("");
  await expect(kpi(page, "invited")).toHaveText("1"); // Nina Vogel
  await expect(kpi(page, "suspended")).toHaveText("1"); // Sam Whitfield
  await expect(page.locator("[data-showing]")).toContainText(/of \d+ employees/);
  const total = Number(((await page.locator("[data-showing]").innerText()).match(/of ([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  expect(total).toBeGreaterThanOrEqual(11);

  await narrate(page, "Searching for Anika narrows the table to her");
  const search = page.getByRole("searchbox", { name: "Search employees" });
  await search.fill("anika");
  await expect(page.locator("tr[data-row-id]")).toHaveCount(1);
  await expect(rowOf(page, "Anika Rao")).toBeVisible();
  await search.fill("");

  await narrate(page, "Filtering by Suspended shows only Sam Whitfield");
  await page.locator('[role=search] button[aria-label="Status"]').click();
  await page.getByRole("option", { name: "Suspended" }).click();
  await expect(page.locator("tr[data-row-id]")).toHaveCount(1);
  await expect(rowOf(page, "Sam Whitfield")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
});

test("ADM-11 Org admin edits an employee's job title and it is saved automatically", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await narrate(page, "Sarah opens Anika Rao's detail sheet");
  // the roster pages 10 at a time and grows with every account the other stories add, so find her by name
  await page.getByRole("searchbox", { name: "Search employees" }).fill("Anika Rao");
  await rowOf(page, "Anika Rao").click();
  const sheet = page.locator("#ent-employee-sheet");
  await expect(sheet.locator("[data-detail-body]")).toBeVisible();
  await expect(sheet).toContainText("Anika Rao");
  const title = sheet.getByRole("textbox", { name: "Job title" });
  const newTitle = `Senior Consultant ${Date.now() % 100000}`;
  await narrate(page, "She types a new job title: no Save button, it autosaves");
  await title.fill(newTitle);
  await expect(sheet.locator("[data-title-status=saved]")).toBeVisible();
  await narrate(page, "After a reload the new title is still there");
  await page.reload();
  await page.getByRole("searchbox", { name: "Search employees" }).fill("Anika Rao");
  await rowOf(page, "Anika Rao").click();
  await expect(sheet.getByRole("textbox", { name: "Job title" })).toHaveValue(newTitle);
  await sheet.getByRole("button", { name: "Close Anika Rao" }).click();
});

test("ADM-12 Org admin suspends an employee with a reason, then reinstates them", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await narrate(page, "Sarah opens the row menu for Ben Okafor and chooses Suspend");
  await openRowMenu(page, rowOf(page, "Ben Okafor"), "Suspend");
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  const dialog = page.getByRole("dialog", { name: /Suspend Ben Okafor/ });
  await narrate(page, "A reason is required");
  await dialog.getByLabel("Reason (required)").fill("Access review pending for the quarter");
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(rowOf(page, "Ben Okafor")).toContainText("Suspended");
  await narrate(page, "The same menu now offers Reinstate");
  await openRowMenu(page, rowOf(page, "Ben Okafor"), "Reinstate");
  await page.getByRole("menuitem", { name: "Reinstate" }).click();
  await expect(rowOf(page, "Ben Okafor")).toContainText("Active");
});

test("ADM-13 Org admin changes the roles of two people at once, then undoes it", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await narrate(page, "Sarah ticks Felix Ng and Hana Petrov");
  await page.getByRole("checkbox", { name: "Select Felix Ng" }).check();
  await page.getByRole("checkbox", { name: "Select Hana Petrov" }).check();
  await expect(page.locator("[data-bulk-bar]")).toContainText("2 selected");
  await narrate(page, "Bulk bar: Change roles, add Consultant");
  await page.getByRole("button", { name: "Change roles" }).click();
  const dlg = page.getByRole("dialog", { name: "Change roles" });
  await dlg.getByRole("group", { name: "Add these roles" }).getByLabel("Consultant", { exact: true }).check();
  await dlg.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Updated roles for 2 people/)).toBeVisible();
  await expect(rowOf(page, "Felix Ng")).toContainText("+1");
  await narrate(page, "Undo restores the seeded roles");
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Undone")).toBeVisible();
  await expect(rowOf(page, "Felix Ng")).not.toContainText("+1");
});

test("ADM-14 Offboarding asks for a typed confirmation and a reason (cancelled here, the roster stays intact)", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await narrate(page, "Sarah starts to offboard Tomas Berg");
  await openRowMenu(page, rowOf(page, "Tomas Berg"), "Delete employee");
  await page.getByRole("menuitem", { name: "Delete employee" }).click();
  const off = page.getByRole("dialog", { name: /Offboard Tomas Berg/ });
  await expect(off).toBeVisible();
  await expect(off).toContainText("Their records are kept");
  await expect(off.getByLabel("Type Tomas Berg to confirm")).toBeVisible();
  await expect(off.getByLabel("Reason (required)")).toBeVisible();
  await narrate(page, "She changes her mind and cancels: nothing is deleted");
  await page.keyboard.press("Escape");
  await expect(off).toHaveCount(0);
  await expect(rowOf(page, "Tomas Berg")).toBeVisible();
});

test("ADM-15 Org admin invites an employee, resends and revokes the invitation", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go(INVITATIONS);
  await expect(page.locator("[data-invitations-page]")).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Invitations/ })).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("table", { name: "Invitations" });

  await narrate(page, "The seeded invitation for Nina Vogel is Pending");
  const nina = table.locator("tr", { hasText: /nina/i });
  await expect(nina).toBeVisible();
  await expect(nina.locator('[data-invitation-status="PENDING"]')).toBeVisible();
  await expect.poll(() => pendingInvites(page)).toBeGreaterThanOrEqual(1);
  const pending0 = await pendingInvites(page);

  const email = `story.invite.${Date.now()}@example.com`;
  await narrate(page, "Sarah opens Add employee and fills in an invitation");
  const panel = await openAddEmployee(page);
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true }); // the dialog opens in "Create account now"; this story is the invitation flow
  await panel.getByLabel(/Email address/).fill(email);
  await panel.getByLabel(/Full name/).fill("Eli Story");
  await panel.getByRole("button", { name: /^Role/ }).click();
  await panel.getByRole("checkbox", { name: /^Consultant/ }).check();
  await pickFirstDepartment(page, panel);
  await panel.getByLabel(/Personal message/).fill("Welcome to the team.");
  await panel.getByRole("button", { name: /Send invitation/ }).click();
  await expect(page.getByText("Invite sent")).toBeVisible({ timeout: 20_000 });
  await expect(panel).toHaveCount(0); // sending closes the dialog

  await narrate(page, "The pending count on the Invitations tab goes up and Eli's row is there");
  await expect.poll(() => pendingInvites(page)).toBe(pending0 + 1);
  const row = table.locator("tr", { hasText: email });
  await expect(row).toBeVisible();

  await narrate(page, "Resend");
  await openRowMenu(page, row, /Resend/);
  await page.getByRole("menuitem", { name: /Resend/ }).click();
  await expect(page.getByText("Invitation sent again")).toBeVisible();

  await narrate(page, "Revoke: the chip flips and the pending count goes back down");
  await openRowMenu(page, row, /Revoke/);
  await page.getByRole("menuitem", { name: /Revoke/ }).click();
  await expect(row.locator('[data-invitation-status="REVOKED"]')).toBeVisible();
  await expect(page.getByText("Invitation revoked")).toBeVisible();
  await expect.poll(() => pendingInvites(page)).toBe(pending0);

  await narrate(page, "The Revoked filter keeps Eli and drops Nina");
  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("option", { name: "Revoked" }).click();
  await expect(table.locator("tr", { hasText: email })).toBeVisible();
  await expect(table.locator("tr", { hasText: /nina/i })).toHaveCount(0);
});

test("ADM-16 An incomplete invitation is refused field by field and nothing is sent", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go(INVITATIONS);
  const panel = await openAddEmployee(page);
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true }); // the dialog opens in "Create account now"; this story is the invitation flow
  await narrate(page, "Sarah types something that is not an email");
  await panel.getByLabel(/Email address/).fill("not-an-email");
  await panel.getByRole("button", { name: /Send invitation/ }).click();
  await expect(panel.getByText("That doesn't look like an email address.")).toBeVisible();
  await expect(panel.getByText("Pick at least one role.")).toBeVisible();
});

test("ADM-17 Sending an invitation can be undone from the toast", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go(INVITATIONS);
  const table = page.getByRole("table", { name: "Invitations" });
  await expect(table).toBeVisible();
  await expect.poll(() => pendingInvites(page)).toBeGreaterThanOrEqual(1); // Nina's seeded invitation
  const pending0 = await pendingInvites(page);
  const email = `story.undo.${stamp()}${Date.now()}@example.com`;
  const panel = await openAddEmployee(page);
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true }); // the dialog opens in "Create account now"; this story is the invitation flow
  await narrate(page, "Sarah sends an invitation");
  await panel.getByLabel(/Email address/).fill(email);
  await panel.getByRole("button", { name: /^Role/ }).click();
  await panel.getByRole("checkbox", { name: /^Consultant/ }).check();
  await pickFirstDepartment(page, panel);
  await panel.getByRole("button", { name: /Send invitation/ }).click();
  await expect(page.getByText("Invite sent")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => pendingInvites(page)).toBe(pending0 + 1);
  await narrate(page, "She clicks Undo in the toast: the invitation is cancelled");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Invitation cancelled")).toBeVisible();
  await expect.poll(() => pendingInvites(page)).toBe(pending0);
  await expect(table.locator("tr", { hasText: email }).locator('[data-invitation-status="REVOKED"]')).toBeVisible();
});

test("ADM-18 Another tenant cannot see Acme's people; Beta has its own empty invitations", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin/employees");
  const acmeOrg = await orgIdOf(sarah.page);

  const { page, go } = await as("bea");
  await go(INVITATIONS);
  await narrate(page, "Bea Turner (Beta owner) opens Employees, Invitations tab");
  await expect(page.locator("[data-invitations-page]")).toBeVisible();
  await expect(page.getByText("No invitations yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /Invite your first teammate/ })).toBeVisible();
  await narrate(page, "Acme's member and invitation APIs answer Beta with a generic 404");
  for (const suffix of ["/members", "/members/counts", "/invitations", "/invitations/counts", "/invitations/activity"]) {
    const r = await bff(page, "GET", `/api/orgs/${acmeOrg}${suffix}`);
    expect(r.status, suffix).toBe(404);
    expect(JSON.stringify(r.json ?? "")).not.toContain("@");
  }
});
