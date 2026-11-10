import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/demo-server", () => ({ demoReadOnly: async () => null }));

import { POST as postRewrite } from "./[id]/ai/rewrite/route";
import { POST as postSummary } from "./[id]/ai/summary/route";
import { GET as getProposals } from "./[id]/ai/proposals/route";
import { POST as postApply } from "../ai/proposals/[pid]/apply/route";
import { POST as postDismiss } from "../ai/proposals/[pid]/dismiss/route";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const post = (body: unknown) => new Request("http://w/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const id = (v: string) => ({ params: Promise.resolve({ id: v }) });
const pid = (v: string) => ({ params: Promise.resolve({ pid: v }) });

afterEach(() => serverApiFetch.mockReset());

describe("resume AI BFF routes (R4.1): thin proxies to Spring", () => {
  it("rewrite forwards only refs, mode and consent, and relays Spring's answer", async () => {
    serverApiFetch.mockResolvedValue(json(200, { status: "ok", proposal: { id: 5, changes: [] } }));
    const res = await postRewrite(post({ refs: ["b_1", 7, "b_2"], mode: "shorter", consent: true, text: "ignore me", userId: 1 }), id("42"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok" });
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/resumes/42/ai/rewrite");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ refs: ["b_1", "b_2"], mode: "shorter", consent: true });
  });

  it("consent is true only when the client says exactly true", async () => {
    serverApiFetch.mockImplementation(async () => json(200, { status: "consentRequired" }));
    await postRewrite(post({ refs: ["b_1"], consent: "yes" }), id("42"));
    expect(JSON.parse(serverApiFetch.mock.calls[0][1]?.body as string).consent).toBe(false);
    await postRewrite(post("not json"), id("42"));
    expect(JSON.parse(serverApiFetch.mock.calls[1][1]?.body as string)).toEqual({ consent: false });
  });

  it("relays 402 PRO_REQUIRED, 429 and 502 verbatim", async () => {
    for (const [status, body] of [
      [402, { code: "PRO_REQUIRED" }],
      [429, { code: "RATE_LIMITED" }],
      [502, { status: "error", error: "Couldn't reach Kiwiply AI right now - try again." }],
    ] as const) {
      serverApiFetch.mockResolvedValueOnce(json(status, body));
      const res = await postRewrite(post({ refs: ["b_1"], consent: true }), id("42"));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual(body);
    }
  });

  it("summary forwards tone and consent", async () => {
    serverApiFetch.mockResolvedValue(json(200, { status: "ok" }));
    await postSummary(post({ tone: "plain", consent: true, refs: ["x"] }), id("42"));
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/resumes/42/ai/summary");
    expect(JSON.parse(init?.body as string)).toEqual({ tone: "plain", consent: true });
  });

  it("proposals reads the resume's open proposals", async () => {
    serverApiFetch.mockResolvedValue(json(200, [{ id: 1, stale: false }]));
    const res = await getProposals(new Request("http://w/x"), id("42"));
    expect(await res.json()).toEqual([{ id: 1, stale: false }]);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/profile/resumes/42/ai/proposals");
  });

  it("apply sends refs and alternative indexes (never text) and passes the new ETag through", async () => {
    serverApiFetch.mockResolvedValue(json(200, { docVersion: 9 }, { etag: '"9"' }));
    const res = await postApply(post({ keep: ["b_1"], alternatives: { b_1: 1, b_2: "x", b_3: 1.5 }, text: "forged" }), pid("5"));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"9"');
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/ai/proposals/5/apply");
    expect(JSON.parse(init?.body as string)).toEqual({ keep: ["b_1"], alternatives: { b_1: 1 } });
  });

  it("apply relays the 409 / 422 / 400 refusals", async () => {
    for (const [status, code] of [
      [409, "PROPOSAL_STALE"],
      [422, "PLACEHOLDER_REMAINS"],
      [400, "KEEP_EMPTY"],
    ] as const) {
      serverApiFetch.mockResolvedValueOnce(json(status, { code }));
      const res = await postApply(post({ keep: [] }), pid("5"));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ code });
    }
  });

  it("dismiss is a bodyless POST that relays the 204", async () => {
    serverApiFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await postDismiss(post(""), pid("5"));
    expect(res.status).toBe(204);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/profile/ai/proposals/5/dismiss");
    expect(init?.method).toBe("POST");
  });

  it("refuses a malformed id without calling Spring, and answers 502 when Spring is down", async () => {
    expect((await postRewrite(post({}), id("abc"))).status).toBe(400);
    expect((await postSummary(post({}), id("1;drop"))).status).toBe(400);
    expect((await getProposals(new Request("http://w/x"), id("x"))).status).toBe(400);
    expect((await postApply(post({}), pid("x"))).status).toBe(400);
    expect((await postDismiss(post(""), pid("x"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await postRewrite(post({ refs: ["b"], consent: true }), id("42"))).status).toBe(502);
  });
});
