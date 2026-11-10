#!/usr/bin/env node
/**
 * Demo check on REAL employer pages (development only): does the extension read the job and fill the form on each site?
 * FILL ONLY: it never presses a submit button, never signs in, never creates an account, and closes each tab afterwards.
 *
 * Signs in as Anika on the demo stack, connects the (branded) extension, then for each URL: opens it, opens the drawer the way the
 * toolbar icon does, presses "Scan & fill this page", and reports how many answers the review panel offers and how many land after
 * "Fill selected". Pages that need the site's own sign-in first (Workday's apply) report that instead.
 *
 *   node web/scripts/demo-real-sites-check.mjs <url> [<url> ...]   env: DEMO_WEB, DEMO_API, EXT_DIR, HEADED=1
 */
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.DEMO_WEB || "http://aaruna.localhost:3200";
const EXT_DIR = resolve(process.env.EXT_DIR || join(here, "../../job-autofill/.output/chrome-mv3-dev-aaruna-technologies"));
const URLS = process.argv.slice(2);

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "kiwiply-real-")), {
  channel: process.env.PW_CHANNEL || "chrome",
  headless: !process.env.HEADED,
  args: ["--enable-unsafe-extension-debugging"],
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1440, height: 900 },
});
const cdp = await context.browser().newBrowserCDPSession();
const { id: extId } = await cdp.send("Extensions.loadUnpacked", { path: EXT_DIR });
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
await context.addInitScript(() => {
  window.open = (url) => {
    if (url && /\/connect(\?|$)/.test(String(url))) location.href = String(url);
    return null;
  };
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(`${WEB}/login`);
await page.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 30_000 });
await page.getByRole("button", { name: "Sign in as Anika Rao" }).click();
await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
await page.getByRole("button", { name: /Anika Rao/ }).first().click();
await page.getByRole("menuitem", { name: "Connect extension" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Connect", exact: true }).click({ noWaitAfter: true });
await page.getByText(/Extension connected/i).first().waitFor({ timeout: 60_000 });
await worker.evaluate(async () => {
  const cur = (await chrome.storage.local.get("settings")).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, serverAiEnabled: true, serverAiConsent: true } });
});
console.log("connected as Anika\n");

for (const url of URLS) {
  const tab = await context.newPage();
  const host = new URL(url).hostname;
  const row = { site: host, url: url.slice(0, 90) };
  try {
    await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tab.waitForTimeout(6000);
    row.title = (await tab.title()).slice(0, 70);
    await tab.bringToFront();
    await tab.evaluate((id) => {
      const host = document.createElement("div");
      host.id = "__kiwiply_drawer_host";
      host.style.cssText = "position:fixed;top:0;right:0;width:400px;height:100vh;z-index:2147483647;";
      const frame = document.createElement("iframe");
      frame.src = `chrome-extension://${id}/panel.html`;
      frame.title = "Kiwiply";
      frame.style.cssText = "width:100%;height:100%;border:0;";
      host.appendChild(frame);
      document.body.appendChild(host);
    }, extId);
    const drawer = tab.frameLocator('iframe[title="Kiwiply"]');
    // Pro on this page: which resume fits best, then the fit report
    try {
      await drawer.getByText(/Best match/).first().waitFor({ timeout: 30_000 });
      row.bestMatch = (await drawer.getByText(/Best match/).first().innerText()).replace(/\s+/g, " ").slice(0, 50);
      await drawer.getByRole("button", { name: "Check fit" }).click({ timeout: 10_000 });
      await drawer.getByText(/Missing from this resume|Red flags|Already covered/i).first().waitFor({ timeout: 40_000 });
      row.fit = "report shown";
    } catch {
      row.bestMatch = row.bestMatch || "not shown";
      if (process.env.DEBUG_FIT) {
        row.drawer = (await drawer.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
        row.capture = await worker.evaluate(async (u) => {
          const [t] = await chrome.tabs.query({ url: u.split("#")[0] + "*" });
          if (!t) return "tab not found";
          const r = await chrome.tabs.sendMessage(t.id, { type: "JAF_CAPTURE_JOB" }).catch((e) => ({ err: String(e) }));
          const c = (r && r.capture) || {};
          return r && r.err ? r.err : `jd=${String(c.jobDescription || "").length} src=${JSON.stringify(c.sources || {})} role=${c.role} company=${c.company}`;
        }, tab.url());
        row.plan = await worker.evaluate(async () => { const s = (await chrome.storage.local.get("settings")).settings || {}; return [s.plan, s.serverAiEnabled, s.serverAiConsent].join(","); });
      }
    }
    await drawer.getByRole("button", { name: /Scan & fill/ }).click({ timeout: 45_000 });
    const fill = tab.getByRole("button", { name: "Fill selected" });
    try {
      await fill.waitFor({ timeout: 30_000 });
      row.offered = await tab.locator('[type="checkbox"][data-i]').count().catch(() => -1);
      row.aiDraft = (await tab.getByText(/AI draft/).count()) > 0;
      try {
        await fill.click({ timeout: 10_000 });
      } catch (e) {
        row.clickBlockedBy = String(e.message).match(/<[^>]{0,160}>[^\n]{0,40}intercepts pointer events/)?.[0]?.slice(0, 160) || String(e.message).split("\n").slice(-3).join(" ").slice(0, 160);
        await fill.click({ force: true, timeout: 10_000 });
      }
      await tab.waitForTimeout(5000);
      row.filledText = (await tab.getByText(/Filled \d+ field/).first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 60);
      row.result = "FILLED (not submitted)";
    } catch {
      const status = (await drawer.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      const m = status.match(/(sign in[^.]*|no (application )?form[^.]*|can't[^.]*|couldn't[^.]*)/i);
      row.result = "NO FORM ON THIS PAGE";
      row.note = m ? m[0].slice(0, 120) : status.slice(0, 120);
    }
  } catch (e) {
    row.result = "ERROR";
    row.note = String(e.message).slice(0, 120);
  }
  console.log(JSON.stringify(row));
  await tab.close(); // never submitted; the tab goes away with what was typed
}
await context.close();
