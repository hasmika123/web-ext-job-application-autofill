import { expect, test } from "@playwright/test";
import { STATE } from "../fixtures/accounts";
import { expectNoHorizontalScroll, expectNoWordPerLineHeadings, expectNotOverlapped } from "../fixtures/audit";

/**
 * The org console opens (O1.6, O1.7, E2E-O4.0, O2.1, O2.7): the gate sends each membership shape where it belongs, the
 * switcher and the role-aware nav work, the create flow gets a phone user to a live workspace, and the dashboard shows a
 * checklist and an honest empty state for a real org (and a full board for the seeded demo org).
 *
 * Runs against the mock API with the `org-roles` fixture (`web/scripts/fixtures/org-roles.mjs`).
 */


test.describe("the console gate", () => {
  test.describe("a person in no organization", () => {
    test.use({ storageState: STATE["org.none"] });
    test("is sent to the create flow", async ({ page }) => {
      await page.goto("/org");
      await expect(page).toHaveURL(/\/org\/new$/);
    });
  });

  test.describe("a plain member", () => {
    test.use({ storageState: STATE["org.member"] });
    test("is sent to their own dashboard with a one-line explanation, and the toast does not stay in the URL", async ({ page }) => {
      await page.goto("/org/team");
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByText("The org console is for admins")).toBeVisible();
      await expect(page).not.toHaveURL(/toast=/);
    });
  });

  test.describe("one admin-ish membership", () => {
    test.use({ storageState: STATE["org.owner"] });
    test("opens the console on the real org, with the real role", async ({ page }) => {
      await page.goto("/org");
      await expect(page).toHaveURL(/\/org$/);
      await expect(page.locator("header").getByText("Northside Career Center")).toBeVisible();
      await expect(page.locator("header").getByText("Owner", { exact: true })).toBeVisible();
      await expect(page.getByText("Acme Corp")).toHaveCount(0);
    });
  });

  test.describe("the seeded demo org", () => {
    test.use({ storageState: STATE["demo-org"] });
    test("opens on Demo Bootcamp", async ({ page }) => {
      await page.goto("/org");
      await expect(page.locator("header").getByText("Demo Bootcamp")).toBeVisible();
    });
  });

  test.describe("several memberships", () => {
    test.use({ storageState: STATE["org.multi"] });
    test("the kiwiply_org cookie picks the org", async ({ page, context }) => {
      await page.goto("/org");
      await expect(page.locator("header").getByText("Harbor Staffing")).toBeVisible(); // first by name
      // the BFF only writes the cookie for an org the caller administers
      const bad = await page.request.post("/api/orgs/current", { data: { orgId: 203 } }); // a MEMBER seat
      expect(bad.status()).toBe(404);
      const ok = await page.request.post("/api/orgs/current", { data: { orgId: 202 } });
      expect(ok.status()).toBe(200);
      const cookie = (await context.cookies()).find((c) => c.name === "kiwiply_org");
      expect(cookie?.httpOnly).toBe(true);
      await page.goto("/org");
      await expect(page.locator("header").getByText("Zephyr Academy")).toBeVisible();
    });
  });
});

test.describe("the org switcher (phone)", () => {
  test.use({ storageState: STATE["org.multi"], viewport: { width: 390, height: 844 } });

  test("a bottom sheet lists the orgs you can open, switching sticks, and the page does not scroll sideways", async ({ page }) => {
    await page.goto("/org");
    await expectNoHorizontalScroll(page, "/org at 390");
    await page.getByRole("button", { name: /Switch organization/ }).click();
    const sheet = page.getByRole("dialog", { name: "Your organizations" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Harbor Staffing")).toBeVisible();
    await expect(sheet.getByText("Zephyr Academy")).toBeVisible();
    await expect(sheet.getByText("Orbit Coaching")).toHaveCount(0); // a plain MEMBER seat is not a console
    for (const row of await sheet.getByRole("button", { name: /Zephyr|Harbor|Create a workspace/ }).all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await sheet.getByRole("button", { name: /Zephyr Academy/ }).click();
    await expect(page.getByRole("button", { name: /Current: Zephyr Academy/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Current: Zephyr Academy/ })).toBeVisible();
  });
});

test.describe("role-aware nav", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Organization" }).getByRole("link");

  test.describe("owner", () => {
    test.use({ storageState: STATE["org.owner"] });
    test("sees all ten pages and the role under their name", async ({ page }) => {
      await page.goto("/org");
      await expect(nav(page)).toHaveCount(10);
      await expect(page.locator("header").getByText("Owner", { exact: true })).toBeVisible();
    });
  });

  test.describe("support owner", () => {
    test.use({ storageState: STATE["org.staff"] });
    test("sees five pages, and a page outside the role says so instead of rendering", async ({ page }) => {
      await page.goto("/org");
      await expect(nav(page)).toHaveText(["Dashboard", "Team Management", "Applications", "Interviews", "AI Resume Support"]);
      await expect(page.locator("header").getByText("Support owner")).toBeVisible();
      await page.goto("/org/billing");
      await expect(page.getByText("That page isn't part of your role")).toBeVisible();
    });
  });

  test.describe("finance", () => {
    test.use({ storageState: STATE["org.finance"] });
    test("sees the dashboard, analytics and billing", async ({ page }) => {
      await page.goto("/org");
      await expect(nav(page)).toHaveText(["Dashboard", "Analytics & Reports", "Billing & Subscription"]);
    });
  });
});

const MOCK = `http://localhost:${process.env.E2E_MOCK_PORT ?? 8180}`;

test.describe("billing-off activation", () => {
  test.use({ storageState: STATE["org.draft"], viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ request }) => {
    await request.post(`${MOCK}/mock/orgs/reset`); // the mock keeps orgs in memory for the whole run
  });

  test("a draft workspace says so, billing says it is not connected, and the owner activates it", async ({ page }) => {
    await page.goto("/org");
    const banner = page.locator("[data-draft-banner]");
    await expect(banner).toContainText("This workspace is a draft");
    await expect(page.locator("header").getByText("Draft")).toBeVisible();

    await banner.getByRole("link", { name: "Activate" }).click();
    await expect(page).toHaveURL(/\/org\/billing$/);
    await expect(page.getByText("Your workspace is a draft")).toBeVisible();
    await expect(page.getByText("Billing isn't connected in this environment")).toBeVisible();
    for (const invented of ["Enterprise", "4242", "INV-", "72 / 100"]) await expect(page.getByText(invented)).toHaveCount(0);

    await page.getByRole("button", { name: "Activate workspace (dev)" }).click();
    await expect(page.getByText("Workspace activated")).toBeVisible();
    await expect(page.getByText("Your workspace is active")).toBeVisible();
    await expect(page.getByRole("button", { name: "Activate workspace (dev)" })).toHaveCount(0);
    await page.goto("/org");
    await expect(page.locator("[data-draft-banner]")).toHaveCount(0);
    await expect(page.locator("header").getByText("Active")).toBeVisible();
  });
});

test.describe("the create flow (phone)", () => {
  test.use({ storageState: STATE["org.creator"], viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ request }) => {
    await request.post(`${MOCK}/mock/orgs/reset`);
  });

  test("name and type, about your people, activate: a live workspace in three screens, no sideways scroll, nothing covering the button", async ({ page }) => {
    await page.goto("/org"); // no org: the gate sends us here
    await expect(page).toHaveURL(/\/org\/new$/);
    await expect(page.getByRole("heading", { name: "What's your organization?" })).toBeVisible();
    await expectNoHorizontalScroll(page, "screen 1");
    await expectNoWordPerLineHeadings(page, "screen 1");

    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click(); // an empty first try names what is missing
    await expect(page.getByText("Add your organization's name.")).toBeVisible();

    await page.getByLabel("Organization name").fill("Acme Bootcamp");
    await expect(page.getByText("acme-bootcamp", { exact: true })).toBeVisible(); // the derived address
    await page.getByRole("radio", { name: "Bootcamp" }).click();
    await expectNotOverlapped(page.getByRole("button", { name: "Continue" }), "Continue on screen 1");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "About your people" })).toBeVisible();
    await expectNoHorizontalScroll(page, "screen 2");
    await page.getByRole("radio", { name: "51–200" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please confirm this to continue.")).toBeVisible(); // a bootcamp asserts 16+
    await page.getByLabel("Everyone we invite is 16 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Acme Bootcamp is ready" })).toBeVisible();
    await expectNoHorizontalScroll(page, "screen 3");
    await expect(page.locator("body")).not.toContainText(/\$\d/); // no price is typed into a screen
    await expectNotOverlapped(page.getByRole("button", { name: "Activate workspace (dev)" }), "Activate on screen 3");
    await page.getByRole("button", { name: "Activate workspace (dev)" }).click();

    await expect(page).toHaveURL(/\/org$/);
    await expect(page.getByRole("button", { name: /Current: Acme Bootcamp/ })).toBeVisible();
    await expect(page.locator("[data-draft-banner]")).toHaveCount(0);
  });

  test("a taken address comes back to screen 1 with a suggestion, one tap to use it", async ({ page }) => {
    await page.goto("/org/new");
    await page.getByLabel("Organization name").fill("Zephyr Academy"); // zephyr-academy is Zephyr Academy's address in the fixture
    await page.getByRole("radio", { name: "Company" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: "1–50", exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That address is taken.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What's your organization?" })).toBeVisible();
    await page.getByRole("button", { name: "Use zephyr-academy-2" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Zephyr Academy is ready" })).toBeVisible();
  });

  test("what was typed survives a reload, and 'Skip for now' lands in the draft console with the pay banner", async ({ page }) => {
    await page.goto("/org/new");
    await page.getByLabel("Organization name").fill("Lakeview Collective");
    await page.getByRole("radio", { name: "Company" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: "201–500" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "About your people" })).toBeVisible(); // still on screen 2
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("Organization name")).toHaveValue("Lakeview Collective");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: "201–500" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Skip for now, explore my workspace" }).click();
    await expect(page).toHaveURL(/\/org$/);
    await expect(page.locator("[data-draft-banner]")).toContainText("This workspace is a draft");
  });
});

test.describe("the create flow (narrowest phone)", () => {
  test.use({ storageState: STATE["org.none"], viewport: { width: 360, height: 740 } });
  test("360 px: headings do not wrap a word per line and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/org/new");
    await expect(page.getByRole("heading", { name: "What's your organization?" })).toBeVisible();
    await expectNoHorizontalScroll(page, "/org/new at 360");
    await expectNoWordPerLineHeadings(page, "/org/new at 360");
  });
});

test.describe("billing for an active workspace", () => {
  test.use({ storageState: STATE["org.finance"], viewport: { width: 390, height: 844 } });
  test("finance reads the honest state on a phone, without sideways scroll", async ({ page }) => {
    await page.goto("/org/billing");
    await expect(page.getByText("Your workspace is active")).toBeVisible();
    await expect(page.getByText("Billing isn't connected in this environment")).toBeVisible();
    await expect(page.getByRole("button", { name: /Activate/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page, "/org/billing at 390");
  });
});
