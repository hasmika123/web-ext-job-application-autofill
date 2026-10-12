import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavedTick, { SAVED_TICK_MS, useSavedFlash } from "./SavedTick";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSavedFlash + SavedTick", () => {
  it("shows the tick for its id for the duration, then goes", () => {
    const { result } = renderHook(() => useSavedFlash());
    const view = render(<SavedTick flash={result.current} id="name" />);
    expect(view.container.querySelector("[data-saved-tick]")).toBeNull();

    act(() => result.current.flash("name"));
    view.rerender(<SavedTick flash={result.current} id="name" />);
    const tick = view.container.querySelector("[data-saved-tick]");
    expect(tick?.getAttribute("aria-label")).toBe("Saved");
    expect(tick?.getAttribute("role")).toBe("img");

    act(() => void vi.advanceTimersByTime(SAVED_TICK_MS + 5));
    view.rerender(<SavedTick flash={result.current} id="name" />);
    expect(view.container.querySelector("[data-saved-tick]")).toBeNull();
  });

  it("only the flashed id shows; a new flash moves it", () => {
    const { result } = renderHook(() => useSavedFlash<"a" | "b">());
    act(() => result.current.flash("a"));
    const both = () => (
      <>
        <SavedTick flash={result.current} id="a" />
        <SavedTick flash={result.current} id="b" />
      </>
    );
    const view = render(both());
    expect(view.container.querySelectorAll("[data-saved-tick]")).toHaveLength(1);
    expect(view.container.querySelector('[data-saved-tick="a"]')).not.toBeNull();
    act(() => result.current.flash("b"));
    view.rerender(both());
    expect(view.container.querySelector('[data-saved-tick="b"]')).not.toBeNull();
    expect(view.container.querySelector('[data-saved-tick="a"]')).toBeNull();
  });

  it("flashing the same id again extends the time on screen", () => {
    const { result } = renderHook(() => useSavedFlash());
    act(() => result.current.flash("x"));
    act(() => void vi.advanceTimersByTime(SAVED_TICK_MS - 100));
    act(() => result.current.flash("x"));
    act(() => void vi.advanceTimersByTime(SAVED_TICK_MS - 100));
    expect(result.current.active).toBe("x");
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.active).toBeNull();
  });
});
