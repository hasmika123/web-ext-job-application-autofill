import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
// The real demoReadOnly, over the real DEMO_READ_ONLY pass-through (it needs no network).
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => p }));

import { GET, PATCH } from "./route";
import { DELETE, POST as DRAFT_POST, PUT } from "./draft/route";
import { POST as FINISH } from "./finish/route";
import { DRAFT_PER_MIN, OTHER_PER_MIN } from "@/lib/onboarding/bff";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const base = "http://web.test/api/profile/onboarding";
const req = (path: string, method: string, body?: string, ip = "10.0.0.1") =>
  new Request(`${base}${path}`, { method, body, headers: { "x-forwarded-for": ip, "content-type": "application/json" } });

afterEach(() => serverApiFetch.mockReset());

describe("GET /api/profile/onboarding", () => {
  it("proxies the status and never lets the browser cache it", async () => {
    serverApiFetch.mockImplementation(async () => json({ status: "NONE", persona: null }));
    const res = await GET(req("", "GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "NONE", persona: null });
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/profile/onboarding");
  });

  it("passes ?include=state through, and nothing else", async () => {
    serverApiFetch.mockImplementation(async () => json({}));
    await GET(req("?include=state", "GET"));
    await GET(req("?include=evil&x=1", "GET"));
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toEqual(["/api/profile/onboarding?include=state", "/api/profile/onboarding"]);
  });

  it("answers 502 when Spring is down, and relays a 401", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await GET(req("", "GET"))).status).toBe(502);
    serverApiFetch.mockResolvedValueOnce(json({ title: "Unauthorized" }, 401));
    expect((await GET(req("", "GET"))).status).toBe(401);
  });
});

describe("PATCH /api/profile/onboarding", () => {
  it("forwards persona / card actions and relays Spring's refusal verbatim", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ status: "NONE" }));
    const res = await PATCH(req("", "PATCH", '{"card":{"action":"SNOOZE"}}', "10.0.1.1"));
    expect(res.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/onboarding");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"card":{"action":"SNOOZE"}}');

    serverApiFetch.mockResolvedValueOnce(json({ code: "PERSONA_INVALID" }, 422));
    const bad = await PATCH(req("", "PATCH", '{"persona":"wizard"}', "10.0.1.1"));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ code: "PERSONA_INVALID" });
  });

  it("refuses an empty body without calling Spring", async () => {
    expect((await PATCH(req("", "PATCH", "  ", "10.0.1.2"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("PUT /api/profile/onboarding/draft", () => {
  const body = '{"v":2,"step":"review","stepsDone":2,"stepsTotal":7,"state":{},"baseUpdatedAt":"2026-10-12T10:00:00Z"}';

  it("forwards the draft as a PUT to Spring and relays its answer", async () => {
    serverApiFetch.mockImplementation(async () => json({ updatedAt: "t1", expiresAt: "t2" }));
    const res = await PUT(req("/draft", "PUT", body, "10.0.2.1"));
    expect(await res.json()).toEqual({ updatedAt: "t1", expiresAt: "t2" });
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/onboarding/draft");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(body);
  });

  it.each([
    [409, { code: "DRAFT_CONFLICT", serverUpdatedAt: "2026-10-12T11:00:00Z" }],
    [413, { code: "DRAFT_TOO_LARGE", max: 262144 }],
    [422, { code: "SENSITIVE_CONTENT", path: "state.skills[0]", class: "SSN_ITIN" }],
    [422, { code: "DRAFT_INVALID", path: "step" }],
  ])("relays Spring's %i verbatim", async (status, problem) => {
    serverApiFetch.mockImplementation(async () => json(problem, status));
    const res = await PUT(req("/draft", "PUT", body, "10.0.2.2"));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(problem);
  });

  it("rewrites the demo login's 403 into the friendly one (same code)", async () => {
    serverApiFetch.mockImplementation(async () => json({ code: "DEMO_READ_ONLY" }, 403));
    const res = await PUT(req("/draft", "PUT", body, "10.0.2.3"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
  });

  it("POST is the same write (navigator.sendBeacon can only POST)", async () => {
    serverApiFetch.mockImplementation(async () => json({ updatedAt: "t1", expiresAt: "t2" }));
    const res = await DRAFT_POST(req("/draft", "POST", body, "10.0.2.4"));
    expect(res.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/onboarding/draft");
    expect(init?.method).toBe("PUT"); // upstream is the PUT
    expect(init?.body).toBe(body);
  });

  it("refuses an empty body without calling Spring", async () => {
    expect((await PUT(req("/draft", "PUT", "", "10.0.2.5"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("answers 502 when Spring is down", async () => {
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await PUT(req("/draft", "PUT", body, "10.0.2.6"))).status).toBe(502);
  });

  it(`is rate limited: ${DRAFT_PER_MIN} saves a minute per client, then 429 RATE_LIMITED with retry-after`, async () => {
    serverApiFetch.mockImplementation(async () => json({ updatedAt: "t1", expiresAt: "t2" }));
    const ip = "10.0.9.9";
    for (let i = 0; i < DRAFT_PER_MIN; i++) expect((await PUT(req("/draft", "PUT", body, ip))).status).toBe(200);
    const over = await PUT(req("/draft", "PUT", body, ip));
    expect(over.status).toBe(429);
    expect((await over.json()) as { code: string }).toMatchObject({ code: "RATE_LIMITED" });
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    // another client is not affected, and the beacon alias shares the same bucket
    expect((await PUT(req("/draft", "PUT", body, "10.0.9.10"))).status).toBe(200);
    expect((await DRAFT_POST(req("/draft", "POST", body, ip))).status).toBe(429);
  });
});

describe("DELETE /api/profile/onboarding/draft", () => {
  it("starts over: forwards the DELETE and relays the 204", async () => {
    serverApiFetch.mockImplementation(async () => new Response(null, { status: 204 }));
    const res = await DELETE(req("/draft", "DELETE", undefined, "10.0.3.1"));
    expect(res.status).toBe(204);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/profile/onboarding/draft");
    expect(serverApiFetch.mock.calls[0][1]?.method).toBe("DELETE");
  });
});

describe("POST /api/profile/onboarding/finish", () => {
  it("forwards finish and relays the payoff numbers", async () => {
    const payoff = { finishedAt: "t", completeness: { score: 72, promptBelow: 40, resurfaceBelow: 20 }, coverage: { fields: 31, groups: { contact: 12 } } };
    serverApiFetch.mockImplementation(async () => json(payoff));
    const res = await FINISH(req("/finish", "POST", "{}", "10.0.4.1"));
    expect(await res.json()).toEqual(payoff);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/onboarding/finish");
    expect(init?.method).toBe("POST");
  });

  it(`is limited to ${OTHER_PER_MIN} a minute like the other writes`, async () => {
    serverApiFetch.mockImplementation(async () => json({}));
    const ip = "10.0.4.2";
    for (let i = 0; i < OTHER_PER_MIN; i++) expect((await FINISH(req("/finish", "POST", "{}", ip))).status).toBe(200);
    expect((await FINISH(req("/finish", "POST", "{}", ip))).status).toBe(429);
  });
});
