import type { Locator, Page } from "@playwright/test";
import { test, expect, type Session } from "../_support/story";
import { PERSONAS, type PersonaKey } from "../_support/personas";

/**
 * Shared helpers of the MKT (Marketing workspace) stories. Not a spec file (the config only matches *.story.ts).
 *
 * The one thing Playwright cannot drive is the browser EXTENSION. Its "Save for consultant" button ends in
 *   POST /api/orgs/{orgId}/mkt/opportunities/from-extension   (Idempotency-Key header, JSON body, user token)
 * so the stories perform that exact HTTP call as the signed-in marketer (`captureJob`). The web app has no BFF route for it (the extension
 * calls the API directly), so the helper tries the web origin first and, on a 404/405, calls the API directly with the marketer's own access
 * token (read from the session cookie) plus the tenant-host headers the web server would add. Environment for the direct call:
 *   E2E_API_URL                  default http://localhost:18183 (the API of the real-stack runbook)
 *   DOSSIER_TENANT_HOST_SECRET   the same secret the API and `next start` share (only needed when the API enforces it, which the runbook does)
 */
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:18183";
export const POSTING_HOST = "jobs.example.com";

export interface ApiReply {
  status: number;
  json: unknown;
  text: string;
  headers: Record<string, string>;
}

/** The org id of the signed-in tenant member (the page must already be on the tenant origin). */
export async function orgIdOf(page: Page): Promise<number> {
  return page.evaluate(async () => ((await (await fetch("/api/me/tenant")).json()) as { org: { id: number } }).org.id);
}

/** The root marker of a page, once its first load has finished. */
export function ready(page: Page, root: string): Locator {
  // Several marketing pages are now the shared organization pages and carry no data-status marker: their title in the page header is the signal.
  // It must be INSIDE the signed-in shell: a signed-out browser shows the sign-in page, whose own <h1> must never count as "the page is ready".
  return page.locator(`${root}[data-status=ready], [data-enterprise-shell] [data-page-header] h1, [data-enterprise-shell] main h1`).first();
}

/** A same-origin call through the web app (cookies attached by the browser). Used for the BFF routes that exist. */
export async function bff<T = unknown>(page: Page, path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; json: T | null }> {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: { accept: "application/json", ...(init?.body !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      return { status: res.status, json: (await res.json().catch(() => null)) as T | null };
    },
    { path, init },
  );
}

/** A call straight to the Spring API as `who` (their own access token, the tenant host headers). Call it right after a page navigation so the token is fresh. */
export async function api(s: Session, who: PersonaKey, method: string, path: string, opts: { body?: unknown; raw?: string; headers?: Record<string, string> } = {}): Promise<ApiReply> {
  const cookies = await s.context.cookies();
  const access = cookies.find((c) => c.name === "__Host-kiwiply_access" || c.name === "kiwiply_access");
  if (!access) throw new Error(`no access cookie for ${who}: is the persona signed in?`);
  const secret = process.env.DOSSIER_TENANT_HOST_SECRET?.trim();
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${access.value}`,
    "x-kiwiply-host": `${PERSONAS[who].tenant}.localhost`,
    ...(secret ? { "x-kiwiply-host-secret": secret } : {}),
    ...(opts.body !== undefined || opts.raw !== undefined ? { "content-type": "application/json" } : {}),
    ...opts.headers,
  };
  const res = await s.page.request.fetch(`${API_URL}${path}`, {
    method,
    headers,
    data: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    failOnStatusCode: false,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status(), json, text, headers: res.headers() };
}

export interface Option { id: number; name: string }

/** The consultant ids a marketer may assign to (the Opportunities "Add" dialog's own list). Matches by full name. */
export async function consultantIdByName(page: Page, orgId: number, fullName: string): Promise<number> {
  const first = fullName.split(" ")[0];
  const r = await bff<{ consultants?: Option[] }>(page, `/api/orgs/${orgId}/mkt/opportunities/options?q=${encodeURIComponent(first)}`);
  const hit = (r.json?.consultants ?? []).find((c) => c.name === fullName);
  if (!hit) throw new Error(`${fullName} is not in this marketer's assignable consultants (status ${r.status}): check the demo roster / marketer assignment`);
  return hit.id;
}

/** A trimmed job exactly as the extension would send it (no description: the extension drops it, the API refuses it). */
export function jobBody(stamp: number, consultantIds: number[], over: Record<string, unknown> = {}): Record<string, unknown> {
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return {
    jobUrl: `https://${POSTING_HOST}/story/${stamp}`,
    title: `Senior QA Automation Engineer (Story ${stamp})`,
    company: `Storyline Labs ${stamp}`,
    location: "Austin, TX",
    workMode: "REMOTE",
    employmentType: "Contract",
    payLabel: "$70 - $80 / hr",
    payMin: 70,
    payMax: 80,
    payPeriod: "HOUR",
    externalJobId: `story-${stamp}`,
    atsPlatform: "greenhouse",
    postedOn: today,
    skills: ["Playwright", "TypeScript", "CI/CD"],
    keyInfo: `Story ${stamp}: strong fit for your automation background. Please read the posting and apply yourself if you like it.`,
    priority: "HIGH",
    dueOn: due,
    consultantIds,
    extensionVersion: "story-e2e",
    ...over,
  };
}

export interface CaptureResult {
  status: number;
  via: "web" | "api";
  json: { jobId?: number; existingJob?: boolean; results?: { consultantId: number; opportunityId?: number; existing: boolean; reason?: string }[] } | null;
  text: string;
}

/** "Save for consultant" from the extension, performed over HTTP (see the file header). `key` is the Idempotency-Key (a fresh UUID by default). */
export async function captureJob(s: Session, who: PersonaKey, orgId: number, body: unknown, opts: { key?: string | null; raw?: string } = {}): Promise<CaptureResult> {
  const key = opts.key === undefined ? crypto.randomUUID() : opts.key;
  const path = `/api/orgs/${orgId}/mkt/opportunities/from-extension`;
  const headers: Record<string, string> = key ? { "idempotency-key": key } : {};
  // 1) the web origin, in case a BFF route is ever added for it (today it is not: the extension talks to the API)
  const origin = new URL(s.page.url()).origin;
  // (Node cannot resolve *.localhost, so this first attempt answers ENOTFOUND here: that counts as "no BFF route" and the API is called directly.)
  const viaWeb = await s.page.request
    .fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    data: opts.raw ?? JSON.stringify(body),
    failOnStatusCode: false,
  })
    .catch(() => null);
  if (viaWeb && viaWeb.status() !== 404 && viaWeb.status() !== 405) {
    const text = await viaWeb.text();
    return { status: viaWeb.status(), via: "web", json: safe(text), text };
  }
  // 2) the API itself, as the extension does
  const r = await api(s, who, "POST", path, { body: opts.raw === undefined ? body : undefined, raw: opts.raw, headers });
  return { status: r.status, via: "api", json: r.json as CaptureResult["json"], text: r.text };
}

function safe(text: string): CaptureResult["json"] {
  try {
    return JSON.parse(text) as CaptureResult["json"];
  } catch {
    return null;
  }
}

/** Make the posting host answer with a tiny page, so "Open job posting" is demonstrable without the internet. */
export async function mockPostingSite(s: Session): Promise<void> {
  await s.context.route(`**://${POSTING_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Posting</title><h1 style='font:700 28px system-ui;padding:40px'>The job posting on the source site (story stub)</h1>" }),
  );
}

/** The Opportunities board of a marketer, searched down to one job title; returns that job's row. */
export async function boardRow(page: Page, title: string): Promise<Locator> {
  await ready(page, "[data-opportunities]").waitFor();
  await page.getByLabel("Search by consultant or job title").fill(title);
  const row = page.locator("[data-opp-row]").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  return row;
}

/** The consultant's list row of one job on the live Assigned Opportunities page (matched by its unique title). */
export function conRow(page: Page, title: string): Locator {
  return page.locator("[data-consultant-opportunities] [data-opp]").filter({ hasText: title });
}

/** Click a sidebar entry by its label and wait for the URL (client-side navigation). */
export async function sidebar(page: Page, label: string, pathEnd: string): Promise<void> {
  await page.getByRole("link", { name: label, exact: true }).first().click();
  await page.waitForURL((u) => u.pathname.replace(/\/+$/, "").endsWith(pathEnd));
}

/** A tile's numeric value on any marketing page (KpiTile: [data-stat-tile=<id>] [data-tile-value]). */
export async function tileValue(page: Page, id: string): Promise<number> {
  const el = page.locator(`[data-stat-tile="${id}"] [data-tile-value]`).first();
  await expect(el).toHaveText(/^[\d,]+$/);
  return Number((await el.innerText()).replace(/,/g, ""));
}

/**
 * Sets a consultant's availability the way the Consultants page does (PATCH with the version it read), as an administrator whose page is open.
 * A consultant who is ON_PROJECT is not being marketed (marketing PAUSED: nothing can be assigned, the API answers CONSULTANT_PAUSED), so the stories
 * that hand Ben a job first make him AVAILABLE and put him back afterwards. Returns what it was.
 */
export async function setAvailability(page: Page, orgId: number, fullName: string, status: string): Promise<string> {
  const list = (await bff<{ items: { id: number; name: string; availability: string }[] }>(page, `/api/orgs/${orgId}/consultants?q=${encodeURIComponent(fullName)}&size=5`)).json;
  const row = list?.items.find((c) => c.name === fullName);
  if (!row) throw new Error(`${fullName} is not in the consultant list`);
  if (row.availability === status) return status;
  const detail = (await bff<{ version: string }>(page, `/api/orgs/${orgId}/consultants/${row.id}`)).json;
  const r = await bff(page, `/api/orgs/${orgId}/consultants/${row.id}`, { method: "PATCH", body: { availabilityStatus: status }, headers: { "if-match": detail!.version } });
  if (r.status >= 300) throw new Error(`could not set ${fullName} to ${status}: HTTP ${r.status}`);
  return row.availability;
}

/**
 * Registers hooks on the enclosing describe: before each story the consultant is AVAILABLE (so a marketer can hand them a job), after each it is back to
 * what it was. Sarah (Org Admin) does it through the same page API an administrator uses.
 */
export function keepMarketed(fullName: string) {
  let was: string | null = null;
  test.beforeEach(async ({ as }) => {
    const sarah = await as("sarah");
    await sarah.go("/w/admin");
    await expect(sarah.page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 45_000 });
    was = await setAvailability(sarah.page, await orgIdOf(sarah.page), fullName, "AVAILABLE");
    await sarah.context.close(); // finish this hook's recording now
  });
  test.afterEach(async ({ as }) => {
    if (!was || was === "AVAILABLE") return;
    const sarah = await as("sarah");
    await sarah.go("/w/admin");
    await expect(sarah.page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 45_000 });
    await setAvailability(sarah.page, await orgIdOf(sarah.page), fullName, was);
    was = null;
    await sarah.context.close();
  });
}
