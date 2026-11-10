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
});
