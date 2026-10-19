#!/usr/bin/env node
/**
 * Enterprise demo page crawl (development only): signs in as each demo persona through the "Demo accounts" tab, opens every page of that role's
 * menu at desktop width, and reports what a viewer would trip over: a console error, a failed API call (4xx/5xx), a "on the way" placeholder, a
 * page that never settles, or a horizontal overflow. Screenshots go to CRAWL_OUT (default C:/work_bench_claude/crawl).
 *
 *   node web/scripts/demo-crawl.mjs                 # all three personas
 *   PERSONAS=anika node web/scripts/demo-crawl.mjs  # one
 * env: DEMO_WEB (http://acme.localhost:3200), PW_CHANNEL (chrome), HEADED=1
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const WEB = process.env.DEMO_WEB || "http://acme.localhost:3200";
const OUT = process.env.CRAWL_OUT || "C:/work_bench_claude/crawl";
const PERSONAS = (process.env.PERSONAS || "sarah,omar,anika").split(",");
const NAMES = { sarah: "Sarah Chen", omar: "Omar Haddad", anika: "Anika Rao", ben: "Ben Okafor" };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome", headless: !process.env.HEADED });
const problems = [];
let pages = 0;

for (const who of PERSONAS) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let current = "";
  const note = (kind, detail) => problems.push({ who, path: current, kind, detail: String(detail).slice(0, 220) });
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) note("console", m.text());
  });
  page.on("pageerror", (e) => note("pageerror", e.message));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && !/\/_next\/|favicon|\.map$/.test(u) && !/prefetch/.test(r.request().headers()["purpose"] || "")) note(`http ${r.status()}`, u.replace(WEB, ""));
  });

  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Demo accounts/ }).first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: `Sign in as ${NAMES[who]}` }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
  await page.waitForSelector("[data-enterprise-shell]", { timeout: 60_000 });
  const home = new URL(page.url()).pathname;
  const links = await page.$$eval("[data-enterprise-shell] a[href^='/w/']", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  const routes = [home, ...links.filter((l) => l !== home)];
  console.log(`\n== ${who}: ${routes.length} pages`);
  for (const route of routes) {
    current = route;
    const before = problems.length;
    try {
      await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector("[data-enterprise-shell] main", { timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const text = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
      if (/on the way|coming soon/i.test(text)) note("placeholder", text.slice(0, 80));
      if (/couldn't load|something went wrong|try again/i.test(text)) note("error text", (text.match(/.{0,40}(couldn't load|something went wrong|try again).{0,40}/i) || [""])[0]);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 4) note("overflow", `${over}px wider than the window`);
      await page.screenshot({ path: join(OUT, `${who}${route.replace(/[^a-z0-9]+/gi, "_")}.png`) });
    } catch (e) {
      note("load", e.message.split("\n")[0]);
    }
    pages++;
    console.log(`${problems.length === before ? "ok  " : "FAIL"}  ${route}`);
  }
  await context.close();
}
await browser.close();

console.log(`\n${pages} pages, ${problems.length} problem(s)`);
for (const p of problems) console.log(`- ${p.who} ${p.path}: ${p.kind}: ${p.detail}`);
process.exit(problems.length ? 1 : 0);
