import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTailoring, coveredWith, parseApplied, parseProposal, proposeTailoring, scoreWith, statusText, type TailorProposal } from "./tailor";

const raw = {
  proposalId: 77,
  status: "OK",
  source: { orgResumeId: 31, name: "Anika - Java" },
  jobTitle: "ML Platform Engineer",
  scoreBefore: 50,
  keywords: [{ term: "Java", coveredBefore: true }, { term: "Kubernetes", coveredBefore: false }, { term: "Kafka", coveredBefore: false }, { term: "AWS", coveredBefore: true }],
  changes: [
    { ref: "e0b0", section: "Senior Engineer · Acme", before: "Built APIs", after: "Built APIs on Kubernetes", adds: ["Kubernetes"] },
    { ref: "summary", section: "Summary", before: "x", after: "y", adds: [] },
    { bad: true },
  ],
  additions: ["Kafka", ""],
};

afterEach(() => vi.unstubAllGlobals());

/** MKT-TAILOR-BUILD.md: the proposal the sheet draws, and the score that moves as changes are kept (keyword coverage, no AI). */
describe("marketer tailoring", () => {
  it("reads the proposal and drops what is not the contract", () => {
    const p = parseProposal(raw)!;
    expect(p.proposalId).toBe(77);
    expect(p.changes.map((c) => c.ref)).toEqual(["e0b0", "summary"]);
    expect(p.additions).toEqual(["Kafka"]);
    expect(parseProposal({ status: "OK" })).toBeNull();
    expect(parseProposal({ ...raw, status: "WEIRD" })!.status).toBe("ERROR");
  });

  it("the score is the share of the job's terms covered, and moves with what is kept and ticked", () => {
    const p = parseProposal(raw) as TailorProposal;
    expect(scoreWith(p, new Set(), new Set())).toBe(50);
    expect(scoreWith(p, new Set(["e0b0"]), new Set())).toBe(75);
    expect(scoreWith(p, new Set(["e0b0"]), new Set(["Kafka"]))).toBe(100);
    expect([...coveredWith(p, new Set(["summary"]), new Set())]).toEqual(["Java", "AWS"]);
    expect(scoreWith({ ...p, keywords: [] }, new Set(), new Set())).toBeNull();
  });

  it("says plainly why there is nothing to keep", () => {
    expect(statusText("QUOTA_EXCEEDED", "Anika")).toMatch(/AI budget/);
    expect(statusText("NO_JOB_DESCRIPTION", "Anika")).toMatch(/description/);
    expect(statusText("NOTHING_TO_CHANGE", "Anika")).toMatch(/already fits/);
  });

  it("asks and saves through the board's routes", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.endsWith("/save")) return new Response(JSON.stringify({ orgResumeId: 40, resumeId: 900, name: "Anika - ML", scoreBefore: 50, scoreAfter: 100, skipped: [], notAdded: [], detail: { item: { id: 5 } } }), { status: 200 });
        return new Response(JSON.stringify(raw), { status: 200 });
      }),
    );
    const p = await proposeTailoring(2, 5, 31);
    expect(p.ok && p.value.proposalId).toBe(77);
    expect(calls[0]).toEqual({ url: "/api/orgs/2/mkt/opportunities/5/tailor", body: { orgResumeId: 31 } });
    const a = await applyTailoring(2, 5, 77, ["e0b0"], ["Kafka"], "  Anika - ML  ");
    expect(a.ok && a.value.scoreAfter).toBe(100);
    expect(calls[1]).toEqual({ url: "/api/orgs/2/mkt/opportunities/5/tailor/77/save", body: { keep: ["e0b0"], additions: ["Kafka"], label: "Anika - ML" } });
  });

  it("a refusal carries the server's sentence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "FEATURE_NOT_LICENSED", detail: "Anika's licence doesn't include AI resume tailoring." }), { status: 402 })));
    const r = await proposeTailoring(2, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("FEATURE_NOT_LICENSED");
      expect(r.message).toMatch(/licence/);
    }
    expect(parseApplied({ name: "x" })).toBeNull();
  });
});
