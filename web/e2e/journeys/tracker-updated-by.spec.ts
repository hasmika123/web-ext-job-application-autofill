import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STATE } from "../fixtures/accounts";

/**
 * Change audit on the tracker (U6.14, docs/change-audit/README.md section 3): "Updated ... by ..." in the list, in the
 * detail header and in the timeline, at a desktop (side panel) and a phone (bottom sheet) width. Runs against the mock
 * API's demo job seeker (Priya Sharma, account id 101): in the mock, a marketer ("Sarah Chen") set the Figma
 * application's next step 5 hours ago and the extension moved the Canva one. State is in memory, so a test that writes
 * changes only the application it opens.
 */
test.use({ storageState: STATE.demo });

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Opens an application by its role title (the mock's applications: Figma "Design Systems Designer", Notion "Product Designer, Growth"). */
async function openApp(page: Page, role: string) {
  await page.goto("/applications");
  await expect(page.getByRole("tab", { name: /^All/ })).toBeVisible();
  await page.getByRole("button", { name: role }).first().click();
  const detail = page.locator("[data-application-detail]");
  await expect(detail.getByText("Where does this stand?")).toBeVisible();
  return detail;
}

test.describe("desktop (side panel)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the list has an Updated column: other people and the extension show, 'by you' never does, no ent# login", async ({ page }) => {
    await page.goto("/applications");
    await expect(page.getByRole("columnheader", { name: "Updated" })).toBeVisible();
    const cells = page.locator("table [data-updated-cell]");
    await expect(cells.first()).toBeVisible();
    const all = (await cells.allTextContents()).join(" | ");
    expect(all).toContain("by Sarah Chen");
    expect(all).toContain("MARKETER");
    expect(all).toContain("by the extension");
    expect(all).not.toMatch(/by you/);
    expect(await page.locator("body").innerText()).not.toContain("ent#");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });

  test("the header line names the marketer", async ({ page }) => {
    const detail = await openApp(page, "Design Systems Designer");
    const line = detail.locator("[data-updated-by]");
    await expect(line).toContainText("by Sarah Chen");
    await expect(line).toContainText("MARKETER");
    await expect(line).toHaveAttribute("title", /\d{4}.* by Sarah Chen/);
  });

  test("changing the status reads 'Updated just now by you' and the timeline follows", async ({ page }) => {
    const detail = await openApp(page, "Product Designer, Growth");
    const line = detail.locator("[data-updated-by]");
    await expect(line).toContainText("by the extension");

    await detail.getByRole("group", { name: "Application status" }).getByRole("button", { name: "Under review" }).click();
    await expect(line).toHaveText(/Updated just now by you/);
    const newest = detail.getByRole("list", { name: "Timeline" }).getByRole("listitem").first();
    await expect(newest).toContainText("Moved to");
    await expect(newest).toContainText("by you");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("phone (bottom sheet)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the header line wraps, opens the Timeline, and nothing scrolls sideways", async ({ page }) => {
    const detail = await openApp(page, "Design Systems Designer");
    const button = detail.getByRole("button", { name: "Open timeline" });
    await expect(button).toContainText("by Sarah Chen");
    await detail.getByRole("tab", { name: /^Notes/ }).click();
    await button.click();
    await expect(detail.getByRole("tab", { name: /^Timeline/ })).toHaveAttribute("aria-selected", "true");
    // no hover on a phone: the absolute time is printed inline
    await expect(detail.locator("[data-absolute-time]").first()).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});
