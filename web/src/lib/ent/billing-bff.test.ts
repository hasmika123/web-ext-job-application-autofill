import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { cleanQuery, handleBilling, handleUsage } from "./billing-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string) => new Request(`http://web.test${url}`, { method, body: method === "GET" ? undefined : "{}" });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

/** ORG-BILLING-BUILD.md step 1a: the billing BFF forwards the documented reads and nothing else. */
describe("billing BFF", () => {
  it("forwards each documented read with only its own query parameters", async () => {
    await handleBilling(req("GET", "/api/orgs/2/billing/overview"), ctx("2", ["overview"]));
    await handleBilling(req("GET", "/api/orgs/2/billing"), ctx("2"));
    await handleBilling(req("GET", "/api/orgs/2/billing/invoices?status=OPEN&page=2&evil=1"), ctx("2", ["invoices"]));
    await handleBilling(req("GET", "/api/orgs/2/billing/invoices/41"), ctx("2", ["invoices", "41"]));
    await handleUsage(req("GET", "/api/orgs/2/usage?period=2026-10"), ctx("2"));
    await handleUsage(req("GET", "/api/orgs/2/usage/history?months=6"), ctx("2", ["history"]));
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/orgs/2/billing/overview",
      "/api/orgs/2/billing",
      "/api/orgs/2/billing/invoices?status=OPEN&page=2",
      "/api/orgs/2/billing/invoices/41",
      "/api/orgs/2/usage?period=2026-10",
      "/api/orgs/2/usage/history?months=6",
    ]);
  });

  it("is a 404 for writes, unknown routes, bad ids and a bad organization id", async () => {
    expect((await handleBilling(req("POST", "/api/orgs/2/billing/overview"), ctx("2", ["overview"]))).status).toBe(404);
    expect((await handleBilling(req("GET", "/api/orgs/2/billing/portal"), ctx("2", ["portal"]))).status).toBe(404);
    expect((await handleBilling(req("GET", "/api/orgs/2/billing/invoices/x"), ctx("2", ["invoices", "x"]))).status).toBe(404);
    expect((await handleUsage(req("GET", "/api/orgs/abc/usage"), ctx("abc"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("drops query values that are not plain words", () => {
    expect(cleanQuery("?period=2026-10%26x%3D1&months=6", ["period", "months"])).toBe("?months=6");
    expect(cleanQuery("", ["period"])).toBe("");
  });
});
