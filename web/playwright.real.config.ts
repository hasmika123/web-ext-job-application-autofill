import { defineConfig, devices } from "@playwright/test";

/**
 * Journeys that need the REAL stack (the Spring API + `next start`, docs/enterprise-v2/real-stack-runbook.md): no web server is
 * started here. Point the specs at it with REAL_ACME_BASE / REAL_BETA_BASE (see e2e/journeys/tenant-dashboard.spec.ts).
 */
export default defineConfig({
  testDir: "./e2e/journeys",
  testMatch: ["tenant-dashboard.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  outputDir: "test-results-real",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
});
