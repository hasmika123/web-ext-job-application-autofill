import { afterEach, describe, expect, it, vi } from "vitest";
import { approveWaitingChoices, waitingChoices } from "./chosenResume";
import type { OppRow } from "./opportunities";

const opp = (matchId: number, resume: OppRow["resume"]) => ({ matchId, resume }) as unknown as OppRow;
const mine = (id: number, awaiting: boolean) => ({ id, title: `Resume ${id}`, visibility: "INTERNAL", versionNo: 3, contentHash: awaiting ? "h" + id : null, awaitingMyApproval: awaiting });

afterEach(() => vi.unstubAllGlobals());

/** PINNED-RESUME-BUILD.md: the consultant's Prepare click approves the waiting resumes their marketer chose, exactly the version they were shown. */
describe("approving the resumes a marketer chose", () => {
  it("only waiting choices need the consultant", () => {
    const rows = [opp(1, { orgResumeId: 31, name: "a", state: "NEEDS_APPROVAL", chosenBy: null }), opp(2, { orgResumeId: 30, name: "b", state: "READY", chosenBy: null }), opp(3, null)];
    expect(waitingChoices(rows).map((r) => r.matchId)).toEqual([1]);
  });

  it("approves each waiting resume once, with the version and hash of the consultant's own row", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (!init?.method) return new Response(JSON.stringify({ orgId: 2, generatedAt: "x", me: { consultantId: 1, name: "A" }, tiles: {}, resumes: [mine(31, true), mine(32, false)], resumeStrength: { percent: 0, hasResume: true, checks: [] } }), { status: 200 });
        return new Response(JSON.stringify(mine(31, false)), { status: 200 });
      }),
    );
    const rows = [opp(1, { orgResumeId: 31, name: "a", state: "NEEDS_APPROVAL", chosenBy: null }), opp(2, { orgResumeId: 31, name: "a", state: "NEEDS_APPROVAL", chosenBy: null }), opp(3, { orgResumeId: 32, name: "b", state: "NEEDS_APPROVAL", chosenBy: null })];
    const out = await approveWaitingChoices(2, rows);
    expect(out.ok).toBe(true);
    const approvals = calls.filter((c) => c.url.endsWith("/approve"));
    expect(approvals.map((c) => c.url)).toEqual(["/api/orgs/2/me-workspace/resumes/31/approve"]); // 32 was approved meanwhile: not asked again
  });

  it("nothing to approve calls nothing, and a resume that left the list stops the batch", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ orgId: 2, generatedAt: "x", me: { consultantId: 1, name: "A" }, tiles: {}, resumes: [], resumeStrength: { percent: 0, hasResume: false, checks: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await approveWaitingChoices(2, [opp(1, null)])).toEqual({ ok: true });
    expect(f).not.toHaveBeenCalled();
    const out = await approveWaitingChoices(2, [opp(1, { orgResumeId: 31, name: "a", state: "NEEDS_APPROVAL", chosenBy: null })]);
    expect(out.ok).toBe(false);
  });
});
