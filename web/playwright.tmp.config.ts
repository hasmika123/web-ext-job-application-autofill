import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./e2e/_tmp", timeout: 300000, workers: 1, reporter: "list", use: { baseURL: "http://acme.localhost:3213" }, projects: [{ name: "c", use: { ...devices["Desktop Chrome"], channel: "chrome" } }] });
