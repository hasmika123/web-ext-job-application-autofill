import { expect, test } from "@playwright/test";

/**
 * X1.4: host-based tenant resolution over the mock API (MOCK_ENTERPRISE_ENABLED defaults on; mock tenants:
 * acme.localhost). Plain HTTP requests with an explicit Host header, so nothing depends on the machine resolving
 * *.localhost names.
 */
const base = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const get = (request: import("@playwright/test").APIRequestContext, host: string, path = "/") =>
  request.get(`${base}${path}`, { headers: { host }, maxRedirects: 0 });

test("an unknown host is a 404 with the generic page and no cookie", async ({ request }) => {
  const res = await get(request, "nobody.localhost:3100");
  expect(res.status()).toBe(404);
  expect(res.headers()["set-cookie"]).toBeUndefined();
  expect(await res.text()).toContain("isn&#x27;t available");
});

test("a served host renders the tenant tree with the display name as the title", async ({ request }) => {
  const res = await get(request, "acme.localhost:3100");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("<title>Acme Staffing</title>");
});

test("the platform host is untouched, and /_t is not reachable on it", async ({ request }) => {
  const home = await get(request, `localhost:3100`);
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain("<title>Kiwiply |");
  expect((await get(request, "localhost:3100", "/_t")).status()).toBe(404);
});
