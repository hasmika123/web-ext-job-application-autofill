import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actOnCanonicalMatch, CANONICAL_SOURCE, canonicalQueryString, fetchCanonicalDetail, fetchCanonicalMatches, parseCanonicalMatches,
} from "./canonical-matches";

const match = (over: Record<string, unknown> = {}) => ({
  id: 11, consultantMemberId: 7, opportunityId: 101, opportunityKind: "JOB_POSTING", title: "Backend Engineer", company: "Acme", location: "Remote",
  url: "https://jobs.example/101", applyUrl: "https://jobs.example/apply/101", sourceLabel: "BOARD_API", score: 91, reason: "Strong Java fit", model: "gpt-test",
  source: "SUGGESTED_AI", status: "SUGGESTED", createdAt: null, updatedAt: null, ...over,
});
const item = (over: Record<string, unknown> = {}) => ({ source: CANONICAL_SOURCE, match: match(), consultant: { memberId: 7, name: "Alex Morgan", role: "Java Developer", primarySkill: "Java", availabilityStatus: "AVAILABLE", availableFrom: null }, ...over });
const reply = (status: number, body: unknown) => vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("canonical marketer match parser", () => {
  it("requires the canonical source and preserves the nested safe view", () => {
    const view = parseCanonicalMatches({ source: CANONICAL_SOURCE, items: [item()], total: 1 });
    expect(view?.source).toBe(CANONICAL_SOURCE);
    expect(view?.items[0]?.consultant.name).toBe("Alex Morgan");
    expect(view?.items[0]?.match.opportunityId).toBe(101);
    expect(parseCanonicalMatches({ source: "REQUIREMENT_MATCH", items: [item()] })).toBeNull();
  });

  it("drops malformed canonical items and normalizes unknown status", () => {
    const view = parseCanonicalMatches({ source: CANONICAL_SOURCE, items: [item({ source: "wrong" }), { source: CANONICAL_SOURCE, match: match({ status: "UNKNOWN" }), consultant: { memberId: 7 } }], total: 4 });
    expect(view?.items).toHaveLength(1);
    expect(view?.items[0]?.match.status).toBe("SUGGESTED");
  });
});

describe("canonical marketer network paths", () => {
  it("encodes only canonical list filters", () => {
    expect(canonicalQueryString({ consultant: "7", status: "SUGGESTED" })).toBe("consultant=7&status=SUGGESTED");
  });

  it("uses source-specific list and detail routes", async () => {
    const f = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(async (input) => {
      const body = String(input).endsWith("/11") ? item() : { source: CANONICAL_SOURCE, items: [item()], total: 1 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", f);
    expect((await fetchCanonicalMatches(2, { consultant: "7" })).kind).toBe("OK");
    expect((await fetchCanonicalDetail(2, 11)).kind).toBe("OK");
    expect(f.mock.calls.map((call) => call[0])).toEqual([
      "/api/orgs/2/mkt/matches/canonical?consultant=7",
      "/api/orgs/2/mkt/matches/canonical/11",
    ]);
  });

  it("uses canonical action routes and preserves lifecycle refusals", async () => {
    const f = reply(409, { error: "That opportunity is closed." });
    vi.stubGlobal("fetch", f);
    expect(await actOnCanonicalMatch(2, 11, "assign")).toEqual({ kind: "CONFLICT", message: "That opportunity is closed." });
    expect(f.mock.calls[0]![0]).toBe("/api/orgs/2/mkt/matches/canonical/11/assign");
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });
});
