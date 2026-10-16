import { test, expect, narrate, narrateDo } from "../stories/_support/story";
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
    intro: "Hi! In this video I'll walk you through how an org admin sets up and runs their organization in Kiwiply.",
    minMs: 3500,
  });

  // ---- dashboard
  await f.go("/w/admin");
  await expect(page.locator("[data-dashboard]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-dash-tiles] [data-state=loading]")).toHaveCount(0, { timeout: 45_000 });
  await narrate(page, "Okay, I'm signed in as Sarah. She's the org admin at Acme Staffing, and this is her Organization Dashboard.");
  await narrate(page, "These tiles give me the whole organization at a glance: consultants, employees, applications, interviews and placements.", undefined, page.locator("[data-dash-tiles]"));
  await page.mouse.wheel(0, 520);
  await narrate(page, "Scrolling down, I get team performance, the pipeline, and a feed of who did what lately.");
  await page.mouse.wheel(0, -900);

  // ---- branding: draft -> preview -> publish
  await narrate(page, "First thing an admin usually does is branding. Let's open Organization Branding from the sidebar.");
  await page.getByRole("link", { name: "Organization Branding", exact: true }).first().click();
  await page.waitForURL(/\/w\/admin\/branding/);
  await expect(page.locator("[data-branding-page]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  originalTitle = (await page.getByLabel(/Welcome title/).inputValue()).replace(/, [a-z0-9]{4,6}$/, ""); // an earlier take may have left its suffix
  await narrate(page, "The live brand is on the left, and on the right I get a preview of the sign-in page. Nothing is published yet.");
  const title = `Welcome to Acme Staffing, ${stamp()}`;
  await narrateDo(page, "I'll type a new welcome title. Notice it only saves as a draft, so the live sign-in page doesn't change.", async () => {
    await page.getByLabel(/Welcome title/).fill(title);
  });
  await expect(page.locator('[data-draft-badge="differs"]')).toBeVisible({ timeout: 20_000 });
  const secondaryField = page.getByLabel("Secondary colour", { exact: true });
  await secondaryField.scrollIntoViewIfNeeded();
  await narrateDo(page, "Now let me try a bright amber as the secondary colour.", async () => {
    await secondaryField.fill("#f59e0b");
  });
  await expect(page.locator("[data-colour-field=secondary]")).toContainText("too light for white text");
  await narrate(page, "See that? Kiwiply won't take it. White text on that amber would be hard to read, so it suggests a darker one instead.", undefined, page.locator("[data-colour-field=secondary]"));
  await page.getByRole("button", { name: /^Use #/ }).click();
  await page.waitForTimeout(1800);
  await page.locator("[data-publish]").scrollIntoViewIfNeeded();
  await narrate(page, "The preview already shows my draft. Let me check how it looks on a phone, too.");
  const device = page.getByRole("group", { name: "Preview device" });
  const buttons = device.getByRole("button");
  if ((await buttons.count()) > 1) await buttons.nth(1).click();
  await page.waitForTimeout(1500);
  if ((await buttons.count()) > 0) await buttons.first().click();
  await narrate(page, "When I hit Publish, it first shows me exactly what will change.");
  await page.locator("[data-publish]").click();
  await expect(page.locator("[data-publish-diff]")).toContainText(title);
  await page.waitForTimeout(2000);
  await narrate(page, "That looks right, so I'll confirm and publish.");
  await page.locator("[data-publish-confirm]").click();
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  await narrate(page, "And it's live. Everyone in the organization now sees the new sign-in page.");
  await page.waitForTimeout(1200);

  // ---- departments and teams
  await narrate(page, "Next, let's look at the structure of the organization. Departments first.");
  await f.go("/w/admin/departments");
  await expect(page.getByRole("list", { name: "Departments", exact: true }).getByText("Consulting", { exact: true })).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Acme already has its departments, each with a live head count. I'll add a new one for Legal, led by Hana.");
  await page.getByRole("button", { name: "Create Department", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Create Department" });
  await sheet.getByLabel(/Department name/).fill(dept);
  await sheet.getByRole("combobox", { name: "Department lead" }).fill("Hana");
  await sheet.getByRole("option", { name: /Hana Petrov/ }).getByRole("button").click();
  await sheet.getByRole("button", { name: "shield" }).click();
  await sheet.getByRole("button", { name: "Amber" }).click();
  await sheet.getByRole("button", { name: "Create Department", exact: true }).click();
  await expect(page.getByRole("list", { name: "Departments", exact: true }).getByText(dept)).toBeVisible({ timeout: 30_000 });
  await narrate(page, "There it is, Legal is on the board. Now let's add a team inside it.");
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
  await narrate(page, "Done. The team sits under Legal, and Omar is its lead.");

  // ---- roles
  await narrate(page, "Now, roles and permissions. Let's go to Roles.");
  await f.go("/w/admin/roles");
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  await expect(page.locator("[data-kpi-value]").first()).not.toHaveText("–");
  await narrate(page, "Kiwiply comes with twelve system roles, like Organization Admin, Marketing Specialist and Consultant, each with a real user count.");
  await narrate(page, "Say I need a role the system doesn't have. I'll create a custom one, starting from the Marketing Specialist template.");
  await page.getByRole("button", { name: /Create Role/ }).click();
  await page.getByLabel(/Role name/).fill(roleName);
  await page.getByRole("radio", { name: "A template" }).click();
  await page.getByRole("combobox", { name: "Template" }).or(page.getByRole("button", { name: /Template/ })).first().click();
  await page.getByRole("option", { name: "Marketing Specialist" }).click();
  await page.locator("[data-create-submit]").click();
  const editor = page.locator("[data-role-editor]");
  await expect(editor).toBeVisible();
  await narrate(page, "The new role starts out matching the template. I'll take away one permission, follow-ups, and review the change before saving.");
  await editor.locator('[data-perm-row="followups.manage"]').getByRole("radio", { name: "Not granted" }).click();
  await page.locator("[data-review-changes]").click();
  await expect(page.locator("[data-change-list]")).toContainText("Removed (1)");
  await page.waitForTimeout(1800);
  await page.locator("[data-confirm-go]").click();
  await expect(page.getByText("Role updated")).toBeVisible();
  await narrate(page, "Notice some permissions are locked on purpose. Closing the organization belongs to the Owner alone, so an admin can't hand that out.");
  await expect(editor.locator('[data-perm-row="org.close"]')).toHaveAttribute("data-perm-locked", "true");
  await editor.locator('[data-perm-row="org.close"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await f.go("/w/admin/roles");
  await expect(page.locator("[data-roles-page]")).toBeVisible();
  await narrate(page, "A custom role that nobody holds can be deleted again, and the history keeps a record of every change.");
  const roleRow = page.locator("tr", { has: page.getByText(roleName, { exact: true }) }).first();
  await openRowMenu(page, roleRow, /^Delete$/);
  await page.getByRole("menuitem", { name: /^Delete$/ }).click();
  await expect(page.getByText(`${roleName} deleted`)).toBeVisible();

  // ---- people: create an account now / invite
  await narrate(page, "Now, people. Let's open Invitations to add a new employee.");
  await f.go("/w/admin/invitations");
  const panel = page.getByRole("complementary", { name: "Invite Employee" });
  await expect(panel.getByRole("radio", { name: /Create account now/ })).toBeChecked();
  await narrate(page, "There are two ways to bring someone in. I can email an invitation, or create the account right now with a temporary password.");
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true });
  await page.waitForTimeout(1200);
  await panel.getByRole("radio", { name: /Create account now/ }).check({ force: true });
  await narrate(page, "I'll create the account now. So, an email address, a name, a role and a department.");
  await panel.getByLabel(/Email Address/).fill(person.email);
  await panel.getByLabel(/Full Name/).fill(person.name);
  await panel.getByRole("button", { name: /^Role/ }).click();
  await panel.getByRole("checkbox", { name: /^HR Specialist/ }).check();
  await panel.getByRole("button", { name: /^Role/ }).click();
  await pickFirstDepartment(page, panel);
  await narrateDo(page, "Kiwiply makes a temporary password for them. When I create the account, it's shown just once, with a Copy button.", async () => {
    await panel.getByRole("button", { name: "Create Account" }).click();
  });
  const shown = page.getByRole("dialog", { name: "Account created" });
  await expect(shown).toBeVisible();
  await page.waitForTimeout(1500);
  await shown.getByRole("button", { name: "Copy" }).click();
  await narrate(page, "I copy it and hand it over. It's never shown again, and the employee has to choose their own password the first time they sign in.");
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await f.go("/w/admin/employees");
  await page.getByPlaceholder(/Search/).first().fill(person.name);
  await expect(page.getByRole("row", { name: new RegExp(person.name) }).first()).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Over on the Employees page, the new person is active, with the HR Specialist role.");

  // ---- marketing assignments
  await narrate(page, "Next, Marketing Assignments. This is where I decide which marketer looks after which consultant.");
  await f.go("/w/admin/marketing-assignments");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible();
  const david = page.locator("[data-marketer]", { hasText: "David Kim" });
  await david.getByRole("button", { name: /Show their consultants/ }).click();
  const load0 = await david.locator("[data-load]").innerText();
  await narrate(page, "Each marketer has a workload measured against their capacity. Let me assign a consultant to David Kim.");
  await page.getByRole("button", { name: "Assign Consultants" }).first().click();
  const dlg = page.getByRole("dialog", { name: /Assign consultants to David Kim/ });
  const boxes = dlg.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await boxes.nth(0).check();
  await page.waitForTimeout(1200);
  await dlg.getByRole("button", { name: /^Assign 1 consultant/ }).click();
  await expect(page.getByText(/Assigned 1 consultant/)).toBeVisible();
  await expect(david.locator("[data-load]")).not.toHaveText(load0);
  await narrate(page, "David's workload just went up by one. And any change like this can be undone from the toast.");
  await page.waitForTimeout(1500);

  // ---- settings
  await narrate(page, "Last stop, Settings.");
  await f.go("/w/admin/settings");
  await expect(page.locator("[data-org-settings]")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Consultants can only create share links for their resumes if the organization allows it. It's off by default, so I'll turn it on.");
  const sw = page.getByRole("switch", { name: /Share links/ });
  await sw.click();
  await expect(page.getByText("Consultants can now create share links")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByText("Consultants can no longer create share links")).toBeVisible();
  await narrate(page, "It saved by itself, and there's an Undo, which I'll use to put it back. One more thing: a marketer preparing a resume for a consultant can never create share links, whatever this switch says.");
  await narrate(page, "And that's the org admin's toolkit: brand, structure, roles, people, assignments and settings, all in one place. Thanks for watching!", 1500);

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
