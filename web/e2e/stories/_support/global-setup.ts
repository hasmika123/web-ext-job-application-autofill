import { chromium, type FullConfig, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONAS, hostOf, type Persona } from "./personas";

export const AUTH_DIR = resolve(__dirname, "../../.auth-stories");
export const statePath = (key: string) => resolve(AUTH_DIR, `${key}.json`);

/** One-click "Demo accounts" tab (Acme, Beta). */
async function signInDemo(page: Page, p: Persona) {
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: `Sign in as ${p.name}` }).click();
}

/** A separate-accounts organization (Gamma): e-mail + the dev password from GAMMA_DEMO_PASSWORD (never typed in a spec, never logged). */
async function signInWithPassword(page: Page, p: Persona) {
  const password = process.env.GAMMA_DEMO_PASSWORD;
  if (!password) throw new Error("GAMMA_DEMO_PASSWORD is not set");
  await page.getByLabel("User Name").fill(p.email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign In/ }).click();
}

/**
 * Sign every persona in once (the demo-account list is rate-limited) and keep each browser state for the stories.
 * STORY_PERSONAS=anika,omar limits the run to those people (the web login rate limit is 10 per 5 minutes per IP).
 * Password personas (Gamma) are only signed in when GAMMA_DEMO_PASSWORD is set.
 */
export default async function globalSetup(_config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const only = (process.env.STORY_PERSONAS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  for (const p of Object.values(PERSONAS) as Persona[]) {
    if (only.length ? !only.includes(p.key) : p.signIn === "password" && !process.env.GAMMA_DEMO_PASSWORD) continue;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(`${hostOf(p)}/login`);
      if (p.signIn === "password") await signInWithPassword(page, p);
      else await signInDemo(page, p);
      await page.waitForURL((u) => u.pathname.startsWith("/w/") || u.pathname.includes("change-password"), { timeout: 30_000 });
      await ctx.storageState({ path: statePath(p.key) });
    } catch (e) {
      console.warn(`[stories] sign-in as ${p.name} failed: ${(e as Error).message}`);
    }
    await ctx.close();
  }
  await browser.close();
}
