import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Tooltip, { TOOLTIP_DELAY_MS } from "./Tooltip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const shown = () => document.querySelector("[data-tooltip]");

function setup(props: Partial<React.ComponentProps<typeof Tooltip>> = {}) {
  render(
    <Tooltip content="Bold (Ctrl+B)" {...props}>
      <button type="button" aria-label="Bold">
        B
      </button>
    </Tooltip>,
  );
  return screen.getByRole("button", { name: "Bold" });
}

describe("Tooltip", () => {
  it("shows after the delay on hover, not before, and hides on leave", () => {
    const b = setup();
    fireEvent.pointerEnter(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 50));
    expect(shown()).toBeNull();
    act(() => void vi.advanceTimersByTime(60));
    expect(shown()?.textContent).toBe("Bold (Ctrl+B)");
    fireEvent.pointerLeave(b);
    expect(shown()).toBeNull();
  });

  it("shows on keyboard focus, hides on blur", () => {
    const b = setup();
    fireEvent.focus(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(shown()).not.toBeNull();
    fireEvent.blur(b);
    expect(shown()).toBeNull();
  });

  it("Esc dismisses it", () => {
    const b = setup();
    fireEvent.focus(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(shown()).not.toBeNull();
    fireEvent.keyDown(b, { key: "Escape" });
    expect(shown()).toBeNull();
  });

  it("never opens for a touch pointer", () => {
    const b = setup();
    // jsdom has no PointerEvent: hand React an event that carries the pointer type
    fireEvent(b, Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "touch" }));
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS * 3));
    expect(shown()).toBeNull();
  });

  it("a press closes it and it stays quiet until the pointer leaves", () => {
    const b = setup();
    fireEvent.pointerEnter(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    fireEvent.pointerDown(b);
    expect(shown()).toBeNull();
    fireEvent.pointerEnter(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(shown()).toBeNull();
    fireEvent.pointerLeave(b);
    fireEvent.pointerEnter(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(shown()).not.toBeNull();
  });

  it("marks its trigger wrapper and draws the bubble in the body, outside any clipping parent", () => {
    const b = setup({ side: "left" });
    expect(b.closest("[data-tooltip-trigger]")).not.toBeNull();
    fireEvent.pointerEnter(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(shown()?.parentElement).toBe(document.body);
  });

  it("does nothing when disabled", () => {
    const b = setup({ disabled: true });
    fireEvent.pointerEnter(b);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS * 2));
    expect(shown()).toBeNull();
  });
});
