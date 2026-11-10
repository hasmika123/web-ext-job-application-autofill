import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STATE } from "../fixtures/accounts";

/**
 * The tracker (U6.3, U5.1): open an application from the list, change its status and undo, add a note, add an
 * interview and get its calendar file, at a desktop (side panel) and a phone (bottom sheet) width. Runs against the mock API's demo job seeker (Priya Sharma: 8 applications, two
 * of them saved), whose state lives in memory, so each test writes its own unique text.
 */
test.use({ storageState: STATE.demo });

const unique = () => `e2e ${Date.now().toString(36)}`;

/** Opens "Stripe - Senior Product Designer" (id 1) from the list and waits for its detail. */
async function openStripe(page: Page) {
  await page.goto("/applications");
  await expect(page.getByRole("tab", { name: /^All/ })).toBeVisible();
  await page.getByRole("button", { name: "Senior Product Designer" }).first().click();
  await expect(page).toHaveURL(/[?&]app=1(&|$)/);
  const detail = page.locator("[data-application-detail='1']");
  await expect(detail.getByText("Where does this stand?")).toBeVisible();
  await expect(detail.getByRole("tab", { name: /Timeline/ })).toBeVisible();
  return detail;
}

async function statusJourney(page: Page) {
  const detail = await openStripe(page);
  const picker = detail.getByRole("group", { name: "Application status" });
  await expect(picker.getByRole("button", { name: "Interview" })).toHaveAttribute("aria-pressed", "true");

  await picker.getByRole("button", { name: "Under review" }).click();
  await expect(picker.getByRole("button", { name: "Under review" })).toHaveAttribute("aria-pressed", "true");
  const toast = page.getByText("Moved to Under review");
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(picker.getByRole("button", { name: "Interview" })).toHaveAttribute("aria-pressed", "true");
}

async function noteJourney(page: Page) {
  const detail = await openStripe(page);
  await detail.getByRole("tab", { name: /^Notes/ }).click();
  await detail.getByRole("button", { name: "Add note" }).click();
  const text = unique();
  // autosave: the note is created shortly after the words stop (no Save button), and the chip says so
  const created = page.waitForResponse((r) => r.url().endsWith("/api/applications/1/notes") && r.request().method() === "POST");
  await detail.getByPlaceholder("Write a note…").first().fill(text);
  expect((await created).status()).toBe(201);
  await expect(detail.getByRole("status").filter({ hasText: /^Saved/ }).first()).toBeVisible();
  // saved on the server: it is there after a reload
  await expect(async () => {
    await page.goto("/applications?app=1");
    await page.locator("[data-application-detail='1']").getByRole("tab", { name: /^Notes/ }).click();
    const values = await page.locator("[data-application-detail='1'] textarea").evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    expect(values).toContain(text);
  }).toPass({ timeout: 20_000 });
}

async function interviewJourney(page: Page) {
  const detail = await openStripe(page);
  await detail.getByRole("tab", { name: /^Interview/ }).click();
  await detail.getByRole("button", { name: "Add interview" }).click();
  // the new form is last (soonest first, and a new one starts tomorrow)
  const forms = detail.locator("[data-interview-id]");
  await expect(forms.first()).toBeVisible();
  const ics = detail.getByRole("link", { name: "Download .ics" }).last();
  await expect(ics).toBeVisible();
  const href = await ics.getAttribute("href");
  expect(href).toMatch(/^\/api\/interviews\/\d+\/ics$/);
  const res = await page.request.get(href!);
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("text/calendar");
  await expect(detail.getByRole("link", { name: "Google Calendar" }).last()).toHaveAttribute("href", /calendar\.google\.com/);
}

test.describe("desktop (side panel)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("change status, then undo", async ({ page }) => {
    await statusJourney(page);
    await expect(page.getByRole("dialog", { name: /Senior Product Designer/ })).toBeVisible();
  });
  test("add a note and it survives a reload", async ({ page }) => noteJourney(page));
  test("add an interview and get its .ics and Google Calendar links", async ({ page }) => interviewJourney(page));

  test("the tabs count what the server counts, and the deep link opens the sheet", async ({ page }) => {
    await page.goto("/applications");
    await expect(page.getByRole("tab", { name: /^All\s*8/ })).toBeVisible();
    await page.getByRole("tab", { name: /^Interviews/ }).click();
    await expect(page.getByRole("button", { name: "Senior Product Designer" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Design Systems Designer" })).toHaveCount(0);
    await page.goto("/board?app=4");
    await expect(page).toHaveURL(/\/applications\?app=4/);
    await expect(page.locator("[data-application-detail='4']")).toBeVisible();
  });
});

test.describe("phone (bottom sheet)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("change status, then undo", async ({ page }) => {
    await statusJourney(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    // a phone has no horizontal scroll with the sheet open
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
  test("add a note", async ({ page }) => noteJourney(page));
  test("add an interview and get the calendar links", async ({ page }) => interviewJourney(page));
});

test.describe("Saved Jobs (U5.1)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("tabs read real SAVED applications; removing one offers Undo", async ({ page }) => {
    await page.goto("/saved");
    await expect(page.getByRole("tab", { name: /To apply/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Staff Product Designer", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Senior UX Designer", exact: true })).toBeVisible();
    // a job that is not SAVED is not here
    await expect(page.getByRole("link", { name: "Design Systems Designer", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /More actions for Staff Product Designer/ }).click();
    await page.getByRole("menuitem", { name: "Remove from saved" }).click();
    await expect(page.getByText("Removed from saved jobs")).toBeVisible();
    await expect(page.getByRole("link", { name: "Staff Product Designer", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("link", { name: "Staff Product Designer", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Applied/ }).click();
    await expect(page.getByRole("link", { name: "Design Systems Designer", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /Not interested/ }).click();
    await expect(page.locator("[data-empty-state]").first()).toBeVisible();
  });
});
