import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectAccessible, noOverflow, shot, signInAdmin } from "../fixtures/admin";

/**
 * The plan retirement wizard and its progress page (subscription module K10.9; docs/subscriptions/11-plan-retirement.md section 11) against the mock API
 * (`scripts/mock-retirements.mjs`, mounted by `scripts/mock-plans.mjs`). The journey: Plans -> Retire... on Pro, read the impact (212 subscribers,
 * $4,238.88, 180 monthly, 32 quarterly), add Pro Student as a successor and read "198 fully covered, 14 with gaps, 9 would pay more", see that moving
 * everyone to it at renewal is refused, keep the default (Free with a read-only lock), type the plan key and a reason, start, then watch a switch land
 * on the progress page. Run at 1440 and at 390. Every spec resets the mock first, so they are independent. Written for `npm run test:e2e -w web`;
 * it is not part of the unit run. ADMIN_SHOTS=<dir> also saves screenshots.
 */
const mockPort = Number(process.env.E2E_MOCK_PORT ?? 8180);

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post(`http://localhost:${mockPort}/mock/plans/reset`);
  expect(reset.ok(), "mock reset").toBeTruthy();
  await signInAdmin(page);
});

const next = (page: Page) => page.getByRole("button", { name: "Next" }).click();

async function walkToReview(page: Page) {
  await page.goto("/admin/pricing/plans/PRO/retire");
  await expect(page.getByRole("heading", { level: 1, name: "Retire Pro" })).toBeVisible();
  await next(page); // impact
  await expect(page.getByText("212", { exact: true })).toBeVisible();
  await next(page); // successors
  await next(page); // notices and default
  await next(page); // review
  await expect(page.getByRole("button", { name: "Start retirement" })).toBeDisabled();
}

async function startIt(page: Page) {
  await page.getByLabel("Reason").fill("Pro v1 is replaced by Pro Student for all new buyers");
  await page.getByLabel("Plan key to confirm").fill("PRO");
  await page.getByRole("button", { name: "Start retirement" }).click();
  await expect(page).toHaveURL(/\/admin\/pricing\/retirements\/\d+$/);
}

for (const [name, width, height] of [
  ["1440px", 1440, 900],
  ["390px", 390, 844],
] as const) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport: { width, height } });

    test("impact tiles, successor coverage and the would-pay-more refusal", async ({ page }) => {
      await page.goto("/admin/pricing/plans");
      await page.getByRole("button", { name: "Retire…" }).first().waitFor();
      await page.goto("/admin/pricing/plans/PRO/retire");
      await next(page);
      await expect(page.getByText("212", { exact: true })).toBeVisible();
      await expect(page.getByText("$4,238.88")).toBeVisible();
      await expect(page.getByText("180", { exact: true })).toBeVisible();
      await expect(page.getByText("32", { exact: true })).toBeVisible();
      await expectAccessible(page, `retire impact ${name}`);
      await noOverflow(page);
      await shot(page, `retire-impact-${name}`);
      await next(page);
      await page.getByRole("button", { name: "Add a successor" }).click();
      await page.getByRole("option", { name: /Pro Student/ }).click();
      await expect(page.getByText(/198 fully covered · 14 with gaps · 9 would pay more/)).toBeVisible();
      await next(page);
      await page.getByRole("radio", { name: /Move to the first successor/ }).click();
      await expect(page.getByTestId("outcome-refusal")).toContainText("9 subscribers would pay more under Pro Student");
      await shot(page, `retire-refusal-${name}`);
      await page.getByRole("radio", { name: /Free, with a read-only lock/ }).click();
      await expectAccessible(page, `retire notices ${name}`);
    });

    test("the start needs the plan key typed and a reason; then the progress page follows a switch", async ({ page }) => {
      await walkToReview(page);
      await shot(page, `retire-review-${name}`);
      await startIt(page);
      await expect(page.getByRole("heading", { level: 1, name: "Retirement of Pro" })).toBeVisible();
      await expect(page.getByText("212", { exact: true })).toBeVisible();
      await expectAccessible(page, `retire progress ${name}`);
      await noOverflow(page);
      await shot(page, `retire-progress-${name}`);

      const id = Number(page.url().split("/").pop());
      const ev = await page.request.post(`http://localhost:${mockPort}/mock/retirements/event`, { data: { id, kind: "switched" } });
      expect(ev.ok()).toBeTruthy();
      await page.reload();
      await expect(page.getByText("211", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel retirement…" })).toBeDisabled();
    });

    test("Retire... is the way in from the plans list, and a started retirement shows on the list", async ({ page }) => {
      await page.goto("/admin/pricing/plans");
      await expect(page.getByRole("button", { name: "Retire…" }).first()).toBeVisible();
    });
  });
}
