#!/usr/bin/env node
/**
 * White-label check for an organization-branded extension (development only): nothing a person sees names Kiwiply, and the extension signs
 * in through the organization's own site.
 *
 *   1. load the branded build; its permission list (manifest) names no Kiwiply host;
 *   2. the drawer before sign-in: no "Kiwiply", and its sign-in button opens the organization's /connect page;
 *   3. the options page: no "Kiwiply";
 *   4. sign in on the organization's site, open its /connect page: "Extension connected", with no platform page in between;
 *   5. the drawer after sign-in, on a job page: no "Kiwiply".
 *
 *   node web/scripts/demo-whitelabel-check.mjs     env: DEMO_WEB (http://aaruna.localhost:3200), EXT_DIR, WHO (Anika Rao), HEADED=1
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.DEMO_WEB || "http://aaruna.localhost:3200";
const EXT_DIR = resolve(process.env.EXT_DIR || join(here, "../../job-autofill/.output/chrome-mv3-dev-aaruna-technologies"));
const WHO = process.env.WHO || "Anika Rao";
const JOB = process.env.JOB_URL || "http://jobs.localhost:3399/greenhouse/techcorp/39?t=Cloud%20Engineer&c=TechCorp";

const results = [];
const step = (name, ok, note = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  (" + note + ")" : ""}`);
};
const leak = (text) => (String(text).match(/.{0,50}kiwiply.{0,40}/i) || [""])[0].replace(/\s+/g, " ");

const manifest = JSON.parse(readFileSync(join(EXT_DIR, "manifest.json"), "utf8"));
step("the manifest (name, permissions, connect list) names no Kiwiply", !/kiwiply/i.test(JSON.stringify(manifest)), leak(JSON.stringify(manifest)));

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "kiwiply-wl-")), {
  channel: process.env.PW_CHANNEL || "chrome",
  headless: !process.env.HEADED,
  args: ["--enable-unsafe-extension-debugging"],
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1280, height: 860 },
});
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id: extId } = await cdp.send("Extensions.loadUnpacked", { path: EXT_DIR });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  // a fresh install opens the sign-in page on its own: it must be the organization's
  const installTab = await context.waitForEvent("page", { timeout: 8_000 }).catch(() => null);
  if (installTab) step("on install it opens the organization's sign-in, not Kiwiply", installTab.url().startsWith(WEB), installTab.url());
  if (installTab) await installTab.close();

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extId}/panel.html`);
  await panel.waitForTimeout(2500);
  const before = await panel.locator("body").innerText();
  step("drawer before sign-in shows no Kiwiply", !/kiwiply/i.test(before + (await panel.title())), leak(before) || before.replace(/\s+/g, " ").slice(0, 120));
  const signIn = panel.getByRole("button", { name: /sign in|connect/i }).first();
  let opened = "";
  if (await signIn.count()) {
    const [tab] = await Promise.all([context.waitForEvent("page", { timeout: 10_000 }).catch(() => null), signIn.click()]);
    opened = tab ? tab.url() : "";
    if (tab) await tab.close();
  }
  step("the drawer's sign-in opens the organization's /connect page", opened.startsWith(`${WEB}/connect`) || opened.startsWith(`${WEB}/login`), opened || "no button");
  await panel.screenshot({ path: process.env.SHOT_DIR ? join(process.env.SHOT_DIR, "wl-drawer-signed-out.png") : "C:/work_bench_claude/shots/wl-drawer-signed-out.png" }).catch(() => {});

  await panel.goto(`chrome-extension://${extId}/options.html`);
  await panel.waitForTimeout(1500);
  const opts = await panel.locator("body").innerText();
  step("options page shows no Kiwiply", !/kiwiply/i.test(opts + (await panel.title())), leak(opts));

  // sign in on the organization's own site, then its /connect page signs the extension in
  const web = await context.newPage();
  await web.goto(`${WEB}/login`);
  await web.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 30_000 });
  await web.getByRole("button", { name: `Sign in as ${WHO}` }).click();
  await web.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
  const hosts = [];
  web.on("framenavigated", (f) => f === web.mainFrame() && hosts.push(new URL(f.url()).host));
  await web.goto(`${WEB}/connect`);
  let connected = false;
  try {
    await web.locator('[data-tenant-connect][data-status="connected"]').waitFor({ timeout: 30_000 });
    connected = true;
  } catch {
    connected = false;
  }
  const connectText = await web.locator("body").innerText().catch(() => "");
  step("the organization's /connect page signs the extension in", connected, connected ? "" : connectText.replace(/\s+/g, " ").slice(0, 160));
  step("…without leaving the organization's site", hosts.every((h) => h === new URL(WEB).host), [...new Set(hosts)].join(", "));
  step("the connect page shows no Kiwiply", !/kiwiply/i.test(connectText + (await web.title())), leak(connectText));
  const auth = await worker.evaluate(async () => (await chrome.storage.local.get("trackingAuth")).trackingAuth || null);
  step("the extension holds the enterprise session", !!auth?.access && auth?.kind === "ENTERPRISE", `kind=${auth?.kind} org=${auth?.orgName}`);
  await web.screenshot({ path: "C:/work_bench_claude/shots/wl-connect.png" }).catch(() => {});

  // the drawer after sign-in, over a job page
  const job = await context.newPage();
  await job.goto(JOB, { waitUntil: "domcontentloaded" });
  await job.bringToFront();
  await job.evaluate((id) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;right:0;width:400px;height:100vh;z-index:2147483647;";
    const frame = document.createElement("iframe");
    frame.src = `chrome-extension://${id}/panel.html`;
    frame.title = "drawer";
    frame.style.cssText = "width:100%;height:100%;border:0;";
    host.appendChild(frame);
    document.body.appendChild(host);
  }, extId);
  const drawer = job.frameLocator('iframe[title="drawer"]');
  await drawer.getByText(/Choose a resume|Ready when you are/).first().waitFor({ timeout: 30_000 }).catch(() => {});
  const after = await drawer.locator("body").innerText().catch(() => "");
  step("drawer after sign-in shows no Kiwiply", after.length > 0 && !/kiwiply/i.test(after), leak(after) || after.replace(/\s+/g, " ").slice(0, 120));
  await job.screenshot({ path: "C:/work_bench_claude/shots/wl-drawer-signed-in.png" }).catch(() => {});
} catch (e) {
  step("script error", false, String(e.message).slice(0, 300));
} finally {
  await context.close();
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length - bad}/${results.length} steps passed`);
  process.exit(bad ? 1 : 0);
}
