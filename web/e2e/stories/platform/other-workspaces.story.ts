import { test, expect, narrate } from "../_support/story";
import { expectNotYourRole, expectOnTheWay, navKeys } from "./_platform";

/**
 * PLT: the HR, Finance, Accounts and Executive workspaces. Only the pages that exist are driven; everything else in these menus is the
 * honest "on the way" page (see docs/enterprise-v2/qa/stories/platform.md for the exact built / not-built table).
 */

// ---- HR (Hana Petrov = HR Specialist, Tomas Berg = Talent Acquisition) ------------------------------------------------------

test("PLT-30 Hana (HR) lands on People; the home is not built yet, Employees is", async ({ as }) => {
  const { page, go } = await as("hana");
  await go("/");
  await page.waitForURL("**/w/hr");
  await narrate(page, "Hana lands on the People workspace");
  await expectOnTheWay(page); // /w/hr home (HrHome, roadmap X11.3) is not built
  await expect(page.locator("[data-workspace-switcher]")).toHaveCount(0);
  await narrate(page, "Employees is the one real page in her menu");
  await page.locator("[data-shell-sidebar] [data-nav-item=employees]").click();
  await page.waitForURL("**/w/hr/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await expect(page.locator("tr[data-row-id]", { hasText: "Anika Rao" })).toBeVisible();
  await expect(page.locator("tr[data-row-id]", { hasText: "Felix Ng" })).toBeVisible();
});

test("PLT-31 Hana sees the people list but no sensitive HR identifiers, and no Clients or Finance", async ({ as }) => {
  const { page, go } = await as("hana");
  await go("/w/hr/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await narrate(page, "The roster carries names, roles and status only");
  const text = (await page.locator("[data-employees-page]").innerText()).toLowerCase();
  for (const banned of ["ssn", "social security", "date of birth", "passport", "bank account", "routing number", "tax id"]) {
    expect(text, banned).not.toContain(banned);
  }
  await go("/w/hr/clients");
  await expectNotYourRole(page);
  await go("/w/finance");
  await expectNotYourRole(page);
});

test("PLT-32 Tomas (Talent Acquisition) shares the People workspace with a smaller menu and can add employees", async ({ as }) => {
  const { page, go } = await as("tomas");
  await go("/");
  await page.waitForURL("**/w/hr");
  await narrate(page, "Tomas is Talent Acquisition: same workspace as Hana");
  const keys = await navKeys(page);
  expect(keys).toContain("home");
  expect(keys).toContain("employees");
  expect(keys).not.toContain("offboarding"); // needs members.remove / lifecycle.manage, which only HR holds
  await page.locator("[data-shell-sidebar] [data-nav-item=employees]").click();
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await expect(page.locator("[data-add-employee]")).toBeVisible(); // members.invite
});

test("PLT-33 HR pages beyond Employees open the 'on the way' placeholder", async ({ as }) => {
  const { page, go } = await as("hana");
  await go("/w/hr");
  const keys = await navKeys(page);
  const unbuilt = keys.filter((k) => ["onboarding", "documents", "compliance", "lifecycle", "offboarding", "candidates", "talent-pools", "reports"].includes(k));
  await narrate(page, `Hana's menu also lists: ${unbuilt.join(", ") || "nothing else (module off)"}`);
  for (const k of unbuilt) {
    await page.locator(`[data-shell-sidebar] [data-nav-item=${k}]`).click();
    await page.waitForURL(`**/w/hr/${k}`);
    await expectOnTheWay(page);
  }
});

// ---- Finance (Felix Ng) -----------------------------------------------------------------------------------------------------

test("PLT-34 Felix (Finance) lands on Finance; the Finance pages are not built, and nothing moves money", async ({ as }) => {
  const { page, go } = await as("felix");
  await go("/");
  await page.waitForURL("**/w/finance");
  await narrate(page, "Felix lands on the Finance workspace");
  await expectOnTheWay(page); // FinanceHome (X6.1 / X11.4) is not built
  for (const k of (await navKeys(page)).filter((k) => k !== "home")) {
    await page.locator(`[data-shell-sidebar] [data-nav-item=${k}]`).click();
    await page.waitForURL(`**/w/finance/${k}`);
    await narrate(page, `${k}: on the way`, 500);
    await expect(page.locator("[data-coming-soon], [data-placements-page]")).toBeVisible();
    await expect(page.getByRole("button", { name: /pay now|send payment|transfer|wire|charge card/i })).toHaveCount(0);
  }
});

test("PLT-35 Felix can open the Placements board by address (placements.view) and is refused HR and Administration", async ({ as }) => {
  const { page, go } = await as("felix");
  await go("/w/finance/placements");
  await narrate(page, "The Placements board is a shared page; Felix holds placements.view");
  await expect(page.locator("[data-placements-page]")).toBeVisible();
  await go("/w/admin");
  await expectNotYourRole(page);
  await go("/w/hr/employees");
  await expectNotYourRole(page);
});

// ---- Accounts (Amara Silva) ---------------------------------------------------------------------------------------------------

test("PLT-36 Amara (Account Manager) lands on Clients; the home is not built, Clients is", async ({ as }) => {
  const { page, go } = await as("amara");
  await go("/");
  await page.waitForURL("**/w/accounts");
  await narrate(page, "Amara lands on the Clients workspace");
  await expectOnTheWay(page); // AccountsHome (X10.x) is not built
  await page.locator("[data-shell-sidebar] [data-nav-item=clients]").click();
  await page.waitForURL("**/w/accounts/clients");
  await narrate(page, "The Clients board is real");
  await expect(page.locator("[data-clients-page]")).toBeVisible();
  await expect(page.locator("[data-add-client]")).toBeVisible(); // clients.manage
});

test("PLT-37 Amara's Placements and Interviews boards open; Contacts, Requirements, Submissions and Offers are on the way", async ({ as }) => {
  const { page, go } = await as("amara");
  await go("/w/accounts");
  for (const [key, marker] of [
    ["placements", "[data-placements-page]"],
    ["interviews", "[data-interviews-page]"],
  ] as const) {
    await page.locator(`[data-shell-sidebar] [data-nav-item=${key}]`).click();
    await page.waitForURL(`**/w/accounts/${key}`);
    await narrate(page, `${key}: a real board`, 600);
    await expect(page.locator(marker)).toBeVisible();
  }
  for (const key of ["contacts", "requirements", "submissions", "offers"]) {
    await page.locator(`[data-shell-sidebar] [data-nav-item=${key}]`).click();
    await page.waitForURL(`**/w/accounts/${key}`);
    await narrate(page, `${key}: on the way`, 600);
    await expectOnTheWay(page);
  }
});

// ---- Executive (Eve Lindqvist) ---------------------------------------------------------------------------------------------

test("PLT-38 Eve (Executive Viewer) lands on Overview; the executive pages are not built", async ({ as }) => {
  const { page, go } = await as("eve");
  await go("/");
  await page.waitForURL("**/w/exec");
  await narrate(page, "Eve lands on the Overview workspace");
  await expectOnTheWay(page); // Executive Home (counts-only tiles) is not built
  await page.locator("[data-shell-sidebar] [data-nav-item=reports]").click();
  await page.waitForURL("**/w/exec/reports");
  await expectOnTheWay(page);
});

test("PLT-39 Eve is read-only: Administration, Employees and every other workspace are refused", async ({ as }) => {
  const { page, go } = await as("eve");
  for (const path of ["/w/admin", "/w/admin/employees", "/w/hr", "/w/finance", "/w/accounts", "/w/marketing", "/w/consultant", "/w/exec/employees"]) {
    await go(path);
    await narrate(page, `Eve types ${path}`, 500);
    await expectNotYourRole(page);
  }
  await go("/w/exec");
  await expect(page.locator("[data-workspace-switcher]")).toHaveCount(0);
});
