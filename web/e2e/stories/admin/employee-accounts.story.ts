import { randomBytes } from "node:crypto";
import { test, expect, narrate } from "../_support/story";
import { PORT } from "../_support/personas";
import { pickFirstDepartment } from "./_helpers";

/**
 * ADM-19 / ADM-19b: employee onboarding with a temporary password. The Org Admin creates the account now (roles and department as the
 * invitation form), copies the shown-once password, resets it once; then the new employee signs in on the tenant host, is held on the
 * change-password screen, chooses their own password and lands on their role's workspace. The invitation flow (ADM-15..18) is
 * unchanged and is the other mode of the same "Add employee" dialog.
 *
 * The two stories share one person and run in order. The temporary password is read from the dialog at run time and held in memory
 * only: it is never hard-coded, written to a file or printed; the password the employee chooses is generated per run.
 */
const ACME = `http://acme.localhost:${PORT}`;
const unique = () => `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

test.describe.configure({ mode: "serial", timeout: 150_000 }); // many deliberate pauses (slowMo, narration): the default 75 s is not enough

const person = { email: `hana.${unique()}@example.test`, name: "Story Employee", temp: "", chosen: `Own-${randomBytes(6).toString("hex")}!` };

test("ADM-19 Org admin adds an employee with a temporary password: role and department, copy once, reset once", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin/employees");
  await narrate(page, "Sarah clicks Add employee on the Employees page");
  await page.locator("[data-add-employee]").click();
  const panel = page.getByRole("dialog", { name: "Add employee" });
  await expect(panel).toBeVisible();
  await narrate(page, "The dialog opens in Create account now, with a generated password already in the field");
  await expect(panel.getByRole("radio", { name: /Create account now/ })).toBeChecked();
  const pwField = panel.getByLabel(/Temporary password/);
  await expect(pwField).not.toHaveValue("");
  await expect(panel.getByLabel(/Personal message/)).toHaveCount(0);

  await narrate(page, "Sarah fills in the address, the name, a role and a department");
  await panel.getByLabel(/Email address/).fill(person.email);
  await panel.getByLabel(/Full name/).fill(person.name);
  await panel.getByRole("button", { name: /^Role/ }).click();
  await panel.getByRole("checkbox", { name: /^HR Specialist/ }).check();
  await panel.getByRole("button", { name: /^Role/ }).click(); // close the role list: left open it pushes the Department list below the fold
  await pickFirstDepartment(page, panel);
  await narrate(page, "A password that breaks the rule is refused before anything is created");
  await pwField.fill("ab");
  await panel.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(panel.getByText("At least 4 characters.")).toBeVisible();
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(pwField).not.toHaveValue("ab");

  await narrate(page, "Create account: the password is shown once, with a Copy button");
  await panel.getByRole("button", { name: "Create account", exact: true }).click();
  const shown = page.getByRole("dialog", { name: "Account created" });
  await expect(shown).toBeVisible();
  await expect(shown.getByRole("alert")).toContainText("Shown once");
  const first = await shown.getByTestId("temp-password").inputValue();
  await shown.getByRole("button", { name: "Copy" }).click();
  await expect(shown.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await expect(page.getByTestId("temp-password")).toHaveCount(0);
  await expect(panel.getByText(`Account created for ${person.email}.`)).toBeVisible();

  await narrate(page, "On the Employees page the new person is active; Reset password issues a new password, once");
  await go("/w/admin/employees");
  await page.getByPlaceholder(/Search/).first().fill(person.name);
  await page.getByRole("row", { name: new RegExp(person.name) }).first().click();
  await page.locator('[data-quick-action="reset"]').click();
  const sheet = page.getByRole("dialog", { name: /Reset .*password/ });
  await sheet.getByLabel("Reason (required)").fill("The first one was lost");
  await sheet.getByRole("button", { name: "Reset password" }).click();
  const second = page.getByRole("dialog", { name: "New temporary password" });
  person.temp = await second.getByTestId("temp-password").inputValue();
  expect(person.temp).not.toBe(first);
  await second.getByRole("button", { name: "I have copied it" }).click();
  await expect(page.getByTestId("temp-password")).toHaveCount(0);
});

test("ADM-19b The new employee signs in on the tenant host, must choose a password, and lands on their workspace; the old password is dead", async ({ browser, as }) => {
  expect(person.temp, "ADM-19 must run first").not.toBe("");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${ACME}/login`);
  await narrate(page, "The employee signs in with the e-mail and the temporary password");
  await page.getByLabel("Email", { exact: true }).fill(person.email);
  await page.getByLabel("Password", { exact: true }).fill(person.temp);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await page.waitForURL(/\/change-password$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Choose your password", level: 1 })).toBeVisible();

  await narrate(page, "Nothing else opens: pages come back here and the API refuses");
  await page.goto(`${ACME}/w/hr`);
  await expect(page).toHaveURL(/\/change-password$/);
  const refused = await page.evaluate(async () => {
    const r = await fetch("/api/me/tenant");
    return { status: r.status, body: await r.text() };
  });
  expect(refused.status).toBe(403);
  expect(refused.body).toContain("PASSWORD_CHANGE_REQUIRED");

  await narrate(page, "They choose their own password and land on their role's workspace");
  await page.getByLabel("Temporary password").fill(person.temp);
  await page.getByLabel("New password", { exact: true }).fill(person.chosen);
  await page.getByLabel("Repeat the new password").fill(person.chosen);
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/hr"), { timeout: 30_000 });
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
  await ctx.close();

  const again = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await again.newPage();
  await p2.goto(`${ACME}/login`);
  await narrate(p2, "The temporary password no longer works; the new one does");
  await p2.getByLabel("Email", { exact: true }).fill(person.email);
  await p2.getByLabel("Password", { exact: true }).fill(person.temp);
  await p2.getByRole("button", { name: /^Sign in/ }).click();
  await expect(p2.getByText("Incorrect email or password.")).toBeVisible();
  await p2.getByLabel("Password", { exact: true }).fill(person.chosen);
  await p2.getByRole("button", { name: /^Sign in/ }).click();
  await p2.waitForURL((u) => u.pathname.startsWith("/w/hr"), { timeout: 30_000 });
  await again.close();

  const { page: sarah, go } = await as("sarah");
  await go("/w/admin/employees");
  await narrate(sarah, "Sarah can no longer reset it: the person chose their own");
  await sarah.getByPlaceholder(/Search/).first().fill(person.name);
  await sarah.getByRole("row", { name: new RegExp(person.name) }).first().click();
  await sarah.locator('[data-quick-action="reset"]').click();
  const sheet = sarah.getByRole("dialog", { name: /Reset .*password/ });
  await sheet.getByLabel("Reason (required)").fill("Trying to reset a chosen password");
  await sheet.getByRole("button", { name: "Reset password" }).click();
  await expect(sheet.getByText(/already chosen their own password/)).toBeVisible();
});
