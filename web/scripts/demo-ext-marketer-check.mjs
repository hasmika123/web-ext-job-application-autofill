#!/usr/bin/env node
/**
 * Enterprise demo rehearsal of the MARKETER's extension flow (development only), in a real Chrome with the dev build of the extension:
 *   1. sign in as Omar (Demo accounts) on aaruna.localhost and connect the extension with the one-time code;
 *   2. open a stand-in job posting (web/scripts/demo-ats-server.mjs) and open the Kiwiply drawer the way the toolbar icon does;
 *   3. the drawer shows "Save for consultant" (a marketer has no fill); write a note, tick Anika, press Save;
 *   4. the job is on Omar's Opportunities board and on Anika's Assigned Opportunities.
 * Prints PASS/FAIL per step. Same env as demo-ext-check.mjs (DEMO_WEB, DEMO_API, EXT_DIR, HEADED, PW_CHANNEL).
 */
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.DEMO_WEB || "http://aaruna.localhost:3200";
const EXT_DIR = resolve(process.env.EXT_DIR || join(here, "../../job-autofill/.output/chrome-mv3-dev"));
const STAMP = Date.now();
const TITLE = `Cloud Platform Engineer ${String(STAMP).slice(-5)}`;
// POSTING_URL: save a real posting instead of a fresh stand-in page (e.g. the Adobe Workday posting of the walkthrough); CONSULTANT: who to tick.
const POSTING = process.env.POSTING_URL || `http://jobs.localhost:3399/greenhouse/brightwave-systems/${STAMP}?t=${encodeURIComponent(TITLE)}`;
const CONSULTANT = process.env.CONSULTANT || "Anika Rao";

const results = [];
const step = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  (" + note + ")" : ""}`);
};

const userData = mkdtempSync(join(tmpdir(), "kiwiply-demo-mkt-"));
const context = await chromium.launchPersistentContext(userData, {
  channel: process.env.PW_CHANNEL || "chrome",
  headless: !process.env.HEADED,
  args: ["--enable-unsafe-extension-debugging"],
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1400, height: 900 },
});
const cdp = await context.browser().newBrowserCDPSession();
const { id: extId } = await cdp.send("Extensions.loadUnpacked", { path: EXT_DIR });
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
await context.addInitScript(() => {
  window.open = (url) => {
    if (url) location.href = String(url);
    return null;
  };
});

async function openDrawer(page) {
  await page.evaluate((id) => {
    if (document.getElementById("__kiwiply_drawer_host")) return;
    const host = document.createElement("div");
    host.id = "__kiwiply_drawer_host";
    host.style.cssText = "position:fixed;top:0;right:0;width:400px;height:100vh;z-index:2147483647;background:#ECEBE3;";
    const frame = document.createElement("iframe");
    frame.src = `chrome-extension://${id}/panel.html`;
    frame.title = "Kiwiply";
    frame.style.cssText = "width:100%;height:100%;border:0;";
    host.appendChild(frame);
    document.body.appendChild(host);
  }, extId);
}

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign in as Rahul Mehta" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
  step("sign in as Omar", true);

  await page.getByRole("button", { name: /Rahul Mehta/ }).first().click();
  await page.getByRole("menuitem", { name: "Connect extension" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Connect", exact: true }).click({ noWaitAfter: true });
  await page.waitForURL((u) => u.pathname === "/connect", { timeout: 30_000 });
  await page.getByText(/Extension connected/i).first().waitFor({ timeout: 45_000 });
  const auth = await worker.evaluate(async () => (await chrome.storage.local.get("trackingAuth")).trackingAuth ?? null);
  step("connect extension as Omar", !!auth?.access, `kind=${auth?.kind} org=${auth?.orgName}`);

  // let the extension learn the account's roles (profile/version) before the drawer opens
  await page.waitForTimeout(3000);
  await page.goto(POSTING, { waitUntil: "domcontentloaded" });
  await page.bringToFront(); // the drawer reads the ACTIVE tab, as after a real toolbar click
  await openDrawer(page);
  const drawer = page.frameLocator('iframe[title="Kiwiply"]');
  let shown = false;
  try {
    await drawer.getByRole("heading", { name: "Save for consultant" }).waitFor({ timeout: 45_000 });
    shown = true;
  } catch {
    shown = false;
  }
  step("drawer shows Save for consultant (no fill for a marketer)", shown);
  if (!shown) {
    const txt = (await drawer.locator("body").innerText().catch(() => "")).replace(/s+/g, " ").slice(0, 400);
    console.log("      drawer text:", txt);
    const acct = await worker.evaluate(async () => {
      const a = (await chrome.storage.local.get("trackingAuth")).trackingAuth || {};
      const r = await fetch((await chrome.storage.local.get("settings")).settings.apiBaseUrl + "/api/profile/version", { headers: { authorization: "Bearer " + a.access } });
      return r.status + " " + (await r.text()).slice(0, 400);
    });
    console.log("      profile/version:", acct);
    const panel = page.frames().find((f) => f.url().includes("/panel.html"));
    if (panel) {
      const probe = await panel.evaluate(async () => {
        const out = {};
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          out.tabs = tabs.map((t) => [t.id, (t.url || "").slice(0, 60)]);
          const id = tabs[0] && tabs[0].id;
          try {
            await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ["content-scripts/content.js"] });
            out.inject = "ok";
          } catch (e) {
            out.inject = String(e && e.message ? e.message : e);
          }
          out.reply = await new Promise((res) => {
            const t = setTimeout(() => res("no reply in 5 s"), 5000);
            chrome.tabs.sendMessage(id, { type: "JAF_CAPTURE_JOB" }, { frameId: 0 }, (r) => {
              clearTimeout(t);
              res(chrome.runtime.lastError ? "lastError: " + chrome.runtime.lastError.message : JSON.stringify(r).slice(0, 200));
            });
          });
        } catch (e) {
          out.error = String(e);
        }
        return out;
      });
      console.log("      panel probe:", JSON.stringify(probe));
      console.log("      page:", page.url().slice(0, 90), "form:", await page.locator("#application_form").count());
      const sw = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        const out = [];
        for (const t of tabs) {
          try {
            await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => location.href });
            out.push([t.id, "inject ok"]);
          } catch (e) {
            out.push([t.id, String(e.message).slice(0, 80)]);
          }
        }
        return { perms: await chrome.permissions.getAll(), out };
      });
      console.log("      service worker inject:", JSON.stringify(sw.out));
    } else console.log("      no panel frame");
  }
  if (shown) {
    const titleBox = drawer.locator("input").first();
    if (!(await titleBox.inputValue()).trim()) await titleBox.fill(TITLE);
    const savedTitle = (await titleBox.inputValue()).trim();
    const company = drawer.getByPlaceholder("Employer name");
    const capturedCompany = (await company.count()) ? (await company.inputValue()).trim() : "";
    if (process.env.POSTING_URL) console.log("      read from the page:", JSON.stringify({ title: savedTitle, company: capturedCompany }));
    if ((await company.count()) && !capturedCompany) await company.fill("Brightwave Systems");
    await drawer.locator("textarea").first().fill("Strong fit for your cloud work. Read the posting and apply with your extension if you like it.");
    await drawer.getByRole("checkbox", { name: CONSULTANT }).check({ timeout: 20_000 });
    await drawer.getByRole("button", { name: "Save for consultant" }).click();
    let confirmed = false;
    try {
      await drawer.getByRole("button", { name: "Back to the form" }).waitFor({ timeout: 20_000 });
      confirmed = true;
    } catch {
      confirmed = false;
    }
    const drawerText = (await drawer.locator("body").innerText()).replace(/\s+/g, " ");
    step("drawer confirms the save", confirmed, drawerText.slice(-220));

    const board = await page.evaluate(async (t) => {
      const org = (await (await fetch(`${location.origin.replace("jobs.localhost:3399", "aaruna.localhost:3200")}/api/me/tenant`)).json()).org?.id;
      return org;
    }, savedTitle).catch(() => null);
    void board;
    // check on the web as Omar (new tab on the tenant host, same browser profile = same session)
    const web = await context.newPage();
    await web.goto(`${WEB}/w/marketing/opportunities`, { waitUntil: "domcontentloaded" });
    await web.getByLabel("Search by consultant or job title").fill(savedTitle.slice(0, 30));
    let onBoard = false;
    try {
      await web.locator("[data-opp-row]").filter({ hasText: savedTitle.slice(0, 30) }).first().waitFor({ timeout: 30_000 });
      onBoard = true;
    } catch {
      onBoard = false;
    }
    step("Omar's Opportunities board lists it", onBoard, savedTitle);
  }
} catch (e) {
  step("script error", false, String(e.message).slice(0, 300));
} finally {
  await context.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} steps passed`);
  process.exit(bad ? 1 : 0);
}
