import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));
vi.mock("@/lib/demo-server", () => ({ demoReadOnly: async () => null }));

import { GET as getMe } from "./me/route";
import { POST as choose } from "./me/choice/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3200/api/billing/retirement/me/choice", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(() => serverApiFetch.mockReset());

describe("customer retirement BFF", () => {
  it("GET passes the notice through verbatim", async () => {
    serverApiFetch.mockResolvedValue(json({ retirement: null }));
    const res = await getMe();
    expect(await res.json()).toEqual({ retirement: null });
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/billing/retirement/me");
  });

  it("POST forwards a known choice with its Idempotency-Key and refuses anything else before the API sees it", async () => {
    serverApiFetch.mockResolvedValue(json({ retirement: null }));
    expect((await choose(post({ choice: "NUKE" }))).status).toBe(400);
    expect((await choose(post({ choice: "SWITCH_AT_RENEWAL", price: 1 }))).status).toBe(400);
    expect((await choose(post({ choice: "SWITCH_NOW", quoteId: "9" }))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    const ok = await choose(post({ choice: "SWITCH_AT_RENEWAL", quoteId: 501 }, { "idempotency-key": "11111111-2222-4333-8444-555555555555" }));
    expect(ok.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/billing/retirement/me/choice");
    expect(init.headers["idempotency-key"]).toBe("11111111-2222-4333-8444-555555555555");
    expect(JSON.parse(init.body)).toEqual({ choice: "SWITCH_AT_RENEWAL", quoteId: 501 });
  });

  it("passes a refusal code through so the page can word it", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "QUOTE_STALE" }, 409));
    const res = await choose(post({ choice: "STAY_ON_FREE" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "QUOTE_STALE" });
  });
});
