import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { statePath } from "./global-setup";
import { PERSONAS, hostOf, type PersonaKey } from "./personas";

/**
 * Every story spec imports { test, expect } from here.
 *   const { page, go } = await as("sarah");     // a browser signed in as that persona (own context, recorded on video)
 *   await narrate(page, "Sarah opens the Employees page"); // an on-screen caption + a pause, so the recording reads like a walkthrough
 * Story ids (ADM-01, MKT-03, ...) go in the test title: test("ADM-01 ...").
 */
export interface Session {
  page: Page;
  context: BrowserContext;
  /** Open a path on the persona's tenant host, e.g. go("/w/admin/employees"). */
  go: (path: string) => Promise<void>;
}

const PAUSE = Number(process.env.STORY_PAUSE_MS ?? 900);

export async function narrate(page: Page, text: string, ms = PAUSE) {
  await page
    .evaluate((t) => {
      let el = document.getElementById("__story_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__story_caption";
        el.setAttribute("style", "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:80vw;background:rgba(17,24,39,.92);color:#fff;font:600 15px/1.35 system-ui,sans-serif;padding:10px 18px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none");
        document.body.appendChild(el);
      }
      el.textContent = t;
    }, text)
    .catch(() => undefined);
  await page.waitForTimeout(ms);
}

export const test = base.extend<{ as: (who: PersonaKey) => Promise<Session> }>({
  as: async ({ browser }, provide) => {
    const opened: BrowserContext[] = [];
    await provide(async (who) => {
      const persona = PERSONAS[who];
      const file = statePath(who);
      const context = await browser.newContext({
        storageState: existsSync(file) ? file : undefined,
        viewport: { width: 1440, height: 900 },
        recordVideo: { dir: test.info().outputDir, size: { width: 1440, height: 900 } },
      });
      opened.push(context);
      const page = await context.newPage();
      return { page, context, go: async (path) => void (await page.goto(`${hostOf(persona)}${path}`)) };
    });
    for (const c of opened) await c.close();
  },
});

export { expect };
