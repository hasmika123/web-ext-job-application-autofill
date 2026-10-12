import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveResult } from "@/lib/resume-doc";
import { AUTOSAVE_DELAY_MS, RETRY_DELAYS_MS, createAutosave, type AutosaveOptions } from "./autosave";
import { testDoc } from "./test-doc";

type SaveFn = AutosaveOptions["save"];

/** A save mock whose responses the test controls. */
function setup(responses: Array<SaveResult | (() => Promise<SaveResult>)>, extra: Partial<AutosaveOptions> = {}) {
  const queue = [...responses];
  const save = vi.fn<SaveFn>(async () => {
    const next = queue.shift() ?? { kind: "ok", version: 99, contentHash: null };
    return typeof next === "function" ? next() : next;
  });
  const events = {
    onSaving: vi.fn(),
    onSaved: vi.fn(),
    onRetrying: vi.fn(),
    onConflict: vi.fn(),
    onFailed: vi.fn(),
  };
  const a = createAutosave({ save, version: 1, rev: 0, ...events, ...extra });
  return { a, save, events };
}

const ok = (version: number): SaveResult => ({ kind: "ok", version, contentHash: null });
const snap = (rev: number) => ({ doc: { ...testDoc(), meta: { title: `rev ${rev}` } }, rev });
/** Advance fake time and let promise continuations run. */
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosave: debounce", () => {
  it("saves once, 800 ms after the LAST change, with If-Match = the loaded version", async () => {
    const { a, save, events } = setup([ok(2)]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS - 1);
    a.schedule(snap(2)); // typing resets the timer
    await tick(AUTOSAVE_DELAY_MS - 1);
    a.schedule(snap(3));
    await tick(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await tick(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].version).toBe(1);
    expect(save.mock.calls[0][0].doc.meta.title).toBe("rev 3"); // the latest snapshot, not the first
    expect(events.onSaving).toHaveBeenCalledWith(3);
    expect(events.onSaved).toHaveBeenCalledWith(3, 2);
    expect(a.version).toBe(2);
    expect(a.savedRev).toBe(3);
  });

  it("does nothing for a snapshot the server already has", async () => {
    const { a, save } = setup([]);
    a.schedule(snap(0));
    await tick(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("re-sends against the NEW ETag on the next save", async () => {
    const { a, save } = setup([ok(2), ok(3)]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    a.schedule(snap(2));
    await tick(AUTOSAVE_DELAY_MS);
    expect(save.mock.calls.map((c) => c[0].version)).toEqual([1, 2]);
    expect(a.version).toBe(3);
  });
});

describe("autosave: one request in flight", () => {
  it("a change during a save waits, then saves right after with the updated version", async () => {
    let release!: (r: SaveResult) => void;
    const slow = () => new Promise<SaveResult>((res) => (release = res));
    const { a, save, events } = setup([slow, ok(3)]);

    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);

    a.schedule(snap(2)); // typed while request 1 is out
    await tick(AUTOSAVE_DELAY_MS * 2); // the debounce fires but must not start a parallel PUT
    expect(save).toHaveBeenCalledTimes(1);

    release(ok(2));
    await tick(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ version: 2 });
    expect(save.mock.calls[1][0].doc.meta.title).toBe("rev 2");
    expect(events.onSaved).toHaveBeenLastCalledWith(2, 3);
  });
});

describe("autosave: 409 conflict", () => {
  const serverDoc = { ...testDoc(), meta: { title: "theirs" } };
  const conflict: SaveResult = { kind: "conflict", serverVersion: 5, doc: serverDoc };

  it("pauses, reports the server's document, and stops saving", async () => {
    const { a, save, events } = setup([conflict]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    expect(events.onConflict).toHaveBeenCalledWith(5, serverDoc);
    expect(a.paused).toBe(true);

    a.schedule(snap(2));
    await tick(10_000);
    expect(save).toHaveBeenCalledTimes(1); // nothing more until the user chooses
  });

  it("keep mine: resumes against the server's version and saves my latest document", async () => {
    const { a, save, events } = setup([conflict, ok(6)]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    a.resume(5);
    await tick(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].version).toBe(5);
    expect(save.mock.calls[1][0].doc.meta.title).toBe("rev 1");
    expect(events.onSaved).toHaveBeenCalledWith(1, 6);
    expect(a.paused).toBe(false);
    expect(a.version).toBe(6);
  });

  it("take theirs: adopts the server version/revision and forgets the pending save", async () => {
    const { a, save } = setup([conflict]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    a.reset(5, 2);
    expect(a.version).toBe(5);
    expect(a.savedRev).toBe(2);
    expect(a.paused).toBe(false);

    a.schedule({ doc: serverDoc, rev: 2 }); // the reducer re-publishes the adopted document
    await tick(5000);
    expect(save).toHaveBeenCalledTimes(1);

    a.schedule(snap(3)); // a real edit afterwards saves normally, against version 5
    await tick(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].version).toBe(5);
  });
});

describe("autosave: failures", () => {
  it("network errors retry with backoff until the save lands", async () => {
    const { a, save, events } = setup([{ kind: "network" }, { kind: "network" }, ok(2)]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(events.onRetrying).toHaveBeenLastCalledWith(1, RETRY_DELAYS_MS[0]);

    await tick(RETRY_DELAYS_MS[0] - 1);
    expect(save).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(events.onRetrying).toHaveBeenLastCalledWith(2, RETRY_DELAYS_MS[1]); // backoff grows

    await tick(RETRY_DELAYS_MS[1]);
    expect(save).toHaveBeenCalledTimes(3);
    expect(events.onSaved).toHaveBeenCalledWith(1, 2);
    expect(a.version).toBe(2);
  });

  it("a thrown error counts as a network failure", async () => {
    const { a, events } = setup([() => Promise.reject(new Error("offline"))]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    expect(events.onRetrying).toHaveBeenCalledTimes(1);
  });

  it("the backoff caps at the last delay", async () => {
    const fails = Array.from({ length: RETRY_DELAYS_MS.length + 2 }, () => ({ kind: "network" }) as SaveResult);
    const { a, events } = setup(fails);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    for (const d of RETRY_DELAYS_MS) await tick(d);
    await tick(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    const delays = events.onRetrying.mock.calls.map((c) => c[1]);
    expect(delays.slice(0, RETRY_DELAYS_MS.length)).toEqual([...RETRY_DELAYS_MS]);
    expect(delays[delays.length - 1]).toBe(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
  });

  it("a new edit while waiting to retry restarts the normal debounce and saves the newest document", async () => {
    const { a, save } = setup([{ kind: "network" }, ok(2)]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    a.schedule(snap(2));
    await tick(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].doc.meta.title).toBe("rev 2");
  });

  it("422 / fatal errors are reported, not retried; the next edit tries again", async () => {
    const { a, save, events } = setup([{ kind: "invalid", path: "$.sections[1].items[0].start", message: "must be YYYY or YYYY-MM" }, ok(2)]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    expect(events.onFailed).toHaveBeenCalledWith("$.sections[1].items[0].start: must be YYYY or YYYY-MM", "$.sections[1].items[0].start");
    await tick(60_000);
    expect(save).toHaveBeenCalledTimes(1); // no retry timer

    a.schedule(snap(2));
    await tick(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(events.onSaved).toHaveBeenCalledWith(2, 2);
  });

  it("fatal errors surface their message", async () => {
    const { a, events } = setup([{ kind: "fatal", status: 401, message: "Your session expired — please sign in again." }]);
    a.schedule(snap(1));
    await tick(AUTOSAVE_DELAY_MS);
    expect(events.onFailed).toHaveBeenCalledWith("Your session expired — please sign in again.");
  });
});

describe("autosave: flush and dispose", () => {
  it("flush saves immediately without waiting for the debounce", async () => {
    const { a, save } = setup([ok(2)]);
    a.schedule(snap(1));
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(save).toHaveBeenCalledTimes(1); // the debounce timer was cancelled
  });

  it("dispose cancels pending saves and ignores later calls", async () => {
    const { a, save } = setup([ok(2)]);
    a.schedule(snap(1));
    a.dispose();
    await tick(5000);
    a.schedule(snap(2));
    await tick(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
