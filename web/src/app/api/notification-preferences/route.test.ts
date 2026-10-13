import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => p }));

import { GET, PUT } from "./route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => serverApiFetch.mockReset());

describe("GET /api/notification-preferences", () => {
  it("proxies Spring's preferences and never lets the browser cache them", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ stored: false, tz: "UTC" }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ stored: false, tz: "UTC" });
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/profile/notification-preferences");
  });

  it("answers 502 when Spring is down and relays a 401", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await GET()).status).toBe(502);
    serverApiFetch.mockResolvedValueOnce(json({ title: "Unauthorized" }, 401));
    expect((await GET()).status).toBe(401);
  });
});

describe("PUT /api/notification-preferences", () => {
  const put = (body: string) => PUT(new Request("http://web.test/api/notification-preferences", { method: "PUT", body, headers: { "content-type": "application/json" } }));

  it("forwards the body untouched as a PUT", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ stored: true }));
    const body = '{"matrix":{"SYSTEM":{"inapp":true,"email":"off"}},"quietStart":null,"quietEnd":null,"tz":"Asia/Kolkata"}';
    const res = await put(body);
    expect(res.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/notification-preferences");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(body);
  });

  it("relays Spring's 422 so the panel can say why", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ detail: "That isn't a time zone we know" }, 422));
    const res = await put('{"tz":"Mars/Olympus"}');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: "That isn't a time zone we know" });
  });

  it("turns a demo account's refusal into the friendly demo 403", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ code: "DEMO_READ_ONLY" }, 403));
    const res = await put("{}");
    expect(res.status).toBe(403);
    expect(res.headers.get("x-demo-read-only")).toBe("1");
    expect((await res.json()).code).toBe("DEMO_READ_ONLY");
  });

  it("refuses an empty body without calling Spring", async () => {
    expect((await put("")).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
