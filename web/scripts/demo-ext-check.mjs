#!/usr/bin/env node
/**
 * Enterprise demo rehearsal of the extension flows, in a real Chrome with the DEVELOPMENT build of the extension (development only).
 *
 * What it drives, end to end, against the local demo stack (web 3200, API 18183, stand-in employer pages 3399):
 *   1. sign in as Anika (Demo accounts tab) on aaruna.localhost;
 *   2. Account menu -> Connect extension -> the one-time code hands the session to the extension (platform /connect page);
 *   3. Assigned Opportunities -> tick openings -> Prepare -> confirm -> the extension acknowledges, opens one tab per job and fills it;
 *   4. on the first opened page the script presses the page's OWN Submit (as the consultant would) and waits for the web to say "Submitted".
 * Nothing here submits to a real employer: the pages are the local stand-ins (web/scripts/demo-ats-server.mjs). It prints PASS/FAIL per step.
 *
 *   cd job-autofill && WXT_DEV_WEB_ORIGINS=http://localhost:3200 WXT_DEV_API_ORIGINS=http://localhost:18183 \
 *     WXT_DEV_TENANT_ORIGINS=http://*.localhost:3200 WXT_DEV_ATS_ORIGINS=http://jobs.localhost:3399 npx wxt build --mode development
 *   node web/scripts/demo-ext-check.mjs            # env: DEMO_WEB (http://aaruna.localhost:3200), DEMO_API (http://localhost:18183),
 *                                                  #      EXT_DIR (job-autofill/.output/chrome-mv3-dev), HEADED=1 to watch, PW_CHANNEL (chrome)
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
const PICK = Number(process.env.PICK || 2);

const results = [];

/**
 * Off camera, as Omar (Anika's demo marketer colleague): three fresh openings on the stand-in pages, saved for Anika through the same API call the
 * extension's "Save for consultant" makes. The seeded openings mostly carry no link or wait for a marketer answer, so a batch needs these.
 * The API is called directly from Node (a browser session would do the same through the web); the tenant headers need the stack's host secret
 * (DOSSIER_TENANT_HOST_SECRET, or read from .claude/ent-demo-api.cmd).
 */
async function seedOpenings() {
  let secret = process.env.DOSSIER_TENANT_HOST_SECRET;
  if (!secret) {
    try {
      const cmd = readFileSync(join(here, "../../.claude/ent-demo-api.cmd"), "utf8");
      secret = (/DOSSIER_TENANT_HOST_SECRET=([^"\r\n]+)/.exec(cmd) || [])[1];
    } catch {
      secret = undefined;
    }
  }
  if (!secret) return { ok: false, note: "no DOSSIER_TENANT_HOST_SECRET" };
  const host = new URL(WEB).hostname;
  const h = { "X-Kiwiply-Host": host, "X-Kiwiply-Host-Secret": secret, "content-type": "application/json", accept: "application/json" };
  const tok = async (login) => (await (await fetch(`${API}/api/authenticate/demo`, { method: "POST", headers: h, body: JSON.stringify({ login }) })).json()).accessToken;
  const omar = await tok("demo-ent-acme-omar");
  const ah = { ...h, authorization: `Bearer ${omar}` };
  const me = await (await fetch(`${API}/api/me/tenant`, { headers: ah })).json();
  const org = me.org.id;
  // Omar must be Anika's marketer (an older seed gave her Sarah, whose Marketing Management workspace is not built): Sarah reassigns her once.
  const sarah = { ...h, authorization: `Bearer ${await tok("demo-ent-acme-sarah")}` };
  const facts = await (await fetch(`${API}/api/orgs/${org}/marketing-assignments/consultants?q=Anika`, { headers: sarah })).json();
  const anikaFacts = (facts.items || []).find((i) => i.name === "Anika Rao");
  const marketers = await (await fetch(`${API}/api/orgs/${org}/marketing-assignments/marketers?size=100`, { headers: sarah })).json();
  const omarMember = (marketers.items || []).find((m) => m.name === "Rahul Mehta");
  if (anikaFacts && omarMember && anikaFacts.marketer?.memberId !== omarMember.memberId) {
    const r = await fetch(`${API}/api/orgs/${org}/marketing-assignments/reassign`, {
      method: "POST",
      headers: { ...sarah, "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ consultantId: anikaFacts.consultantId, newMarketerMemberId: omarMember.memberId, reason: "Demo: Omar runs the marketing flows" }),
    });
    console.log("      Sarah reassigned Anika to Omar:", r.status);
  }
  const opts = await (await fetch(`${API}/api/orgs/${org}/mkt/opportunities/options?q=Anika`, { headers: ah })).json();
  const anika = (opts.consultants || []).find((c) => c.name === "Anika Rao");
  if (!anika) return { ok: false, note: "Anika is not among Omar's assignable consultants" };
  const stamp = Date.now();
  const jobs = [
    ["Platform Engineer", "Orbit Freight", "$95 - $110 / hr"],
    ["Data Engineer", "Cedar Analytics", "$85 - $100 / hr"],
    ["Site Reliability Engineer", "Harbor Cloud", "$100 - $120 / hr"],
  ];
  let made = 0;
  for (const [i, [title, company, pay]] of jobs.entries()) {
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const body = {
      jobUrl: `http://jobs.localhost:3399/greenhouse/${slug}/${stamp + i}?t=${encodeURIComponent(title)}&c=${encodeURIComponent(company)}`,
      title, company, location: "Remote (US)", workMode: "REMOTE", employmentType: "Contract", payLabel: pay, payMin: 85, payMax: 120, payPeriod: "HOUR",
      externalJobId: `demo-${stamp + i}`, atsPlatform: "greenhouse", postedOn: new Date().toISOString().slice(0, 10), skills: ["AWS", "Kubernetes", "Python"],
      keyInfo: `${company} needs a ${title.toLowerCase()} soon. Read the posting and apply with your extension if you like it.`, priority: "HIGH",
      dueOn: new Date(Date.now() + (3 + i) * 86_400_000).toISOString().slice(0, 10), consultantIds: [anika.id], extensionVersion: "demo-check",
    };
    const r = await fetch(`${API}/api/orgs/${org}/mkt/opportunities/from-extension`, { method: "POST", headers: { ...ah, "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
    if (r.ok || r.status === 409) made++; // 409: the duplicate guard, the same opening from an earlier run is still on her list
    else console.log("      capture refused:", r.status, (await r.text()).slice(0, 160));
  }
  return { ok: made === jobs.length, note: `${made}/${jobs.length} openings saved for Anika by Omar` };
}
const step = (name, ok, note = "") => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  (" + note + ")" : ""}`);
};

async function launch() {
  const userData = mkdtempSync(join(tmpdir(), "kiwiply-demo-check-"));
  const channel = process.env.PW_CHANNEL || "chrome";
  const context = await chromium.launchPersistentContext(userData, {
    channel,
    headless: !process.env.HEADED,
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1400, height: 900 },
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: EXT_DIR });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  return { context, extId: id, worker };
}

if (!process.env.SKIP_SEED) {
  const seeded = await seedOpenings().catch((e) => ({ ok: false, note: String(e.message).slice(0, 160) }));
  step("Omar saves three stand-in openings for Anika", seeded.ok, seeded.note);
}
const { context, extId, worker } = await launch();
const swLog = [];
worker.on("console", (m) => swLog.push(m.type() + ": " + m.text().slice(0, 200)));
try {
  await worker.evaluate(async (api) => {
    const cur = (await chrome.storage.local.get("settings")).settings ?? {};
    await chrome.storage.local.set({ settings: { ...cur, apiBaseUrl: api } });
  }, API);
  // "Connect" opens the platform /connect page with window.open; a popup is awkward to follow, so it navigates this tab instead (as the video kit does).
  await context.addInitScript(() => {
    window.open = ((url) => {
      if (url) location.href = String(url);
      return null;
    });
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("pageerror", (e) => console.log("[page error]", e.message.slice(0, 200)));

  // 1. sign in
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign in as Anika Rao" }).click({ timeout: 30_000 });
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
  step("sign in as Anika", true, page.url());

  // 2. connect the extension
  await page.getByRole("button", { name: /Anika Rao/ }).first().click();
  await page.getByRole("menuitem", { name: "Connect extension" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Connect", exact: true }).click({ noWaitAfter: true });
  let connected = false;
  let note = "";
  try {
    await page.waitForURL((u) => u.pathname === "/connect", { timeout: 30_000 });
    await page.getByText(/Extension connected/i).first().waitFor({ timeout: 45_000 });
    connected = true;
  } catch (e) {
    note = (await page.locator("[data-connect-message]").textContent().catch(() => null)) || (await page.locator("main").innerText().catch(() => "")).replace(/s+/g, " ").slice(0, 200);
  }
  const auth = await worker.evaluate(async () => (await chrome.storage.local.get("trackingAuth")).trackingAuth ?? null);
  step("connect extension (one-time code)", connected && !!auth?.access, `${page.url().slice(0, 60)} kind=${auth?.kind} org=${auth?.orgName} ${note}`);

  // The two switches Anika turns on once in the extension's settings: "Use Kiwiply AI" and the consent below it.
  await worker.evaluate(async () => {
    const cur = (await chrome.storage.local.get("settings")).settings ?? {};
    await chrome.storage.local.set({ settings: { ...cur, serverAiEnabled: true, serverAiConsent: true } });
  });

  // 3. prepare a batch
  await page.goto(`${WEB}/w/consultant/opportunities`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-consultant-opportunities][data-status=ready]").waitFor({ timeout: 60_000 });
  // PICK_MATCH (e.g. "Figma|Ramp|Rover", case-sensitive so a note saying "ramp up" is not picked) ticks the rows whose text matches; otherwise the first PICK tickable rows.
  const PICK_MATCH = process.env.PICK_MATCH ? new RegExp(process.env.PICK_MATCH) : null;
  const rowsWithBox = page.locator("[data-consultant-opportunities] [data-opp]").filter({ has: page.locator("[data-prepare-check]:not([disabled])") });
  const boxes = PICK_MATCH ? rowsWithBox.filter({ hasText: PICK_MATCH }).locator("[data-prepare-check]") : page.locator("[data-prepare-check]:not([disabled])");
  await page.locator("[data-prepare-bar]").waitFor({ timeout: 30_000 }).catch(() => {});
  await page.locator("[data-prepare-check]:not([disabled])").first().waitFor({ timeout: 30_000 }).catch(() => {}); // the boxes stay disabled until the prepare status has loaded
  const n = Math.min(PICK_MATCH ? 10 : PICK, await boxes.count());
  step("prepare switch on (checkboxes present)", n > 0, `${await boxes.count()} tickable openings`);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.locator("[data-prepare-open]").click();
  await page.locator("[data-prepare-dialog]").waitFor({ timeout: 15_000 });
  const opened = [];
  const pageLogs = new Map(); // batch tab -> its console errors + extension lines (printed when a tab does not fill)
  context.on("page", (p) => {
    opened.push(p);
    pageLogs.set(p, []);
    p.on("console", (m) => { if (m.type() === "error" || /JAF|Kiwiply|batch/i.test(m.text())) pageLogs.get(p).push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    p.on("pageerror", (e) => pageLogs.get(p).push(`pageerror: ${String(e.message).slice(0, 300)}`));
  });
  await page.locator("[data-prepare-confirm]").click();
  let acked = false;
  try {
    await page.locator("[data-prepare-acked]").waitFor({ timeout: 10_000 });
    acked = true;
  } catch {
    acked = false;
  }
  step("extension acknowledged the batch", acked, acked ? "" : (await page.locator("[data-prepare-no-extension]").count()) ? "web shows 'Extension not detected'" : "no ack element");
  if (!acked) {
    console.log("      prepare dialog says:", (await page.locator("[data-prepare-dialog]").innerText().catch(() => "(gone)")).replace(/\s+/g, " ").slice(0, 900));
    // Diagnose the hand-off: is the relay content script on this page, and what does the service worker answer to a probe batch?
    const scripts = await worker.evaluate(() => (chrome.runtime.getManifest().content_scripts || []).map((c) => c.js.join(",") + " @ " + c.matches.join(" ")));
    console.log("      content scripts:", scripts.join(" | "));
    const probe = await page.evaluate(
      () =>
        new Promise((res) => {
          const t = setTimeout(() => res("no ack within 3 s"), 3000);
          window.addEventListener("message", (e) => {
            if (e.source === window && e.data && e.data.type === "KIWIPLY_PREPARE_ACK") {
              clearTimeout(t);
              res(JSON.stringify(e.data));
            }
          });
          window.postMessage({ type: "KIWIPLY_PREPARE_BATCH", version: 1, sessionId: "probe1", orgId: 1, jobs: [{ matchId: 1, url: "http://jobs.localhost:3399/greenhouse/x/1", title: "t", company: "c" }] }, location.origin);
        }),
    );
    console.log("      probe ack:", probe, "on", page.url());
  }

  // tabs open and get filled
  const deadline = Date.now() + 90_000;
  while (opened.length < n && Date.now() < deadline) await page.waitForTimeout(500);
  step("one tab per opening", opened.length >= n, `${opened.length} tab(s): ${opened.map((p) => p.url().slice(0, 50)).join(" | ")}`);
  let filled = 0;
  let reviewed = 0;
  let aiDrafts = 0;
  for (const p of opened) {
    try {
      await p.waitForLoadState("domcontentloaded");
      // A batch tab fills at once ("Prepare" on the web was the consultant's click) and the panel becomes the review:
      // "Filled N of M fields · résumé attached", the required fields still theirs, and a Done button. Nothing is pressed here.
      // "attached", not "visible": on Ashby the panel is on screen, yet Playwright's visibility test reports it hidden (its host
      // box measures zero), so waiting for "visible" never ends there.
      const summary = p.getByText(/Filled \d+ of \d+ fields?/).first();
      await summary.waitFor({ state: "attached", timeout: 90_000 });
      reviewed++;
      const panelText = (await p.locator("#__jaf_host").evaluate((h) => h.shadowRoot.textContent).catch(() => "")).replace(/\s+/g, " ");
      if (/AI/.test(panelText) && (await p.locator("#__jaf_host").evaluate((h) => h.shadowRoot.querySelectorAll(".aibadge").length).catch(() => 0)) > 0) aiDrafts++;
      const v = {
        site: new URL(p.url()).hostname,
        summary: (await summary.textContent()).replace(/\s+/g, " ").slice(0, 70),
        resume: /résumé attached/.test(panelText),
        stillNeeds: (panelText.match(/(\d+) required fields? still needs? you/) || [, "0"])[1],
      };
      if (!v.resume) console.log("      NO RESUME ATTACHED on", v.site, "panel:", panelText.slice(0, 200));
      if (v.stillNeeds !== "0") {
        const names = await p.locator("#__jaf_host").evaluate((h) => Array.from(h.shadowRoot.querySelectorAll(".gjump .gname")).map((n) => n.textContent)).catch(() => []);
        v.needs = names;
      }
      filled++;
      console.log("      filled:", JSON.stringify(v), p.url().slice(0, 60));
      if (/^Filled 0 of/.test(v.summary)) console.log("      page console:", (pageLogs.get(p) || []).slice(-12).join(" || ") || "(nothing)");
      if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/batch-${v.site}.png`, fullPage: true }).catch(() => {});
    } catch (e) {
      console.log("      not filled:", p.url().slice(0, 60), String(e.message).slice(0, 80));
      console.log("      page console:", (pageLogs.get(p) || []).slice(-12).join(" || ") || "(nothing)");
      console.log("      service worker console:", swLog.slice(-12).join(" || ") || "(nothing)");
      await p.screenshot({ path: `C:/work_bench_claude/shots/notfilled-${new URL(p.url()).hostname}.png` }).catch(() => {});
      const all = p.getByText(/Filled \d+ field|still needs you/);
      const seen = [];
      for (let i = 0; i < (await all.count()); i++) seen.push(`${await all.nth(i).isVisible()}:${(await all.nth(i).innerText().catch(() => "?")).slice(0, 40)}`);
      console.log("      summary candidates:", JSON.stringify(seen), "frames:", p.frames().length);
    }
  }
  step("each page filled itself and shows the review", reviewed === opened.length && reviewed > 0, `${reviewed}/${opened.length}`);
  step("every page was filled (no press of a button)", filled === opened.length && filled > 0, `${filled}/${opened.length}`);
  step("Pro: the review shows an AI-written answer for the open question", aiDrafts > 0, `${aiDrafts}/${opened.length} (only pages with an open question get one)`);
  const states = async () => page.locator("[data-prepare-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  await page.waitForTimeout(4000);
  console.log("      web progress:", JSON.stringify(await page.locator("[data-prepare-item]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-state")}: ${e.innerText.replace(/\s+/g, " ").slice(0, 110)}`))));
  await page.waitForTimeout(4000);
  // PREFILLED = filled; NEEDS_INPUT = filled, with required fields the person must do (here the resume upload of the stand-in page).
  step("web progress shows the pages were prepared", (await states()).some((s) => /FILLED|PREFILLED|NEEDS_INPUT/.test(String(s))), (await states()).join(","));

  // 4. the consultant submits on the first page herself
  // SAFETY: only ever press submit on the LOCAL stand-in pages. A real employer's page (Greenhouse's button also reads "Submit application")
  // is never submitted, whatever the selection.
  const standIn = opened.find((p) => new URL(p.url()).hostname === "jobs.localhost");
  if (!standIn && opened.length) console.log("      (real employer pages: the submit step is skipped on purpose)");
  if (standIn) {
    const p = standIn;
    await p.bringToFront();
    // as the walkthrough has her do: Done closes the review panel, which sits over the right of the page (Greenhouse's Submit is there)
    await p.locator("#__jaf_host").evaluate((h) => h.shadowRoot.querySelector("#done")?.click()).catch(() => {});
    await p.getByRole("button", { name: "Submit Application" }).click();
    await p.getByText("Thank you for applying!").waitFor({ timeout: 15_000 });
    let submitted = false;
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      if ((await states()).some((s) => /SUBMIT/.test(String(s)))) {
        submitted = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    step("submit detected and reported to the web", submitted, (await states()).join(","));
    if (!submitted) {
      const st = await worker.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        const key = Object.keys(all).find((k) => /prepareBatch$/.test(k));
        const s = key ? all[key] : null;
        return s ? { jobs: (s.jobs || []).map((j) => [j.matchId, j.state, j.reason, j.tabId]), outbox: (s.outbox || []).length, stopped: s.stopped } : "no batch state";
      });
      console.log("      extension batch state:", JSON.stringify(st));
      const pending = await worker.evaluate(async () => Object.keys((await chrome.storage.local.get("trackingPending")).trackingPending || {}));
      console.log("      trackingPending tabs:", JSON.stringify(pending));
      console.log("      service worker console:", swLog.slice(-15).join(" || ") || "(nothing)");
      for (const p of opened.slice(0, 1)) {
        const body = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 160));
        console.log("      page 1 text now:", body);
      }
    }
  }

  // 5. Pro in the drawer: best resume for this posting, then Check fit (open the drawer as the toolbar icon does, on the active tab)
  // PRO_URL: the posting to check (the demo uses the Adobe Workday posting); a fresh tab, so the batch panel is not in the way.
  const posting = await context.newPage();
  await posting.goto(process.env.PRO_URL || "http://jobs.localhost:3399/greenhouse/northwind-labs/7?t=Data%20Platform%20Engineer&c=Northwind%20Labs", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await posting.waitForTimeout(5000);
  await posting.bringToFront();
  await posting.evaluate((id) => {
    if (document.getElementById("__kiwiply_drawer_host")) return;
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
  const drawer = posting.frameLocator('iframe[title="Kiwiply"]');
  let best = "";
  try {
    await drawer.getByText(/Best match/).first().waitFor({ timeout: 45_000 });
    best = (await drawer.getByText(/Best match/).first().innerText()).replace(/\s+/g, " ");
  } catch {
    best = "";
  }
  step("Pro: the drawer names the best resume for this posting", !!best, best || (await drawer.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
  let fitText = "";
  try {
    await drawer.getByRole("button", { name: "Check fit" }).click({ timeout: 20_000 });
    await drawer.getByText(/Missing from this resume|Red flags/i).first().waitFor({ timeout: 45_000 });
    fitText = (await drawer.locator("body").innerText()).replace(/\s+/g, " ");
  } catch {
    fitText = "";
  }
  const at = fitText.indexOf("Best");
  step("Pro: Check fit shows the fit report (score, missing keywords)", /Missing from this resume|Red flags/i.test(fitText), fitText.slice(at >= 0 ? at : 0).slice(0, 240));
  await posting.screenshot({ path: process.env.SHOT || "C:/work_bench_claude/shots/drawer-pro.png" }).catch(() => {});
} catch (e) {
  step("script error", false, String(e.message).slice(0, 300));
} finally {
  await context.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} steps passed`);
  process.exit(bad ? 1 : 0);
}
