import { expect, test, type Page } from "@playwright/test";

/**
 * The P0 fixes of the 2026-10-16 enterprise role audit against the REAL stack (Spring API + MySQL + `next start`; see
 * docs/enterprise-v2/real-stack-runbook.md): the Resume Builder opens inside the tenant shell (D1), Gamma's consultants are linked so a marketer can prepare a
 * resume for them and they approve it (D2/D3), the marketer's Job Discovery is mounted (D5), and the new-resume chooser reads the organization's records (D10).
 *
 *   E2E_REAL_PORT=3210 PW_CHANNEL=chrome npx playwright test -c playwright.real.config.ts tenant-audit-fixes
 *
 * Acme (SHARED accounts) people sign in through the Demo accounts tab; Gamma (SEPARATE accounts) people with the e-mail and the demo password.
 * Writes: the journeys create resumes (Anika one, Cora one); run them against a database you may change.
 */
const port = process.env.E2E_REAL_PORT ?? "3200";
const acme = `http://acme.localhost:${port}`;
const gamma = `http://gamma.localhost:${port}`;
const GAMMA_PASSWORD = "Gamma-Demo-2026!";

async function demoSignIn(page: Page, name: string) {
  await page.goto(`${acme}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

async function gammaSignIn(page: Page, first: string, last: string) {
  await page.goto(`${gamma}/login`);
  await page.fill('input[name="username"]', `${first}.${last}@gamma.example.com`.toLowerCase());
  await page.fill('input[name="password"]', GAMMA_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
}

const noServerError = async (page: Page) => {
  await expect(page.getByText("Error in the Server Components render")).toHaveCount(0);
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
};

test.describe("enterprise audit fixes (real stack)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("D1 + D10: a consultant creates a resume and the builder opens inside the organization's frame", async ({ page }) => {
    await demoSignIn(page, "Anika Rao");
    await page.goto(`${acme}/w/consultant/resumes`);
    await expect(page.locator("[data-consultant-resumes]")).toBeVisible();
    await page.locator("[data-create-resume]").click();
    const dialog = page.getByRole("dialog");
    // D10: the chooser reads the organization's records, not an empty account profile
    await expect(dialog.getByText("Your profile is empty")).toHaveCount(0);
    await expect(dialog.getByText(/Your saved profile: \d+ roles?/)).toBeVisible();
    await expect(dialog.getByText("You don't have a resume to copy yet")).toHaveCount(0);
    await dialog.getByRole("radio", { name: /Start from scratch/ }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: "Create resume" }).click();
    await page.waitForURL(/\/w\/consultant\/resumes\/\d+$/);
    await noServerError(page);
    await expect(page.locator("[data-builder-frame]")).toBeVisible();
    // the organization's frame, not Kiwiply's: no link to the Kiwiply dashboard in the editor's bar
    await expect(page.locator('[data-builder-frame] a[href="/dashboard"]')).toHaveCount(0);
  });

  test("D1: Open in builder on an imported record makes an editable copy and opens it", async ({ page }) => {
    await demoSignIn(page, "Anika Rao");
    await page.goto(`${acme}/w/consultant/resumes`);
    await expect(page.locator("[data-consultant-resumes]")).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasNot: page.locator("[data-modified-by]") }).first();
    await row.getByRole("button", { name: /More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Open in builder" }).click();
    await page.waitForURL(/\/w\/consultant\/resumes\/\d+$/);
    await noServerError(page);
    await expect(page.locator("[data-builder-frame]")).toBeVisible();
  });

  test("D5: the marketer's Job Discovery is the real page, not 'on the way'", async ({ page }) => {
    await demoSignIn(page, "Omar Haddad");
    await page.goto(`${acme}/w/marketing/jobs`);
    await expect(page.getByText("This page is on the way")).toHaveCount(0);
    await expect(page.locator("[data-jobs-page]").first()).toBeVisible();
  });

  test("D2/D3: Gamma's consultants land on their workspace, a marketer prepares a resume for one, and she approves it", async ({ browser }) => {
    const dana = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await gammaSignIn(dana, "Dana", "Moreau");
    await expect(dana.getByText("This page isn't part of your role")).toHaveCount(0);
    await dana.goto(`${gamma}/w/consultant/resumes`);
    await expect(dana.locator("[data-consultant-resumes]")).toBeVisible();

    const marco = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await gammaSignIn(marco, "Marco", "Bellini");
    await marco.goto(`${gamma}/w/marketing/resumes`);
    await marco.locator("[data-new-resume-for]").click();
    const picker = marco.getByRole("dialog");
    const cora = picker.locator('[data-consultant]').filter({ hasText: "Cora Lindahl" });
    await expect(cora).toBeEnabled();
    await cora.click();
    const sheet = marco.getByRole("dialog");
    await sheet.getByRole("radio", { name: /Start from scratch/ }).click();
    await sheet.getByRole("button", { name: "Continue" }).click();
    await sheet.getByRole("button", { name: "Create resume" }).click();
    await expect(marco.getByText(/waits for .* approval|Pending|pending/i).first()).toBeVisible();

    const cora2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await gammaSignIn(cora2, "Cora", "Lindahl");
    await cora2.goto(`${gamma}/w/consultant/resumes`);
    await cora2.getByRole("button", { name: /^Approve / }).first().click();
    await expect(cora2.getByText(/approved|Approved/).first()).toBeVisible();
  });
});
