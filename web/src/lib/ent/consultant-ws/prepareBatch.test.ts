// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACK_TIMEOUT_MS,
  CONFIRM_TEXT,
  ITEM_LABEL,
  PREPARE_ACK_MESSAGE,
  PREPARE_BATCH_MESSAGE,
  allFinal,
  buildPrepareMessage,
  capsText,
  createPrepareSession,
  fetchPrepareSession,
  fetchPrepareStatus,
  parseCreated,
  parseSession,
  parseStatus,
  prepareBlock,
  prepareLabel,
  sendPrepareBatch,
  skippedText,
  type PrepareItem,
} from "./prepareBatch";

const row = (over: Record<string, unknown> = {}) => ({ status: "NEW" as const, sourceUrl: "https://jobs.example.com/1", allowedActions: ["INTEREST", "REQUEST_INFO", "APPLIED"] as never[], ...over });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("which openings can be ticked, and why not", () => {
  it("an open, linked, undecided opening can", () => {
    expect(prepareBlock(row())).toBeNull();
    expect(prepareBlock(row({ status: "IN_REVIEW" }))).toBeNull();
  });
  it("says why in the consultant's words", () => {
    expect(prepareBlock(row({ status: "DECLINED" }))).toMatch(/Declined/);
    expect(prepareBlock(row({ status: "APPLIED" }))).toMatch(/already applied/);
    expect(prepareBlock(row({ status: "CLOSED" }))).toMatch(/closed/);
    expect(prepareBlock(row({ status: "AWAITING_RESPONSE" }))).toMatch(/marketer's answer/);
    expect(prepareBlock(row({ sourceUrl: null }))).toMatch(/link/);
    expect(prepareBlock(row({ allowedActions: ["RESUME_UPDATE", "DECLINE"] }))).toMatch(/no longer open/);
  });
});

describe("wire parsers", () => {
  it("status: only a body with a boolean enabled counts", () => {
    expect(parseStatus({ enabled: true, maxBatch: 10, remainingToday: 28, remainingMonth: 298, dailyCap: 30, monthlyCap: 300 })).toEqual({ enabled: true, maxBatch: 10, remainingToday: 28, remainingMonth: 298, dailyCap: 30, monthlyCap: 300, reason: null });
    expect(parseStatus({ enabled: false, maxBatch: 0, remainingToday: 0, remainingMonth: 0, dailyCap: 0, monthlyCap: 0, reason: "ORG_OFF" })?.reason).toBe("ORG_OFF");
    expect(parseStatus({ rows: [] })).toBeNull();
    expect(parseStatus(null)).toBeNull();
  });
  it("created: drops malformed jobs, keeps the skipped reasons, allows no session", () => {
    const c = parseCreated({ sessionId: 7, expiresAt: "2026-10-16T12:00:00Z", jobs: [{ matchId: 1, url: "https://x.example/1", title: "A", company: "Co" }, { nope: true }], skipped: [{ matchId: 2, reason: "NO_URL" }], remainingToday: 29, remainingMonth: 299 });
    expect(c?.jobs).toEqual([{ matchId: 1, url: "https://x.example/1", title: "A", company: "Co" }]);
    expect(c?.skipped).toEqual([{ matchId: 2, reason: "NO_URL" }]);
    expect(parseCreated({ sessionId: null, expiresAt: null, jobs: [], skipped: [], remainingToday: 30, remainingMonth: 300 })?.sessionId).toBeNull();
    expect(parseCreated({})).toBeNull();
  });
  it("session: unknown states fall back to Waiting", () => {
    const s = parseSession({ sessionId: 7, expiresAt: null, items: [{ matchId: 1, url: "https://x.example/1", title: "A", company: null, state: "FILLED", detail: "ok", applied: true, updatedAt: "t" }, { matchId: 2, url: "https://x.example/2", title: "B", state: "WEIRD" }, { matchId: "x" }] });
    expect(s?.items).toHaveLength(2);
    expect(s?.items[0]).toMatchObject({ state: "FILLED", applied: true, detail: "ok" });
    expect(s?.items[1]?.state).toBe("WAITING");
    expect(parseSession({ items: [] })).toBeNull();
  });
  it("labels every state the panel shows", () => {
    expect(Object.values(ITEM_LABEL).map((l) => l.label)).toEqual(["Waiting", "Opened", "Filled", "Needs your input", "Submitted", "Closed", "Could not open"]);
  });
  it("a panel is settled only when every item is final", () => {
    const item = (state: PrepareItem["state"]): PrepareItem => ({ matchId: 1, url: "u", title: "t", company: null, state, detail: null, applied: false, updatedAt: null });
    expect(allFinal([])).toBe(false);
    expect(allFinal([item("SUBMITTED"), item("CLOSED"), item("FAILED")])).toBe(true);
    expect(allFinal([item("SUBMITTED"), item("NEEDS_INPUT")])).toBe(false);
  });
  it("small texts", () => {
    expect(prepareLabel(3)).toBe("Prepare selected (3)");
    expect(capsText({ remainingToday: 28, remainingMonth: 298, maxBatch: 10 })).toBe("Today 28 left · This month 298 left · Up to 10 at a time");
    expect(skippedText("NO_URL")).toMatch(/no job link/);
    expect(skippedText("JOB_NOT_OPEN")).toMatch(/no longer open/);
    expect(skippedText("NOT_ELIGIBLE")).toMatch(/not available/);
    expect(CONFIRM_TEXT).toBe("The browser extension opens each job in a new tab and fills it from your profile. Nothing is submitted for you: you review, fix anything missing and press Submit yourself.");
  });
});

describe("the message to the extension", () => {
  it("has exactly the contract's shape", () => {
    const m = buildPrepareMessage(7, 2, [{ matchId: 1, url: "https://x.example/1", title: "A", company: null }], "https://api.example");
    expect(m).toEqual({ type: "KIWIPLY_PREPARE_BATCH", version: 1, sessionId: "7", apiBase: "https://api.example", orgId: 2, jobs: [{ matchId: 1, url: "https://x.example/1", title: "A", company: null }] });
    expect(PREPARE_BATCH_MESSAGE).toBe("KIWIPLY_PREPARE_BATCH");
    expect(PREPARE_ACK_MESSAGE).toBe("KIWIPLY_PREPARE_ACK");
  });

  const msg = () => buildPrepareMessage(7, 2, [{ matchId: 1, url: "https://x.example/1", title: "A", company: null }], "https://api.example");
  const ack = (data: unknown, origin = window.location.origin) => window.dispatchEvent(new MessageEvent("message", { data, origin, source: window }));

  it("posts to its own origin and resolves true on an acknowledgement for this session", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const p = sendPrepareBatch(msg(), 50);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "KIWIPLY_PREPARE_BATCH", sessionId: "7" }), window.location.origin);
    ack({ type: "KIWIPLY_PREPARE_ACK", sessionId: "7", accepted: true });
    await expect(p).resolves.toBe(true);
    post.mockRestore();
  });

  it("ignores another session, another origin and other message types; accepted:false (or ok:false) is a no", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    vi.useFakeTimers();
    const p = sendPrepareBatch(msg(), ACK_TIMEOUT_MS);
    ack({ type: "KIWIPLY_PREPARE_ACK", sessionId: "8", accepted: true });
    ack({ type: "KIWIPLY_PREPARE_ACK", sessionId: 8 });
    ack({ type: "KIWIPLY_PREPARE_ACK", sessionId: 7 }, "https://evil.example");
    ack({ type: "SOMETHING_ELSE", sessionId: 7 });
    window.dispatchEvent(new MessageEvent("message", { data: { type: "KIWIPLY_PREPARE_ACK", sessionId: 7 }, origin: window.location.origin, source: null }));
    ack({ type: "KIWIPLY_PREPARE_ACK", sessionId: "7", accepted: false, reason: "not-connected" });
    await expect(p).resolves.toBe(false);
    post.mockRestore();
  });

  it("gives up after 3 seconds with no acknowledgement", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    vi.useFakeTimers();
    let result: boolean | null = null;
    void sendPrepareBatch(msg()).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS - 1);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(result).toBe(false);
    expect(ACK_TIMEOUT_MS).toBe(3000);
    post.mockRestore();
  });
});

describe("BFF calls", () => {
  let calls: { url: string; init?: RequestInit }[];
  beforeEach(() => {
    calls = [];
  });
  const stub = (res: Response | (() => Response)) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return typeof res === "function" ? res() : res;
      }),
    );

  it("reads the status and the session through the consultant BFF folder", async () => {
    stub(json({ enabled: true, maxBatch: 10, remainingToday: 1, remainingMonth: 2, dailyCap: 3, monthlyCap: 4 }));
    expect((await fetchPrepareStatus(2))?.enabled).toBe(true);
    expect(calls[0]?.url).toBe("/api/orgs/2/consultant/prepare/status");
    stub(json({ sessionId: 9, expiresAt: null, items: [] }));
    expect((await fetchPrepareSession(2, 9))?.sessionId).toBe(9);
    expect(calls[1]?.url).toBe("/api/orgs/2/consultant/prepare/9");
    stub(json({}, 404));
    expect(await fetchPrepareStatus(2)).toBeNull();
    stub(() => {
      throw new Error("offline");
    });
    expect(await fetchPrepareSession(2, 9)).toBeNull();
  });

  it("creates a session with only the ids", async () => {
    stub(json({ sessionId: 9, expiresAt: "t", jobs: [{ matchId: 1, url: "https://x.example/1", title: "A", company: null }], skipped: [], remainingToday: 29, remainingMonth: 299 }));
    const r = await createPrepareSession(2, [1, 2]);
    expect(r.kind).toBe("OK");
    expect(calls[0]?.url).toBe("/api/orgs/2/consultant/prepare");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ matchIds: [1, 2] });
  });

  it("tells a cap refusal, a generic 404 and a failure apart", async () => {
    stub(json({ code: "PREPARE_CAP_REACHED", error: "Over the limit.", remainingToday: 1, remainingMonth: 5 }, 409));
    expect(await createPrepareSession(2, [1, 2])).toEqual({ kind: "CAP", message: "Over the limit.", remainingToday: 1, remainingMonth: 5 });
    stub(json({ error: "Not found." }, 404));
    expect(await createPrepareSession(2, [1])).toEqual({ kind: "DENIED" });
    stub(json({ error: "Too many." }, 400));
    expect(await createPrepareSession(2, [1])).toEqual({ kind: "FAILED", message: "Too many." });
    stub(() => {
      throw new Error("offline");
    });
    expect(await createPrepareSession(2, [1])).toEqual({ kind: "FAILED" });
  });
});
