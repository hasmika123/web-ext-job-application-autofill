import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));

import { GET as list, POST as start } from "./route";
import { GET as coverage } from "./coverage/route";
import { GET as noticePreview } from "./notices/preview/route";
import { GET as detail } from "./[id]/route";
import { POST as cancel } from "./[id]/cancel/route";
import { POST as close } from "./[id]/close/route";
import { GET as items } from "./[id]/items/route";
import { POST as resend } from "./[id]/items/[itemId]/resend/route";
import { POST as exclude } from "./[id]/items/[itemId]/exclude/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost:3200${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => serverApiFetch.mockReset());

const START = {
  planKey: "PRO",
  mode: "RETIRE_AT_RENEWAL",
  defaultOutcome: "FREE",
  successors: [{ planKey: "PRO_STUDENT", rank: 1 }],
  noticeScheduleDays: [60, 30, 7, 1],
  channels: ["EMAIL", "IN_APP"],
  reason: "Pro v1 is replaced by Pro v3",
  confirmPlanKey: "PRO",
};

describe("retirement BFF", () => {
  it("lists with only the known filters", async () => {
    serverApiFetch.mockResolvedValue(json([]));
    await list(req("/api/admin/retirements?planKey=PRO&status=NOTICING&evil=1", "GET"));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/retirements?planKey=PRO&status=NOTICING");
  });

  it("start keeps to the known fields and forwards the body", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 7 }, 201));
    expect((await start(req("/api/admin/retirements", "POST", { ...START, evil: 1 }))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    expect((await start(req("/api/admin/retirements", "POST", START))).status).toBe(201);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/retirements");
    expect(JSON.parse(serverApiFetch.mock.calls[0][1].body)).toEqual(START);
  });

  it("passes the API's refusal through in the admin shape", async () => {
    serverApiFetch.mockResolvedValue(json({ detail: "Subscribers must get at least 30 days of notice.", code: "NOTICE_TOO_SHORT" }, 422));
    const res = await start(req("/api/admin/retirements", "POST", START));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "NOTICE_TOO_SHORT", error: "Subscribers must get at least 30 days of notice." });
  });

  it("coverage checks the plan key and the successor list shape", async () => {
    serverApiFetch.mockResolvedValue(json({}));
    expect((await coverage(req("/api/admin/retirements/coverage?planKey=../x", "GET"))).status).toBe(404);
    expect((await coverage(req("/api/admin/retirements/coverage?planKey=PRO&successors=A,../b", "GET"))).status).toBe(400);
    expect((await coverage(req("/api/admin/retirements/coverage?planKey=PRO&successors=PRO_STUDENT,AUTOPILOT&x=1", "GET"))).status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/retirements/coverage?planKey=PRO&successors=PRO_STUDENT%2CAUTOPILOT");
  });

  it("notice preview needs a plan key", async () => {
    serverApiFetch.mockResolvedValue(json({}));
    expect((await noticePreview(req("/api/admin/retirements/notices/preview", "GET"))).status).toBe(404);
    await noticePreview(req("/api/admin/retirements/notices/preview?planKey=PRO&outcome=FREE", "GET"));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/retirements/notices/preview?planKey=PRO&outcome=FREE");
  });

  it("detail, items and the row actions validate the ids", async () => {
    serverApiFetch.mockResolvedValue(json({}));
    expect((await detail(req("/x", "GET"), ctx({ id: "abc" }))).status).toBe(404);
    await detail(req("/x", "GET"), ctx({ id: "7" }));
    await items(req("/x?status=PENDING&interval=MONTH&evil=1&page=2", "GET"), ctx({ id: "7" }));
    expect(serverApiFetch.mock.calls[1][0]).toBe("/api/admin/retirements/7/items?status=PENDING&interval=MONTH&page=2");
    expect((await resend(req("/x", "POST"), ctx({ id: "7", itemId: "../1" }))).status).toBe(404);
    await resend(req("/x", "POST"), ctx({ id: "7", itemId: "7000" }));
    expect(serverApiFetch.mock.calls[2][0]).toBe("/api/admin/retirements/7/items/7000/resend");
    expect((await exclude(req("/x", "POST", { reason: "r", extra: 1 }), ctx({ id: "7", itemId: "7000" }))).status).toBe(400);
  });

  it("cancel takes the reason and the typed key only; close takes the reason only", async () => {
    serverApiFetch.mockResolvedValue(json({}));
    expect((await cancel(req("/x", "POST", { reason: "r", confirmPlanKey: "PRO", x: 1 }), ctx({ id: "7" }))).status).toBe(400);
    expect((await cancel(req("/x", "POST", { reason: "r", confirmPlanKey: "PRO" }), ctx({ id: "7" }))).status).toBe(200);
    expect((await close(req("/x", "POST", { reason: "r", confirmPlanKey: "PRO" }), ctx({ id: "7" }))).status).toBe(400);
    expect((await close(req("/x", "POST", { reason: "r" }), ctx({ id: "7" }))).status).toBe(200);
  });
});
