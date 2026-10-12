import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (U19.3): a real browser against `npm run dev:demo` (Next + the mock API, no database).
 * `npm run test:e2e -w web`. The mock starts with `MOCK_FIXTURE=fresh,org-roles`, which adds the brand-new, non-demo account
 * the "fresh account" journeys sign in as (see `scripts/fixtures/` and `e2e/fixtures/`).
 *
 *   E2E_PORT / E2E_MOCK_PORT   web and mock ports (defaults 3100 / 8180: leave 3000 / 8080 to a running dev server)
 *   PW_CHROMIUM_PATH           an existing Chromium/Chrome to drive instead of Playwright's own download
 *   PW_CHANNEL                 e.g. "chrome" or "msedge"
 *   CI                         starts a fresh server (never reuses one) and retries a flaky test once
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const mockPort = Number(process.env.E2E_MOCK_PORT ?? 8180);
const baseURL = `http://localhost:${port}`;

const launchOptions = {
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["auth.setup.ts", "journeys/**/*.spec.ts"],
  // `next dev` compiles a route the first time it is opened; a journey that opens 20 routes needs room.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: "auth.setup.ts" },
    {
      name: "chromium",
      testMatch: "journeys/**/*.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined, launchOptions },
    },
  ],
  webServer: {
    command: "node scripts/dev-demo.mjs",
    url: `${baseURL}/login`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      PORT: String(port),
      MOCK_API_PORT: String(mockPort),
      MOCK_WEB_URL: baseURL,
      MOCK_FIXTURE: "fresh,org-roles",
    },
  },
});
