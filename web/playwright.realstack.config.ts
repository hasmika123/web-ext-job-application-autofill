import { defineConfig, devices } from "@playwright/test";

/**
 * The real-stack journeys (docs/enterprise-v2/real-stack-runbook.md): a real browser against `next start` on 3200 over the Spring API on
 * 18183 with the enterprise demo tenants. This config starts NOTHING: boot the API and the web app first (the runbook says how).
 *
 *   npx playwright test -c playwright.realstack.config.ts            (env: PW_CHANNEL=chrome, REAL_ACME_URL, REAL_BETA_URL, SHOTS_DIR)
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["journeys/tenant-groups.spec.ts"],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results-real",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined, launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined } } }],
});
