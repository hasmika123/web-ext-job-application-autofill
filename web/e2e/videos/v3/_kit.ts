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

// ---- the browser extension (video 09) -------------------------------------------------------------------------------------------

import { cpSync, existsSync as fsExists, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

/**
 * A copy of the built extension (`cd job-autofill && npm run build`, output `.output/chrome-mv3`) whose manifest also trusts the LOCAL demo stack: this web
 * origin may hand it a connect session, and the local API may be called. The build output itself is never touched and nothing here is committed;
 * the store build keeps its own manifest.
 */
export function prepareExtensionCopy(repoRoot: string, webPort: string | number, apiUrl: string): string {
  const src = resolve(repoRoot, "job-autofill/.output/chrome-mv3");
  if (!fsExists(join(src, "manifest.json"))) throw new Error(`no built extension at ${src}: run "cd job-autofill && npm run build" first`);
  const dst = join(tmpdir(), "kiwiply-v3-extension");
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  const mp = join(dst, "manifest.json");
  const m = JSON.parse(readFileSync(mp, "utf8")) as { externally_connectable: { matches: string[] }; host_permissions: string[] };
  const api = new URL(apiUrl);
  m.externally_connectable.matches.push(`http://localhost:${webPort}/*`);
  m.host_permissions.push(`${api.protocol}//${api.host}/*`);
  writeFileSync(mp, JSON.stringify(m, null, 2));
  return dst;
}

/**
 * Chrome (branded) no longer accepts --load-extension, so the unpacked extension is loaded over the DevTools protocol (`Extensions.loadUnpacked`, needs
 * --enable-unsafe-extension-debugging) into a persistent profile, which also lets the recording follow it. Headless works (new headless mode).
 */
export async function launchWithExtension(extDir: string, outDir: string, slowMo: number) {
  const userData = mkdtempSync(join(tmpdir(), "kiwiply-v3-profile-"));
  const context = await chromium.launchPersistentContext(userData, {
    channel: process.env.PW_CHANNEL || "chrome",
    headless: !process.env.EXT_HEADED,
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 900 },
    slowMo,
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { id } = (await cdp.send("Extensions.loadUnpacked" as never, { path: resolve(extDir) } as never)) as unknown as { id: string };
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  return { context, extId: id, worker, userData };
}

/** What the toolbar icon does (background.ts `toggleDrawer`): a fixed right-edge iframe hosting panel.html over the page. */
export async function openDrawer(page: Page, extId: string) {
  await page.evaluate((id) => {
    if (document.getElementById("__kiwiply_drawer_host")) return;
    const host = document.createElement("div");
    host.id = "__kiwiply_drawer_host";
    host.style.cssText =
      "position:fixed;top:0;right:0;width:400px;max-width:100vw;height:100vh;z-index:2147483647;border-left:4px solid #94BD37;border-radius:20px 0 0 20px;overflow:hidden;box-shadow:-12px 0 40px rgba(45,49,51,.22);background:#ECEBE3;";
    const frame = document.createElement("iframe");
    frame.src = `chrome-extension://${id}/panel.html`;
    frame.title = "Kiwiply";
    frame.style.cssText = "width:100%;height:100%;border:0;background:transparent;";
    host.appendChild(frame);
    document.body.appendChild(host);
  }, extId);
}
