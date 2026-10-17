import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));

import { GET as list, POST as create } from "./route";
import { GET as getPlan, PUT as putPlan } from "./[planKey]/route";
import { POST as newVersion } from "./[planKey]/versions/route";
import { GET as getVersion, PATCH as patchVersion } from "./[planKey]/versions/[v]/route";
import { PUT as putComponents } from "./[planKey]/versions/[v]/components/route";
import { GET as preview } from "./[planKey]/versions/[v]/preview/route";
import { POST as publish } from "./[planKey]/versions/[v]/publish/route";
import { POST as discard } from "./[planKey]/versions/[v]/discard/route";
import { GET as compare } from "./[planKey]/compare/route";
import { GET as subscribers } from "./[planKey]/subscribers/route";
import { GET as margin } from "../catalog/margin/route";
import { POST as createPrice } from "../catalog/prices/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost:3200${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => serverApiFetch.mockReset());

describe("GET /api/admin/plans", () => {
  it("wraps the array in the list contract, applies q and interval here, and counts every plan in the summary", async () => {
    serverApiFetch.mockResolvedValue(
      json([
        { planKey: "FREE", name: "Free", status: "PUBLISHED", liveVersion: { version: 1 }, subscribersByVersion: { "1": 10 }, pricesByInterval: {} },
        { planKey: "PRO", name: "Pro", status: "PUBLISHED", liveVersion: { version: 2 }, subscribersByVersion: { "1": 212, "2": 1038 }, pricesByInterval: { MONTH: 1999 } },
        { planKey: "ORG", name: "Org", status: "SUNSET", liveVersion: { version: 1 }, subscribersByVersion: {}, pricesByInterval: { MONTH: 1499 } },
      ]),
    );
    const res = await list(req("/api/admin/plans?q=pr&interval=MONTH&audience=INDIVIDUAL&evil=1", "GET"));
    const body = await res.json();
    expect(body.items.map((r: { planKey: string }) => r.planKey)).toEqual(["PRO"]);
    expect(body.total).toBe(1);
    expect(body.summary).toEqual({ plans: 3, published: 2, drafts: 0, sunset: 1, oldVersionSubscribers: 212 });
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/plans?audience=INDIVIDUAL");
  });

  it("passes a refusal through in the admin shape and answers 502 when the API is down", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ detail: "Forbidden", code: "X" }, 403));
    const res = await list(req("/api/admin/plans", "GET"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "X", error: "Forbidden" });
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await list(req("/api/admin/plans", "GET"))).status).toBe(502);
  });
});

describe("writes", () => {
  it("create keeps to the known fields", async () => {
    serverApiFetch.mockResolvedValue(json({ planKey: "X" }, 201));
    expect((await create(req("/api/admin/plans", "POST", { planKey: "X", name: "x", audience: "INDIVIDUAL", reason: "because reasons", evil: 1 }))).status).toBe(400);
    expect((await create(req("/api/admin/plans", "POST", { planKey: "X", name: "x", audience: "INDIVIDUAL", reason: "because reasons" }))).status).toBe(201);
    expect(serverApiFetch).toHaveBeenCalledTimes(1);
  });

  it("publish turns the idempotencyKey into the Idempotency-Key header and keeps it out of the body", async () => {
    serverApiFetch.mockResolvedValue(json({ version: 3, status: "PUBLISHED" }));
    await publish(req("/x", "POST", { idempotencyKey: "abcdef12-3456", confirmVersion: 3, reason: "ship it to everyone" }), ctx({ planKey: "PRO", v: "3" }));
    const [path, init] = serverApiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/admin/plans/PRO/versions/3/publish");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("abcdef12-3456");
    expect(JSON.parse(init.body as string)).toEqual({ confirmVersion: 3, reason: "ship it to everyone" });
  });

  it("publish passes a typed refusal (412 CONFIRM_MISMATCH, 422 with levers) to the page untouched", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ detail: "Type the version number.", code: "CONFIRM_MISMATCH" }, 412));
    const res = await publish(req("/x", "POST", { idempotencyKey: "abcdef12-3456", confirmVersion: 9 }), ctx({ planKey: "PRO", v: "3" }));
    expect(res.status).toBe(412);
    expect(await res.json()).toEqual({ code: "CONFIRM_MISMATCH", error: "Type the version number." });
    serverApiFetch.mockResolvedValueOnce(json({ detail: "Margin below floor", code: "MARGIN_BELOW_FLOOR", overrideAllowed: true, levers: { minPriceMinor: 549 }, checks: [] }, 422));
    const bad = await publish(req("/x", "POST", { idempotencyKey: "abcdef12-3456", confirmVersion: 3 }), ctx({ planKey: "PRO", v: "3" }));
    expect(await bad.json()).toMatchObject({ code: "MARGIN_BELOW_FLOOR", overrideAllowed: true, levers: { minPriceMinor: 549 } });
  });

  it("forwards plan, version and component writes to their Spring routes", async () => {
    serverApiFetch.mockResolvedValue(json({}));
    await putPlan(req("/x", "PUT", { name: "Pro", reason: "rename the plan" }), ctx({ planKey: "PRO" }));
    await newVersion(req("/x", "POST", { from: 2, reason: "new draft please" }), ctx({ planKey: "PRO" }));
    await patchVersion(req("/x", "PATCH", { aiBudgetCapCents: 300, expectedUpdatedAt: "2026-10-16T00:00:00Z" }), ctx({ planKey: "PRO", v: "3" }));
    await putComponents(req("/x", "PUT", { components: [] }), ctx({ planKey: "PRO", v: "3" }));
    await discard(req("/x", "POST", { reason: "not needed" }), ctx({ planKey: "PRO", v: "3" }));
    const calls = serverApiFetch.mock.calls.map((c) => `${(c[1] as RequestInit).method} ${c[0]}`);
    expect(calls).toEqual([
      "PUT /api/admin/plans/PRO",
      "POST /api/admin/plans/PRO/versions",
      "PATCH /api/admin/plans/PRO/versions/3",
      "PUT /api/admin/plans/PRO/versions/3/components",
      "POST /api/admin/plans/PRO/versions/3/discard",
    ]);
    expect((await patchVersion(req("/x", "PATCH", { evil: 1 }), ctx({ planKey: "PRO", v: "3" }))).status).toBe(400);
  });

  it("refuses odd path segments before calling the API", async () => {
    expect((await getPlan(req("/x", "GET"), ctx({ planKey: "../etc" }))).status).toBe(404);
    expect((await getVersion(req("/x", "GET"), ctx({ planKey: "PRO", v: "3;drop" }))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("reads", () => {
  it("forwards only the known query parameters", async () => {
    serverApiFetch.mockResolvedValue(json({}));
    await preview(req("/x?interval=QUARTER&currency=USD&roster=%5B5%5DBASE&evil=1", "GET"), ctx({ planKey: "PRO", v: "3" }));
    await compare(req("/x?a=2&b=3&evil=1", "GET"), ctx({ planKey: "PRO" }));
    await subscribers(req("/x?version=2&page=0&evil=1", "GET"), ctx({ planKey: "PRO" }));
    await margin(req("/x?kind=OPTIONAL&amountMinor=399&interval=MONTH&evil=1", "GET"));
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/admin/plans/PRO/versions/3/preview?interval=QUARTER&currency=USD&roster=%5B5%5DBASE",
      "/api/admin/plans/PRO/compare?a=2&b=3",
      "/api/admin/plans/PRO/subscribers?version=2&page=0",
      "/api/admin/catalog/margin?kind=OPTIONAL&interval=MONTH&amountMinor=399",
    ]);
  });

  it("compare needs two version numbers", async () => {
    expect((await compare(req("/x?a=2", "GET"), ctx({ planKey: "PRO" }))).status).toBe(400);
  });

  it("creates a draft price row with only the known fields", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 5 }, 201));
    expect((await createPrice(req("/x", "POST", { productId: 1, audience: "INDIVIDUAL", interval: "MONTH", amountMinor: 499, currency: "USD", reason: "plan builder draft" }))).status).toBe(201);
    expect((await createPrice(req("/x", "POST", { amountMinor: 1, status: "ACTIVE" }))).status).toBe(400);
  });
});
