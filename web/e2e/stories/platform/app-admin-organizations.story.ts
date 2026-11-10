import { randomBytes } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { PORT } from "../_support/personas";
import { expectNoSideScroll } from "./_platform";

/**
 * APP: the Kiwiply platform admin's Organizations page (X1.11), the start of enterprise onboarding. The app admin signs in on the
 * PLATFORM host (localhost, not a tenant), lists organizations, opens one, provisions its address, turns enterprise on with a reason,
 * suspends and resumes a hostname, and creates a new organization whose owner is given a one-time temporary password.
 *
 * The app admin account is the seeded `admin` user of the dev stack (override with STORY_ADMIN_LOGIN / STORY_ADMIN_PASSWORD).
 * Every organization these stories create has a unique label; nothing depends on counts of records they did not create. The owner's
 * temporary password is read from the shown-once dialog at run time and is never written to the log, a file or the report; the new
 * password the owner chooses is generated per run.
 */
const PLATFORM = `http://localhost:${PORT}`;
const ADMIN_LOGIN = process.env.STORY_ADMIN_LOGIN ?? "admin";
const ADMIN_PASSWORD = process.env.STORY_ADMIN_PASSWORD ?? "admin";

const unique = () => `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const tenantHost = (label: string) => `http://${label}.localhost:${PORT}`;

/** Each browser gets its own made-up client address, so the sign-in rate limit (10 per 5 minutes per address) never counts one story against another. */
const clientAddress = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${1 + (randomBytes(1)[0] % 250)}`;

/** The app admin signs in ONCE for the whole file; every story starts from that session's cookies (held in memory, never written to disk). */
let adminCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": clientAddress() } });
  const page = await context.newPage();
  await page.goto(`${PLATFORM}/login`);
  await page.getByLabel("Email address").fill(ADMIN_LOGIN);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  adminCookies = await context.cookies();
  await context.close();
});

async function signInAsAppAdmin(page: Page) {
  await page.context().addCookies(adminCookies);
  await page.goto(`${PLATFORM}/admin/organizations`);
  await expect(page.getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();
}

/** The HTTP status the organization address answers a browser with (Node cannot resolve *.localhost; Chromium can). */
async function statusOf(visitor: { page: Page }, url: string): Promise<number> {
  const response = await visitor.page.goto(url, { waitUntil: "commit" }).catch(() => null);
  return response ? response.status() : 0;
}

interface Made {
  id: number;
  label: string;
  name: string;
  ownerEmail: string;
  /** Read from the shown-once dialog; null when the account already existed. */
  tempPassword: string | null;
}

/** Create an organization through the dialog, copy the shown-once password, close the dialog (which opens the organization). */
async function createOrganization(page: Page, over: Partial<{ label: string; name: string; ownerEmail: string; type: string }> = {}): Promise<Made> {
  const label = over.label ?? `app${unique()}`;
  const name = over.name ?? `Story Staffing ${label}`;
  const ownerEmail = over.ownerEmail ?? `owner.${label}@example.test`;
  await page.getByRole("button", { name: "Create organization" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create organization" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Organization name").fill(name);
  await dialog.getByLabel("Address").fill(label);
  await expect(dialog.locator("[data-label-state=ok]")).toBeVisible();
  await dialog.getByLabel("Owner name").fill("Olivia Owner");
  await dialog.getByLabel("Owner e-mail").fill(ownerEmail);
  await dialog.getByRole("button", { name: "Create organization" }).click();
  const shown = page.getByRole("dialog", { name: "Organization created" });
  await expect(shown).toBeVisible();
  const field = shown.getByTestId("temp-password");
  await expect(field).toBeVisible();
  const tempPassword = await field.inputValue();
  await shown.getByRole("button", { name: "Copy" }).click();
  await expect(shown.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await page.waitForURL(/\/admin\/organizations\/\d+$/);
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return { id, label, name, ownerEmail, tempPassword };
}

async function withReason(page: Page, confirm: string, reason: string) {
  const sheet = page.getByRole("dialog").last();
  const button = sheet.getByRole("button", { name: confirm, exact: true });
  await expect(button).toBeDisabled();
  await sheet.getByLabel("Reason (required)").fill(reason);
  await expect(button).toBeEnabled();
  await button.click();
}

async function switchEnterprise(page: Page, name: string, on: boolean, reason: string) {
  await page.getByRole("switch", { name: `Enterprise for ${name}` }).click();
  await withReason(page, on ? "Turn on" : "Turn off", reason);
  await expect(page.getByRole("switch", { name: `Enterprise for ${name}` })).toHaveAttribute("aria-checked", String(on));
}

async function switchModule(page: Page, name: string, label: string, on: boolean, reason: string) {
  await page.getByRole("switch", { name: `${label} for ${name}` }).click();
  await withReason(page, on ? "Turn on" : "Turn off", reason);
  await expect(page.getByRole("switch", { name: `${label} for ${name}` })).toHaveAttribute("aria-checked", String(on));
}

async function freshContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": clientAddress() } });
  return { context, page: await context.newPage() };
}

test("APP-01 The app admin lists organizations, filters them and opens Acme", async ({ page }) => {
  await narrate(page, "The Kiwiply app admin signs in on the platform address, not on a tenant");
  await signInAsAppAdmin(page);
  await narrate(page, "The Organizations page: four tiles, filters and a table");
  for (const tile of ["Organizations", "Enterprise on", "Hostnames active", "Pending"]) await expect(page.getByText(tile, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Organizations" }).first()).toBeVisible(); // the nav entry
  await page.getByPlaceholder("Search name or address").fill("Acme");
  const acme = page.getByRole("row", { name: /Acme Staffing/ });
  await expect(acme).toBeVisible();
  await expect(page.getByRole("row", { name: /Beta Talent/ })).toHaveCount(0);
  await narrate(page, "A filter narrows by status; the search is kept in the address");
  await expect(page).toHaveURL(/q=Acme/);
  await acme.click();
  await page.waitForURL(/\/admin\/organizations\/\d+$/);
  await narrate(page, "Acme's page: counts, its hostnames and the enterprise switch, never a member's name");
  await expect(page.getByRole("heading", { name: "Acme Staffing", level: 1 })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Enterprise for Acme Staffing/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("list", { name: "Hostnames" })).toContainText("acme.localhost");
  await expect(page.getByText("Sarah Chen")).toHaveCount(0);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Admin history" })).toBeVisible();
});

test("APP-02 Provisioning an address: reserved and taken labels are refused live, a free one goes live", async ({ page }) => {
  await signInAsAppAdmin(page);
  const org = await createOrganization(page);
  await narrate(page, "A new organization already has the address it was created with");
  await expect(page.getByRole("list", { name: "Hostnames" })).toContainText(`${org.label}.`);
  await page.getByRole("button", { name: "Provision subdomain" }).click();
  const dialog = page.getByRole("dialog", { name: "Provision subdomain" });
  const input = dialog.getByLabel("Address");
  const submit = dialog.getByRole("button", { name: "Provision", exact: true });
  await narrate(page, "Typing a reserved word: refused while typing, nothing to submit");
  await input.fill("api");
  await expect(dialog.getByText(/reserved for Kiwiply/)).toBeVisible();
  await expect(submit).toBeDisabled();
  await narrate(page, "Typing Acme's address: taken, with a suggestion");
  await input.fill("acme");
  await expect(dialog.getByText(/already taken/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Use acme-/ })).toBeVisible();
  await expect(submit).toBeDisabled();
  await narrate(page, "A free label is accepted and goes live");
  const next = `${org.label}x`;
  await input.fill(next);
  await expect(dialog.locator("[data-label-state=ok]")).toBeVisible();
  await submit.click();
  await expect(dialog).toBeHidden();
  const hosts = page.getByRole("list", { name: "Hostnames" });
  await expect(hosts.locator(`[data-hostname^="${next}."]`)).toContainText("Active");
  await narrate(page, "The old address is retired, the audit trail records who did it");
  await expect(hosts.locator(`[data-hostname^="${org.label}."]`)).toContainText("Removed");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Admin history" })).toContainText("Subdomain provisioned");
});

test("APP-03 The enterprise switch always asks for a reason, and the address follows it", async ({ page, browser }) => {
  await signInAsAppAdmin(page);
  const org = await createOrganization(page);
  await narrate(page, "Enterprise starts off for a new organization");
  const toggle = page.getByRole("switch", { name: `Enterprise for ${org.name}` });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await narrate(page, "Turning it on needs a reason of at least ten characters");
  await toggle.click();
  const sheet = page.getByRole("dialog").last();
  await sheet.getByLabel("Reason (required)").fill("short");
  await expect(sheet.getByRole("button", { name: "Turn on", exact: true })).toBeDisabled();
  await sheet.getByLabel("Reason (required)").fill("Order form signed, pilot starts Monday");
  await sheet.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await narrate(page, "The organization address now answers with its own sign-in");
  const visitor = await freshContext(browser);
  await expect.poll(() => statusOf(visitor, `${tenantHost(org.label)}/login`), { timeout: 20_000 }).toBe(200);
  await visitor.context.close();
  await narrate(page, "Modules are switched one by one, each with a reason");
  await switchModule(page, org.name, "Roles and permissions", true, "Part of the pilot scope");
  await narrate(page, "The history keeps the changes with who did them");
  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "Admin history" });
  await expect(history).toContainText("Enterprise switched on");
  await expect(history).toContainText("Module switched on");
});

test("APP-04 Create organization: the owner gets a one-time temporary password and must choose their own", async ({ page, browser }) => {
  await signInAsAppAdmin(page);
  await narrate(page, "Create organization: name, address, type, and the owner's name and e-mail");
  const org = await createOrganization(page);
  expect(org.tempPassword).toBeTruthy();
  await narrate(page, "The temporary password was shown once; the page never shows it again");
  await expect(page.locator("[data-testid=temp-password]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(org.tempPassword ?? "")).toHaveCount(0);
  await expect(page.getByText("Members", { exact: true }).first()).toBeVisible();
  await narrate(page, "Enterprise on, so the new address serves the organization");
  await switchEnterprise(page, org.name, true, "Owner onboarding, order form signed");
  await switchModule(page, org.name, "Roles and permissions", true, "Owner onboarding, workspace roles");

  const owner = await freshContext(browser);
  const host = tenantHost(org.label);
  await owner.page.goto(`${host}/login`);
  await narrate(owner.page, "The owner signs in on the organization address with the e-mail and the temporary password");
  await owner.page.getByLabel("Email", { exact: true }).fill(org.ownerEmail);
  await owner.page.getByLabel("Password", { exact: true }).fill(org.tempPassword ?? "");
  await owner.page.getByRole("button", { name: /^Sign in/ }).click();
  await owner.page.waitForURL(/\/change-password$/, { timeout: 30_000 });
  await expect(owner.page.getByRole("heading", { name: "Choose your password", level: 1 })).toBeVisible();

  await narrate(owner.page, "Nothing else works yet: every page comes back here and every API call is refused");
  await owner.page.goto(`${host}/w/admin`);
  await expect(owner.page).toHaveURL(/\/change-password$/);
  const refused = await owner.page.evaluate(async () => {
    const r = await fetch("/api/me/tenant");
    return { status: r.status, body: await r.text() };
  });
  expect(refused.status).toBe(403);
  expect(refused.body).toContain("PASSWORD_CHANGE_REQUIRED");

  await narrate(owner.page, "A password that matches the temporary one is not accepted");
  const fresh = `Own-${randomBytes(6).toString("hex")}!`;
  await owner.page.getByLabel("Temporary password").fill(org.tempPassword ?? "");
  await owner.page.getByLabel("New password", { exact: true }).fill(org.tempPassword ?? "");
  await owner.page.getByLabel("Repeat the new password").fill(org.tempPassword ?? "");
  await owner.page.getByRole("button", { name: /Save and continue/ }).click();
  await expect(owner.page.locator("[data-tenant-change-password] [role=alert]")).toContainText("different from the temporary one");

  await narrate(owner.page, "The owner chooses their own password and lands on the Organization Dashboard");
  await owner.page.getByLabel("New password", { exact: true }).fill(fresh);
  await owner.page.getByLabel("Repeat the new password").fill(fresh);
  await owner.page.getByRole("button", { name: /Save and continue/ }).click();
  await owner.page.waitForURL((u) => u.pathname.startsWith("/w/admin"), { timeout: 30_000 });
  await expect(owner.page.locator("[data-page-header] h1")).toHaveText("Organization Dashboard");
  await owner.context.close();

  await narrate(page, "The temporary password no longer works; the new one does");
  const again = await freshContext(browser);
  await again.page.goto(`${host}/login`);
  await again.page.getByLabel("Email", { exact: true }).fill(org.ownerEmail);
  await again.page.getByLabel("Password", { exact: true }).fill(org.tempPassword ?? "");
  await again.page.getByRole("button", { name: /^Sign in/ }).click();
  await expect(again.page.getByText("Incorrect email or password.")).toBeVisible();
  await again.page.getByLabel("Password", { exact: true }).fill(fresh);
  await again.page.getByRole("button", { name: /^Sign in/ }).click();
  await again.page.waitForURL((u) => u.pathname.startsWith("/w/admin"), { timeout: 30_000 });
  await again.context.close();

  await narrate(page, "Once the owner has their own password, the admin cannot reset it");
  await page.reload();
  await page.getByRole("button", { name: /Reset owner password/ }).click();
  await withReason(page, "Reset password", "Owner asked for a new password");
  await expect(page.getByText(/already set their own password/)).toBeVisible();
});

test("APP-04b A reset gives the owner who never signed in a new one-time password", async ({ page }) => {
  await signInAsAppAdmin(page);
  const org = await createOrganization(page);
  await narrate(page, "Reset owner password: a reason, then a new password shown once");
  await page.getByRole("button", { name: /Reset owner password/ }).click();
  await withReason(page, "Reset password", "The owner never received the first one");
  const shown = page.getByRole("dialog", { name: "New temporary password" });
  const second = await shown.getByTestId("temp-password").inputValue();
  expect(second).not.toBe(org.tempPassword);
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await expect(page.locator("[data-testid=temp-password]")).toHaveCount(0);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Admin history" })).toContainText("Owner password reset");
});

test("APP-05 Suspending a hostname takes the address down at once; resuming brings it back", async ({ page, browser }) => {
  await signInAsAppAdmin(page);
  const org = await createOrganization(page);
  await switchEnterprise(page, org.name, true, "Pilot customer onboarding");
  const visitor = await freshContext(browser);
  const url = `${tenantHost(org.label)}/login`;
  await expect.poll(() => statusOf(visitor, url), { timeout: 20_000 }).toBe(200);
  await narrate(page, "Suspend the address, with a reason");
  const row = page.locator(`[data-hostname^="${org.label}."]`);
  await row.getByRole("button", { name: "Suspend" }).click();
  await withReason(page, "Suspend", "Payment dispute under review");
  await expect(row).toContainText("Suspended");
  await narrate(page, "The address answers as an unknown host straight away");
  await expect.poll(() => statusOf(visitor, url), { timeout: 20_000 }).toBe(404);
  await narrate(page, "Resume it, with a reason");
  await row.getByRole("button", { name: "Resume" }).click();
  await withReason(page, "Resume", "Dispute resolved in our favour");
  await expect(row).toContainText("Active");
  await expect.poll(() => statusOf(visitor, url), { timeout: 20_000 }).toBe(200);
  await visitor.context.close();
});

test("APP-06 On a phone the table is cards, the sheets are bottom sheets and nothing scrolls sideways", async ({ page }) => {
  await signInAsAppAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${PLATFORM}/admin/organizations`);
  await narrate(page, "At 390 pixels the organizations are cards");
  await page.getByPlaceholder("Search name or address").fill("Acme");
  await expect(page.getByRole("button", { name: /Acme Staffing/ }).first()).toBeVisible();
  await expectNoSideScroll(page);
  await narrate(page, "Create organization opens as a bottom sheet with the live address check");
  await page.getByRole("button", { name: "Create organization" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Create organization" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Address").fill("www");
  await expect(sheet.getByText(/reserved for Kiwiply/)).toBeVisible();
  await expectNoSideScroll(page);
  await page.keyboard.press("Escape");
  await narrate(page, "The organization page keeps its panels in one column");
  await page.goto(`${PLATFORM}/admin/organizations`);
  await page.getByPlaceholder("Search name or address").fill("Acme");
  await page.getByRole("button", { name: /Acme Staffing/ }).first().click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForURL(/\/admin\/organizations\/\d+$/);
  await expect(page.getByRole("switch", { name: /Enterprise for Acme Staffing/ })).toBeVisible();
  await expectNoSideScroll(page);
});
