import { test, expect, narrate } from "../_support/story";
import type { BrowserContext } from "@playwright/test";
import { ACME, BETA, apiGet, orgIdOf } from "./_platform";

/**
 * PLT: tenant isolation (one organization can never read another's data, and a refusal looks like "not found") and the job-data
 * audit evidence endpoint, which is API-only (no web page or BFF route exists for it yet).
 */

test("PLT-20 Beta's owner cannot read Acme's data, and the refusal is the same as for an organization that does not exist", async ({ as }) => {
  const acme = await as("sarah");
  await acme.go("/w/admin");
  const acmeOrg = await orgIdOf(acme.page);

  const bea = await as("bea");
  await bea.go("/w/admin");
  const betaOrg = await orgIdOf(bea.page);
  await narrate(bea.page, "Bea is Beta's owner; she knows Acme's organization id");
  expect(betaOrg).not.toBe(acmeOrg);
  const own = await apiGet(bea.page, `/api/orgs/${betaOrg}/dashboard`);
  expect(own.status).toBe(200);
  const foreign = await apiGet(bea.page, `/api/orgs/${acmeOrg}/dashboard`);
  const missing = await apiGet(bea.page, `/api/orgs/987654321/dashboard`);
  await narrate(bea.page, "Acme's dashboard answers 404, like an id that was never issued");
  expect(foreign.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(foreign.body).not.toMatch(/Acme/); // the refusal never names the organization it refused
  for (const sub of ["members", "invitations", "consultants", "clients", "placements"]) {
    const r = await apiGet(bea.page, `/api/orgs/${acmeOrg}/${sub}`);
    expect(r.status, sub).toBe(404);
  }
});

test("PLT-21 A session from one tenant's host means nothing on another tenant's host", async ({ as }) => {
  const { page } = await as("sarah");
  await page.goto(`${ACME}/w/admin`);
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
  await narrate(page, "Sarah is signed in on acme.localhost");
  await page.goto(`${BETA}/w/admin`);
  await narrate(page, "On beta.localhost she is a stranger: sent to Beta's own sign-in");
  await expect(page).toHaveURL(/beta\.localhost.*\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to Beta Talent");
  await expect(page.locator("[data-enterprise-shell]")).toHaveCount(0);
});

test("PLT-22 Bea sees only Beta: her workspace shows her organization and none of Acme's people", async ({ as }) => {
  const { page, go } = await as("bea");
  await go("/w/admin");
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible();
  await narrate(page, "Bea's Administration is Beta Talent's");
  await expect(page.locator('[aria-label="Beta Talent home"]').first()).toBeVisible();
  await go("/w/admin/employees");
  await expect(page.locator("[data-employees-page]")).toBeVisible();
  await narrate(page, "Her Employees page lists Beta's people only");
  await expect(page.locator("tr[data-row-id]", { hasText: "Bea Turner" })).toBeVisible();
  for (const name of ["Sarah Chen", "Omar Haddad", "Anika Rao", "Hana Petrov"]) {
    await expect(page.locator("tr[data-row-id]", { hasText: name })).toHaveCount(0);
  }
});

/**
 * GET /api/orgs/{orgId}/audit/job-data has no BFF route, so these two stories call the API directly with the persona's tenant access token
 * (read from the stored browser state) and the tenant host header, exactly as the BFF would. STORY_API_URL (default http://localhost:8080) and
 * DOSSIER_TENANT_HOST_SECRET (when the API requires it) must match the running stack.
 */
const API = process.env.STORY_API_URL ?? process.env.E2E_API_URL ?? "http://localhost:8080";

async function directAudit(context: BrowserContext, host: string, orgId: number, query = "") {
  const cookies = await context.cookies(host);
  const token = cookies.find((c) => c.name === "__Host-kiwiply_access")?.value;
  if (!token) return null;
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, "x-kiwiply-host": new URL(host).host, accept: "application/json" };
  if (process.env.DOSSIER_TENANT_HOST_SECRET) headers["x-kiwiply-host-secret"] = process.env.DOSSIER_TENANT_HOST_SECRET;
  const r = await context.request.get(`${API}/api/orgs/${orgId}/audit/job-data${query}`, { headers });
  return { status: r.status(), json: r.status() === 200 ? await r.json() : null };
}

test("PLT-23 The org admin can read the job-data audit evidence", async ({ as }) => {
  const { page, context, go } = await as("sarah");
  await go("/w/admin");
  const org = await orgIdOf(page);
  await narrate(page, "The audit evidence has no page yet: Sarah's token is used on the API directly");
  const r = await directAudit(context, ACME, org, "?size=5");
  test.skip(r === null, "no tenant access cookie in the stored state");
  expect(r!.status).toBe(200);
  expect(r!.json).toEqual(expect.objectContaining({ items: expect.any(Array), total: expect.any(Number), page: 0, size: 5 }));
  for (const item of r!.json.items as { job: Record<string, unknown>; events: unknown[] }[]) {
    expect(item.job).toEqual(expect.objectContaining({ id: expect.anything(), title: expect.any(String) }));
    expect(Array.isArray(item.events)).toBe(true);
    expect(JSON.stringify(item.job)).not.toMatch(/"description"/); // no job text beyond title and employer
  }
  const none = await directAudit(context, ACME, org, "?jobId=999999999");
  expect(none!.status).toBe(200);
  expect(none!.json.items).toHaveLength(0);
});

test("PLT-24 Everyone else gets the generic 404 from the audit evidence, even with a row-filtered audit grant", async ({ as }) => {
  const sarah = await as("sarah");
  await sarah.go("/w/admin");
  const org = await orgIdOf(sarah.page);
  for (const who of ["omar", "anika", "felix", "hana", "amara", "eve"] as const) {
    const s = await as(who);
    await s.go("/");
    await s.page.waitForURL("**/w/**");
    const r = await directAudit(s.context, ACME, org);
    test.skip(r === null, "no tenant access cookie in the stored state");
    await narrate(s.page, `${who}: audit evidence answers 404`, 600);
    expect(r!.status, who).toBe(404); // Felix holds audit.view limited to billing rows: still not enough for ORG-wide job data
  }
});
