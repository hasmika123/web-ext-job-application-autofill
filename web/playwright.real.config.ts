import { defineConfig, devices } from "@playwright/test";

/**
 * Journeys against the REAL stack (Spring API + MySQL + `next start`), no mock and no dev server: see
 * docs/enterprise-v2/real-stack-runbook.md. The API must run with DEMO_ENABLED, ENT_DEMO_SEED and DEMO_ALLOW_WRITES (the demo members
 * write through the API) and the web must be a production build.
 *
 *   E2E_REAL_PORT=3201 PW_CHANNEL=chrome npx playwright test -c playwright.real.config.ts
 */
const port = Number(process.env.E2E_REAL_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["journeys/tenant-employees.spec.ts", "journeys/tenant-dashboard.spec.ts", "journeys/tenant-invitations.spec.ts", "journeys/tenant-jobs.spec.ts"],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results-real",
  use: { baseURL: `http://acme.localhost:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
});
