import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET } from "./route";
import { PUT } from "./[slot]/route";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const put = (body: unknown) => new Request("http://w/x", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) });
const params = (slot: string) => ({ params: Promise.resolve({ slot }) });

afterEach(() => serverApiFetch.mockReset());

describe("admin subprocessor BFF routes", () => {
  it("GET forwards to the admin privacy route", async () => {
    serverApiFetch.mockResolvedValue(json(200, { items: [] }));
    expect((await GET()).status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/privacy/subprocessors");
  });

  it("PUT writes one slot through the audited settings route, sending only value", async () => {
    serverApiFetch.mockResolvedValue(json(200, { key: "legal.subprocessor.07" }));
    const value = { name: "Acme", link: "https://acme.example" };
    const res = await PUT(put({ value }), params("07"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/settings/legal.subprocessor.07");
    expect(serverApiFetch.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(String(serverApiFetch.mock.calls[0][1]?.body))).toEqual({ value });
  });

  it("refuses a slot outside 01-12, extra fields and a non-object value without calling Spring", async () => {
    expect((await PUT(put({ value: {} }), params("13"))).status).toBe(404);
    expect((await PUT(put({ value: {} }), params("7"))).status).toBe(404);
    expect((await PUT(put({ value: {}, reason: "x" }), params("07"))).status).toBe(400);
    expect((await PUT(put({ value: "text" }), params("07"))).status).toBe(400);
    expect((await PUT(put({ value: [] }), params("07"))).status).toBe(400);
    expect((await PUT(put("not json"), params("07"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("passes the API's refusal through as { error } with the same status", async () => {
    serverApiFetch.mockResolvedValue(json(400, { detail: "Not a valid value" }));
    const res = await PUT(put({ value: { name: "A", link: "http://x" } }), params("07"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Not a valid value");
  });
});
