// Screenshots of the Employees page at 1440 / 768 / 390 against a running stack (real or mock), into design/enterprise-admin/built.
//   E2E_REAL_PORT=3201 PW_CHANNEL=chrome node scripts/employees-shots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const port = process.env.E2E_REAL_PORT ?? "3200";
const base = `http://acme.localhost:${port}`;
const out = resolve(import.meta.dirname, "../../design/enterprise-admin/built");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/w/"));
  await page.goto(`${base}/w/admin/employees`);
  await page.waitForSelector("[data-employee-table], [data-employee-cards]");
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(out, `employees-${w}.png`) });
  if (w >= 768) await page.locator("tr[data-row-id]", { hasText: "Anika Rao" }).click();
  else await page.locator("[data-employee-cards] li", { hasText: "Anika Rao" }).getByRole("button", { name: /Anika Rao/ }).click();
  await page.waitForSelector("[data-detail-body]");
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(out, `employees-sheet-${w}.png`) });
  if (w === 1440) {
    await page.getByRole("tab", { name: "Access & Roles" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, "employees-roles-1440.png") });
  }
  await ctx.close();
}
await browser.close();
