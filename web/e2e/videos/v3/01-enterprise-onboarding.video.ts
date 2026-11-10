import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { ADMIN_LOGIN, ADMIN_PASSWORD, PLATFORM, randomPassword, saveOrg, shellReady, tenantHost, tenantSignIn, openPage } from "./_v3";

/**
 * V3 VIDEO 01: Enterprise onboarding. A Kiwiply platform admin creates a new organization (Brightline Talent Group); its owner gets the one-time
 * temporary password, signs in for the first time on the organization's own branded address, chooses a password, and works through the first-run checklist.
 * Stories shown: APP-01..04 (platform admin: create, enterprise switch with a reason, modules), PLT sign-in, first-run checklist (dashboard).
 * Writes the new organization to the v3 state file so videos 02 and 03 can carry on with the same organization.
 */
const LABEL = process.env.V3_ORG_LABEL ?? "brightline";
const NAME = process.env.V3_ORG_NAME ?? "Brightline Talent Group";
const OWNER = process.env.V3_OWNER_NAME ?? "Maya Fernandez";
const OWNER_EMAIL = `maya.fernandez@${LABEL}.example`;

test("V3-01 Enterprise onboarding: the platform admin creates an organization and its owner takes the first steps", async ({ flow }) => {
  const f = await flow();
  const { page } = f;
  const host = tenantHost(LABEL);

  await f.titleCard({
    title: "Enterprise onboarding",
    roles: "Kiwiply platform admin  |  A new organization and its owner",
    intro: "Hi! In this video I'll show you how a new company is brought onto Kiwiply Enterprise: first the platform admin creates the organization, then its owner signs in for the very first time and gets set up.",
    minMs: 4000,
  });

  // ---- the platform admin signs in on the platform address
  await page.goto(`${PLATFORM}/login`);
  await narrate(page, "I'm starting as a Kiwiply platform admin. This is the platform address, not a customer's. Customers never see this side.");
  await page.getByLabel("Email address").fill(ADMIN_LOGIN);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.goto(`${PLATFORM}/admin/organizations`);
  await expect(page.getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible({ timeout: 45_000 });
  await narrate(page, "The Organizations page lists every company on the platform, with its address, whether enterprise is on, and how many members it has.", undefined, page.getByRole("table").first());

  // ---- create the organization
  await narrate(page, "A new customer, Brightline Talent Group, has signed the order form. Let me create their organization.");
  await page.getByRole("button", { name: "Create organization" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create organization" });
  await expect(dialog).toBeVisible();
  await narrateDo(page, "I type the company name, and the address they will use. Kiwiply checks the address live, so nobody can take a reserved word or somebody else's.", async () => {
    await dialog.getByLabel("Organization name").fill(NAME);
    await dialog.getByLabel("Address").fill(LABEL);
    await expect(dialog.locator("[data-label-state=ok]")).toBeVisible({ timeout: 20_000 });
  });
  await narrateDo(page, "Then the owner: the person who will be in charge. This creates a brand new account just for this organization. If Maya has a personal Kiwiply account, it is never touched or linked.", async () => {
    await dialog.getByLabel("Owner name").fill(OWNER);
    await dialog.getByLabel("Owner e-mail").fill(OWNER_EMAIL);
  });
  await narrate(page, "No email is sent. Instead, I get a temporary password, shown just once, to hand over myself.", undefined, dialog.getByRole("button", { name: "Create organization" }));
  await dialog.getByRole("button", { name: "Create organization" }).click();
  const shown = page.getByRole("dialog", { name: "Organization created" });
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const field = shown.getByTestId("temp-password");
  await expect(field).toBeVisible();
  const tempPassword = await field.inputValue();
  await narrate(page, "Here it is. I'll copy it and give it to Maya. Once I close this, nobody can see it again, not even me.", undefined, field);
  await shown.getByRole("button", { name: "Copy" }).click();
  await expect(shown.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await page.waitForURL(/\/admin\/organizations\/\d+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: NAME, level: 1 })).toBeVisible();

  // ---- switch the organization on, and its modules
  await narrate(page, "This is the organization's own page. It already has an address, and the owner is the first member.");
  const reason = async (confirm: string, text: string) => {
    const sheet = page.getByRole("dialog").last();
    await sheet.getByLabel("Reason (required)").fill(text);
    await sheet.getByRole("button", { name: confirm, exact: true }).click();
  };
  await narrate(page, "Enterprise starts switched off, so nothing goes live by accident. I turn it on, and every change like this asks me for a reason.", undefined, page.getByRole("switch", { name: `Enterprise for ${NAME}` }));
  await page.getByRole("switch", { name: `Enterprise for ${NAME}` }).click();
  await reason("Turn on", "Order form signed, onboarding kickoff this week");
  await expect(page.getByRole("switch", { name: `Enterprise for ${NAME}` })).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });
  await narrate(page, "Next the modules, the parts of the workspace this customer has bought. For Brightline: roles and permissions, talent marketing, and consultant assigned jobs.");
  for (const m of ["Roles and permissions", "Talent marketing", "Consultant assigned jobs"]) {
    const sw = page.getByRole("switch", { name: `${m} for ${NAME}` });
    await sw.click();
    await reason("Turn on", "Part of Brightline's starter package");
    await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });
  }
  await narrate(page, "Everything I just did is written to the history, with who did it and why.");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Admin history" })).toContainText("Enterprise switched on");
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");

  // ---- the owner signs in for the first time on the organization's own address
  await narrate(page, "That's the platform admin's part done. Now I become Maya, the owner, and open Brightline's own address.");
  await openPage(page, `${host}/login`, () => expect(page.getByLabel("Email", { exact: true })).toBeVisible({ timeout: 45_000 }));
  await narrate(page, "This is Brightline's own sign-in page. It carries their name already, and in the next video the owner will add their logo and colors.");
  await narrateDo(page, "Maya types her work email and the temporary password I gave her.", async () => {
    await page.getByLabel("Email", { exact: true }).fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(tempPassword);
    await page.getByRole("button", { name: /^Sign in/ }).click();
    await page.waitForURL(/\/change-password$/, { timeout: 45_000 });
  });
  await expect(page.getByRole("heading", { name: "Choose your password", level: 1 })).toBeVisible();
  await narrate(page, "Nothing else opens until she chooses her own password. The temporary one only works for this one step, and it is refused if she tries to keep it.");
  const fresh = randomPassword();
  await page.getByLabel("Temporary password").fill(tempPassword);
  await page.getByLabel("New password", { exact: true }).fill(fresh);
  await page.getByLabel("Repeat the new password").fill(fresh);
  await narrate(page, "She picks a new password, repeats it, and saves.");
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/admin"), { timeout: 60_000 });
  await shellReady(page);
  saveOrg({ label: LABEL, name: NAME, ownerName: OWNER, ownerEmail: OWNER_EMAIL, ownerPassword: fresh });

  // ---- the owner's dashboard and the first-run checklist
  await expect(page.locator("[data-dashboard]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-dash-tiles] [data-state=loading]")).toHaveCount(0, { timeout: 45_000 });
  await narrate(page, "And she's in. This is the Dashboard. She's the Owner, shown by her name at the top.");
  await narrate(page, "The tiles are all empty or zero, because nothing has happened yet. That's right for a brand new organization.", undefined, page.locator("[data-dash-tiles]"));
  const checklist = page.locator('[data-dash-card="checklist"]');
  await expect(checklist).toBeVisible({ timeout: 30_000 });
  await narrate(page, "What matters now is this card, Get your organization ready. Five steps, and each one ticks itself the moment the work is really done.", undefined, checklist);

  // ---- first step: a department
  await narrate(page, "Let's do the first-run setup. I'll start with a department, so people can be grouped the way the company is organized.");
  await checklist.locator('[data-checklist-item="department"] a').first().click();
  // the checklist still links /w/admin/departments, which redirects to the Departments tab of Teams & Departments
  await page.waitForURL(/\/w\/admin\/teams\?tab=departments/, { timeout: 30_000 });
  await page.locator('[data-create-group="departments"]').click();
  const sheet = page.getByRole("dialog", { name: "Create department" });
  await expect(sheet).toBeVisible();
  await narrateDo(page, "Brightline places consultants with clients, so the first department is Delivery.", async () => {
    await sheet.getByLabel(/Department name/).fill("Delivery");
  });
  await sheet.getByRole("button", { name: "Create department", exact: true }).click();
  await expect(page.getByRole("region", { name: "Structure", exact: true }).getByText("Delivery")).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Delivery is in the structure. Every department shows a live head count, which will grow as people join.");

  // ---- second step: branding (a first pass; the next video goes deeper)
  await narrate(page, "Back on the dashboard, the checklist has noticed. Next, branding, so the sign-in page and every workspace look like Brightline.");
  await page.locator('[data-shell-sidebar] [data-nav-item="home"]').click();
  await page.waitForURL(/\/w\/admin$/);
  await expect(checklist).toBeVisible({ timeout: 30_000 });
  await expect(checklist.locator('[data-checklist-item="department"]')).toHaveAttribute("data-done", "true", { timeout: 30_000 });
  await narrate(page, "One step is ticked, all by itself.", undefined, checklist.locator("[data-checklist-count]"));
  await checklist.locator('[data-checklist-item="branding"] a').first().click();
  await page.waitForURL(/\/w\/admin\/branding/, { timeout: 30_000 });
  await expect(page.locator("[data-branding-page]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("[data-draft-badge]")).toBeVisible({ timeout: 30_000 });
  const primary = page.getByLabel("Primary color", { exact: true });
  await primary.scrollIntoViewIfNeeded();
  await narrateDo(page, "I'll keep this one simple for now: just a primary color, a deep teal. The next video does branding properly, with a logo and a live preview.", async () => {
    await primary.fill("#0f766e");
  });
  await expect(page.locator('[data-draft-badge="differs"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-publish]").click();
  await expect(page.locator("[data-publish-diff]")).toBeVisible();
  await page.waitForTimeout(1800);
  await page.locator("[data-publish-confirm]").click();
  await expect(page.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  await narrate(page, "Published. The whole workspace just took on Brightline's color.");

  // ---- back to the checklist: two of five
  await page.locator('[data-shell-sidebar] [data-nav-item="home"]').click();
  await page.waitForURL(/\/w\/admin$/);
  await expect(checklist).toBeVisible({ timeout: 30_000 });
  await expect(checklist.locator('[data-checklist-item="branding"]')).toHaveAttribute("data-done", "true", { timeout: 30_000 });
  await narrate(page, "Two of five done. The three left are the people: invite or create the first employees, give them roles, and assign consultants to a marketer.", undefined, checklist);
  await narrate(page, "Down here the alerts card has already noticed something, too: there is only one administrator, and it suggests adding a second so nobody gets locked out.");
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, -900);
  await narrate(page, "That's onboarding. The platform admin created the organization and switched it on, the owner took over with a temporary password, and the first-run checklist is under way. In the next videos we finish the setup and bring in the team. Thanks for watching!", 1500);
});
