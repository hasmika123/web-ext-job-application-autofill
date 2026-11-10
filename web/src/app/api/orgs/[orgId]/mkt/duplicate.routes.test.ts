import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { POST as matchAssign } from "./matches/[id]/assign/route";
import { POST as jobAssign } from "./jobs/[jobId]/assign/route";
import { POST as submissionCreate } from "./submissions/route";

/** The BFF half of the duplicate confirmation (Sprint 2 / B1): the optional fields travel, nothing else does, and the API's refusal reaches the page with its code. */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (url: string, body?: unknown) =>
  new Request(`http://web.test${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const sent = (n = 0) => serverApiFetch.mock.calls[n]![1] as RequestInit;

beforeEach(() => serverApiFetch.mockResolvedValue(json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("POST mkt/matches/{id}/assign", () => {
  const ctx = (orgId: string, id: string) => ({ params: Promise.resolve({ orgId, id }) });

  it("a plain assign goes to the API with no body", async () => {
    const res = await matchAssign(req("/api/orgs/2/mkt/matches/7/assign"), ctx("2", "7"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/mkt/matches/7/assign");
    expect(sent().method).toBe("POST");
    expect(sent().body).toBeUndefined();
  });

  it("the confirmation fields are forwarded as they are", async () => {
    await matchAssign(req("/x", { confirmDuplicate: true, duplicateReason: "Both vendors asked" }), ctx("2", "7"));
    expect(JSON.parse(sent().body as string)).toEqual({ confirmDuplicate: true, duplicateReason: "Both vendors asked" });
    expect((sent().headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("an unknown field, a body that is not an object, and bad ids never reach the API", async () => {
    expect((await matchAssign(req("/x", { status: "ASSIGNED" }), ctx("2", "7"))).status).toBe(400);
    expect((await matchAssign(req("/x", "[1]"), ctx("2", "7"))).status).toBe(400);
    expect((await matchAssign(req("/x", "not json"), ctx("2", "7"))).status).toBe(400);
    expect((await matchAssign(req("/x"), ctx("abc", "7"))).status).toBe(404);
    expect((await matchAssign(req("/x"), ctx("2", "../7"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("the API's duplicate warning reaches the page as { error, code, findings } with its status", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ title: "Conflict", detail: "Duplicate. Confirm with a reason to go ahead.", status: 409, code: "DUPLICATE_WARNING", findings: [{ rule: "SAME_JOB", message: "Same role." }] }, 409));
    const res = await matchAssign(req("/x"), ctx("2", "7"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [{ rule: "SAME_JOB", message: "Same role." }] });
  });
});

describe("POST mkt/jobs/{jobId}/assign", () => {
  const ctx = (orgId: string, jobId: string) => ({ params: Promise.resolve({ orgId, jobId }) });

  it("forwards the consultant, and the confirmation only when both fields are right", async () => {
    await jobAssign(req("/x", { consultantId: 5 }), ctx("2", "3"));
    expect(JSON.parse(sent(0).body as string)).toEqual({ consultantId: 5 });
    await jobAssign(req("/x", { consultantId: 5, confirmDuplicate: true, duplicateReason: "Both vendors asked" }), ctx("2", "3"));
    expect(JSON.parse(sent(1).body as string)).toEqual({ consultantId: 5, confirmDuplicate: true, duplicateReason: "Both vendors asked" });
    await jobAssign(req("/x", { consultantId: 5, confirmDuplicate: "yes", duplicateReason: 7 }), ctx("2", "3"));
    expect(JSON.parse(sent(2).body as string)).toEqual({ consultantId: 5 });
  });

  it("still refuses an unknown field and a missing consultant", async () => {
    expect((await jobAssign(req("/x", { consultantId: 5, status: "ASSIGNED" }), ctx("2", "3"))).status).toBe(400);
    expect((await jobAssign(req("/x", { confirmDuplicate: true, duplicateReason: "x" }), ctx("2", "3"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("POST mkt/submissions", () => {
  const ctx = (orgId: string) => ({ params: Promise.resolve({ orgId }) });

  it("forwards the draft with the confirmation fields", async () => {
    await submissionCreate(req("/x", { consultantId: 1, requirementId: 11, note: "Fits", confirmDuplicate: true, duplicateReason: "Both vendors asked" }), ctx("2"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/mkt/submissions");
    expect(JSON.parse(sent().body as string)).toEqual({ consultantId: 1, requirementId: 11, note: "Fits", confirmDuplicate: true, duplicateReason: "Both vendors asked" });
  });

  it("still refuses a field it does not know", async () => {
    expect((await submissionCreate(req("/x", { consultantId: 1, requirementId: 11, status: "SUBMITTED" }), ctx("2"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("a block reaches the page with its code", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ detail: "Same role. Your organization does not allow this.", code: "DUPLICATE_BLOCKED", findings: [] }, 409));
    const res = await submissionCreate(req("/x", { consultantId: 1, requirementId: 11 }), ctx("2"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Same role. Your organization does not allow this.", code: "DUPLICATE_BLOCKED" });
  });
});
