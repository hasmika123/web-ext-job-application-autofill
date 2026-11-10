import { defineConfig, devices } from "@playwright/test";

/**
 * Narrated flow videos (one test = one MP4) against the REAL stack. See scripts/story-video/ and docs/enterprise-v2/qa/videos-index.md.
 *
 *   GAMMA_DEMO_PASSWORD=... STORY_NARRATION_LOG=<dir>/01.json STORY_SLOWMO=280 E2E_REAL_PORT=3200 PW_CHANNEL=chrome \
 *     npx playwright test -c playwright.videos.config.ts e2e/videos/01-consultant.video.ts
 *   node scripts/story-video/render.cjs --log <dir>/01.json --out <folder>/01-consultant-resume-and-applying.mp4 --srt
 */
const port = Number(process.env.E2E_REAL_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e/videos",
  testMatch: ["**/*.video.ts"],
  globalSetup: "./e2e/stories/_support/global-setup.ts",
  timeout: 1_800_000, // a narrated flow runs several minutes at human pace
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results-stories/videos",
  preserveOutput: "always",
  use: {
    baseURL: `http://acme.localhost:${port}`,
    trace: "off",
    actionTimeout: 20_000, // a missing control fails the take in 20 s instead of hanging for the whole test timeout
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    video: "off", // the flow fixture records its own context
    viewport: { width: 1440, height: 900 },
    launchOptions: { slowMo: Number(process.env.STORY_SLOWMO ?? 280) },
  },
  projects: [{ name: "videos", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL || undefined } }],
});
