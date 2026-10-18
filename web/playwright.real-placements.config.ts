import { defineConfig, devices } from "@playwright/test";

/**
 * The Placements journey against the REAL stack (own config so the shared real-stack config's testMatch list stays untouched).
 *
 *   E2E_REAL_PORT=3215 PW_CHANNEL=chrome npx playwright test -c playwright.real-placements.config.ts
 */
const port = Number(process.env.E2E_REAL_PORT ?? 3215);

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["journeys/tenant-placements.spec.ts"],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results-real-placements",
  use: { baseURL: `http://acme.localhost:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
});
