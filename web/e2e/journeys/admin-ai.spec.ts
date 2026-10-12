import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

/**
 * Admin AI providers & routing (I1.12 / I1.13) against the mock API's static, read-only `/api/admin/ai/*` fixture.
 * The page's first paint comes from the fixture; writes go through the BFF, and the mock refuses them with a friendly
 * 403, so each write journey intercepts the browser's request and answers like the real API would.
 * Set AI_ADMIN_SHOTS=<dir> to also save screenshots.
 */
const SHOTS = process.env.AI_ADMIN_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

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
  const res = await page.context().request.post("/api/auth/demo", { data: { login: "demo-admin" } });
  expect(res.ok(), "demo-admin sign-in").toBeTruthy();
});

async function noOverflow(page: Page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(o.sw, "horizontal overflow").toBeLessThanOrEqual(o.iw + 1);
}

test.describe("at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders the provider card and 15 routes without a key field", async ({ page }) => {
    await page.goto("/admin/ai/providers");
    await expect(page.getByRole("heading", { level: 1, name: "AI providers & routing" })).toBeVisible();
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
});
