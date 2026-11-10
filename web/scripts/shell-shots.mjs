// DEV ONLY (X2.16): screenshots of the EnterpriseShell for a mock member at several widths.
//   node web/scripts/shell-shots.mjs [login] [outDir]        (env: SHELL_BASE=http://acme.localhost:3190, PW_CHANNEL=chrome|msedge)
// Needs the mock API and `next start` running (see docs/enterprise-v2/progress-tracker.md, X2.16 log).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.SHELL_BASE ?? "http://acme.localhost:3190";
const login = process.argv[2] ?? "owner@acme.com";
const out = process.argv[3] ?? "design/enterprise-admin/built";
const tag = login.split("@")[0];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const sizes = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];
const pages = (process.env.SHELL_PAGES ?? "/w/admin").split(",");
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill('input[name="username"]', login);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  for (const p of pages) {
    await page.goto(`${base}${p}`);
    await page.waitForSelector("[data-enterprise-shell]", { timeout: 30000 });
    await page.waitForTimeout(700);
    if (process.env.SHELL_CLICK) {
      // e.g. SHELL_CLICK="[data-workspace-switcher=sidebar]" (desktop) - the phone uses the bar chip
      const sel = s.width < 768 ? (process.env.SHELL_CLICK_PHONE ?? process.env.SHELL_CLICK) : process.env.SHELL_CLICK;
      await page.click(sel);
      await page.waitForTimeout(500);
    }
    const slug = p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
    await page.screenshot({ path: `${out}/shell-${tag}-${slug}-${s.name}.png` });
    console.log("shot", `${out}/shell-${tag}-${slug}-${s.name}.png`);
  }
  await ctx.close();
}
await browser.close();
