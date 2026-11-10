import { defineConfig, devices } from "@playwright/test";

/**
 * Consultant workspace journeys against the REAL stack (Spring API + MySQL + `next start`), see
 * docs/enterprise-v2/real-stack-runbook.md and HANDOFF-ENT-CONSULTANT-WORKSPACE.md. Anika Rao (Consultant) signs in through the Demo accounts tab.
 *
 *   E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.real.consultant.config.ts
 */
const port = Number(process.env.E2E_REAL_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["journeys/consultant-*.spec.ts"],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results-real-consultant",
  use: { baseURL: `http://acme.localhost:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
});
