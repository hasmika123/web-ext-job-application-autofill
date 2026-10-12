import { expect, test } from "@playwright/test";
import { STATE } from "../fixtures/accounts";
import { expectNoHorizontalScroll } from "../fixtures/audit";

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
