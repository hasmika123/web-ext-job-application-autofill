import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLACEHOLDER,
  applyProposal,
  chosenText,
  dismissProposal,
  hasPlaceholder,
  listOpenProposals,
  modeLabel,
  quotaSentence,
  requestRewrite,
  usageLine,
  type AiChange,
} from "./resume-ai";

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const change = (over: Partial<AiChange> = {}): AiChange => ({ ref: "b_1", section: "Engineer", before: "Led migration", after: "Drove the migration", ...over });

describe("requestRewrite", () => {
  it("POSTs refs, mode and consent, and hands back the result", async () => {
    fetchMock.mockResolvedValue(reply(200, { status: "ok", proposal: { id: 9, task: "rewrite", stale: false, changes: [change()] }, usage: { used: 12, limit: 100 } }));
    const out = await requestRewrite(42, ["b_1", "b_2"], "shorter");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resumes/42/ai/rewrite",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ refs: ["b_1", "b_2"], mode: "shorter", consent: true }) }),
    );
    expect(out).toMatchObject({ kind: "result", result: { status: "ok", proposal: { id: 9 } } });
  });

  it("keeps the refusals that are statuses as results (quota, disabled, nothing to change)", async () => {
    for (const status of ["quotaExceeded", "disabled", "nothingToChange", "consentRequired"]) {
      fetchMock.mockResolvedValueOnce(reply(200, { status }));
      expect(await requestRewrite(1, ["b"], "stronger")).toMatchObject({ kind: "result", result: { status } });
    }
  });

  it("402 is the Pro lock", async () => {
    fetchMock.mockResolvedValue(reply(402, { code: "PRO_REQUIRED" }));
    expect(await requestRewrite(1, ["b"], "stronger")).toEqual({ kind: "locked" });
  });

  it("429, 502 and a dead network are retryable errors with a sentence", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { code: "RATE_LIMITED" }));
    expect(await requestRewrite(1, ["b"], "stronger")).toMatchObject({ kind: "error", status: 429, retry: true });
    fetchMock.mockResolvedValueOnce(reply(502, { status: "error", error: "Couldn't reach Kiwiply AI right now - try again." }));
    expect(await requestRewrite(1, ["b"], "stronger")).toMatchObject({ kind: "error", status: 502, retry: true, message: "Couldn't reach Kiwiply AI right now - try again." });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await requestRewrite(1, ["b"], "stronger")).toMatchObject({ kind: "error", status: 0, retry: true });
  });

  it("401 and 404 are not worth retrying", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, {}));
    expect(await requestRewrite(1, ["b"], "stronger")).toMatchObject({ kind: "error", status: 401, retry: false });
    fetchMock.mockResolvedValueOnce(reply(404, {}));
    expect(await requestRewrite(1, ["b"], "stronger")).toMatchObject({ kind: "error", status: 404, retry: false });
  });
});

describe("applyProposal", () => {
  it("names refs and alternative indexes and returns the document with the ETag as its version", async () => {
    fetchMock.mockResolvedValue(reply(200, { resumeId: 42, docVersion: 3, doc: { sections: [] } }, { etag: '"7"' }));
    const out = await applyProposal(9, ["b_1"], { b_1: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/proposals/9/apply", expect.objectContaining({ body: JSON.stringify({ keep: ["b_1"], alternatives: { b_1: 1 } }) }));
    expect(out).toMatchObject({ kind: "ok", dto: { docVersion: 7 } });
  });

  it("maps each refusal the server defines", async () => {
    const cases: Array<[number, unknown, string]> = [
      [409, { code: "PROPOSAL_STALE" }, "stale"],
      [409, { code: "PROPOSAL_CLOSED" }, "closed"],
      [422, { code: "PLACEHOLDER_REMAINS" }, "placeholder"],
      [400, { code: "KEEP_EMPTY" }, "keepEmpty"],
      [402, { code: "PRO_REQUIRED" }, "locked"],
      [500, { error: "boom" }, "error"],
    ];
    for (const [status, body, kind] of cases) {
      fetchMock.mockResolvedValueOnce(reply(status, body));
      expect((await applyProposal(1, ["b"], {})).kind).toBe(kind);
    }
  });
});

describe("dismiss and list", () => {
  it("dismissProposal POSTs and says whether it worked, never throws", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await dismissProposal(9)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/proposals/9/dismiss", { method: "POST" });
    fetchMock.mockRejectedValueOnce(new Error("x"));
    expect(await dismissProposal(9)).toBe(false);
  });

  it("listOpenProposals is empty on any failure", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, [{ id: 1, task: "rewrite", stale: false, changes: [] }]));
    expect(await listOpenProposals(42)).toHaveLength(1);
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    expect(await listOpenProposals(42)).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error("x"));
    expect(await listOpenProposals(42)).toEqual([]);
  });
});

describe("the little helpers", () => {
  it("chosenText picks the alternative by index (0 = after) and clamps", () => {
    expect(chosenText(change())).toBe("Drove the migration");
    const c = change({ alternatives: ["A one", "A two", "A three"] });
    expect(chosenText(c, 0)).toBe("A one");
    expect(chosenText(c, 2)).toBe("A three");
    expect(chosenText(c, 9)).toBe("A three");
    expect(chosenText(c, -1)).toBe("A one");
  });

  it("finds the placeholder gap whatever its case", () => {
    expect(hasPlaceholder(`Cut costs by ${PLACEHOLDER}`)).toBe(true);
    expect(hasPlaceholder("Cut costs by [ADD A NUMBER]")).toBe(true);
    expect(hasPlaceholder("Cut costs by 30%")).toBe(false);
  });

  it("modeLabel falls back to Stronger", () => {
    expect(modeLabel("formal")).toBe("More formal");
    expect(modeLabel(null)).toBe("Stronger");
  });

  it("says the period budget and the daily cap in plain words", () => {
    expect(quotaSentence({ used: 100, limit: 100, resetsAt: "2026-11-01T00:00:00Z" }, undefined)).toEqual({
      title: "This period's Kiwiply AI is used up",
      body: "It resets November 1. Repeats of things you've already asked are free.",
    });
    expect(quotaSentence(undefined, "daily").title).toBe("That's today's AI rewrites");
    expect(usageLine({ used: 25, limit: 100, resetsAt: "2026-11-01T00:00:00Z", economy: true })).toBe("25% of your Kiwiply AI used · resets November 1 · lighter model now");
    expect(usageLine({ used: 40, limit: 40 }, "daily")).toBe("40 of 40 AI rewrites used today");
    expect(usageLine(undefined)).toBeNull();
  });
});
