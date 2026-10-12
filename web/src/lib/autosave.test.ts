import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, useAutosave, USE_AUTOSAVE_DEBOUNCE_MS, type AutosaveResult } from "./autosave";

interface Form {
  name: string;
}

describe("createAutosave<T> (generic)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a plain object once, after the debounce, and adopts the returned version", async () => {
    const save = vi.fn<(req: { doc: Form; version: number }) => Promise<AutosaveResult<Form>>>(async () => ({ kind: "ok", version: 4 }));
    const onSaved = vi.fn();
    const c = createAutosave<Form>({ save, version: 3, delayMs: 100, onSaved });
    c.schedule({ doc: { name: "a" }, rev: 1 });
    c.schedule({ doc: { name: "ab" }, rev: 2 });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ doc: { name: "ab" }, version: 3 });
    expect(c.version).toBe(4);
    expect(onSaved).toHaveBeenCalledWith(2, 4);
  });

  it("an unversioned ok keeps the current version", async () => {
    const c = createAutosave<Form>({ save: async () => ({ kind: "ok" }), version: 7, delayMs: 10 });
    c.schedule({ doc: { name: "x" }, rev: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(c.version).toBe(7);
  });
});

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const ok = async (_v?: Form, _ctx?: { version: number }): Promise<AutosaveResult<Form>> => ({ kind: "ok" });

  it("does not save the loaded value, only later changes, debounced", async () => {
    const save = vi.fn(ok);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 200 }), { initialProps: { v: { name: "a" } } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("saved");

    rerender({ v: { name: "ab" } });
    rerender({ v: { name: "abc" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(199);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ name: "abc" });
    expect(result.current.status).toBe("saved");
    expect(result.current.savedAt).not.toBeNull();
  });

  it("the default debounce is 600 ms", async () => {
    const save = vi.fn(ok);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: { name: "a" } } });
    rerender({ v: { name: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(USE_AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("goes saving -> saved, and reports a failure with a retry that works", async () => {
    let fail = true;
    const save = vi.fn(async (): Promise<AutosaveResult<Form>> => (fail ? { kind: "fatal", message: "Too large" } : { kind: "ok" }));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 50 }), { initialProps: { v: { name: "a" } } });
    rerender({ v: { name: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Too large");

    fail = false;
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("a network failure shows retrying and tries again after the backoff", async () => {
    let calls = 0;
    const save = vi.fn(async (): Promise<AutosaveResult<Form>> => (++calls === 1 ? { kind: "network" } : { kind: "ok" }));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 50 }), { initialProps: { v: { name: "a" } } });
    rerender({ v: { name: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("retrying");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("a conflict pauses, calls onConflict, and keepMine saves against the server's version", async () => {
    const onConflict = vi.fn();
    const seen: number[] = [];
    let first = true;
    const save = vi.fn(async (_v: Form, ctx: { version: number }): Promise<AutosaveResult<Form>> => {
      seen.push(ctx.version);
      if (first) {
        first = false;
        return { kind: "conflict", serverVersion: 9, doc: { name: "theirs" } };
      }
      return { kind: "ok", version: 10 };
    });
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 50, version: 5, onConflict }), {
      initialProps: { v: { name: "a" } },
    });
    rerender({ v: { name: "mine" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("conflict");
    expect(onConflict).toHaveBeenCalledWith(9, { name: "theirs" });

    // further edits while paused are not sent
    rerender({ v: { name: "mine2" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.keepMine();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(seen).toEqual([5, 9]);
    expect(result.current.status).toBe("saved");
  });

  it("takeTheirs drops the pending change and returns to saved", async () => {
    const save = vi.fn(async (): Promise<AutosaveResult<Form>> => ({ kind: "conflict", serverVersion: 2, doc: { name: "t" } }));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 20 }), { initialProps: { v: { name: "a" } } });
    rerender({ v: { name: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    expect(result.current.status).toBe("conflict");
    act(() => result.current.takeTheirs());
    expect(result.current.status).toBe("saved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("enabled=false saves nothing", async () => {
    const save = vi.fn(ok);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 20, enabled: false }), { initialProps: { v: { name: "a" } } });
    rerender({ v: { name: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("unmounting with a change still waiting saves it", async () => {
    const save = vi.fn(ok);
    const { rerender, unmount } = renderHook(({ v }) => useAutosave(v, save, { debounceMs: 5000 }), { initialProps: { v: { name: "a" } } });
    rerender({ v: { name: "b" } });
    expect(save).not.toHaveBeenCalled();
    unmount();
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
