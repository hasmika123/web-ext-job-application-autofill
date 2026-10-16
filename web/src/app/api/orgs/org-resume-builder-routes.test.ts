import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (p: string, i?: RequestInit) => serverApiFetch(p, i) }));

import { POST as createForMe } from "./[orgId]/me-workspace/resumes/built/route";
import { POST as approve } from "./[orgId]/me-workspace/resumes/[resumeId]/approve/route";
import { POST as requestChanges } from "./[orgId]/me-workspace/resumes/[resumeId]/request-changes/route";
import { GET as consultants } from "./[orgId]/mkt/resumes/consultants/route";
import { GET as sources } from "./[orgId]/mkt/resumes/consultants/[consultantId]/sources/route";
import { POST as createForConsultant } from "./[orgId]/mkt/resumes/consultants/[consultantId]/built/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const post = (body: unknown) => new Request("http://x.test/", { method: "POST", body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(json({ ok: true }, 201));
});

describe("the tenant-aware BFF of the one Resume Builder", () => {
  it("a consultant's create forwards the personal builder's own body to the organization route, and nothing else", async () => {
    const res = await createForMe(post({ label: "Java", source: { kind: "scratch" } }), ctx({ orgId: "2" }));
    expect(res.status).toBe(201);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/orgs/2/me-workspace/resumes/built");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ label: "Java", source: { kind: "scratch" } });
    const bad = await createForMe(post({ label: "x", consultantId: 5 }), ctx({ orgId: "2" }));
    expect(bad.status).toBe(400);
    expect(serverApiFetch).toHaveBeenCalledTimes(1);
  });

  it("relays the cap and the sensitive-content refusals with their codes (the chooser branches on them)", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ code: "RESUME_LIMIT", detail: "Your organization's license keeps up to 25 resumes", plan: "ORGANIZATION", limit: 25 }, 402));
    const limit = await createForMe(post({}), ctx({ orgId: "2" }));
    expect(limit.status).toBe(402);
    expect(await limit.json()).toMatchObject({ code: "RESUME_LIMIT", plan: "ORGANIZATION", limit: 25, error: expect.stringContaining("25 resumes") });
    serverApiFetch.mockResolvedValueOnce(json({ code: "SENSITIVE_CONTENT", path: "structured.experience[1]", detail: "that looks like a never-collected value" }, 422));
    const sensitive = await createForMe(post({ source: { kind: "upload" } }), ctx({ orgId: "2" }));
    expect(sensitive.status).toBe(422);
    expect(await sensitive.json()).toMatchObject({ code: "SENSITIVE_CONTENT", path: "structured.experience[1]" });
  });

  it("the consultant's approve and send-back go to their own resume routes", async () => {
    await approve(post({ versionNo: 3, contentHash: "abc", extra: "ignored" }), ctx({ orgId: "2", resumeId: "12" }));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/me-workspace/resumes/12/approve");
    expect(JSON.parse(String(serverApiFetch.mock.calls[0][1]?.body))).toEqual({ versionNo: 3, contentHash: "abc" });
    await requestChanges(post({ note: "Please add my 2019 role", versionNo: 3, contentHash: "abc", extra: "ignored" }), ctx({ orgId: "2", resumeId: "12" }));
    const [path, init] = serverApiFetch.mock.calls[1];
    expect(path).toBe("/api/orgs/2/me-workspace/resumes/12/request-changes");
    expect(JSON.parse(String(init?.body))).toEqual({ note: "Please add my 2019 role", versionNo: 3, contentHash: "abc" });
  });

  it("the marketer's picker, sources and act-for create go to the Marketing routes", async () => {
    await consultants(new Request("http://x.test/"), ctx({ orgId: "2" }));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/mkt/resumes/consultants");
    await sources(new Request("http://x.test/"), ctx({ orgId: "2", consultantId: "9" }));
    expect(serverApiFetch.mock.calls[1][0]).toBe("/api/orgs/2/mkt/resumes/consultants/9/sources");
    await createForConsultant(post({ label: "For Casey", source: "scratch" }), ctx({ orgId: "2", consultantId: "9" }));
    const [path, init] = serverApiFetch.mock.calls[2];
    expect(path).toBe("/api/orgs/2/mkt/resumes/consultants/9/built");
    expect(JSON.parse(String(init?.body))).toEqual({ label: "For Casey", source: "scratch" });
  });

  it("ids that are not numbers are a plain 404 and reach nothing", async () => {
    expect((await approve(new Request("http://x.test/", { method: "POST" }), ctx({ orgId: "2", resumeId: "1;drop" }))).status).toBe(404);
    expect((await sources(new Request("http://x.test/"), ctx({ orgId: "x", consultantId: "9" }))).status).toBe(404);
    expect((await createForConsultant(post({}), ctx({ orgId: "2", consultantId: "../9" }))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
