import { expect, test } from "@playwright/test";
import { noOverflow, shot, signInAdmin } from "../fixtures/admin";

/**
 * Admin AI providers & routing (I1.12 / I1.13) against the mock API's static, read-only `/api/admin/ai/*` fixture.
 * The page's first paint comes from the fixture; writes go through the BFF, and the mock refuses them with a friendly
 * 403, so each write journey intercepts the browser's request and answers like the real API would.
 * Sign-in, the overflow check and the screenshots are the admin fixtures (`e2e/fixtures/admin.ts`, E2E-A15.0);
 * set ADMIN_SHOTS=<dir> (or the old AI_ADMIN_SHOTS) to also save screenshots.
 */
const R = (value: unknown, source = "default", envDefault: unknown = null) => ({ value, source, envDefault, codeDefault: value });
const routeJson = (task: string, label: string, over: Record<string, unknown> = {}) => ({
  task,
  label,
  enabled: R(true),
  provider: R("gemini", "env", "gemini"),
  model: R("gemini-2.5-flash-lite", "env", "gemini-2.5-flash-lite"),
  fallbackProvider: R("none"),
  fallbackModel: R(""),
  maxOutputTokens: R(400, "env", 400),
  risk: task === "parse" ? "HIGH" : "MEDIUM",
  ...over,
});

test.beforeEach(async ({ page }) => {
  await signInAdmin(page);
});

test.describe("at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders the provider card and 15 routes without a key field", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/admin/ai/providers");
    await expect(page.getByRole("heading", { level: 1, name: "AI providers & routing" })).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(errors, "console errors (hydration mismatches included)").toEqual([]);
    const card = page.getByRole("article", { name: "Google Gemini" });
    await expect(card.getByText("Key present ✓")).toBeVisible();
    await expect(card.getByText("DOSSIER_AI_API_KEY", { exact: true })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /Resume parsing/ })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Resume parsing enabled" })).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^save$/i })).toHaveCount(0);
    await noOverflow(page);
    await shot(page, "providers-1440");
  });

  test("a model change autosaves: ✓, an Undo toast, and Undo sends the old value back", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    const bodies: unknown[] = [];
    await page.route("**/api/admin/ai/routes/draft", async (route) => {
      const body = route.request().postDataJSON() as { model: string | null };
      bodies.push(body);
      const model = body.model === null ? R("gemini-2.5-flash-lite", "env") : R(body.model, "db", "gemini-2.5-flash-lite");
      await route.fulfill({ json: routeJson("draft", "Answer drafting", { model }) });
    });

    await page.getByRole("button", { name: "Answer drafting model" }).click();
    await page.getByRole("option", { name: "gemini-2.5-flash", exact: true }).click();
    await expect(page.getByRole("img", { name: "Saved" }).first()).toBeVisible();
    await expect(page.getByText("Answer drafting now uses gemini-2.5-flash on gemini")).toBeVisible();
    expect(bodies[0]).toEqual({ model: "gemini-2.5-flash" });
    await shot(page, "route-saved-undo-1440");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies[1]).toEqual({ model: null });
  });

  test("the mock's read-only refusal shows inline and the control falls back", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    const box = page.getByLabel("Answer drafting max output tokens");
    await box.fill("700");
    await box.blur();
    await expect(page.getByRole("alert").filter({ hasText: "read-only in the mock demo" }).first()).toBeVisible();
    await expect(box).toHaveValue("600");
  });

  test("turning resume parsing off confirms with a reason first", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    let sent: unknown = null;
    await page.route("**/api/admin/ai/routes/parse", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: routeJson("parse", "Resume parsing", { enabled: R(false, "db", true) }) });
    });

    await page.getByRole("switch", { name: "Resume parsing enabled" }).click();
    const dialog = page.getByRole("dialog", { name: "Turn off resume parsing?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Turn off" })).toBeDisabled();
    await shot(page, "confirm-parse-off-1440");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(sent).toBeNull();

    await page.getByRole("switch", { name: "Resume parsing enabled" }).click();
    await dialog.getByLabel("Reason (required)").fill("Gemini 5xx spike");
    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText("Resume parsing turned off")).toBeVisible();
    expect(sent).toEqual({ enabled: false, reason: "Gemini 5xx spike" });
  });

  test("stat tiles, pricing, recent calls and the Failed-only filter (the mock serves the filter)", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    await expect(page.getByText("Calls · 24 h")).toBeVisible();
    await expect(page.getByText("Spend · 24 h")).toBeVisible();
    await expect(page.getByLabel("gemini-2.5-flash input price in dollars per million tokens")).toHaveValue("0.30");
    await expect(page.getByText("Unpriced models are costed at the dearest Flash rate (over-counted, never free).")).toBeVisible();

    const table = page.getByLabel("Recent AI calls");
    await expect(page.getByText(/^Showing 100 of /)).toBeVisible();
    await page.getByRole("switch", { name: "Failed only" }).click();
    const failedRows = table.locator("tbody tr");
    await expect(failedRows.first()).toBeVisible();
    await expect(table.locator("td", { hasText: /^OK$/ })).toHaveCount(0);
    await expect(page.getByText(/^Showing \d+ of \d+$/)).toBeVisible();
    await shot(page, "calls-failed-only-1440");

  });

  test("the Server AI switch asks for a reason, and the history drawer opens", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    let sent: unknown = null;
    await page.route("**/api/admin/ai/config/global", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { enabled: R(false, "db", true) } });
    });
    await page.getByRole("switch", { name: "Server AI" }).click();
    const dialog = page.getByRole("dialog", { name: "Turn off server AI?" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Reason (required)").fill("Provider outage");
    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText("Server AI turned off")).toBeVisible();
    expect(sent).toEqual({ enabled: false, reason: "Provider outage" });

    await page.getByRole("button", { name: "Change history" }).click();
    await expect(page.getByText("route · map · model")).toBeVisible();
    await shot(page, "history-drawer-1440");
  });

  test("Test connection shows latency, model, tokens and cost", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    await page.route("**/api/admin/ai/providers/gemini/test", (route) =>
      route.fulfill({ json: { ok: true, model: "gemini-2.5-flash-lite-001", latencyMs: 412, inputTokens: 9, outputTokens: 1, costMicros: 4, error: null } }),
    );
    const card = page.getByRole("article", { name: "Google Gemini" });
    await card.getByRole("button", { name: "Test connection" }).click();
    await expect(card.getByText("OK · gemini-2.5-flash-lite-001 · 412 ms · 9 in / 1 out · $0.0000")).toBeVisible();
    await shot(page, "test-connection-1440");
  });
});

test.describe("at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one column, no horizontal scroll, and a route opens in a sheet", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    await expect(page.getByRole("heading", { level: 1, name: "AI providers & routing" })).toBeVisible();
    await noOverflow(page);
    await page.getByRole("button", { name: "Edit Answer drafting routing" }).click();
    const sheet = page.getByRole("dialog", { name: "Answer drafting routing" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Answer drafting max output tokens")).toBeVisible();
    await noOverflow(page);
    await shot(page, "route-sheet-390");
  });

  test("no horizontal scroll at 360px either", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/admin/ai/providers");
    await expect(page.getByText("Recent calls & errors")).toBeVisible();
    await noOverflow(page);
  });

  test("pricing and recent calls stay in one column; a price opens in a sheet; 44 px controls", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    await expect(page.getByText("Recent calls & errors")).toBeVisible();
    await noOverflow(page);
    await shot(page, "providers-390");
    // every visible button / input / switch that is a real tap target is at least 44 px tall (Switch tracks have a taller hit area)
    const short = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main button, main input, main [role=switch]")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || e.getAttribute("role") === "switch") return false;
          return r.height < 43;
        })
        .map((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40)),
    );
    expect(short, "controls under 44 px").toEqual([]);

    await page.getByRole("button", { name: "Edit gemini-2.5-flash price" }).click();
    const sheet = page.getByRole("dialog", { name: "gemini-2.5-flash price" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("gemini-2.5-flash input price in dollars per million tokens")).toHaveValue("0.30");
    await noOverflow(page);
    await shot(page, "price-sheet-390");
  });
});
