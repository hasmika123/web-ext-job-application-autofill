import { existsSync } from "node:fs";
import { test, expect, narrate, type Session } from "../_support/story";
import { statePath } from "../_support/global-setup";
import { PERSONAS, type Persona, type PersonaKey } from "../_support/personas";
import { expectNotYourRole, expectOnTheWay, navKeys } from "./_platform";

/** PLT: the shell around every role: landing, the workspace switcher, one menu per role, honest "on the way" pages. */

test("PLT-10 Sarah has two workspaces: she lands on Administration and switches to Marketing management", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await narrate(page, "Sarah is Org Admin and Marketing Manager, so she has two workspaces");
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
  await page.locator("[data-account-menu]").click();
  await narrate(page, "Her account menu offers Switch workspace");
  await page.getByRole("menuitem", { name: "Switch workspace" }).click();
  const panel = page.locator("[data-workspace-switcher=panel]");
  await expect(panel).toBeVisible();
  const rows = page.getByRole("menuitemradio");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Administration");
  await expect(rows.first()).toContainText("opens first");
  await expect(rows.nth(1)).toContainText("Marketing management");
  await narrate(page, "Administration is checked and opens first; she picks Marketing management");
  await rows.nth(1).click();
  await page.waitForURL("**/w/marketing-mgmt");
  await expect(page.locator("[data-shell-sidebar] [data-nav-item]").first()).toBeVisible();
  const keys = await navKeys(page);
  expect(keys).toEqual(expect.arrayContaining(["team", "approvals", "pipeline"]));
  expect(keys).not.toContain("employees");
  await narrate(page, "The URL is the state: Back returns to Administration");
  await page.goBack();
  await expect(page).toHaveURL(/\/w\/admin$/);
});

test("PLT-11 A member with one workspace never sees a switcher", async ({ as }) => {
  for (const who of ["omar", "anika"] as PersonaKey[]) {
    const { page, go } = await as(who);
    await go(`/w/${PERSONAS[who].home}`);
    await narrate(page, `${PERSONAS[who].name} has a single workspace`);
    await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
    await expect(page.locator("[data-workspace-switcher]")).toHaveCount(0);
    await page.locator("[data-account-menu]").click();
    await expect(page.getByText("Sign out")).toBeVisible();
    await expect(page.getByText("Switch workspace")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

/** Each person opens "/" on their own host and must land on the workspace their primary role opens, inside the shell, signed in as themselves. */
async function expectEveryoneLandsHome(as: (who: PersonaKey) => Promise<Session>, people: Persona[]) {
  for (const p of people) {
    const { page, go, context } = await as(p.key as PersonaKey);
    await go("/");
    await page.waitForURL(`**/w/${p.home}`);
    await narrate(page, `${p.name} lands on /w/${p.home}`, 500);
    await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
    await expect(page.locator("[data-account-menu]")).toHaveAttribute("aria-label", `Account menu for ${p.name}`);
    await context.close(); // finish this person's recording now, so ten of them do not all flush at the end of the test
  }
}

test("PLT-12 Every persona lands on the workspace their primary role opens", async ({ as }) => {
  test.setTimeout(300_000); // ten people, each in a fresh recorded browser
  // Acme and Beta sign in with the one-click Demo accounts tab; Gamma's people (separate accounts) are PLT-12b
  await expectEveryoneLandsHome(as, (Object.values(PERSONAS) as Persona[]).filter((p) => p.signIn !== "password"));
});

test("PLT-12b The people of a separate-accounts organization (Gamma) land on their own workspaces too", async ({ as }) => {
  test.setTimeout(300_000);
  const people = (Object.values(PERSONAS) as Persona[]).filter((p) => p.signIn === "password");
  test.skip(people.some((p) => !existsSync(statePath(p.key))), "needs GAMMA_DEMO_PASSWORD at global setup (the password is never written in a spec)");
  await expectEveryoneLandsHome(as, people);
});

test("PLT-13 Asking for a workspace you do not hold shows the denied state inside the shell, with a way back", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/hr");
  await narrate(page, "Sarah types /w/hr, a workspace her roles do not grant");
  await expectNotYourRole(page);
  await expect(page.locator("[data-shell-sidebar]")).toBeVisible(); // no redirect, no blank page
  await expect(page).toHaveURL(/\/w\/hr$/);
  for (const path of ["/w/finance", "/w/exec", "/w/accounts", "/w/not-a-workspace"]) {
    await go(path);
    await expectNotYourRole(page);
  }
  await narrate(page, "The page offers her own workspace instead");
  await go("/w/hr");
  await page.getByRole("link", { name: "Open Administration" }).click();
  await expect(page).toHaveURL(/\/w\/admin$/);
});

test("PLT-14 Menu entries that are not built open an honest 'on the way' page, never a 404", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await narrate(page, "Sarah's full menu lists pages that are still being built");
  for (const key of ["subscription", "licenses", "billing", "usage", "reports"]) {
    const item = page.locator(`[data-shell-sidebar] [data-nav-item=${key}]`);
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await page.waitForURL(`**/w/admin/${key}`);
    await expectOnTheWay(page);
    await narrate(page, `${key}: "This page is on the way"`, 500);
  }
  // Audit Logs was on this list until the audit page was built (P0 audit fixes): it is a real page now, never "on the way"
  await page.locator("[data-shell-sidebar] [data-nav-item=audit]").click();
  await page.waitForURL("**/w/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit Logs", level: 1 })).toBeVisible();
  await expect(page.locator("[data-coming-soon]")).toHaveCount(0);
});

const MENUS: { who: PersonaKey; present: string[]; absent: string[] }[] = [
  { who: "omar", present: ["home", "talent", "jobs", "tasks"], absent: ["employees", "roles", "billing", "invitations"] },
  { who: "anika", present: ["home", "matches", "applications", "interviews", "profile"], absent: ["employees", "talent", "roles"] },
  { who: "hana", present: ["home", "employees"], absent: ["billing", "talent", "roles", "clients"] },
  { who: "felix", present: ["home"], absent: ["employees", "talent", "roles"] },
  { who: "amara", present: ["home", "clients"], absent: ["employees", "roles", "talent"] },
  { who: "eve", present: ["home", "reports"], absent: ["employees", "clients", "roles"] },
];

test("PLT-15 Each role sees a different menu: pages they cannot use are absent, not greyed", async ({ as }) => {
  for (const m of MENUS) {
    const { page, go } = await as(m.who);
    await go(`/w/${PERSONAS[m.who].home}`);
    await expect(page.locator("[data-shell-sidebar] [data-nav-item]").first()).toBeVisible();
    await narrate(page, `${PERSONAS[m.who].name}'s menu`, 600);
    const keys = await navKeys(page);
    for (const k of m.present) expect(keys, `${m.who} should list ${k}`).toContain(k);
    for (const k of m.absent) expect(keys, `${m.who} should not list ${k}`).not.toContain(k);
    await expect(page.locator("[data-shell-sidebar] [data-nav-soon]")).toHaveCount(0); // only the Administration board draws "Soon" rows
  }
});
