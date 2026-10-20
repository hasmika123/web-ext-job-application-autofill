import { defineConfig, devices } from "@playwright/test";

/**
 * Use-case story walkthroughs against the REAL stack (Spring API + MySQL + `next start`) with the demo tenants,
 * recorded on video. See docs/enterprise-v2/qa/00-README.md.
 *
 *   E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.stories.config.ts
 *   STORY_SLOWMO=300 STORY_PAUSE_MS=1200 ...   # slower, for a presentation recording
 */
const port = Number(process.env.E2E_REAL_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e/stories",
  testMatch: ["**/*.story.ts"],
  globalSetup: "./e2e/stories/_support/global-setup.ts",
  timeout: 75_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: Number(process.env.STORY_WORKERS ?? 3),
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-stories", open: "never" }], ["json", { outputFile: "test-results-stories/results.json" }]],
  outputDir: "test-results-stories",
  use: {
    baseURL: `http://acme.localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.STORY_VIDEO === "off" ? "off" : { mode: "on", size: { width: 1440, height: 900 } },
    viewport: { width: 1440, height: 900 },
    launchOptions: { slowMo: Number(process.env.STORY_SLOWMO ?? 150) },
  },
  projects: [{ name: "stories", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL || undefined } }],
});
