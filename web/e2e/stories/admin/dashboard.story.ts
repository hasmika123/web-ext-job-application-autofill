import type { Page } from "@playwright/test";
import { test, expect, narrate } from "../_support/story";
import { bff, orgIdOf, shellReady } from "./_helpers";

const loaded = (page: Page) => expect(page.locator("[data-dash-tiles] [data-state=loading]")).toHaveCount(0, { timeout: 30_000 });
const tile = (page: Page, key: string) => page.locator(`[data-stat-tile="${key}"]`);

type Widget = { key: string; state: string; data?: { value?: number } };

test("ADM-01 Org admin reviews the Organization Dashboard", async ({ as }) => {
  const { page, go } = await as("sarah");
  await go("/w/admin");
  await shellReady(page);
  await narrate(page, "Sarah lands on the Organization Dashboard");
  await expect(page).toHaveURL(/\/w\/admin$/);
  await expect(page.locator("[data-dashboard]")).toBeVisible();
  await loaded(page);
  await expect(page.locator("[data-page-header] h1")).toHaveText("Organization Dashboard");
  await expect(page.locator("[data-page-header]")).toContainText(/Here's where .+ stands today\./);

  await narrate(page, "The four stat tiles show the numbers of the whole organization");
  await expect(page.locator("[data-stat-tile]")).toHaveCount(4);
  for (const key of ["consultants.total", "applications.active", "interviews.upcoming", "placements"]) {
    await expect(tile(page, key).locator("[data-tile-value]"), key).toBeVisible();
    await expect(tile(page, key).locator("[data-tile-value]"), key).not.toHaveText("");
  }

  await narrate(page, "Every tile equals what the dashboard API reports");
  const dash = await bff(page, "GET", `/api/orgs/${await orgIdOf(page)}/dashboard`);
  expect(dash.status).toBe(200);
  const widgets = Object.fromEntries((dash.json.widgets as Widget[]).map((w) => [w.key, w]));
  const consultants = widgets["consultants.total"].data!.value as number;
  expect(consultants).toBeGreaterThan(100); // the demo bench
  await expect(tile(page, "consultants.total").locator("[data-tile-value]")).toHaveText(consultants.toLocaleString("en-US"));

  await narrate(page, "Applications, interviews and placements by month: six months of bars, switch to three");
  const team = page.locator('[data-dash-card="team.performance"]');
  await expect(team).toHaveAttribute("data-state", "ok");
  await expect(team.locator("[data-bar^='applications:']")).toHaveCount(6);
  await team.locator("[data-team-range]").selectOption("3");
  await expect(team.locator("[data-bar^='applications:']")).toHaveCount(3);

  await narrate(page, "The pipeline donut and recent activity come from real rows");
  await expect(page.locator('[data-dash-card="pipeline.overview"]')).toContainText("Interview Scheduled");
  const rows = page.locator('[data-dash-card="activity.recent"] [data-activity]');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first().locator("time")).toContainText(/ago|just now/);
});

test("ADM-04 Beta's owner sees Beta's numbers, never Acme's", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin");
  await loaded(sarah.page);
  const acmeOrg = await orgIdOf(sarah.page);
  const acmeDash = (await bff(sarah.page, "GET", `/api/orgs/${acmeOrg}/dashboard`)).json;
  const acmeConsultants = (acmeDash.widgets as Widget[]).find((w) => w.key === "consultants.total")!.data!.value;

  const { page, go } = await as("bea");
  await go("/w/admin");
  await narrate(page, "Bea Turner opens Beta Talent's dashboard");
  await expect(page.locator("[data-dashboard]")).toBeVisible();
  await loaded(page);
  const betaDash = (await bff(page, "GET", `/api/orgs/${await orgIdOf(page)}/dashboard`)).json;
  const betaConsultants = (betaDash.widgets as Widget[]).find((w) => w.key === "consultants.total")!.data!.value as number;
  expect(betaConsultants).not.toBe(acmeConsultants);
  await expect(tile(page, "consultants.total").locator("[data-tile-value]")).toHaveText(betaConsultants.toLocaleString("en-US"));
  await narrate(page, "None of Acme's people or name appear on Beta's page");
  const text = await page.locator("[data-dashboard]").innerText();
  expect(text).not.toContain("Sarah Chen");
  expect(text).not.toContain("Acme");
  await narrate(page, "Acme's dashboard API answers Beta's session with a refusal");
  const hostile = await bff(page, "GET", `/api/orgs/${acmeOrg}/dashboard`);
  expect([403, 404]).toContain(hostile.status);
});
