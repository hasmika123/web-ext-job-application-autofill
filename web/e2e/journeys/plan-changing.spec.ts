import { expect, test } from "@playwright/test";
import { STATE } from "../fixtures/accounts";
import AxeBuilder from "@axe-core/playwright";

/**
 * "Your plan is changing" and the read-only lock (subscription module K10.10; docs/subscriptions/11-plan-retirement.md section 12) against the customer mock
 * (`scripts/mock-billing.mjs`): `POST /mock/billing/retire?scenario=equal|dearer|locked` picks the situation. Equal price: ONE primary button
 * "Switch at renewal — free". Dearer: two explicit buttons, neither pre-selected. Locked: the lock banner on every page, the "Read-only for now" card and
 * a way to download the data. Run at 1440 and at 390. Written for `npm run test:e2e -w web`; it is not part of the unit run.
 */
const mockPort = Number(process.env.E2E_MOCK_PORT ?? 8180);
const scenario = (request: import("@playwright/test").APIRequestContext, name: string) => request.post(`http://localhost:${mockPort}/mock/billing/retire?scenario=${name}`);

async function axeClean(page: import("@playwright/test").Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help}`), label).toEqual([]);
}

for (const [name, width, height] of [
  ["1440px", 1440, 900],
  ["390px", 390, 844],
] as const) {
  test.describe(`at ${name}`, () => {
    test.use({ storageState: STATE.fresh, viewport: { width, height } });

    test("equal price: the banner leads to one primary button, and choosing it shows the decision with the date", async ({ page, request }) => {
      expect((await scenario(request, "equal")).ok()).toBeTruthy();
      await page.goto("/settings/plan");
      const banner = page.getByTestId("retirement-banner");
      await expect(banner).toContainText("is changing on");
      await banner.getByRole("link", { name: "See your options" }).click();
      await expect(page).toHaveURL(/\/settings\/plan\/changing$/);
      await expect(page.getByTestId("changing-title")).toContainText("Pro v1 is changing on");
      await expect(page.getByRole("button", { name: "Switch at renewal — free" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Switch now/ })).toHaveCount(0);
      await expect(page.getByTestId("do-nothing")).toContainText("your account moves to Free");
      await axeClean(page, `plan changing equal ${name}`);
      await page.getByRole("button", { name: "Switch at renewal — free" }).click();
      await expect(page.getByTestId("decision-line")).toContainText("It starts on");
    });

    test("dearer: two explicit buttons with today's charge and the renewal price, none pre-selected", async ({ page, request }) => {
      expect((await scenario(request, "dearer")).ok()).toBeTruthy();
      await page.goto("/settings/plan/changing");
      const group = page.getByRole("group", { name: "How to switch" });
      await expect(group.getByRole("button")).toHaveCount(2);
      await expect(group.getByRole("button").first()).toContainText("today (prorated)");
      await expect(group.getByRole("button").last()).toContainText("from");
      await axeClean(page, `plan changing dearer ${name}`);
    });

    test("after a fallback: the lock banner, the read-only card and the data download", async ({ page, request }) => {
      expect((await scenario(request, "locked")).ok()).toBeTruthy();
      await page.goto("/settings/plan");
      await expect(page.getByTestId("lock-banner")).toContainText("Your data is safe");
      const card = page.getByTestId("locked-services");
      await expect(card).toContainText("AI resume tailoring");
      await expect(card.getByRole("link", { name: "Download my data" })).toBeVisible();
      await expect(card.getByRole("link", { name: "Pick a plan to unlock" })).toBeVisible();
      await axeClean(page, `locked ${name}`);
      expect((await scenario(request, "off")).ok()).toBeTruthy();
    });
  });
}
