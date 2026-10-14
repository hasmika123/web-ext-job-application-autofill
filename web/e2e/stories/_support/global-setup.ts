import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONAS, hostOf, type Persona } from "./personas";

export const AUTH_DIR = resolve(__dirname, "../../.auth-stories");
export const statePath = (key: string) => resolve(AUTH_DIR, `${key}.json`);

/** Sign every persona in once (the demo-account list is rate-limited) and keep each browser state for the stories. */
export default async function globalSetup(_config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  for (const p of Object.values(PERSONAS) as Persona[]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(`${hostOf(p)}/login`);
      await page.getByRole("button", { name: /Demo accounts/ }).first().click();
      await page.getByRole("button", { name: `Sign in as ${p.name}` }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 30_000 });
      await ctx.storageState({ path: statePath(p.key) });
    } catch (e) {
      console.warn(`[stories] sign-in as ${p.name} failed: ${(e as Error).message}`);
    }
    await ctx.close();
  }
  await browser.close();
}
