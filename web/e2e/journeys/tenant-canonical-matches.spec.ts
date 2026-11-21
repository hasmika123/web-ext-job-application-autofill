import { expect, test, type Page } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3100";
const base = `http://acme.localhost:${port}`;
const canonicalPath = "/api/orgs/2/mkt/matches/canonical";

type CanonicalStatus = "SUGGESTED" | "ASSIGNED" | "DISMISSED";

function canonicalItem(status: CanonicalStatus = "SUGGESTED") {
  return {
    source: "OPPORTUNITY_MATCH",
    match: {
      id: 11,
      consultantMemberId: 7,
      opportunityId: 101,
      opportunityKind: "JOB_POSTING",
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      url: "https://jobs.example/101",
      applyUrl: "https://jobs.example/apply/101",
      sourceLabel: "PUBLIC_API",
      score: 91,
      reason: "Strong Java fit",
      model: "rule-v1",
      source: "RULE",
      status,
      createdAt: "2026-11-21T00:00:00Z",
      updatedAt: "2026-11-21T00:00:00Z",
    },
    consultant: {
      memberId: 7,
      name: "Alex Morgan",
      role: "Java Developer",
      primarySkill: "Java",
      availabilityStatus: "AVAILABLE",
      availableFrom: null,
    },
  };
}

async function signInAsOmar(page: Page) {
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (login) => {
    const response = await fetch("/api/auth/tenant-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login }),
    });
    return response.status;
  }, "demo-ent-acme-omar");
  expect(status).toBe(200);
}

async function stubCanonicalApi(page: Page) {
  let status: CanonicalStatus = "SUGGESTED";
  const calls: { method: string; url: string }[] = [];

  await page.route(`**${canonicalPath}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ method: request.method(), url: `${url.pathname}${url.search}` });

    if (request.method() === "POST" && url.pathname.endsWith("/assign")) status = "ASSIGNED";
    if (request.method() === "POST" && url.pathname.endsWith("/dismiss")) status = "DISMISSED";

    const item = canonicalItem(status);
    const body = url.pathname.endsWith("/11") || url.pathname.endsWith("/assign") || url.pathname.endsWith("/dismiss")
      ? item
      : { source: "OPPORTUNITY_MATCH", items: [item], total: 1 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  return calls;
}

async function openMatches(page: Page) {
  await page.goto(`${base}/w/marketing/jobs?tab=matches`);
  await expect(page.locator("[data-job-matches]")).toBeVisible();
  await expect(page.locator('[data-canonical-matches][data-status="ready"]')).toBeVisible();
}

test.describe("canonical marketer matches (mock browser)", () => {
  let calls: { method: string; url: string }[] = [];

  test.beforeEach(async ({ page }) => {
    calls = await stubCanonicalApi(page);
    await signInAsOmar(page);
    await openMatches(page);
  });

  test("renders the canonical panel and opens source-specific detail", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Canonical suggestions" });
    await expect(panel).toContainText("Source: opportunity matches");
    await expect(panel).toContainText("Alex Morgan");
    await expect(panel).toContainText("Backend Engineer");
    await expect(panel).toContainText("91%");

    await panel.getByRole("button", { name: "Review" }).click();
    await expect(panel.locator("[data-canonical-detail]")).toContainText("Strong Java fit");
  });

  test("assigns through the canonical route and never submits", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Canonical suggestions" });
    await panel.getByRole("button", { name: "Assign" }).click();
    await expect.poll(() => calls.some((call) => call.method === "POST" && call.url.endsWith(`${canonicalPath}/11/assign`))).toBe(true);
    await expect(panel.getByRole("button", { name: "Assigned" })).toBeVisible();
    expect(calls.every((call) => !/submit|apply|send/i.test(call.url))).toBe(true);
  });

  test("dismisses through the canonical route and never submits", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Canonical suggestions" });
    await panel.getByRole("button", { name: "Dismiss" }).click();
    await expect.poll(() => calls.some((call) => call.method === "POST" && call.url.endsWith(`${canonicalPath}/11/dismiss`))).toBe(true);
    expect(calls.every((call) => !/submit|apply|send/i.test(call.url))).toBe(true);
  });

  test("fits at phone width without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/w/marketing/jobs?tab=matches`);
    await expect(page.locator('[data-canonical-matches][data-status="ready"]')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
