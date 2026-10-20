#!/usr/bin/env node
/**
 * Enterprise demo rehearsal of the "tailor a resume, then assign" story (DEMO-PLAN section 16), in a real Chrome (development only).
 *
 *   1. Rahul (no extension): Job Discovery -> the preset job -> "Tailor Anika's resume" -> the AI suggestions, score 58% -> 87% -> Save & assign.
 *   2. Anika (with the development build of the extension): connect -> Assigned Opportunities shows "Resume tailored by Rahul" -> View changes ->
 *      tick the job -> Prepare (the dialog names the tailored resume) -> the extension opens the stand-in page, fills it and attaches THAT resume
 *      (the file input holds the tailored PDF's name) -> she presses the page's own Submit -> the web says Submitted.
 * Run node web/scripts/demo-tailor-setup.mjs first (the job and the archived tailored resume). Only the LOCAL stand-in page is ever submitted.
 *
 *   node web/scripts/demo-tailor-check.mjs   # env: DEMO_WEB (http://aaruna.localhost:3200), DEMO_API (http://localhost:18183),
 *                                            #      EXT_DIR (job-autofill/.output/chrome-mv3-dev), HEADED=1, PW_CHANNEL (chrome), SHOTS=<dir>
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.DEMO_WEB || "http://aaruna.localhost:3200";
const API = process.env.DEMO_API || "http://localhost:18183";
const EXT_DIR = resolve(process.env.EXT_DIR || join(here, "../../job-autofill/.output/chrome-mv3-dev"));
const SHOTS = process.env.SHOTS || "";
const preset = JSON.parse(readFileSync(join(here, "../src/lib/ent/demo/tailor-preset.json"), "utf8"));

const results = [];
const step = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  (" + note + ")" : ""}`);
};
const shot = async (p, name) => (SHOTS ? p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false }).catch(() => {}) : undefined);

async function signIn(page, who) {
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: `Sign in as ${who}` }).click({ timeout: 30_000 });
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
}

const browserArgs = { channel: process.env.PW_CHANNEL || "chrome", headless: !process.env.HEADED, viewport: { width: 1440, height: 900 } };

// ---- 1. Rahul tailors and assigns --------------------------------------------------------------------------------------------------------
{
  const browser = await chromium.launch(browserArgs);
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[rahul page error]", e.message.slice(0, 200)));
  try {
    await signIn(page, "Rahul Mehta");
    await page.goto(`${WEB}/w/marketing/jobs`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Search job title/).fill(preset.job.company);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: `View ${preset.job.title}` }).first().click({ timeout: 45_000 });
    await page.locator("[data-tailor-card]").waitFor({ timeout: 20_000 });
    step("Rahul: the job sheet offers to tailor Anika's resume", true, (await page.locator("[data-tailor-card]").innerText()).replace(/\s+/g, " ").slice(0, 120));
    await shot(page, "1-job-sheet");
    await page.locator("[data-tailor-open]").click();
    await page.locator("[data-tailor-thinking]").waitFor({ timeout: 10_000 }).catch(() => {});
    await page.locator("[data-tailor-sheet]").waitFor({ timeout: 15_000 });
    const before = (await page.locator("[data-tailor-score=before]").innerText()).trim();
    const after = (await page.locator("[data-tailor-score=after]").innerText()).trim();
    step("Rahul: AI suggestions with the score before and after", before === `${preset.scoreBefore}%` && after === "87%", `${before} -> ${after}, ${await page.locator("[data-tailor-change]").count()} changes`);
    await shot(page, "2-tailor-sheet");
    // the honesty beat: ticking "Kubeflow" (not on her profile) would raise the score; it is left unticked
    await page.locator("[data-tailor-addition=add-kubeflow] input").check();
    const withKf = (await page.locator("[data-tailor-score=after]").innerText()).trim();
    await page.locator("[data-tailor-addition=add-kubeflow] input").uncheck();
    step("Rahul: the score follows the changes he keeps", withKf === "90%" && (await page.locator("[data-tailor-score=after]").innerText()).trim() === "87%", `with Kubeflow ${withKf}`);
    await page.locator("[data-tailor-save]").click();
    await page.getByText(/assigned Anika Rao/).first().waitFor({ timeout: 20_000 });
    step("Rahul: Save & assign assigns Anika", true, (await page.getByText(/assigned Anika Rao/).first().innerText()).slice(0, 140));
    await shot(page, "3-assigned");
  } catch (e) {
    step("Rahul: script error", false, String(e.message).slice(0, 240));
    await shot(page, "rahul-error");
  } finally {
    await browser.close();
  }
}

// ---- 2. Anika prepares with the tailored resume ------------------------------------------------------------------------------------------
{
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "kiwiply-tailor-check-")), {
    ...browserArgs,
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send("Extensions.loadUnpacked", { path: EXT_DIR });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
    await worker.evaluate(async (api) => {
      const cur = (await chrome.storage.local.get("settings")).settings ?? {};
      await chrome.storage.local.set({ settings: { ...cur, apiBaseUrl: api, serverAiEnabled: true, serverAiConsent: true } });
    }, API);
    await context.addInitScript(() => {
      window.open = (url) => {
        if (url) location.href = String(url);
        return null;
      };
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await signIn(page, "Anika Rao");
    await page.getByRole("button", { name: /Anika Rao/ }).first().click();
    await page.getByRole("menuitem", { name: "Connect extension" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Connect", exact: true }).click({ noWaitAfter: true });
    await page.getByText(/Extension connected/i).first().waitFor({ timeout: 60_000 });
    step("Anika: extension connected", true);

    await page.goto(`${WEB}/w/consultant/opportunities`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-consultant-opportunities][data-status=ready]").waitFor({ timeout: 60_000 });
    const row = page.locator("[data-opp]").filter({ hasText: preset.job.title }).filter({ hasText: preset.job.company }).first();
    await row.locator("[data-tailored-note]").waitFor({ timeout: 20_000 });
    step("Anika: the row says the resume was tailored for this job", true, (await row.locator("[data-tailored-note]").innerText()).replace(/\s+/g, " "));
    await row.locator("[data-tailored-note]").click();
    await page.locator("[data-tailor-sheet]").waitFor({ timeout: 10_000 });
    step("Anika: View changes shows what Rahul changed", (await page.locator("[data-tailor-change]").count()) === preset.changes.length);
    await shot(page, "4-anika-view");
    await page.getByRole("button", { name: "Close", exact: true }).last().click();

    await page.locator("[data-prepare-check]:not([disabled])").first().waitFor({ timeout: 30_000 });
    await row.locator("[data-prepare-check]").check();
    await page.locator("[data-prepare-open]").click();
    await page.locator("[data-prepare-tailored]").waitFor({ timeout: 15_000 });
    step("Anika: the Prepare dialog names the tailored resume", true, (await page.locator("[data-prepare-tailored]").innerText()).replace(/\s+/g, " ").slice(0, 160));
    await shot(page, "5-prepare-dialog");
    const tab = context.waitForEvent("page", { timeout: 60_000 });
    await page.locator("[data-prepare-confirm]").click();
    const p = await tab;
    await p.waitForLoadState("domcontentloaded");
    await p.getByText(/Filled \d+ of \d+ fields?/).first().waitFor({ state: "attached", timeout: 90_000 });
    const attached = await p.evaluate(() => {
      const i = document.querySelector('input[type="file"]');
      return i && i.files && i.files[0] ? { name: i.files[0].name, size: i.files[0].size } : null;
    });
    // the tailored PDF's size, read through the web as Anika (the extension renames every upload "first_last_resume.pdf")
    const tailoredSize = await page.evaluate(async () => {
      const r = await (await fetch("/api/demo/tailored-resume")).json();
      return r.resume ? (await (await fetch(`/api/resumes/${r.resume.id}/file`)).blob()).size : -1;
    });
    const shown = await p.locator("#__jaf_host").evaluate((h) => (h.shadowRoot.querySelector("[data-resume-file]") || {}).textContent || "").catch(() => "");
    step("Anika: the page is filled and the TAILORED resume is attached", !!attached && attached.size === tailoredSize, `${attached && attached.name} ${attached && attached.size} bytes vs tailored ${tailoredSize}`);
    step("Anika: the review names the tailored resume", shown.includes(preset.resume.label), shown);
    await shot(p, "6-filled");
    if (new URL(p.url()).hostname !== "jobs.localhost") throw new Error("not the local stand-in page: not submitting");
    await p.getByRole("button", { name: "Submit Application" }).click();
    await p.getByText("Thank you for applying!").waitFor({ timeout: 15_000 });
    let submitted = false;
    for (let i = 0; i < 15 && !submitted; i++) {
      submitted = (await page.locator("[data-prepare-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).some((s) => s === "SUBMITTED");
      if (!submitted) await page.waitForTimeout(2000);
    }
    step("Anika: she submits herself and the web shows Submitted", submitted);
    const mine = await page.evaluate(async () => (await fetch("/api/demo/tailored-resume")).json());
    step("Anika: preparing approved the resume (it is back on her list)", mine.resume && mine.resume.archived === false, JSON.stringify(mine.resume));
  } catch (e) {
    step("Anika: script error", false, String(e.message).slice(0, 240));
    for (const pg of context.pages()) await shot(pg, `anika-error-${context.pages().indexOf(pg)}`);
  } finally {
    await context.close();
  }
}

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} steps passed`);
process.exit(bad ? 1 : 0);
