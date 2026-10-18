import { existsSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { freshSignIn, statePath } from "../../stories/_support/global-setup";
import { PERSONAS, hostOf, type PersonaKey } from "../../stories/_support/personas";

/**
 * Helpers for videos 11 and 12 (v3). Not a spec file (the video config only matches *.video.ts).
 *
 * `offCamera(browser, who)` opens a signed-in person in a context that is NOT recorded, so a take can start from a known place
 * (a consultant handed to a different marketer, an offer waiting for an answer). It makes the same HTTP calls the real pages make.
 */
export async function offCamera(browser: Browser, who: PersonaKey, landing = "/w/" + PERSONAS[who].home) {
  await freshSignIn(browser, who);
  const file = statePath(who);
  const context: BrowserContext = await browser.newContext({ storageState: existsSync(file) ? file : undefined, viewport: { width: 1440, height: 900 } });
  const page: Page = await context.newPage();
  await page.goto(`${hostOf(PERSONAS[who])}${landing}`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  return { page, context, close: () => context.close() };
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

/** The ids of the marketers and a consultant, from the Marketing Assignments page's own API. */
export async function assignmentFacts(page: Page, org: number, consultantName: string) {
  const c = await bffCall<{ items: { consultantId: number; name: string; marketer: { memberId: number; name: string } | null }[] }>(page, `/api/orgs/${org}/marketing-assignments/consultants?q=${encodeURIComponent(consultantName)}`);
  const item = c.json?.items.find((i) => i.name === consultantName);
  if (!item) throw new Error(`no consultant named ${consultantName}`);
  return item;
}

/** Tick the next question: a small wait so a re-render has settled before the next click. */
export const settle = (page: Page, ms = 400) => page.waitForTimeout(ms);
