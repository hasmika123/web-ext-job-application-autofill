import { test, expect } from "@playwright/test";
import { ADMIN_LOGIN, ADMIN_PASSWORD, PLATFORM, randomPassword, saveOrg, tenantHost } from "./_v3";

/**
 * NOT a video (nothing is recorded or narrated). Makes a fresh organization in the state video 01 leaves behind (organization created and switched on with its
 * modules, owner signed in and with a chosen password, a "Delivery" department, a published primary colour), without the 6 minutes of recording.
 * Use it to repeat a take of video 02 or 03 on a clean organization:
 *   V3_ORG_LABEL=take2 npx playwright test -c playwright.videos.config.ts e2e/videos/v3/00-prep-org.video.ts
 * It writes the v3 state file, so the next video follows the new organization.
 */
const LABEL = process.env.V3_ORG_LABEL ?? `prep${Date.now().toString(36).slice(-5)}`;
const NAME = process.env.V3_ORG_NAME ?? "Brightline Talent Group";
const OWNER = process.env.V3_OWNER_NAME ?? "Maya Fernandez";
const OWNER_EMAIL = `maya.fernandez@${LABEL}.example`;
const ip = () => `10.${40 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

test("V3-00 prep: a fresh organization in the state video 01 leaves it", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const page = await ctx.newPage();
  await page.goto(`${PLATFORM}/login`);
  await page.getByLabel("Email address").fill(ADMIN_LOGIN);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.goto(`${PLATFORM}/admin/organizations`);
  await page.getByRole("button", { name: "Create organization" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create organization" });
  await dialog.getByLabel("Organization name").fill(NAME);
  await dialog.getByLabel("Address").fill(LABEL);
  await expect(dialog.locator("[data-label-state=ok]")).toBeVisible({ timeout: 20_000 });
  await dialog.getByLabel("Owner name").fill(OWNER);
  await dialog.getByLabel("Owner e-mail").fill(OWNER_EMAIL);
  await dialog.getByRole("button", { name: "Create organization" }).click();
  const shown = page.getByRole("dialog", { name: "Organization created" });
  const temp = await shown.getByTestId("temp-password").inputValue();
  await shown.getByRole("button", { name: "I have copied it" }).click();
  await page.waitForURL(/\/admin\/organizations\/\d+$/, { timeout: 30_000 });
  const on = async (switchName: string, reason: string) => {
    await page.getByRole("switch", { name: switchName }).click();
    const sheet = page.getByRole("dialog").last();
    await sheet.getByLabel("Reason (required)").fill(reason);
    await sheet.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(page.getByRole("switch", { name: switchName })).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });
  };
  await on(`Enterprise for ${NAME}`, "Order form signed, onboarding kickoff this week");
  for (const m of ["Roles and permissions", "Talent marketing", "Consultant assigned jobs"]) await on(`${m} for ${NAME}`, "Part of the starter package");
  await ctx.close();

  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const p = await owner.newPage();
  const host = tenantHost(LABEL);
  await p.goto(`${host}/login`);
  await p.getByLabel("Email", { exact: true }).fill(OWNER_EMAIL);
  await p.getByLabel("Password", { exact: true }).fill(temp);
  await p.getByRole("button", { name: /^Sign in/ }).click();
  await p.waitForURL(/\/change-password$/, { timeout: 45_000 });
  const fresh = randomPassword();
  await p.getByLabel("Temporary password").fill(temp);
  await p.getByLabel("New password", { exact: true }).fill(fresh);
  await p.getByLabel("Repeat the new password").fill(fresh);
  await p.getByRole("button", { name: /Save and continue/ }).click();
  await p.waitForURL((u) => u.pathname.startsWith("/w/admin"), { timeout: 60_000 });
  await p.goto(`${host}/w/admin/departments`);
  await p.getByRole("button", { name: "Create Department", exact: true }).first().click();
  const sheet = p.getByRole("dialog", { name: "Create Department" });
  await sheet.getByLabel(/Department name/).fill("Delivery");
  await sheet.getByRole("button", { name: "Create Department", exact: true }).click();
  await expect(p.getByRole("list", { name: "Departments", exact: true }).getByText("Delivery")).toBeVisible({ timeout: 30_000 });
  await p.goto(`${host}/w/admin/branding`);
  await expect(p.locator("[data-draft-badge]")).toBeVisible({ timeout: 45_000 });
  await p.getByLabel("Primary colour", { exact: true }).fill("#0f766e");
  await expect(p.locator('[data-draft-badge="differs"]')).toBeVisible({ timeout: 20_000 });
  await p.locator("[data-publish]").click();
  await p.locator("[data-publish-confirm]").click();
  await expect(p.locator('[data-draft-badge="live"]')).toBeVisible({ timeout: 30_000 });
  await owner.close();
  saveOrg({ label: LABEL, name: NAME, ownerName: OWNER, ownerEmail: OWNER_EMAIL, ownerPassword: fresh });
  console.log(`[v3] prepared organization ${LABEL}`);
});
