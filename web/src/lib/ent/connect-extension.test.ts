import { describe, expect, it, vi } from "vitest";
import { requestExtensionConnectLink } from "./connect-extension";

const res = (status: number, body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("requestExtensionConnectLink", () => {
  it("returns the platform connect URL the API built", async () => {
    const f = vi.fn((_url: string, _init?: RequestInit) => res(200, { connectUrl: "https://kiwiply.com/connect?code=x" }));
    expect(await requestExtensionConnectLink(f as unknown as typeof fetch)).toEqual({ ok: true, url: "https://kiwiply.com/connect?code=x" });
    expect(f.mock.calls[0][1]?.method).toBe("POST");
  });

  it("explains each failure in plain words", async () => {
    const msg = async (status: number) => {
      const r = await requestExtensionConnectLink((() => res(status)) as unknown as typeof fetch);
      return r.ok ? "" : r.message;
    };
    expect(await msg(401)).toMatch(/Sign in again/);
    expect(await msg(429)).toMatch(/Too many/);
    expect(await msg(502)).toMatch(/Couldn't start/);
    const down = await requestExtensionConnectLink((() => Promise.reject(new Error("x"))) as unknown as typeof fetch);
    expect(down.ok).toBe(false);
  });
});
