// DEV ONLY: screenshots of the three exact-match pages. node web/scripts/exact-shots.mjs <tag> [pages] [sizes]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.env.SHELL_BASE ?? "http://acme.localhost:3216";
const tag = process.argv[2] ?? "before";
const pages = (process.argv[3] ?? "dashboard=/w/admin,employees=/w/admin/employees,invitations=/w/admin/invitations").split(",");
const sizes = (process.argv[4] ?? "1672x941,1440x900,768x1024,390x844").split(",").map((s) => s.split("x").map(Number));
const out = process.env.OUT ?? "../design/enterprise-talent/built";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (let t = 0; t < 4; t++) {
    await page.goto(`${base}/login`);
    try { await page.locator("[data-tenant-demo-tab]").waitFor({ timeout: 10000 }); break; } catch { console.log("retry login"); }
  }
  await page.locator("[data-tenant-demo-tab]").click();
  await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 30000 });
  for (const p of pages) {
    const [name, path] = p.split("=");
    await page.goto(`${base}${path}`);
    await page.waitForSelector("[data-enterprise-shell]", { timeout: 30000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForFunction(() => !document.querySelector("[data-widget-skeleton],[aria-busy=true],[data-state=loading]"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const f = `${out}/exact-${name}-${tag}-${w}.png`;
    await page.screenshot({ path: f, fullPage: w < 1000 });
    console.log("shot", f);
  }
  await ctx.close();
}
await browser.close();
