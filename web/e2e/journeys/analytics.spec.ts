import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STATE } from "../fixtures/accounts";
import { expectNoHorizontalScroll, expectNoWordPerLineHeadings } from "../fixtures/audit";

/**
 * Analytics on real data (U12.1): a brand-new account sees an honest empty state (no chart, no sample number, no
 * "Skills in demand"); the seeded demo job seeker (Priya: 5 sent, 1 interview, 1 offer) sees its own numbers, and the
 * period select really asks the server for another range.
 */

/** The four tiles as `label -> value` (the number sits just above its label). */
async function tiles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const label of ["Applications", "Replies", "Interviews", "Offers"]) {
      const el = [...document.querySelectorAll("main div")].find((d) => d.children.length === 0 && d.textContent === label);
      out[label] = el?.previousElementSibling?.textContent ?? "";
    }
    return out;
  });
}

test.describe("a brand-new account", () => {
  test.use({ storageState: STATE.fresh, viewport: { width: 1440, height: 900 } });

  test("an honest empty state, with a next step and no sample", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/analytics");
    await expect(page.getByText("No analytics yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Find jobs" })).toBeVisible();
    for (const sample of [/Skills in demand/, /Example numbers/, /Google/, /Microsoft/, /React/]) await expect(page.getByText(sample)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("a seeded account", () => {
  test.use({ storageState: STATE.demo, viewport: { width: 1440, height: 900 } });

  test("the tiles and cards are the account's own and the period select is real", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/analytics")) asked.push(new URL(r.url()).searchParams.get("range") ?? "");
    });
    await page.goto("/analytics");
    await expect(page.getByText("Applications over time")).toBeVisible();
    const t = await tiles(page);
    expect(t.Applications).toBe("5");
    expect(Number(t.Interviews)).toBeGreaterThanOrEqual(1);
    await expect(page.getByText("Skills in demand")).toHaveCount(0);
    await expect(page.getByText("Status breakdown")).toBeVisible();
    // inbox-sourced replies exist for the demo, so response-by-company lists real companies
    await expect(page.getByText("Response rate by company")).toBeVisible();

    await page.getByRole("button", { name: "Time period" }).click();
    await page.getByRole("option", { name: "Last year" }).click();
    await expect.poll(() => asked).toContain("365");
    await page.getByRole("button", { name: "Time period" }).click();
    await page.getByRole("option", { name: "Last 90 days" }).click();
    await expect.poll(() => asked).toContain("90");
    await expect(page.getByText("Applications over time")).toBeVisible();
  });

  test("at a phone width nothing scrolls sideways and no heading is a word per line", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/analytics");
    await expect(page.getByText("Applications over time")).toBeVisible();
    await expectNoHorizontalScroll(page, "analytics at 390");
    await expectNoWordPerLineHeadings(page, "analytics at 390");
    await page.setViewportSize({ width: 360, height: 780 });
    await expectNoHorizontalScroll(page, "analytics at 360");
  });
});
