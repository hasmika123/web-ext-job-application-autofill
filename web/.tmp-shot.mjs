import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
const [,, out, w = "1448", h = "1086", path = "/w/admin/clients", click = ""] = process.argv;
const base = "http://acme.localhost:3214";
const state = process.env.STATE_FILE;
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: Number(w), height: Number(h) }, storageState: state && existsSync(state) ? state : undefined });
const p0 = await ctx.newPage();
await p0.goto(`${base}/login`);
const st = await p0.evaluate(async (who) => (await fetch("/api/auth/tenant-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: who }) })).status, process.env.WHO || "demo-ent-acme-sarah");
console.log("login", st);
await p0.close();
const p = await ctx.newPage();
await p.goto(`${base}${path}`);
await p.waitForSelector("[data-clients-page] tr[data-row-id], [data-clients-page] li[data-row-id]", { timeout: 90000 }).catch(async () => { await p.screenshot({ path: out }); console.log((await p.locator("body").innerText()).slice(0, 600)); process.exit(1); });
await p.waitForTimeout(2500);
if (click) { await p.locator(click).first().click(); await p.waitForTimeout(1500); }
await p.screenshot({ path: out });
await b.close();
