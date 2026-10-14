import { defineConfig } from "@playwright/test";
import base from "./playwright.real.config";
export default defineConfig({ ...base, testMatch: ["journeys/tenant-resumes.spec.ts", "journeys/tenant-marketing-assignments.spec.ts", "journeys/tenant-jobs.spec.ts", "journeys/tenant-applications.spec.ts"], timeout: 400000 });
