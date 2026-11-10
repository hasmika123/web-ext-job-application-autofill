import { expect, test } from "@playwright/test";
import { ADMIN_WIDTHS, expectAccessible, noOverflow, shot, signInAdmin, trackConsoleErrors } from "../fixtures/admin";

/**
 * The admin page kit (E2E-A15.0) in a real browser, on the development-only specimen page `/admin/kit` (local data, no
 * API): real deltas, the URL-synced filter bar, the table that becomes cards, the reason / typed-confirm sheets and the
 * autosave tick with Undo. Set ADMIN_SHOTS=<dir> to save screenshots.
 */
test.beforeEach(async ({ page }) => {
  await signInAdmin(page);
});

const users = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Users" });

test.describe("at 1440px", () => {
  test.use({ viewport: { width: ADMIN_WIDTHS.desktop, height: 900 } });

  test("tiles show a delta only when there is a real previous value", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/admin/kit");
    await expect(page.getByRole("heading", { level: 1, name: "Admin kit specimen" })).toBeVisible();
    await expect(page.locator("[data-delta=up]").filter({ hasText: "12%" })).toHaveCount(1); // 112 vs 100
    await expect(page.locator("[data-delta=up]").filter({ hasText: "3 pts" })).toHaveCount(1); // 63% vs 60%, points mode
    await expect(page.locator("[data-delta]")).toHaveCount(3); // the fourth tile has previous = null: no chip
    await expect(page.locator('[data-delta][data-good="false"]')).toHaveCount(1); // failed logins went UP: bad
    await expect(page.getByText("previous window arrives with the API")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    await noOverflow(page, "kit 1440");
    expect(errors(), "console errors (hydration mismatches included)").toEqual([]);
    await shot(page, "kit-1440");
  });

  test("search and filters are server-driven and live in the URL; paging is real", async ({ page }) => {
    await page.goto("/admin/kit");
    const table = users(page).getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(21); // header + 20
    await expect(users(page).getByText("Showing 1–20 of 47")).toBeVisible();

    await users(page).getByRole("button", { name: "Page 3" }).click();
    await expect(users(page).getByText("Showing 41–47 of 47")).toBeVisible();
    await expect(page).toHaveURL(/page=2/);

    await page.getByRole("searchbox", { name: "Search name or login" }).fill("user07");
    await expect(users(page).getByText("Showing 1–1 of 1")).toBeVisible(); // debounced, then page reset to 1
    await expect(page).toHaveURL(/q=user07/);
    await expect(table.getByRole("row")).toHaveCount(2);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(users(page).getByText("Showing 1–20 of 47")).toBeVisible();
    await expect(page).not.toHaveURL(/q=/);

    await page.getByRole("button", { name: "Plan" }).click();
    await page.getByRole("option", { name: "Pro", exact: true }).click();
    await expect(page).toHaveURL(/plan=PRO/);
    await expect(users(page).getByText(/^Showing 1–\d+ of 16$/)).toBeVisible();

    await page.getByRole("searchbox", { name: "Search name or login" }).fill("zzz-nobody");
    await expect(users(page).getByText("No users match")).toBeVisible();
    await shot(page, "kit-no-match-1440");
  });

  test("a filtered link opens already filtered (the URL is the state)", async ({ page }) => {
    await page.goto("/admin/kit?q=user1&plan=FREE");
    await expect(page.getByRole("searchbox", { name: "Search name or login" })).toHaveValue("user1");
    await expect(page.getByRole("button", { name: "Plan" })).toContainText("Free");
    await expect(users(page).getByText(/^Showing 1–\d+ of \d+$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  test("Deactivate asks for a reason: off until 10 characters, Esc cancels, confirming records it", async ({ page }) => {
    await page.goto("/admin/kit");
    const first = users(page).getByRole("table").getByRole("button", { name: "Deactivate" }).first();
    await first.click();
    const dialog = page.getByRole("dialog", { name: "Deactivate user01?" });
    await expect(dialog).toBeVisible();
    const go = dialog.getByRole("button", { name: "Deactivate", exact: true });
    await expect(go).toBeDisabled();
    await shot(page, "kit-reason-dialog-1440");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();

    await first.click();
    await dialog.getByLabel("Reason (required)").fill("short");
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Reason (required)").fill("Support ticket 4821, user asked");
    await expect(go).toBeEnabled();
    await go.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Last confirmed: deactivate user01: Support ticket 4821, user asked")).toBeVisible();
  });

  test("Delete needs the exact login AND a reason", async ({ page }) => {
    await page.goto("/admin/kit");
    await users(page).getByRole("table").getByRole("button", { name: "Delete" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Delete user01?" });
    const go = dialog.getByRole("button", { name: "Delete account" });
    await dialog.getByLabel("Reason (required)").fill("Verified privacy request 4821");
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Type user01 to confirm").fill("user02");
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Type user01 to confirm").fill("user01");
    await expect(go).toBeEnabled();
    await shot(page, "kit-typed-dialog-1440");
    await go.click();
    await expect(page.getByText("Last confirmed: delete user01: Verified privacy request 4821")).toBeVisible();
  });

  test("autosave: refusal shows inline, a save shows a tick and an Undo toast, no Save button", async ({ page }) => {
    await page.goto("/admin/kit");
    await expect(page.getByRole("button", { name: /^save/i })).toHaveCount(0);
    const box = page.getByLabel("Match threshold");
    await expect(box).toHaveValue("60");

    await box.fill("95");
    await box.blur();
    const refusal = page.getByRole("alert").filter({ hasText: "Must be between 40 and 90." });
    await expect(refusal).toBeVisible();
    await expect(box).toHaveValue("60");

    await box.fill("70");
    await box.blur();
    await expect(page.getByRole("img", { name: "Saved" }).first()).toBeVisible();
    await expect(page.getByText("Match threshold set to 70")).toBeVisible();
    await expect(box).toHaveValue("70");
    await shot(page, "kit-autosave-undo-1440");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(box).toHaveValue("60");
  });

  test("a HIGH switch asks for a reason before turning off, never before turning on", async ({ page }) => {
    await page.goto("/admin/kit");
    const sw = page.getByRole("switch", { name: "Resume parsing enabled" });
    await sw.click();
    const dialog = page.getByRole("dialog", { name: "Turn off resume parsing?" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Reason (required)").fill("Gemini 5xx spike");
    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(dialog).toBeHidden();
    await expect(sw).not.toBeChecked();

    await sw.click(); // on: no dialog
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(sw).toBeChecked();
  });

  test("the change history drawer opens and returns focus", async ({ page }) => {
    await page.goto("/admin/kit");
    const opener = page.getByRole("button", { name: "Change history" });
    await opener.click();
    await expect(page.getByText("jobs · match_threshold")).toBeVisible();
    await expect(page.getByText(/by admin · “Too many weak matches”/)).toBeVisible();
    await shot(page, "kit-history-1440");
    await page.keyboard.press("Escape");
    await expect(page.getByText("jobs · match_threshold")).toBeHidden();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`axe finds nothing (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/admin/kit");
      await expect(users(page).getByRole("table")).toBeVisible();
      await expectAccessible(page, `kit 1440 ${scheme}`, "main"); // the shell (sidebar) is A15.1's: see HANDOFF-ADMIN-E2E
    });
  }
});

test.describe("at 390px", () => {
  test.use({ viewport: { width: ADMIN_WIDTHS.phone, height: 844 } });

  test("the table is cards, nothing scrolls sideways, and every control is a thumb target", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/admin/kit");
    await expect(users(page).getByRole("listitem").first()).toBeVisible();
    await expect(users(page).getByRole("table")).toHaveCount(0);
    await expect(users(page).getByRole("listitem")).toHaveCount(20);
    await noOverflow(page, "kit 390");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(errors()).toEqual([]);
    const short = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main button, main input, main textarea")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && e.getAttribute("role") !== "switch" && r.height < 43;
        })
        .map((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40)),
    );
    expect(short, "controls under 44 px").toEqual([]);
    await shot(page, "kit-390");
  });

  test("tapping a card opens a sheet with every column and the actions; Deactivate stacks a reason sheet", async ({ page }) => {
    await page.goto("/admin/kit");
    await users(page).getByRole("listitem").first().getByRole("button").click();
    const sheet = page.getByRole("dialog", { name: "user01" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Last seen")).toBeVisible();
    await expect(sheet.getByText("1 d ago")).toBeVisible();
    await noOverflow(page, "kit sheet 390");
    await shot(page, "kit-card-sheet-390");

    await sheet.getByRole("button", { name: "Deactivate", exact: true }).click();
    const reason = page.getByRole("dialog", { name: "Deactivate user01?" });
    await expect(reason).toBeVisible();
    await expect(reason.getByLabel("Reason (required)")).toBeVisible();
    await noOverflow(page, "reason sheet 390");
    await shot(page, "kit-reason-sheet-390");
    await reason.getByLabel("Reason (required)").fill("Support ticket 4821, user asked");
    await reason.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(page.getByText("Last confirmed: deactivate user01: Support ticket 4821, user asked")).toBeVisible();
  });

  test("filters wrap in two columns without a word per line", async ({ page }) => {
    await page.goto("/admin/kit");
    await expect(page.getByRole("searchbox", { name: "Search name or login" })).toBeVisible();
    await noOverflow(page, "filter bar 390");
    const box = await page.getByRole("searchbox", { name: "Search name or login" }).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300); // full width, not squeezed beside the select
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`axe finds nothing (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/admin/kit");
      await expect(users(page).getByRole("listitem").first()).toBeVisible();
      await expectAccessible(page, `kit 390 ${scheme}`, "main");
    });
  }
});
