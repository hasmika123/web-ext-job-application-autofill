# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys\tenant-placements.spec.ts >> placements (real stack) >> the journey
- Location: e2e\journeys\tenant-placements.spec.ts:40:7

# Error details

```
Error: Timeout 90000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e5]:
      - region [ref=e6]:
        - heading "Welcome to Acme Staffing" [level=1] [ref=e7]
        - paragraph [ref=e12]: Sign in to your consultant bench, placements and team workspace.
      - region "Sign in" [ref=e13]:
        - generic [ref=e15]:
          - generic [ref=e16]:
            - generic [ref=e17]:
              - heading "Sign In" [level=2] [ref=e18]
              - paragraph [ref=e19]: Access your account securely.
            - img "Acme Staffing" [ref=e23]
          - generic [ref=e24]:
            - generic [ref=e25] [cursor=pointer]: User Name
            - textbox "User Name" [ref=e27]:
              - /placeholder: you@company.com
          - generic [ref=e28]:
            - generic [ref=e29] [cursor=pointer]: Password
            - generic [ref=e30]:
              - textbox "Password" [ref=e31]:
                - /placeholder: Enter your password
              - button "Show password" [ref=e32] [cursor=pointer]
          - generic [ref=e36]:
            - generic [ref=e37] [cursor=pointer]:
              - checkbox "Remember me" [ref=e38]
              - text: Remember me
            - link "Forgot password?" [ref=e39] [cursor=pointer]:
              - /url: /forgot-password
          - alert [ref=e40]
          - button "Sign In" [ref=e41] [cursor=pointer]
          - generic [ref=e44]:
            - paragraph [ref=e45]: Secure access protected by industry standards.
            - paragraph [ref=e48]:
              - text: Need help?
              - link "Contact IT Support" [ref=e49] [cursor=pointer]:
                - /url: mailto:support@acme.example.com
  - alert [ref=e50]
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | import { mkdirSync } from "node:fs";
  3   | import { resolve } from "node:path";
  4   | 
  5   | /**
  6   |  * The Placements page and its drawer against the REAL stack (Spring API + MySQL + `next start`): the seeded Acme Staffing placements, Sarah Chen signed
  7   |  * in through the Demo accounts tab. Run with `playwright.real-placements.config.ts` (docs/enterprise-v2/real-stack-runbook.md, page-placements.md).
  8   |  * Re-runnable: every change is undone from its toast, and the placement it adds is completed again so its consultant is free for the next run.
  9   |  */
  10  | const port = process.env.E2E_REAL_PORT ?? "3215";
  11  | const base = `http://acme.localhost:${port}`;
  12  | const shots = resolve(__dirname, "../../../design/enterprise-more/built");
  13  | 
  14  | async function signInAsSarah(page: Page) {
  15  |   // the first click can land before the page is hydrated: reload and click again until the demo roster is open
  16  |   await expect(async () => {
  17  |     await page.goto(`${base}/login`);
  18  |     await page.getByRole("button", { name: /Demo accounts/ }).first().click();
  19  |     await expect(page.getByRole("button", { name: "Sign in as Sarah Chen" })).toBeVisible({ timeout: 8000 });
> 20  |   }).toPass({ timeout: 90_000 });
      |      ^ Error: Timeout 90000ms exceeded while waiting on the predicate
  21  |   await page.getByRole("button", { name: "Sign in as Sarah Chen" }).click();
  22  |   await page.waitForURL((u) => u.pathname.startsWith("/w/"));
  23  | }
  24  | 
  25  | const kpi = (page: Page, k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
  26  | const drawer = (page: Page) => page.locator("[data-docked-drawer] [data-detail-body]");
  27  | const num = async (loc: ReturnType<Page["locator"]>) => Number((await loc.innerText()).replace(/,/g, ""));
  28  | const iso = (d: Date) => d.toISOString().slice(0, 10);
  29  | 
  30  | /** "Dec 20, 2026 (in 45 days)" to a Date (UTC). */
  31  | function dayOf(text: string): Date {
  32  |   const m = /([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(text);
  33  |   if (!m) throw new Error(`no date in "${text}"`);
  34  |   return new Date(`${m[1]} UTC`);
  35  | }
  36  | 
  37  | test.describe("placements (real stack)", () => {
  38  |   test.use({ viewport: { width: 1440, height: 900 } });
  39  | 
  40  |   test("the journey", async ({ page }) => {
  41  |     test.slow(); // a loaded shared machine: triple the timeout
  42  |     mkdirSync(shots, { recursive: true });
  43  |     await signInAsSarah(page);
  44  |     await page.goto(`${base}/w/admin/placements`);
  45  |     await expect(page.locator("[data-placements-page]")).toBeVisible();
  46  | 
  47  |     // the real tiles, the four tabs and the first page of the table agree with each other
  48  |     await expect(kpi(page, "active")).not.toHaveText("");
  49  |     const active = await num(kpi(page, "active"));
  50  |     expect(active).toBeGreaterThanOrEqual(50);
  51  |     await expect(page.getByRole("tab", { name: `Active (${active})` })).toBeVisible();
  52  |     await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
  53  |     await expect(page.locator("[data-showing-top]")).toContainText(`of ${active.toLocaleString("en-US")} active placements`);
  54  |     await expect(page.locator("[data-kpi=active] [data-kpi-delta]")).toContainText("vs last month");
  55  |     await expect(page.locator("[data-help-card]")).toBeVisible();
  56  |     // the board opens with its first row selected, docked in the right column
  57  |     await expect(drawer(page)).toBeVisible();
  58  |     await expect(page).toHaveURL(/pl=\d+/);
  59  |     await expect(drawer(page).locator("[data-extension-status]")).toBeVisible();
  60  |     await expect(drawer(page).locator("[data-availability]")).toBeVisible();
  61  |     await page.screenshot({ path: resolve(shots, "placements-1440.png") });
  62  | 
  63  |     // the other tabs show their own rows and the same numbers
  64  |     for (const [tab, status] of [["Upcoming", "UPCOMING"], ["Completed", "ENDED"]] as const) {
  65  |       await page.getByRole("tab", { name: new RegExp(`^${tab} \\(`) }).click();
  66  |       await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`));
  67  |       await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
  68  |       for (const s of await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))) expect(s).toBe(status);
  69  |     }
  70  |     await page.getByRole("tab", { name: /^Extensions \(/ }).click();
  71  |     await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
  72  |     await page.screenshot({ path: resolve(shots, "placements-extensions-1440.png") });
  73  |     await page.getByRole("tab", { name: /^Active \(/ }).click();
  74  |     await expect(page).not.toHaveURL(/tab=/);
  75  | 
  76  |     // filter by "Ending soon": every row carries an end-date pill; then the search; then clear
  77  |     await page.locator('button[aria-label="Status"]').click();
  78  |     await page.getByRole("option", { name: "Ending soon" }).click();
  79  |     await expect(page).toHaveURL(/status=ENDING_SOON/);
  80  |     await expect(page.locator("tr[data-row-id]").first()).toBeVisible();
  81  |     for (const k of await page.locator("tr[data-row-id] [data-next-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-next-action")))) expect(["ENDS_IN", "ENDED_AGO"]).toContain(k);
  82  |     const ending = await num(kpi(page, "endingSoon"));
  83  |     await expect(page.locator("[data-showing-top]")).toContainText(`of ${ending} active placements`);
  84  |     await page.locator('button[aria-label="Status"]').click();
  85  |     await page.getByRole("option", { name: "All Statuses" }).click();
  86  |     const search = page.getByRole("searchbox", { name: "Search placements" });
  87  |     await search.fill("zzzz-nobody");
  88  |     await expect(page.getByText("No placements match")).toBeVisible();
  89  |     await page.getByRole("button", { name: "Clear filters" }).first().click();
  90  |     await expect(page.locator("tr[data-row-id]")).toHaveCount(10);
  91  |     await expect(page).not.toHaveURL(/q=/);
  92  | 
  93  |     // sort by bill rate, high to low
  94  |     await page.locator('button[aria-label="Sort by"]').click();
  95  |     await page.getByRole("option", { name: "Bill Rate (High to Low)" }).click();
  96  |     await expect(page).toHaveURL(/sort=rate%2Cdesc/);
  97  |     const rates = await page.locator("tr[data-row-id]").evaluateAll((els) => els.map((e) => Number(/\$([\d,.]+)\//.exec(e.textContent ?? "")?.[1]?.replace(/,/g, "") ?? "0")));
  98  |     expect(rates).toEqual([...rates].sort((a, b) => b - a));
  99  |     await page.locator('button[aria-label="Sort by"]').click();
  100 |     await page.getByRole("option", { name: "End Date (Soonest)" }).click();
  101 | 
  102 |     // grid view and More Filters
  103 |     await page.getByRole("button", { name: "Grid view" }).click();
  104 |     await expect(page.locator("[data-placement-cards=grid] li").first()).toBeVisible();
  105 |     await page.screenshot({ path: resolve(shots, "placements-grid-1440.png") });
  106 |     await page.getByRole("button", { name: "List view" }).click();
  107 |     await page.locator("[data-more-filters]").click();
  108 |     await expect(page.locator("[data-more-filters-panel]")).toBeVisible();
  109 |     await page.screenshot({ path: resolve(shots, "placements-filters-1440.png") });
  110 |     await page.keyboard.press("Escape");
  111 | 
  112 |     // a placement with nothing to do: open it, then record, undo, record, undo
  113 |     const quiet = page.locator('tr[data-row-id]:has([data-next-action=NONE])').first();
  114 |     await expect(quiet).toBeVisible();
  115 |     const id = await quiet.getAttribute("data-row-id");
  116 |     await quiet.click();
  117 |     await expect(page).toHaveURL(new RegExp(`pl=${id}`));
  118 |     await expect(drawer(page).locator(`[data-placement-id="${id}"]`)).toBeVisible().catch(() => undefined);
  119 |     await expect(drawer(page).locator("[data-field=end]")).toBeVisible();
  120 |     const endText = await drawer(page).locator("[data-field=end]").innerText();
```