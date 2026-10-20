import { chromium, type Browser, type FullConfig, type Page } from "@playwright/test";
import { existsSync, mkdirSync, statSync } from "node:fs";
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
  await page.getByLabel("Email", { exact: true }).fill(p.email ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign in/ }).click();
}

/** Signs one persona in through the real sign-in page and saves the browser state. Returns false (and says why) when the sign-in failed. */
export async function signInPersona(browser: Browser, p: Persona): Promise<boolean> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${hostOf(p)}/login`);
    if (p.signIn === "password") await signInWithPassword(page, p);
    else await signInDemo(page, p);
    await page.waitForURL((u) => u.pathname.startsWith("/w/") || u.pathname.includes("change-password"), { timeout: 30_000 });
    await ctx.storageState({ path: statePath(p.key) });
    return true;
  } catch (e) {
    console.warn(`[stories] sign-in as ${p.name} failed: ${(e as Error).message}`);
    return false;
  } finally {
    await ctx.close();
  }
}

/**
 * A browser state that is still a live session. A sign-in lives ~15 minutes (then the first request refreshes it, and a refresh token is single-use, so
 * ten test browsers started from the same old file sign each other out): a story suite or a long video runs longer than that. When the cached sign-in is
 * older than STORY_SIGNIN_MAX_AGE_MIN (default 9) the person signs in again here, before their browser opens. Without a state file nothing is done.
 */
export async function freshSignIn(browser: Browser, key: string): Promise<void> {
  const file = statePath(key);
  if (!existsSync(file)) return;
  const maxMin = Number(process.env.STORY_SIGNIN_MAX_AGE_MIN ?? 9);
  if (maxMin <= 0 || Date.now() - statSync(file).mtimeMs < maxMin * 60_000) return;
  const p = PERSONAS[key as keyof typeof PERSONAS] as Persona | undefined;
  if (!p || (p.signIn === "password" && !process.env.GAMMA_DEMO_PASSWORD)) return;
  await signInPersona(browser, p);
}

/**
 * Sign every persona in once (the demo-account list is rate-limited) and keep each browser state for the stories.
 * STORY_PERSONAS=anika,omar limits the run to those people (the web login rate limit is 10 per 5 minutes per IP).
 * Password personas (Gamma) are only signed in when GAMMA_DEMO_PASSWORD is set.
 * STORY_REUSE_SIGNIN_MIN=8 keeps a sign-in younger than 8 minutes instead of signing in again (re-running one area right after another
 * would otherwise trip the web login limit); older than the access token's life, a cached sign-in would need a refresh, so keep it short.
 */
export default async function globalSetup(_config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const only = (process.env.STORY_PERSONAS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  for (const p of Object.values(PERSONAS) as Persona[]) {
    if (only.length ? !only.includes(p.key) : p.signIn === "password" && !process.env.GAMMA_DEMO_PASSWORD) continue;
    const reuseMin = Number(process.env.STORY_REUSE_SIGNIN_MIN ?? 0);
    if (reuseMin > 0 && existsSync(statePath(p.key)) && Date.now() - statSync(statePath(p.key)).mtimeMs < reuseMin * 60_000) continue;
    await signInPersona(browser, p);
  }
  await browser.close();
}
