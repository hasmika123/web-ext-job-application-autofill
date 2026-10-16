import { test, expect, narrate } from "../stories/_support/story";
import { bff, orgIdOf, openRowMenu, pickFirstDepartment, stamp } from "../stories/admin/_helpers";
import { PERSONAS, hostOf } from "../stories/_support/personas";
import { statePath } from "../stories/_support/global-setup";

/**
 * VIDEO 03: the Org Admin runs the organization (Sarah Chen, Acme Staffing).
 * Stories shown: ADM-01 dashboard, ADM-70 branding (draft, preview, publish), ADM-20/21 departments and teams, ADM-30/31 roles,
 * ADM-19 create an account now (and the invitation mode, ADM-15), ADM-48 marketing assignments, Settings (share links, ent-resume).
 * Everything the video creates is tidied afterwards through the same API the page uses, so the demo can be recorded again.
 */
test("VIDEO-03 Org admin: dashboard, branding, structure, roles, people, assignments, settings", async ({ flow, browser }) => {
  // a clean start: an unrecorded browser discards any leftover branding draft from an earlier take
  const prep = await browser.newContext({ storageState: statePath("sarah"), viewport: { width: 1440, height: 900 } });
  const p0 = await prep.newPage();
  await p0.goto(`${hostOf(PERSONAS.sarah)}/w/admin/branding`);
  await expect(p0.locator("[data-branding-page]")).toBeVisible({ timeout: 45_000 });
  await expect(p0.locator("[data-draft-badge]")).toBeVisible({ timeout: 30_000 });
  if ((await p0.locator("[data-draft-badge=differs]").count()) > 0) {
    await p0.locator("[data-discard]").click();
    await p0.locator("[data-discard-confirm]").click();
    await expect(p0.locator("[data-draft-badge=live]")).toBeVisible({ timeout: 20_000 });
  }
  await p0.goto(`${hostOf(PERSONAS.sarah)}/w/admin/settings`);
  await expect(p0.locator("[data-org-settings]")).toBeVisible({ timeout: 30_000 });
  if ((await p0.getByRole("switch", { name: /Share links/ }).getAttribute("aria-checked")) === "true") {
    await p0.getByRole("switch", { name: /Share links/ }).click();
    await p0.locator("[data-confirm-off]").click();
    await expect(p0.getByRole("switch", { name: /Share links/ })).toHaveAttribute("aria-checked", "false", { timeout: 20_000 });
  }
  await prep.close();
  const f = await flow({ who: "sarah" });
  const { page } = f;
  const dept = `Legal ${stamp()}`;
  const team = `Contracts ${stamp()}`;
  const roleName = `Night Desk ${stamp()}`;
  const person = { email: `ines.${stamp()}@example.test`, name: "Ines Walker" };
  let originalTitle = "";

  await f.titleCard({
    title: "Running the organization",
    roles: "Org Admin  |  Acme Staffing",
    intro: "Welcome. In this walkthrough, the Org Admin sets up and runs an organization on Kiwiply Enterprise.",
    minMs: 3500,
  });

  // ---- dashboard
  await f.go("/w/admin");
  await expect(page.locator("[data-dashboard]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-dash-tiles] [data-state=loading]")).toHaveCount(0, { timeout: 45_000 });
  await narrate(page, "Sarah is the Org Admin of Acme Staffing. She signs in and lands on the Organization Dashboard.");
  await narrate(page, "The tiles show the whole organization at a glance: consultants, employees, active applications, interviews and placements.");
  await page.mouse.wheel(0, 520);
  await narrate(page, "Below them are team performance, the pipeline, and a recent activity feed of who did what.");
  await page.mouse.wheel(0, -900);

  // ---- branding: draft -> preview -> publish
  await narrate(page, "First, branding. Sarah opens Organization Branding from the sidebar.");
  await page.getByRole("link", { name: "Organization Branding", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/branding/);
  await expect(page.locator("[data-branding-page]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  originalTitle = (await page.getByLabel(/Welcome title/).inputValue()).replace(/, [a-z0-9]{4,6}$/, ""); // an earlier take may have left its suffix
  await narrate(page, "The live brand is on the left, and a live preview of the sign-in page is on the right. Nothing is published yet.");
  const title = `Welcome to Acme Staffing, ${stamp()}`;
  await narrate(page, "She types a new welcome title. It is saved as a draft only, so the live sign-in page does not change.");
  await page.getByLabel(/Welcome title/).fill(title);
  await expect(page.locator('[data-draft-badge="differs"]')).toBeVisible({ timeout: 20_000 });
  await narrate(page, "She also tries a bright amber as the secondary colour.");
  const secondaryField = page.getByLabel("Secondary colour", { exact: true });
  await secondaryField.scrollIntoViewIfNeeded();
  await secondaryField.fill("#f59e0b");
  await expect(page.locator("[data-colour-field=secondary]")).toContainText("too light for white text");
  await narrate(page, "Kiwiply refuses that colour: white text on it would be hard to read. Readability is guarded, and it suggests a darker amber instead.");
  await page.getByRole("button", { name: /^Use #/ }).click();
  await page.waitForTimeout(1800);
  await page.locator("[data-publish]").scrollIntoViewIfNeeded();
  await narrate(page, "The preview already shows the draft. She checks it on a phone as well.");
  const device = page.getByRole("group", { name: "Preview device" });
  const buttons = device.getByRole("button");
  if ((await buttons.count()) > 1) await buttons.nth(1).click();
  await page.waitForTimeout(1500);
  if ((await buttons.count()) > 0) await buttons.first().click();
  await narrate(page, "Publish first shows exactly what will change.");
  await page.locator("[data-publish]").click();
  await expect(page.locator("[data-publish-diff]")).toContainText(title);
  await page.waitForTimeout(2000);
  await narrate(page, "She confirms and publishes.");
  await page.locator("[data-publish-confirm]").click();
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The new sign-in page is live for everyone in the organization.");
  await page.waitForTimeout(1200);

  // ---- departments and teams
  await narrate(page, "Next, the structure of the organization. Departments first.");
  await f.go("/w/admin/departments");
  await expect(page.getByRole("list", { name: "Departments", exact: true }).getByText("Consulting", { exact: true })).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Acme already has its departments, each with a live head count. Sarah adds a new one for Legal, led by Hana.");
  await page.getByRole("button", { name: "Create Department", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Create Department" });
  await sheet.getByLabel(/Department name/).fill(dept);
  await sheet.getByRole("combobox", { name: "Department lead" }).fill("Hana");
  await sheet.getByRole("option", { name: /Hana Petrov/ }).getByRole("button").click();
  await sheet.getByRole("button", { name: "shield" }).click();
  await sheet.getByRole("button", { name: "Amber" }).click();
  await sheet.getByRole("button", { name: "Create Department", exact: true }).click();
  await expect(page.getByRole("list", { name: "Departments", exact: true }).getByText(dept)).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The Legal department is on the board. Now a team inside it.");
  await f.go("/w/admin/teams");
  await page.getByRole("button", { name: "Create Team", exact: true }).first().click();
  const tsheet = page.getByRole("dialog", { name: "Create Team" });
  await tsheet.getByLabel(/Team name/).fill(team);
  await tsheet.getByRole("button", { name: "Department" }).click();
  await page.getByRole("option", { name: dept }).click();
  await tsheet.getByRole("combobox", { name: "Team lead" }).fill("Omar");
  await tsheet.getByRole("option", { name: /Omar Haddad/ }).getByRole("button").click();
  await tsheet.getByRole("button", { name: "Create Team", exact: true }).click();
  await expect(page.locator(`[data-team-card="${team}"]`)).toBeVisible({ timeout: 30_000 });
  await narrate(page, "The team is created under Legal, with Omar as its lead.");

  // ---- roles
  await narrate(page, "Now roles and permissions.");
  await f.go("/w/admin/roles");
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  await expect(page.locator("[data-kpi-value]").first()).not.toHaveText("–");
  await narrate(page, "Kiwiply ships twelve system roles, such as Organization Admin, Marketing Specialist and Consultant, each with a real user count.");
  await narrate(page, "Sarah needs a role the system does not have. She creates a custom one, starting from the Marketing Specialist template.");
  await page.getByRole("button", { name: /Create Role/ }).click();
  await page.getByLabel(/Role name/).fill(roleName);
  await page.getByRole("radio", { name: "A template" }).click();
  await page.getByRole("combobox", { name: "Template" }).or(page.getByRole("button", { name: /Template/ })).first().click();
  await page.getByRole("option", { name: "Marketing Specialist" }).click();
  await page.locator("[data-create-submit]").click();
  const editor = page.locator("[data-role-editor]");
  await expect(editor).toBeVisible();
  await narrate(page, "The new role matches the template. She removes one permission, follow-ups, and reviews the change before saving.");
  await editor.locator('[data-perm-row="followups.manage"]').getByRole("radio", { name: "Not granted" }).click();
  await page.locator("[data-review-changes]").click();
  await expect(page.locator("[data-change-list]")).toContainText("Removed (1)");
  await page.waitForTimeout(1800);
  await page.locator("[data-confirm-go]").click();
  await expect(page.getByText("Role updated")).toBeVisible();
  await narrate(page, "Some permissions are locked on purpose. Closing the organization belongs to the Owner alone, so an admin cannot grant it.");
  await expect(editor.locator('[data-perm-row="org.close"]')).toHaveAttribute("data-perm-locked", "true");
  await editor.locator('[data-perm-row="org.close"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await f.go("/w/admin/roles");
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  await narrate(page, "A custom role nobody holds can be deleted again. History keeps a record of every change.");
  const roleRow = page.locator("tr", { has: page.getByText(roleName, { exact: true }) }).first();
  await openRowMenu(page, roleRow, /^Delete$/);
  await page.getByRole("menuitem", { name: /^Delete$/ }).click();
  await expect(page.getByText(`${roleName} deleted`)).toBeVisible();

  // ---- people: create an account now / invite
  await narrate(page, "Now people. Sarah opens Invitations to add an employee.");
  await f.go("/w/admin/invitations");
  const panel = page.getByRole("complementary", { name: "Invite Employee" });
  await expect(panel.getByRole("radio", { name: /Create account now/ })).toBeChecked();
  await narrate(page, "There are two ways in. Send an invitation by email, or create the account right now with a temporary password.");
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true });
  await page.waitForTimeout(1200);
  await panel.getByRole("radio", { name: /Create account now/ }).check({ force: true });
  await narrate(page, "She chooses Create account now, and fills in the address, the name, a role and a department.");
  await panel.getByLabel(/Email Address/).fill(person.email);
  await panel.getByLabel(/Full Name/).fill(person.name);
  await panel.getByRole("button", { name: /^Role/ }).click();
  await panel.getByRole("checkbox", { name: /^HR Specialist/ }).check();
  await panel.getByRole("button", { name: /^Role/ }).click();
  await pickFirstDepartment(page, panel);
  await narrate(page, "Kiwiply generated a temporary password. Create Account shows it once, with a Copy button.");
  await panel.getByRole("button", { name: "Create Account" }).click();
  const shown = page.getByRole("dialog", { name: "Account created" });
  await expect(shown).toBeVisible();
  await page.waitForTimeout(1500);
  await shown.getByRole("button", { name: "Copy" }).click();
  await narrate(page, "She copies it and hands it to the new employee. It is never shown again, and the employee must choose their own password at first sign-in.");
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await f.go("/w/admin/employees");
  await page.getByPlaceholder(/Search/).first().fill(person.name);
  await expect(page.getByRole("row", { name: new RegExp(person.name) }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "On the Employees page the new person is active, with the HR Specialist role.");

  // ---- marketing assignments
  await narrate(page, "Next, Marketing Assignments: which marketer looks after which consultant.");
  await f.go("/w/admin/marketing-assignments");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();
  const david = page.locator("[data-marketer]", { hasText: "David Kim" });
  await david.getByRole("button", { name: /Show their consultants/ }).click();
  const load0 = await david.locator("[data-load]").innerText();
  await narrate(page, "Each marketer has a workload against their capacity. Sarah assigns a consultant to David Kim.");
  await page.getByRole("button", { name: "Assign Consultants" }).first().click();
  const dlg = page.getByRole("dialog", { name: /Assign consultants to David Kim/ });
  const boxes = dlg.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await boxes.nth(0).check();
  await page.waitForTimeout(1200);
  await dlg.getByRole("button", { name: /^Assign 1 consultant/ }).click();
  await expect(page.getByText(/Assigned 1 consultant/)).toBeVisible();
  await expect(david.locator("[data-load]")).not.toHaveText(load0);
  await narrate(page, "David's workload went up by one. Every change like this can be undone from the toast.");
  await page.waitForTimeout(1500);

  // ---- settings
  await narrate(page, "Finally, Settings.");
  await f.go("/w/admin/settings");
  await expect(page.locator("[data-org-settings]")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Consultants can create share links for their resumes only if the organization allows it. It is off by default. Sarah turns it on.");
  const sw = page.getByRole("switch", { name: /Share links/ });
  await sw.click();
  await expect(page.getByText("Consultants can now create share links")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Consultants can no longer create share links")).toBeVisible();
  await narrate(page, "It saved by itself, with an Undo, which she uses to put it back. A marketer preparing a resume for a consultant can never create share links, whatever this switch says.");
  await narrate(page, "And that is the Org Admin's toolkit: brand, structure, roles, people, assignments and settings, all in one place.", 1500);

  // ---- tidy up what the video created (a second, unrecorded browser), so the recording can be repeated
  const quiet = await browser.newContext({ storageState: statePath("sarah"), viewport: { width: 1440, height: 900 } });
  const q = await quiet.newPage();
  await q.goto(`${hostOf(PERSONAS.sarah)}/w/admin/branding`);
  await expect(q.locator("[data-branding-page]")).toBeVisible({ timeout: 30_000 });
  await q.getByLabel(/Welcome title/).fill(originalTitle);
  await expect(q.locator("[data-publish]")).toBeEnabled({ timeout: 20_000 });
  await q.locator("[data-publish]").click();
  await q.locator("[data-publish-confirm]").click();
  await expect(q.locator(`[data-draft-badge="live"]`)).toBeVisible({ timeout: 30_000 });
  const orgId = await orgIdOf(q);
  for (const [kind, name] of [["TEAM", team], ["DEPARTMENT", dept]] as const) {
    const left = (await bff(q, "GET", `/api/orgs/${orgId}/groups/directory?kind=${kind}&q=${encodeURIComponent(name)}`)).json;
    if (left.items?.[0]) await bff(q, "DELETE", `/api/orgs/${orgId}/groups/${left.items[0].id}`, undefined, { "if-match": String(left.items[0].version) });
  }
  await quiet.close();
});
