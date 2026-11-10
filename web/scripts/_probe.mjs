// DEV: probe element boxes. node scripts/_probe.mjs <path> <w>x<h> "sel1;sel2"
import { chromium } from "@playwright/test";
const base = "http://acme.localhost:3216";
const [path, size, sels] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
for (let t = 0; t < 4; t++) { await page.goto(`${base}/login`); try { await page.locator("[data-tenant-demo-tab]").waitFor({ timeout: 10000 }); break; } catch {} }
await page.locator("[data-tenant-demo-tab]").click();
await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 30000 });
await page.goto(`${base}${path}`);
await page.waitForSelector("[data-enterprise-shell]");
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2500);
const out = await page.evaluate((sels) => sels.split(";").map((s) => [...document.querySelectorAll(s)].slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${s} -> x${Math.round(r.x)} y${Math.round(r.y)} w${Math.round(r.width)} h${Math.round(r.height)} fs${cs.fontSize} fw${cs.fontWeight} c${cs.color} bg${cs.backgroundColor} r${cs.borderRadius}`; }).join("\n")).join("\n"), sels);
console.log(out);
await b.close();
