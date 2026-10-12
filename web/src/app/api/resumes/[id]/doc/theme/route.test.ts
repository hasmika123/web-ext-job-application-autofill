import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/demo-server", () => ({ demoReadOnly: async () => null }));

import { PATCH } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: string) => new Request("http://web.test/api/resumes/42/doc/theme", { method: "PATCH", body });

afterEach(() => serverApiFetch.mockReset());

describe("PATCH /api/resumes/:id/doc/theme", () => {
  it("forwards {theme} to Spring and relays the status, ETag and body", async () => {
    serverApiFetch.mockResolvedValue(new Response('{"docVersion":6}', { status: 200, headers: { etag: '"6"', "content-type": "application/json" } }));
    const res = await PATCH(req('{"theme":{"accent":"#16a34a"}}'), ctx("42"));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"6"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ docVersion: 6 });
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/resumes/42/doc/theme");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"theme":{"accent":"#16a34a"}}');
  });

  it("relays Spring's 422 THEME_INVALID verbatim", async () => {
    serverApiFetch.mockResolvedValue(new Response('{"code":"THEME_INVALID","path":"$.theme.fit.target"}', { status: 422, headers: { "content-type": "application/json" } }));
    const res = await PATCH(req('{"theme":{"fit":{"target":3}}}'), ctx("42"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "THEME_INVALID", path: "$.theme.fit.target" });
  });

  it("refuses a malformed id and an empty body without calling Spring", async () => {
    expect((await PATCH(req("{}"), ctx("abc"))).status).toBe(400);
    expect((await PATCH(req("  "), ctx("42"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("answers 502 when Spring cannot be reached", async () => {
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await PATCH(req('{"theme":{}}'), ctx("42"))).status).toBe(502);
  });
});
