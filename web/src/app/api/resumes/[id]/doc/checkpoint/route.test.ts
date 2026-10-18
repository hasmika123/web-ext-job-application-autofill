import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/demo-server", () => ({ demoReadOnly: async () => null }));

import { POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: string) => new Request("http://web.test/api/resumes/42/doc/checkpoint", { method: "POST", body });

afterEach(() => serverApiFetch.mockReset());

describe("POST /api/resumes/:id/doc/checkpoint", () => {
  it("forwards an unnamed Save as an empty body and relays Spring's answer", async () => {
    serverApiFetch.mockResolvedValue(new Response('{"versionNo":3,"reason":"MANUAL","pdf":{"status":"PENDING"}}', { status: 200, headers: { "content-type": "application/json" } }));
    const res = await POST(req(), ctx("42"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ versionNo: 3, reason: "MANUAL", pdf: { status: "PENDING" } });
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/resumes/42/doc/checkpoint");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("{}");
  });

  it("forwards the version name", async () => {
    serverApiFetch.mockResolvedValue(new Response('{"versionNo":4,"reason":"NAMED"}', { status: 200, headers: { "content-type": "application/json" } }));
    await POST(req('{"name":"Before the Acme call"}'), ctx("42"));
    expect(serverApiFetch.mock.calls[0][1]?.body).toBe('{"name":"Before the Acme call"}');
  });

  it("relays Spring's 422 verbatim", async () => {
    serverApiFetch.mockResolvedValue(new Response('{"code":"DOC_INVALID"}', { status: 422, headers: { "content-type": "application/json" } }));
    const res = await POST(req('{"name":"x"}'), ctx("42"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "DOC_INVALID" });
  });

  it("refuses a malformed id without calling Spring, and answers 502 when Spring is down", async () => {
    expect((await POST(req(), ctx("abc"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await POST(req(), ctx("42"))).status).toBe(502);
  });
});
