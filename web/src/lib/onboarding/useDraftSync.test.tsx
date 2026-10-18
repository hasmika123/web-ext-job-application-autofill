import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import { toDraft } from "@/lib/profile-setup/draft";
import { INITIAL_STATE, readState, reducer, withProgress, type SetupState } from "@/lib/profile-setup/state";
import type { OnboardingStatus } from "./api";
import { MIRROR_KEY, readMirror, writeMirror } from "./mirror";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

const putDraft = vi.fn();
const getOnboarding = vi.fn();
const deleteDraft = vi.fn();
const sendDraftBeacon = vi.fn();
const sendDraftKeepalive = vi.fn();
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  putDraft: (...a: unknown[]) => putDraft(...a),
  getOnboarding: (...a: unknown[]) => getOnboarding(...a),
  deleteDraft: (...a: unknown[]) => deleteDraft(...a),
  sendDraftBeacon: (...a: unknown[]) => sendDraftBeacon(...a),
  sendDraftKeepalive: (...a: unknown[]) => sendDraftKeepalive(...a),
}));

import { OnboardingApiError } from "./api";
import useDraftSync, { CLOCK_SKEW_MS, SAVE_DEBOUNCE_MS, pickDraft, retryDelay, type UseDraftSyncOptions } from "./useDraftSync";

const structured: StructuredResume = {
  summary: "",
  skills: ["Go"],
  experience: [
    { company: "Acme", title: "Engineer", location: "", startDate: "2020", endDate: "Present", current: false, bullets: ["Shipped"] },
    { company: "Globex", title: "Intern", location: "", startDate: "2018", endDate: "2019", current: false, bullets: [] },
  ],
  education: [],
  languages: [],
  projects: [],
};
const bio: ParsedBio = { firstName: "Jane" };
const base = withProgress(reducer(INITIAL_STATE, { type: "parsed", draft: toDraft(structured, bio, [], { valueChars: 500, summaryChars: 2000 }), source: "ai", removed: 0, existing: {} }), true, 2);

const iso = (sec: number) => new Date(Date.UTC(2026, 9, 12, 10, 0, sec)).toISOString();
/** The review state at `cursor` n, stamped at second n (distinct stamps, so each is "a change"). */
const at = (n: number, over: Partial<SetupState> = {}): SetupState => ({ ...base, cursor: n, updatedAt: iso(n), ...over });

const status = (over: Partial<OnboardingStatus> = {}): OnboardingStatus => ({
  status: "NONE",
  persona: null,
  finishedAt: null,
  draft: null,
  card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0, show: true, state: "NOT_STARTED", resurfaced: false },
  completeness: { score: 10, promptBelow: 40, resurfaceBelow: 20 },
  ...over,
});
const draftOf = (state: SetupState, updatedAt: string): OnboardingStatus =>
  status({ status: "DRAFT", draft: { step: state.step, stepsDone: state.stepsDone, stepsTotal: state.stepsTotal, updatedAt, state: JSON.parse(JSON.stringify(state)) } });

const onHydrate = vi.fn();
type Props = Pick<UseDraftSyncOptions, "state" | "server">;
function setup(initial: SetupState, server: OnboardingStatus | null = status()) {
  return renderHook((p: Props) => useDraftSync({ state: p.state, login: "jo", server: p.server, onHydrate }), { initialProps: { state: initial, server } });
}

/** Advance the fake clock and let the promises a timer started settle. */
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T10:30:00.000Z"));
  localStorage.clear();
  sessionStorage.clear();
  for (const f of [track, putDraft, getOnboarding, deleteDraft, sendDraftBeacon, sendDraftKeepalive, onHydrate]) f.mockReset();
  putDraft.mockImplementation(async () => ({ updatedAt: iso(50), expiresAt: iso(59) }));
  deleteDraft.mockResolvedValue(undefined);
  sendDraftBeacon.mockReturnValue(true);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("retryDelay", () => {
  it("2 s growing to 30 s, then doubling up to a 5 minute cap", () => {
    expect([0, 1, 2, 3].map(retryDelay)).toEqual([2000, 5000, 15000, 30000]);
    expect([4, 5, 6].map(retryDelay)).toEqual([60000, 120000, 240000]);
    expect(retryDelay(7)).toBe(300000);
    expect(retryDelay(40)).toBe(300000);
  });
});

describe("useDraftSync: saving", () => {
  it("waits 600 ms after the last change, then PUTs the newest state once, with no base the first time", async () => {
    const h = setup(base);
    await settle();
    expect(h.result.current.ready).toBe(true);
    h.rerender({ state: at(1), server: status() });
    await tick(300);
    h.rerender({ state: at(2), server: status() });
    await tick(300);
    expect(putDraft).not.toHaveBeenCalled(); // the second change restarted the wait
    await tick(SAVE_DEBOUNCE_MS - 300 + 1);
    expect(putDraft).toHaveBeenCalledTimes(1);
    const body = putDraft.mock.calls[0][0];
    expect(body).toMatchObject({ v: 2, step: "review", persona: null, stepsDone: 2, stepsTotal: 7 });
    expect(body.baseUpdatedAt).toBeUndefined();
    expect(body.state.cursor).toBe(2); // the latest wins
    expect(body.state).not.toHaveProperty("prefs"); // never the application answers
    expect(h.result.current.status).toBe("saved");
  });

  it("keeps one PUT in flight, then sends what changed meanwhile with the new base", async () => {
    let release: (v: unknown) => void = () => undefined;
    putDraft.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(putDraft).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toBe("saving");
    h.rerender({ state: at(2), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(putDraft).toHaveBeenCalledTimes(1); // still the first one
    await act(async () => release({ updatedAt: iso(40), expiresAt: iso(59) }));
    await settle();
    expect(putDraft).toHaveBeenCalledTimes(2);
    expect(putDraft.mock.calls[1][0]).toMatchObject({ baseUpdatedAt: iso(40) });
    expect(putDraft.mock.calls[1][0].state.cursor).toBe(2);
  });

  it("writes the local mirror at once on every change (dirty), and again once the server confirmed (clean, with its base)", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    let m = readMirror(localStorage, "jo");
    expect(m).toMatchObject({ base: null, dirty: true });
    expect(m?.state.cursor).toBe(1);
    await tick(SAVE_DEBOUNCE_MS + 1);
    m = readMirror(localStorage, "jo");
    expect(m).toMatchObject({ base: iso(50), dirty: false });
  });

  it("saves nothing before there is something to resume (no parse, no fresh answers)", async () => {
    const h = setup(INITIAL_STATE);
    await settle();
    h.rerender({ state: { ...INITIAL_STATE, path: "upload", updatedAt: iso(3) }, server: status() });
    await tick(SAVE_DEBOUNCE_MS * 3);
    expect(putDraft).not.toHaveBeenCalled();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
    expect(h.result.current.status).toBe("idle");
  });

  it("keeps the self-identification answers out of the mirror, and every answer out of the server body", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1, { prefs: { desiredSalary: "100k", gender: "Woman" } }), server: status() });
    expect(readMirror(localStorage, "jo")?.state.prefs).toEqual({ desiredSalary: "100k" });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(JSON.stringify(putDraft.mock.calls[0][0])).not.toMatch(/Woman|100k/);
  });
});

describe("useDraftSync: leaving the page", () => {
  it("flushes an unsent draft with a beacon when the page is hidden, and does not send it twice", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(sendDraftBeacon).toHaveBeenCalledTimes(1);
    expect(sendDraftBeacon.mock.calls[0][0]).toMatchObject({ v: 2, step: "review" });
    await tick(SAVE_DEBOUNCE_MS * 2);
    expect(putDraft).not.toHaveBeenCalled(); // the pending debounce was cancelled
  });

  it("flushes on pagehide / beforeunload too, falling back to a keepalive fetch when the beacon is refused", async () => {
    sendDraftBeacon.mockReturnValue(false);
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    act(() => void window.dispatchEvent(new Event("beforeunload")));
    expect(sendDraftBeacon).toHaveBeenCalledTimes(1);
    expect(sendDraftKeepalive).toHaveBeenCalledTimes(1);
  });

  it("has nothing to flush when everything is saved", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(sendDraftBeacon).not.toHaveBeenCalled();
  });
});

describe("useDraftSync: offline", () => {
  const down = () => new OnboardingApiError(0, { code: "NETWORK" }, "down");

  it("shows offline, retries 2 s then 5 s later, and recovers to saved (the offline event is tracked once)", async () => {
    putDraft.mockRejectedValueOnce(down()).mockRejectedValueOnce(down());
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(h.result.current).toMatchObject({ status: "offline", reason: "network" });
    expect(track).toHaveBeenCalledWith("onboarding_draft_offline", { retries: 0 });
    expect(readMirror(localStorage, "jo")?.dirty).toBe(true); // kept on this device

    await tick(1900);
    expect(putDraft).toHaveBeenCalledTimes(1);
    await tick(200); // 2 s: the first retry fails again
    expect(putDraft).toHaveBeenCalledTimes(2);
    expect(h.result.current.status).toBe("offline");
    await tick(4800);
    expect(putDraft).toHaveBeenCalledTimes(2);
    await tick(300); // +5 s: the second retry works
    expect(putDraft).toHaveBeenCalledTimes(3);
    expect(h.result.current.status).toBe("saved");
    expect(track.mock.calls.filter((c) => c[0] === "onboarding_draft_offline")).toHaveLength(1);
    expect(readMirror(localStorage, "jo")?.dirty).toBe(false);
  });

  it("retries at once when the browser comes back online, and on Retry", async () => {
    putDraft.mockRejectedValueOnce(down()).mockRejectedValueOnce(down());
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(h.result.current.status).toBe("offline");
    act(() => void window.dispatchEvent(new Event("online")));
    await settle();
    expect(putDraft).toHaveBeenCalledTimes(2); // failed again -> still offline
    expect(h.result.current.status).toBe("offline");
    act(() => h.result.current.retry());
    await settle();
    expect(putDraft).toHaveBeenCalledTimes(3);
    expect(h.result.current.status).toBe("saved");
  });

  it("the browser going offline flips the status; coming back with nothing unsent just says saved", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(h.result.current).toMatchObject({ status: "offline", reason: "network" });
    act(() => void window.dispatchEvent(new Event("online")));
    expect(putDraft).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toBe("saved");
  });

  it("a 5xx is retried like a dead network; a 403 demo login says so and does not retry", async () => {
    putDraft.mockRejectedValueOnce(new OnboardingApiError(502, { error: "bad gateway" }, "x"));
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(h.result.current).toMatchObject({ status: "offline", reason: "server" });
    putDraft.mockReset();
    putDraft.mockRejectedValue(new OnboardingApiError(403, { code: "DEMO_READ_ONLY" }, "demo"));
    await tick(2100);
    expect(h.result.current).toMatchObject({ status: "offline", reason: "demo" });
    await tick(60_000);
    expect(putDraft).toHaveBeenCalledTimes(1); // no more retries for a demo login
  });

  it("a 5xx while the browser itself is offline is still the network", async () => {
    const was = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
    try {
      putDraft.mockRejectedValueOnce(new OnboardingApiError(502, { error: "bad gateway" }, "x"));
      const h = setup(base);
      await settle();
      h.rerender({ state: at(1), server: status() });
      await tick(SAVE_DEBOUNCE_MS + 1);
      expect(h.result.current).toMatchObject({ status: "offline", reason: "network" });
    } finally {
      if (was) Object.defineProperty(Navigator.prototype, "onLine", was);
    }
  });

  it("a refused draft (too large, a value we never store) stays on this device, is reported once, and is tried again on the next change", async () => {
    putDraft.mockRejectedValueOnce(new OnboardingApiError(413, { code: "DRAFT_TOO_LARGE", max: 262144 }, "big"));
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(h.result.current).toMatchObject({ status: "offline", reason: "refused", error: { code: "DRAFT_TOO_LARGE", max: 262144 } });
    await tick(60_000);
    expect(putDraft).toHaveBeenCalledTimes(1);
    act(() => h.result.current.clearError());
    expect(h.result.current.error).toBeNull();
    h.rerender({ state: at(2), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(putDraft).toHaveBeenCalledTimes(2);
    expect(h.result.current.status).toBe("saved");
  });
});

describe("useDraftSync: conflict", () => {
  const conflict = () => new OnboardingApiError(409, { code: "DRAFT_CONFLICT", serverUpdatedAt: iso(55) }, "conflict");
  /** Another device saved: its draft holds a state we never sent. */
  const theirs = at(9, { updatedAt: iso(9), cursor: 1, decisions: { exp0: "skip" } });

  async function conflicted() {
    putDraft.mockRejectedValueOnce(conflict());
    getOnboarding.mockResolvedValue(draftOf(theirs, iso(55)));
    const h = setup(base, draftOf(at(0, { updatedAt: iso(1) }), iso(20)));
    await settle();
    onHydrate.mockClear();
    h.rerender({ state: at(2), server: draftOf(at(0, { updatedAt: iso(1) }), iso(20)) });
    await tick(SAVE_DEBOUNCE_MS + 1);
    return h;
  }

  it("a 409 whose stored draft is someone else's raises the conflict, and nothing is sent until the person chooses", async () => {
    const h = await conflicted();
    expect(h.result.current).toMatchObject({ conflict: true, status: "conflict" });
    h.rerender({ state: at(3), server: status() });
    await tick(SAVE_DEBOUNCE_MS * 3);
    expect(putDraft).toHaveBeenCalledTimes(1);
    expect(readMirror(localStorage, "jo")?.state.cursor).toBe(3); // still kept on this device
  });

  it("Use that: loads the other device's draft, clears the conflict, and the next save builds on it", async () => {
    const h = await conflicted();
    await act(async () => h.result.current.acceptServer());
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(onHydrate.mock.calls[0][0]).toMatchObject({ step: "review", cursor: 1, decisions: { exp0: "skip" } });
    expect(h.result.current).toMatchObject({ conflict: false, status: "saved" });
    expect(track).toHaveBeenCalledWith("onboarding_draft_conflict", { choice: "theirs" });
    expect(readMirror(localStorage, "jo")).toMatchObject({ base: iso(55), dirty: false });
    // the hydrated state is what the wizard now holds: it is not unsent
    h.rerender({ state: onHydrate.mock.calls[0][0] as SetupState, server: status() });
    await tick(SAVE_DEBOUNCE_MS * 2);
    expect(putDraft).toHaveBeenCalledTimes(1);
  });

  it("Keep mine: saves this device's draft over it with force", async () => {
    const h = await conflicted();
    await act(async () => h.result.current.keepMine());
    expect(putDraft).toHaveBeenCalledTimes(2);
    expect(putDraft.mock.calls[1][0]).toMatchObject({ force: true, baseUpdatedAt: iso(55) });
    expect(putDraft.mock.calls[1][0].state.cursor).toBe(2);
    expect(h.result.current).toMatchObject({ conflict: false, status: "saved" });
    expect(track).toHaveBeenCalledWith("onboarding_draft_conflict", { choice: "mine" });
  });

  it("a 409 against our OWN earlier write (a beacon, or an answer we never saw) is not a conflict: it adopts the new base and saves again", async () => {
    // the first PUT lands on the server but its answer is lost; the retry then carries a stale base
    putDraft.mockRejectedValueOnce(new OnboardingApiError(0, { code: "NETWORK" }, "lost")).mockRejectedValueOnce(conflict());
    const sent = at(1);
    getOnboarding.mockResolvedValue(draftOf(sent, iso(33)));
    const h = setup(base);
    await settle();
    h.rerender({ state: sent, server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1); // network failure
    await tick(2100); // retry -> 409 -> our own stamp is stored -> adopt
    await settle();
    expect(h.result.current.conflict).toBe(false);
    expect(putDraft).toHaveBeenCalledTimes(3);
    expect(putDraft.mock.calls[2][0]).toMatchObject({ baseUpdatedAt: iso(33) });
    expect(h.result.current.status).toBe("saved");
  });
});

describe("useDraftSync: load", () => {
  it("opens a server draft, says it came from another device, and tracks onboarding_resumed", async () => {
    const saved = at(2, { updatedAt: new Date(Date.parse("2026-10-12T10:30:00.000Z") - 3 * 3_600_000).toISOString() });
    // the wizard starts on what the server will hand back (in the app the hydrate and the first render are one commit)
    const h = setup(readState(JSON.parse(JSON.stringify(saved)))!, draftOf(saved, iso(20)));
    await settle();
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(onHydrate.mock.calls[0][0]).toMatchObject({ step: "review", cursor: 2 });
    expect(h.result.current.resumed).toEqual({ device: "other", stepsDone: 2, stepsTotal: 7, step: "review" });
    expect(h.result.current.status).toBe("saved");
    expect(track).toHaveBeenCalledWith("onboarding_resumed", { stepsDone: 2, stepsTotal: 7, device: "other", ageHours: 3 });
    await tick(SAVE_DEBOUNCE_MS * 2);
    expect(putDraft).not.toHaveBeenCalled(); // taken from the server: nothing to push
    expect(readMirror(localStorage, "jo")).toMatchObject({ base: iso(20), dirty: false });
  });

  it("with no draft anywhere it just opens (nothing hydrated, nothing tracked)", async () => {
    const h = setup(INITIAL_STATE);
    await settle();
    expect(h.result.current).toMatchObject({ ready: true, resumed: null, status: "idle" });
    expect(onHydrate).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("pushes a newer local copy straight away (the person worked offline)", async () => {
    const local = at(4, { updatedAt: new Date(Date.parse(iso(20)) + 5 * 60_000).toISOString() });
    writeMirror(localStorage, { login: "jo", base: iso(10), dirty: true, state: local });
    const h = setup(base, draftOf(at(1), iso(20)));
    await settle();
    expect(onHydrate.mock.calls[0][0]).toMatchObject({ cursor: 4 });
    expect(h.result.current.resumed?.device).toBe("same");
    // the wizard holds the hydrated state now
    h.rerender({ state: onHydrate.mock.calls[0][0] as SetupState, server: draftOf(at(1), iso(20)) });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(putDraft).toHaveBeenCalledTimes(1);
    expect(putDraft.mock.calls[0][0]).toMatchObject({ baseUpdatedAt: iso(20) });
    expect(putDraft.mock.calls[0][0].state.cursor).toBe(4);
  });

  it("upgrades an old v1 sessionStorage draft once, pushes it, and removes the old key", async () => {
    sessionStorage.setItem(
      "kiwiply.profileSetup.draft.v1",
      JSON.stringify({ v: 1, step: "cards", path: "paste", parsed: base.parsed, fresh: null, decisions: {}, edits: {}, cursor: 1, skills: [], languages: [], identity: {}, prefs: {}, imported: false }),
    );
    const h = setup(INITIAL_STATE);
    await settle();
    expect(sessionStorage.getItem("kiwiply.profileSetup.draft.v1")).toBeNull();
    const hydrated = onHydrate.mock.calls[0][0] as SetupState;
    expect(hydrated).toMatchObject({ v: 2, step: "review", cursor: 1 });
    h.rerender({ state: hydrated, server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(putDraft).toHaveBeenCalledTimes(1);
  });

  it("when the API cannot be reached the flow opens from the local copy, shows offline, and keeps trying", async () => {
    writeMirror(localStorage, { login: "jo", base: iso(10), dirty: true, state: at(3) });
    const h = setup(base, null);
    await settle();
    expect(onHydrate.mock.calls[0][0]).toMatchObject({ cursor: 3 });
    expect(h.result.current).toMatchObject({ ready: true, status: "offline", reason: "server" });
    h.rerender({ state: onHydrate.mock.calls[0][0] as SetupState, server: null });
    await tick(2100);
    expect(putDraft).toHaveBeenCalled();
  });

  it("never offers another login's local copy", async () => {
    writeMirror(localStorage, { login: "someone-else", base: null, dirty: true, state: at(3) });
    setup(INITIAL_STATE);
    await settle();
    expect(onHydrate).not.toHaveBeenCalled();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });
});

describe("useDraftSync: start over and finish", () => {
  it("start over deletes the server draft and the local copy, and the next change is a fresh draft", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    await act(async () => h.result.current.startOver());
    expect(deleteDraft).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
    expect(h.result.current).toMatchObject({ status: "idle", resumed: null, conflict: false });
    h.rerender({ state: at(2), server: status() });
    await tick(SAVE_DEBOUNCE_MS + 1);
    expect(putDraft.mock.calls[1][0].baseUpdatedAt).toBeUndefined();
  });

  it("start over works offline too (the draft expires on its own)", async () => {
    deleteDraft.mockRejectedValue(new OnboardingApiError(0, { code: "NETWORK" }, "down"));
    const h = setup(base);
    await settle();
    await act(async () => h.result.current.startOver());
    expect(h.result.current.status).toBe("idle");
  });

  it("finished stops saving and removes the local copy", async () => {
    const h = setup(base);
    await settle();
    h.rerender({ state: at(1), server: status() });
    expect(localStorage.getItem(MIRROR_KEY)).not.toBeNull();
    act(() => h.result.current.finished());
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
    await tick(SAVE_DEBOUNCE_MS * 3);
    expect(putDraft).not.toHaveBeenCalled();
    h.rerender({ state: at(2), server: status() });
    await tick(SAVE_DEBOUNCE_MS * 3);
    expect(putDraft).not.toHaveBeenCalled();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });
});

describe("pickDraft (DESIGN 7.3)", () => {
  const server = (state: SetupState, updatedAt: string, over: Partial<OnboardingStatus> = {}) => ({ ...draftOf(state, updatedAt), ...over });
  const local = (state: SetupState, base: string | null, dirty = true) => ({ login: "jo", base, dirty, state });
  const readable = (s: SetupState) => readState(JSON.parse(JSON.stringify(s)))!;

  it("nothing anywhere", () => {
    expect(pickDraft({ server: status(), local: null, v1: null }).source).toBe("none");
  });

  it("only the server has one: take it, from another device", () => {
    const r = pickDraft({ server: server(at(2), iso(20)), local: null, v1: null });
    expect(r).toMatchObject({ source: "server", base: iso(20), dirty: false, device: "other" });
  });

  it("only the local copy: use it, and push what the server never confirmed", () => {
    expect(pickDraft({ server: status(), local: local(at(2), null), v1: null })).toMatchObject({ source: "local", base: null, dirty: true, device: "same" });
    expect(pickDraft({ server: status(), local: local(at(2), iso(20), false), v1: null })).toMatchObject({ source: "local", base: iso(20), dirty: false });
  });

  it("local in step with the server (same base): local wins, it may hold unsent changes", () => {
    const r = pickDraft({ server: server(at(1), iso(20)), local: local(at(3), iso(20), true), v1: null });
    expect(r).toMatchObject({ source: "local", base: iso(20), dirty: true, device: "same" });
  });

  it("the very same write on both sides (our own beacon) is in step: nothing to push", () => {
    const r = pickDraft({ server: server(at(3), iso(30)), local: local(at(3), iso(10), true), v1: null });
    expect(r).toMatchObject({ source: "server", base: iso(30), dirty: false, device: "same" });
  });

  it("another device wrote since and local is only slightly newer: the server wins (clock skew favours it)", () => {
    const l = at(3, { updatedAt: new Date(Date.parse(iso(30)) + CLOCK_SKEW_MS - 1000).toISOString() });
    const r = pickDraft({ server: server(at(1, { updatedAt: iso(1) }), iso(30)), local: local(l, iso(10)), v1: null });
    expect(r).toMatchObject({ source: "server", device: "other", base: iso(30), dirty: false });
  });

  it("local newer by more than the skew: local wins and is pushed over the server's draft", () => {
    const l = at(3, { updatedAt: new Date(Date.parse(iso(30)) + CLOCK_SKEW_MS + 1000).toISOString() });
    const r = pickDraft({ server: server(at(1, { updatedAt: iso(1) }), iso(30)), local: local(l, iso(10)), v1: null });
    expect(r).toMatchObject({ source: "local", base: iso(30), dirty: true, device: "same" });
  });

  it("a local copy of a draft that was finished on another device is dropped", () => {
    const r = pickDraft({ server: status({ status: "FINISHED" }), local: local(at(3), iso(10)), v1: null });
    expect(r.source).toBe("none");
    // but a local copy the server never saw (offline run) is still there to push
    expect(pickDraft({ server: status({ status: "FINISHED" }), local: local(at(3), null), v1: null }).source).toBe("local");
  });

  it("a local copy that is not worth resuming is ignored", () => {
    expect(pickDraft({ server: status(), local: local({ ...INITIAL_STATE, updatedAt: iso(1) }, null), v1: null }).source).toBe("none");
  });

  it("an old v1 draft is only used when nothing else exists", () => {
    expect(pickDraft({ server: status(), local: null, v1: readable(at(2)) })).toMatchObject({ source: "v1", dirty: true });
    expect(pickDraft({ server: server(at(1), iso(20)), local: null, v1: readable(at(2)) }).source).toBe("server");
  });

  it("an unreadable server draft is as good as none", () => {
    const bad = status({ status: "DRAFT", draft: { step: "review", stepsDone: 1, stepsTotal: 7, updatedAt: iso(20), state: { v: 1 } } });
    expect(pickDraft({ server: bad, local: local(at(2), iso(10)), v1: null }).source).toBe("local");
  });
});
