import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelightProvider } from "@/lib/onboarding/delight";
import { DEFAULT_BUILDER_CONFIG, DEFAULT_DELIGHT_CONFIG } from "@/lib/resume-builder-config.shared";
import ComboChip, { COMBO_FADE_MS, COMBO_FROM, isComboMilestone } from "./ComboChip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cfg = { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, delight: { ...DEFAULT_DELIGHT_CONFIG } } };
const chip = (count: number) => (
  <DelightProvider config={cfg}>
    <ComboChip count={count} />
  </DelightProvider>
);
const el = () => document.querySelector<HTMLElement>("[data-combo]");

describe("ComboChip", () => {
  it("is hidden below three", () => {
    for (const n of [0, 1, 2]) {
      render(chip(n));
      expect(el()).toBeNull();
      cleanup();
    }
  });

  it("three in a row shows it: aria-hidden, the desktop line and the short phone line, a pop", () => {
    render(chip(3));
    expect(COMBO_FROM).toBe(3);
    expect(el()?.getAttribute("aria-hidden")).toBe("true");
    const [desktop, phone] = [...el()!.children] as HTMLElement[];
    expect(desktop.textContent).toBe("🔥 3 in a row"); // the number is the animated figure between the words
    expect(desktop.className).toContain("hidden sm:inline");
    expect(phone.textContent).toBe("🔥 3");
    expect(phone.className).toContain("sm:hidden");
    expect(el()?.className).toContain("ob-chip-pop");
  });

  it("counts on and pops again by swapping between two identical pop animations (so the number can flip)", () => {
    const { rerender } = render(chip(3));
    const first = el()!;
    expect(first.className).toContain("ob-chip-pop");
    rerender(chip(4));
    expect(el()).toBe(first); // the same element: not remounted
    expect(el()?.className).toContain("ob-chip-pop-b");
    expect(el()?.getAttribute("data-combo")).toBe("4");
    rerender(chip(5));
    expect(el()?.className).toMatch(/ob-chip-pop(?!-)/);
  });

  it("a Skip fades it out over 200 ms with no text and then it is gone", () => {
    const { rerender } = render(chip(4));
    rerender(chip(0));
    expect(el()?.hasAttribute("data-fading")).toBe(true);
    expect(el()?.getAttribute("data-combo")).toBe("4"); // the last figure, never a "0"
    expect(el()?.className).toContain("kiwi-combo-fade");
    expect(el()?.textContent).not.toMatch(/lost|broke|reset|streak/i);
    act(() => void vi.advanceTimersByTime(COMBO_FADE_MS - 10));
    expect(el()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(20));
    expect(el()).toBeNull();
  });

  it("does not come back when the count restarts below three (it counts taps in a row)", () => {
    const { rerender } = render(chip(3));
    rerender(chip(0));
    act(() => void vi.advanceTimersByTime(300));
    rerender(chip(1));
    rerender(chip(2));
    expect(el()).toBeNull();
    rerender(chip(3));
    expect(el()?.getAttribute("data-combo")).toBe("3");
  });

  it("the companion cheers at three and every fifth after", () => {
    expect([2, 3, 4, 5, 7, 8, 9, 12, 13, 18].filter(isComboMilestone)).toEqual([3, 8, 13, 18]);
  });

  it("has no pointer events and never takes part in what is announced", () => {
    render(chip(3));
    expect(el()?.className).toContain("pointer-events-none");
    expect(el()?.querySelector(".sr-only")).toBeNull();
  });
});
