import { describe, expect, it, vi } from "vitest";
import { connectFromTenant } from "./tenant-connect";

const LINK = "http://localhost:3200/connect?code=abcdefghijklmnop1234";
const TOKENS = { kind: "ENTERPRISE", orgName: "Aaruna Technologies", access: "a", refresh: "r" };

function fetchFake(over: { codeStatus?: number; tokenStatus?: number } = {}) {
  return vi.fn(async (url: string) => {
    if (url === "/api/extension/connect-code") return new Response(JSON.stringify({ connectUrl: LINK }), { status: over.codeStatus ?? 200 });
    if (url === "/api/extension/token") return new Response(JSON.stringify(TOKENS), { status: over.tokenStatus ?? 200 });
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("connectFromTenant: the organization's own connect page", () => {
  it("hands the session straight to a build that lists this host (white-label), without the platform page", async () => {
    const fetchImpl = fetchFake();
    const sent: unknown[] = [];
    const runtime = { sendMessage: (id: string, msg: unknown, cb?: (r: unknown) => void) => { sent.push([id, msg]); cb?.({ ok: true }); } };
    const forward = vi.fn();
    const r = await connectFromTenant({ runtime, extId: "ext1", forward, fetchImpl });
    expect(r).toEqual({ status: "connected" });
    expect(forward).not.toHaveBeenCalled();
    expect(sent).toEqual([["ext1", { type: "KIWIPLY_CONNECT", tokens: TOKENS }]]);
    const tokenCall = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find((c) => c[0] === "/api/extension/token")!;
    expect(JSON.parse(String(tokenCall[1].body))).toEqual({ code: "abcdefghijklmnop1234" });
  });

  it("passes the code on to the platform connect page when no extension lists this host (the standard extension)", async () => {
    const fetchImpl = fetchFake();
    const forward = vi.fn();
    const r = await connectFromTenant({ runtime: undefined, extId: "ext1", forward, fetchImpl });
    expect(r).toEqual({ status: "forwarded" });
    expect(forward).toHaveBeenCalledWith(LINK);
    expect((fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls.some((c) => c[0] === "/api/extension/token")).toBe(false);
  });

  it("an extension that does not answer is reported, not a silent success", async () => {
    const runtime = { lastError: undefined as { message?: string } | undefined, sendMessage(_id: string, _m: unknown, cb?: (r: unknown) => void) { this.lastError = { message: "port closed" }; cb?.(undefined); } };
    const r = await connectFromTenant({ runtime, extId: "ext1", forward: vi.fn(), fetchImpl: fetchFake() });
    expect(r.status).toBe("no-extension");
  });

  it("a code that cannot be exchanged, or a signed-out session, ends in a calm message", async () => {
    const runtime = { sendMessage: vi.fn() };
    expect((await connectFromTenant({ runtime, extId: "x", forward: vi.fn(), fetchImpl: fetchFake({ tokenStatus: 400 }) })).status).toBe("error");
    expect(await connectFromTenant({ runtime, extId: "x", forward: vi.fn(), fetchImpl: fetchFake({ codeStatus: 401 }) })).toEqual({
      status: "error",
      message: "Your session ended. Sign in again, then connect the extension.",
    });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("hands the session to the organization's own build through its relay, whose ID the page cannot know (A6)", async () => {
    const fetchImpl = fetchFake();
    const forward = vi.fn();
    const send = vi.fn(async () => ({ ok: true }));
    const r = await connectFromTenant({ runtime: undefined, extId: "kiwiply-id", forward, fetchImpl, relay: { ping: async () => true, send } });
    expect(r).toEqual({ status: "connected" });
    expect(send).toHaveBeenCalledWith(TOKENS);
    expect(forward).not.toHaveBeenCalled();
  });

  it("the relay comes first even where a direct runtime exists, and its refusal is shown", async () => {
    const runtime = { sendMessage: vi.fn() };
    const r = await connectFromTenant({
      runtime,
      extId: "x",
      forward: vi.fn(),
      fetchImpl: fetchFake(),
      relay: { ping: async () => true, send: async () => ({ ok: false, reason: "This extension belongs to another organization." }) },
    });
    expect(r).toEqual({ status: "error", message: "This extension belongs to another organization." });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    const silent = await connectFromTenant({ runtime: undefined, extId: "x", forward: vi.fn(), fetchImpl: fetchFake(), relay: { ping: async () => true, send: async () => null } });
    expect(silent.status).toBe("no-extension");
  });

  it("a relay that does not answer the ping changes nothing: the standard path runs", async () => {
    const forward = vi.fn();
    const send = vi.fn();
    const r = await connectFromTenant({ runtime: undefined, extId: "x", forward, fetchImpl: fetchFake(), relay: { ping: async () => false, send } });
    expect(r).toEqual({ status: "forwarded" });
    expect(send).not.toHaveBeenCalled();
  });
});
