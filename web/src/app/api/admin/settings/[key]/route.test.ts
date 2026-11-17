import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));

import { GET, PUT } from "./route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const put = (body: unknown) => new Request("http://localhost:3200/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => serverApiFetch.mockReset());

describe("/api/admin/settings/{key}: the Autopilot settings only (gap D12)", () => {
  it("reads and writes an Autopilot key, forwarding the value and the reason only", async () => {
    serverApiFetch.mockResolvedValue(json({ key: "enterprise.autopilot.prepare.enabled", value: true }));
    await GET(new Request("http://localhost:3200/x"), ctx("enterprise.autopilot.prepare.enabled"));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/settings/enterprise.autopilot.prepare.enabled");
    await PUT(put({ value: true, reason: "Pilot organizations are ready" }), ctx("enterprise.autopilot.prepare.enabled"));
    expect(serverApiFetch.mock.calls[1][0]).toBe("/api/admin/settings/enterprise.autopilot.prepare.enabled");
    expect((serverApiFetch.mock.calls[1][1] as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((serverApiFetch.mock.calls[1][1] as RequestInit).body))).toEqual({ value: true, reason: "Pilot organizations are ready" });
  });

  it("any other registry key is a 404 and never reaches the API", async () => {
    expect((await GET(new Request("http://localhost:3200/x"), ctx("feature.resume_parsing.enabled"))).status).toBe(404);
    expect((await PUT(put({ value: true, reason: "Trying another key here" }), ctx("enterprise.flag.master"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("a body with anything but value and reason is refused", async () => {
    const res = await PUT(put({ value: true, reason: "A good reason here", key: "x" }), ctx("enterprise.autopilot.prepare.enabled"));
    expect(res.status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
