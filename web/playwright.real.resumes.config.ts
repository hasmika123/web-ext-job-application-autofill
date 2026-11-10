import { defineConfig } from "@playwright/test";
import base from "./playwright.real.config";

/** The Resumes journey against the real stack (kept apart so the shared journey list stays untouched). E2E_REAL_PORT=3205 PW_CHANNEL=chrome npx playwright test -c playwright.real.resumes.config.ts */
export default defineConfig({ ...base, testMatch: ["journeys/tenant-resumes.spec.ts"] });
