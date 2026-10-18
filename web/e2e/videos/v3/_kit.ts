import { existsSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { freshSignIn, statePath } from "../../stories/_support/global-setup";
import { PERSONAS, hostOf, type PersonaKey } from "../../stories/_support/personas";
import type { Session } from "../../stories/_support/story";

/**
 * Helpers for the v3 narrated videos (07-12). Not a spec file (the video config only matches *.video.ts).
 *
 * `offCamera(browser, who)` opens a signed-in person in a context that is NOT recorded: the setup a video needs before the camera rolls
 * (a marketer saving jobs for a consultant, an administrator freeing a consultant for marketing), done through the same HTTP calls the real
 * pages and the extension make. Nothing on camera is faked; this only prepares the data a take starts from.
 */
export async function offCamera(browser: Browser, who: PersonaKey, landing = "/w/" + PERSONAS[who].home): Promise<Session & { close: () => Promise<void> }> {
  await freshSignIn(browser, who);
  const file = statePath(who);
  const context: BrowserContext = await browser.newContext({ storageState: existsSync(file) ? file : undefined, viewport: { width: 1440, height: 900 } });
  const page: Page = await context.newPage();
  const go = async (path: string) => void (await page.goto(`${hostOf(PERSONAS[who])}${path}`));
  await go(landing);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  return { page, context, go, close: () => context.close() };
}

/** A same-origin call through the web app as the page's signed-in person. */
export async function bffCall<T = unknown>(page: Page, path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; json: T | null }> {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: { accept: "application/json", ...(init?.body !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      return { status: res.status, json: (await res.json().catch(() => null)) as T | null };
    },
    { path, init },
  );
}

/** The signed-in member's organization id. */
export async function orgId(page: Page): Promise<number> {
  const r = await bffCall<{ org: { id: number } }>(page, "/api/me/tenant");
  if (!r.json) throw new Error("no tenant session on this page");
  return r.json.org.id;
}
