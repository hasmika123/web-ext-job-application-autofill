import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STATE } from "../fixtures/accounts";

/**
 * The dashboard on real data (U3.1): a brand-new account sees zeros and honest empty cards with a next step each; the
 * seeded demo job seeker (Priya: 2 applied, 1 interview, 1 offer, 1 rejected, 2 saved) sees its own numbers, the
 * status donut, recent applications and its upcoming interviews. Neither shows a sample row.
 */

/** The four tiles as `label -> value`. */
async function tiles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const label of ["Applications", "Interviews", "Offers", "Saved Jobs"]) {
      const el = [...document.querySelectorAll("main div")].find((d) => d.children.length === 0 && d.textContent === label);
      out[label] = el?.previousElementSibling?.textContent ?? "";
    }
    return out;
  });
}

test.describe("a brand-new account", () => {
  test.use({ storageState: STATE.fresh, viewport: { width: 1440, height: 900 } });

  test("zeros and empty cards, each with a next step", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard");
    await expect(page.getByText("Send your first one")).toBeVisible();
    expect(await tiles(page)).toEqual({ Applications: "0", Interviews: "0", Offers: "0", "Saved Jobs": "0" });
    // activity + interviews load from their feeds, then say there is nothing, honestly
    await expect(page.getByText("No activity yet")).toBeVisible();
    await expect(page.getByText("No interviews coming up")).toBeVisible();
    await expect(page.getByText("No job alerts yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your first alert" })).toBeVisible();
    await expect(page.getByText("No applications yet").first()).toBeVisible();
    for (const sample of [/AI Insights/, /Google/, /Microsoft/, /78%/, /Frontend Developer/]) await expect(page.getByText(sample)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("a seeded account", () => {
  test.use({ storageState: STATE.demo, viewport: { width: 1440, height: 900 } });

  test("the tiles, the donut, recent applications and upcoming interviews are the account's own", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Upcoming Interviews")).toBeVisible();
    expect(await tiles(page)).toEqual({ Applications: "5", Interviews: "1", Offers: "1", "Saved Jobs": "2" });
    await expect(page.getByRole("img", { name: /5 Total: 2 Applied, 0 Under Review, 1 Interview, 1 Offer, 1 Rejected/ })).toBeVisible();
    // recent applications link to their detail
    const stripe = page.getByRole("link", { name: /Stripe/ }).first();
    await expect(stripe).toHaveAttribute("href", /\/applications\?app=1$/);
    // an interview is on the calendar (the mock seeds one for Stripe two days out)
    await expect(page.getByText(/^Video call · /).first()).toBeVisible();
    // activity bars, not the empty state
    await expect(page.getByRole("group").first()).toBeVisible();
    await expect(page.getByText("No activity yet")).toHaveCount(0);
  });

  test("at a phone width there is no horizontal scroll and the interview card fits", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByText("Upcoming Interviews")).toBeVisible();
    await expect(page.getByText(/^Video call · /).first()).toBeVisible();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
