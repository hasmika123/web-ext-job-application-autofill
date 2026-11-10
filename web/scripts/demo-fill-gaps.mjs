#!/usr/bin/env node
/**
 * Which fields does the extension leave empty on each real posting? (development only; FILL ONLY, never submits, never signs in to a site.)
 *
 * Mirrors the demo: signs in as Anika on the organization's site, connects the branded extension through its /connect page, uploads her resume
 * PDF in the drawer ("Save to my resumes"), then for each URL opens the page, presses "Scan & fill this page" and "Fill selected", and lists
 * every visible form control that is still empty (required ones first), plus what the extension's own "still needs you" card says.
 *
 *   node web/scripts/demo-fill-gaps.mjs <url> [<url> ...]     env: DEMO_WEB, EXT_DIR, RESUME_PDF, HEADED=1, SHOTS=<dir>
 */
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.DEMO_WEB || "http://aaruna.localhost:3200";
const EXT_DIR = resolve(process.env.EXT_DIR || join(here, "../../job-autofill/.output/chrome-mv3-dev-aaruna-technologies"));
const PDF = process.env.RESUME_PDF || join(process.env.USERPROFILE || homedir(), "OneDrive", "Desktop", "Anika-Rao-Resume.pdf");
const SHOTS = process.env.SHOTS || "C:/work_bench_claude/shots";
const URLS = process.argv.slice(2);

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "kiwiply-gaps-")), {
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
for (const p of context.pages().slice(1)) await p.close().catch(() => {});

// sign in and connect through the organization's own /connect page
const web = context.pages()[0] ?? (await context.newPage());
await web.goto(`${WEB}/login`, { timeout: 90_000 });
await web.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 90_000 });
await web.getByRole("button", { name: "Sign in as Anika Rao" }).click({ timeout: 90_000, noWaitAfter: true });
await web.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
await web.goto(`${WEB}/connect`);
await web.locator('[data-tenant-connect][data-status="connected"]').waitFor({ timeout: 30_000 });
await worker.evaluate(async () => {
  const cur = (await chrome.storage.local.get("settings")).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, serverAiEnabled: true, serverAiConsent: true } });
});
console.log("connected as Anika");

async function openDrawer(tab) {
  await tab.bringToFront();
  await tab.evaluate((id) => {
    document.getElementById("__gaps_drawer")?.remove();
    const host = document.createElement("div");
    host.id = "__gaps_drawer";
    host.style.cssText = "position:fixed;top:0;right:0;width:400px;height:100vh;z-index:2147483647;";
    const frame = document.createElement("iframe");
    frame.src = `chrome-extension://${id}/panel.html`;
    frame.title = "drawer";
    frame.style.cssText = "width:100%;height:100%;border:0;";
    host.appendChild(frame);
    document.body.appendChild(host);
  }, extId);
  return tab.frameLocator('iframe[title="drawer"]');
}

// upload the resume PDF once, as the walkthrough's one-time setup does
if (!process.env.NO_UPLOAD) {
  const tab = await context.newPage();
  await tab.goto("http://jobs.localhost:3399/greenhouse/techcorp/39?t=Cloud%20Engineer&c=TechCorp");
  const drawer = await openDrawer(tab);
  await drawer.getByText(/Choose a resume/).first().waitFor({ timeout: 30_000 });
  await drawer.locator('input[type="file"]').setInputFiles(PDF);
  await drawer.getByRole("button", { name: "Save to my resumes" }).click();
  const save = drawer.getByRole("button", { name: /^(Save|Save resume|Save to my resumes|Confirm|Looks good)/ }).last();
  await save.waitFor({ timeout: 60_000 });
  await tab.waitForTimeout(1500);
  await tab.screenshot({ path: join(SHOTS, "gaps-upload-review.png") }).catch(() => {});
  await save.click();
  const again = drawer.getByRole("button", { name: "Save anyway" });
  if (await again.isVisible({ timeout: 3000 }).catch(() => false)) await again.click();
  try {
    await drawer.getByText(/Choose a resume|Ready when you are/).first().waitFor({ timeout: 60_000 });
  } catch (e) {
    await tab.screenshot({ path: join(SHOTS, "gaps-upload-stuck.png") }).catch(() => {});
    console.log("upload did not finish:", (await drawer.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
    throw e;
  }
  await tab.waitForTimeout(1500);
  const txt = (await drawer.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("after upload:", (txt.match(/Choose a resume.{0,140}/) || [txt.slice(0, 160)])[0]);
  await tab.close();
}

/** Every visible form control on the page that is still empty, with its question text. */
async function emptyFields(tab) {
  const frames = tab.frames().filter((f) => !f.url().startsWith("chrome-extension://"));
  const out = [];
  for (const f of frames) {
    const rows = await f
      .evaluate(() => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const clean = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 90);
        const labelOf = (el) => {
          const by = el.getAttribute("aria-labelledby");
          if (by) return clean(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "));
          if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
          if (el.id) {
            const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (l) return clean(l.textContent);
          }
          const wrap = el.closest("label, fieldset, .field, .application-question, [class*='field'], [class*='question']");
          if (wrap) return clean((wrap.querySelector("legend, label, .application-label, [class*='label']") || wrap).textContent);
          return clean(el.name || el.placeholder || el.id);
        };
        const res = [];
        const seenGroups = new Set();
        for (const el of document.querySelectorAll("input, select, textarea, [role='combobox']")) {
          if (el.closest("#__gaps_drawer, [id^='__kiwiply'], [id^='jaf-'], [class*='jaf-']")) continue;
          const type = (el.getAttribute("type") || el.tagName).toLowerCase();
          if (["hidden", "submit", "button", "image", "reset", "search"].includes(type)) continue;
          if (type !== "file" && !vis(el)) continue;
          const required = el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(labelOf(el));
          let empty;
          if (type === "radio" || type === "checkbox") {
            const key = el.name || labelOf(el);
            if (seenGroups.has(key)) continue;
            seenGroups.add(key);
            const group = el.name ? document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`) : [el];
            empty = ![...group].some((g) => g.checked);
            if (type === "checkbox" && group.length === 1 && !required) continue; // an optional single checkbox (consent, follow-up) is not a gap
          } else if (type === "file") {
            const box = el.closest("[class*='upload'], .field, fieldset, div");
            empty = el.files.length === 0 && !/\.pdf|\.docx|attached|uploaded|remove|Anika/i.test(box ? box.textContent : "");
          } else if (el.getAttribute("role") === "combobox" && el.tagName !== "INPUT") {
            empty = !clean(el.textContent) || /^select/i.test(clean(el.textContent));
          } else if (el.tagName === "SELECT") {
            empty = !el.value || /^select/i.test(el.options[el.selectedIndex]?.text || "");
          } else {
            // react-select style comboboxes keep the chosen value outside the <input>
            const single = el.closest("[class*='__control']")?.querySelector("[class*='single-value'], [class*='singleValue'], [class*='multi-value']");
            empty = !el.value && !(single && clean(single.textContent));
          }
          if (empty) res.push({ label: labelOf(el), type, required });
        }
        return res;
      })
      .catch(() => []);
    out.push(...rows);
  }
  return out;
}

for (const url of URLS) {
  const tab = await context.newPage();
  const host = new URL(url).hostname;
  try {
    await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tab.waitForTimeout(6000);
    const drawer = await openDrawer(tab);
    await drawer.getByRole("button", { name: /Scan & fill/ }).click({ timeout: 45_000 });
    const fill = tab.getByRole("button", { name: "Fill selected" });
    await fill.waitFor({ timeout: 40_000 });
    const offered = await tab.locator('[type="checkbox"][data-i]').count().catch(() => -1);
    await fill.click({ timeout: 10_000 }).catch(() => fill.click({ force: true }));
    await tab.waitForTimeout(6000);
    const summary = ((await tab.getByText(/Filled \d+ field/).first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
    const needs = ((await tab.getByText(/still needs? you/).first().locator("xpath=ancestor::*[3]").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
    const empty = await emptyFields(tab);
    await tab.screenshot({ path: join(SHOTS, `gaps-${host}.png`), fullPage: true }).catch(() => {});
    console.log(`\n== ${host}  offered ${offered} · ${summary.slice(0, 110)}`);
    if (needs) console.log(`   card: ${needs.slice(0, 200)}`);
    const req = empty.filter((e) => e.required);
    const opt = empty.filter((e) => !e.required);
    console.log(`   EMPTY REQUIRED (${req.length}):`);
    for (const e of req) console.log(`     - [${e.type}] ${e.label}`);
    console.log(`   empty optional (${opt.length}):`);
    for (const e of opt) console.log(`     - [${e.type}] ${e.label}`);
  } catch (e) {
    console.log(`\n== ${host}: ERROR ${String(e.message).split("\n")[0].slice(0, 160)}`);
  }
  await tab.close(); // never submitted
}
await context.close();
