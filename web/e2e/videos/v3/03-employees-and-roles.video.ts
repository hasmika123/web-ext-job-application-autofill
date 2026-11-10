import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { pickFirstDepartment } from "../../stories/admin/_helpers";
import { loadOrg, shellReady, tenantHost, tenantSignIn, openPage } from "./_v3";

/**
 * V3 VIDEO 03: Add employees and assign roles. The owner of Brightline Talent Group (videos 01 and 02) sets up a department and a team, looks at the roles
 * (they are data: twelve system roles, and a custom one made from a template), invites one person, invites three consultants in bulk, and assigns roles.
 * Stories shown: ADM-15..17 invitations (single and bulk), ADM-20/21 departments and teams, ADM-30/31 roles, ADM-40s employees and role assignment.
 */
test("V3-03 Employees and roles: departments and teams, roles as data, single and bulk invites, assigning roles", async ({ flow }) => {
  const org = loadOrg();
  const host = tenantHost(org.label);
  const f = await flow();
  const { page } = f;
  const roleName = "Marketing Coordinator";

  await f.titleCard({
    title: "Adding employees and assigning roles",
    roles: "Organization owner  |  Brightline Talent Group",
    intro: "Hi! In this video the owner of Brightline brings in the team. First the structure, departments and teams. Then the roles, which are data you can read and change. Then the people, one by one and in bulk.",
    minMs: 3500,
  });

  // ---- sign in
  await openPage(page, `${host}/login`, () => expect(page.getByLabel("Email", { exact: true })).toBeVisible({ timeout: 45_000 }));
  await narrate(page, "Maya, the owner of Brightline, signs in again.");
  await tenantSignIn(page, host, org.ownerEmail, org.ownerPassword);
  await shellReady(page);
  await expect(page.locator("[data-dashboard]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-dash-card="checklist"]')).toBeVisible({ timeout: 45_000 });
  await narrate(page, "On the dashboard, the setup checklist shows two steps done. The next three are all about people, so that's where we're going.", undefined, page.locator('[data-dash-card="checklist"]'));

  // ---- departments and teams
  await narrate(page, "Before anyone is invited, I'll set up the structure, so each person lands in the right place. Teams & Departments, on the Departments tab first.");
  await page.locator('[data-shell-sidebar] [data-nav-item="teams"]').click();
  await page.waitForURL(/\/w\/admin\/teams/, { timeout: 30_000 });
  await page.getByRole("tab", { name: "Departments", exact: true }).click();
  const structure = page.getByRole("region", { name: "Structure", exact: true });
  await expect(structure.getByText("Delivery", { exact: true })).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Delivery is here from the first video. Brightline also needs a Marketing department, for the people who find work for consultants.");
  await page.locator('[data-create-group="departments"]').click();
  const dsheet = page.getByRole("dialog", { name: "Create department" });
  await expect(dsheet).toBeVisible();
  await dsheet.getByLabel(/Department name/).fill("Marketing");
  await dsheet.getByRole("button", { name: "Create department", exact: true }).click();
  await expect(structure.getByText("Marketing", { exact: true })).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Next, a team inside it, on the Teams tab. A department is the part of the company a person belongs to. A team is a smaller working group.");
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await page.locator('[data-create-group="teams"]').click();
  const tsheet = page.getByRole("dialog", { name: "Create team" });
  await expect(tsheet).toBeVisible();
  await tsheet.getByLabel(/Team name/).fill("Talent Marketing");
  await tsheet.getByRole("button", { name: "Department" }).click();
  await page.getByRole("option", { name: "Marketing", exact: true }).click();
  await narrate(page, "The team's lead can be picked here too, but nobody has joined yet, so I'll leave that for later.");
  await tsheet.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page.getByRole("table", { name: "Team directory" }).getByRole("row").filter({ has: page.getByText("Talent Marketing", { exact: true }) })).toBeVisible({ timeout: 30_000 });

  // ---- roles
  await narrate(page, "Now roles. Let's open Roles.");
  await page.locator('[data-shell-sidebar] [data-nav-item="roles"]').click();
  await page.waitForURL(/\/w\/admin\/roles/, { timeout: 30_000 });
  await expect(page.locator("[data-roles-page]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-roles-count]")).toContainText(" custom", { timeout: 30_000 }); // "12 roles · 0 custom" once the overview is in
  await narrate(page, "Kiwiply comes with twelve ready-made roles: Owner, Organization Admin, Marketing Specialist, Consultant, HR, Finance and more. Each one says how far it reaches, and how many people hold it.", undefined, page.locator("[data-roles-page] table").first());
  await narrate(page, "Roles aren't hard-coded. They're data, a list of permissions, and I can open one to read exactly what it allows.");
  const specialist = page.locator("tr", { has: page.getByText("Marketing Specialist", { exact: true }) }).first();
  await specialist.getByText("Marketing Specialist", { exact: true }).first().click();
  const viewer = page.locator("[data-role-editor]");
  await expect(viewer).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Here are the permissions of a Marketing Specialist, grouped by area. It can prepare and track applications for its consultants, and it can never submit one.", undefined, viewer);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden({ timeout: 10_000 });
  await page.waitForTimeout(800);

  await narrate(page, "Brightline wants a coordinator who helps marketers, but doesn't manage follow-up calls. No ready-made role fits exactly, so I'll make my own from the Marketing Specialist template.");
  await page.locator("[data-create-role-button]").click();
  await page.getByLabel(/Role name/).fill(roleName);
  await page.getByRole("radio", { name: "A template" }).click();
  await page.getByRole("combobox", { name: "Template" }).or(page.getByRole("button", { name: /Template/ })).first().click();
  await page.getByRole("option", { name: "Marketing Specialist" }).click();
  await page.locator("[data-create-submit]").click();
  const editor = page.locator("[data-role-editor]");
  await expect(editor).toBeVisible({ timeout: 30_000 }).catch(async (e) => {
    console.log("[v3] create failed; dialogs:", JSON.stringify(await page.locator("[role=dialog], [role=alert], [role=status]").allInnerTexts()));
    await page.screenshot({ path: "test-results-stories/create-failed.png" });
    throw e;
  });
  await narrate(page, "The new role starts as a copy of the template. I'll take away one permission, managing follow-ups, and Kiwiply shows me the change before it's saved.");
  await editor.locator('[data-perm-row="followups.manage"]').getByRole("radio", { name: "Not granted" }).click();
  await page.locator("[data-review-changes]").click();
  await expect(page.locator("[data-change-list]")).toContainText("Removed (1)");
  await page.waitForTimeout(2000);
  await page.locator("[data-confirm-go]").click();
  await expect(page.locator("[data-confirm-go]")).toBeHidden({ timeout: 30_000 });
  await narrate(page, "Saved. Because I'm the owner, I can grant anything here. An Organization Admin couldn't hand out the owner-only permissions, like closing the organization. Those stay locked for them, on purpose.");
  await editor.locator('[data-perm-row="org.close"]').scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");

  // ---- single invitation
  await narrate(page, "Now the people. On Employees, the Invitations tab lists who has been invited, and Add employee brings someone in.");
  await page.locator('[data-shell-sidebar] [data-nav-item="employees"]').click();
  await page.waitForURL(/\/w\/admin\/employees/, { timeout: 30_000 });
  await page.getByRole("tab", { name: /^Invitations/ }).click();
  await page.waitForURL(/\/w\/admin\/employees\?tab=invitations/, { timeout: 30_000 });
  await page.locator("[data-add-employee]").click();
  const panel = page.getByRole("dialog", { name: "Add employee" });
  await expect(panel.getByRole("radio", { name: /Create account now/ })).toBeVisible({ timeout: 45_000 });
  await narrate(page, "There are two ways to add a person. I can create their account right now, with a temporary password, or I can send an invitation by email. For a new hire who'll set up their own account, an invitation is right.");
  await panel.getByRole("radio", { name: /Send invitation/ }).check({ force: true });
  await narrateDo(page, "Daniel Okoye is joining as a marketer. I enter his email and his name.", async () => {
    await panel.getByLabel(/Email address/).fill("daniel.okoye@brightline.example");
    await panel.getByLabel(/Full name/).fill("Daniel Okoye");
  });
  await panel.getByRole("button", { name: /^Role/ }).click();
  await narrate(page, "Roles are a checklist. A person can hold more than one, and the one marked primary decides which workspace they land in. Daniel is a Marketing Specialist.");
  await page.getByRole("checkbox", { name: /^Marketing Specialist/ }).check();
  await panel.getByRole("button", { name: /^Role/ }).click();
  const dept = panel.getByRole("button", { name: "Department" });
  await dept.scrollIntoViewIfNeeded();
  await dept.click();
  await expect(page.getByRole("option", { name: "Marketing", exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("option", { name: "Marketing", exact: true }).click();
  const team = panel.getByRole("button", { name: "Team" });
  if (await team.isVisible().catch(() => false)) {
    await team.click();
    await page.getByRole("option", { name: "Talent Marketing" }).click({ timeout: 8000 }).catch(() => page.keyboard.press("Escape"));
  }
  await narrateDo(page, "He goes into the Marketing department and the Talent Marketing team. Then Send invitation.", async () => {
    await panel.getByRole("button", { name: "Send invitation", exact: true }).click();
  });
  await expect(panel).toBeHidden({ timeout: 30_000 }); // sending closes the dialog (with an Undo in the toast)
  await expect(page.getByRole("row", { name: /Daniel Okoye/ }).first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await narrate(page, "He's on the list as invited. Daniel gets an email with a link, chooses his own password, and lands in the Marketing workspace.");

  // ---- bulk invitation
  await narrate(page, "Now three consultants at once. Add employee has a Bulk invite link: it takes a list of email addresses, one per line, and everyone gets the same role.");
  await page.locator("[data-add-employee]").click();
  await page.getByRole("dialog", { name: "Add employee" }).locator("[data-bulk-invite]").click();
  const bulk = page.getByRole("dialog", { name: "Bulk invite" });
  await expect(bulk).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(2500); // the sheet loads its role and department lists as it opens; typing before that would be lost
  await narrateDo(page, "I paste three addresses. A name in front is fine, and so is a plain address.", async () => {
    const ta = bulk.getByLabel("Email addresses");
    await ta.hover();
    await ta.focus();
    await expect(ta).toBeFocused();
    await page.keyboard.type("Ravi Menon <ravi.menon@brightline.example>\nSofia Almeida <sofia.almeida@brightline.example>\ntom.becker@brightline.example", { delay: 30 });
  });
  await expect(bulk.getByText(/3 addresses found/)).toBeVisible({ timeout: 10_000 });
  await narrate(page, "It counts three addresses. If I had them in a spreadsheet, I could upload a CSV instead.");
  await bulk.getByRole("button", { name: /^Role/ }).click();
  await page.getByRole("checkbox", { name: /^Consultant/ }).first().check();
  await bulk.getByRole("button", { name: /^Role/ }).click();
  const bdept = bulk.getByRole("button", { name: "Department" });
  await bdept.click();
  await page.getByRole("option", { name: "Delivery", exact: true }).click();
  await narrate(page, "They're consultants, in the Delivery department.");
  await bulk.getByRole("button", { name: /^Send 3 invitations/ }).click();
  const result = bulk.locator("[data-bulk-result]");
  await expect(result).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Three invited, and the result lists every address, so I can see at once if one didn't work, for example a typo or someone who is already a member.", undefined, result);
  await bulk.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("row", { name: /Ravi Menon/ }).first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "The Invitations tab now tracks all four: pending, accepted, expired or revoked. An invitation I no longer want can be revoked or sent again from here.");

  // ---- employees and role assignment
  await narrate(page, "Next, the Employees tab, which is the people list for the whole organization.");
  await page.getByRole("tab", { name: "Employees", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/w/admin/employees" && !u.searchParams.has("tab"), { timeout: 30_000 });
  await expect(page.getByRole("row", { name: /daniel\.okoye/i }).first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "Everyone is here with their role, department, team and status. The people who were invited show as Invited, until they accept.", undefined, page.getByRole("table").first());
  const row = page.getByRole("row", { name: /daniel\.okoye/i }).first();
  const kebab = row.getByRole("button", { name: "Row actions" });
  await expect(async () => {
    await kebab.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await kebab.click();
    await expect(page.getByRole("menuitem", { name: /Manage roles/ })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 30_000 });
  await narrate(page, "Roles can change at any time. From the row menu, I choose Manage roles and permissions for Daniel.");
  await page.getByRole("menuitem", { name: /Manage roles/ }).click();
  const picker = page.locator("[data-role-picker]");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await narrate(page, "His current role is at the top. Below is the whole list, including my new Marketing Coordinator role, right next to the built-in ones.", undefined, picker);
  await picker.getByRole("checkbox", { name: new RegExp(roleName) }).check();
  await expect(page.getByText("Roles updated")).toBeVisible({ timeout: 20_000 });
  await narrate(page, "I tick the coordinator role, and it saves straight away. He now holds two roles, and I can choose which one is his primary role. There's no Save button to forget.");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");

  // ---- the checklist
  await narrate(page, "Back on the dashboard, the checklist has been watching.");
  await page.locator('[data-shell-sidebar] [data-nav-item="home"]').click();
  await page.waitForURL(/\/w\/admin$/, { timeout: 30_000 });
  const checklist = page.locator('[data-dash-card="checklist"]');
  await expect(checklist).toBeVisible({ timeout: 45_000 });
  await expect(checklist.locator('[data-checklist-item="employees"]')).toHaveAttribute("data-done", "true", { timeout: 30_000 });
  await expect(checklist.locator('[data-checklist-item="roles"]')).toHaveAttribute("data-done", "true", { timeout: 30_000 });
  await narrate(page, "Four of five are done: branding, a department, employees, and roles. Only one is left, assigning consultants to a marketer, and that's the next video.", undefined, checklist);
  await narrate(page, "That's how a team comes together: structure first, then roles you can read and shape, then people, one at a time or many at once. Thanks for watching!", 1500);
});
