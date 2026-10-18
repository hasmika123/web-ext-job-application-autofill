import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnimatedNumber from "./AnimatedNumber";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const reduce = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

const srText = (c: HTMLElement) => c.querySelector(".sr-only")?.textContent;
const moving = (c: HTMLElement) => [...c.querySelectorAll("[aria-hidden=true]")].map((e) => e.textContent);

describe("AnimatedNumber", () => {
  it("has the final value as plain text for assistive tech, and the moving digits aria-hidden", () => {
    const { container } = render(<AnimatedNumber value={3} />);
    expect(srText(container)).toBe("3");
    expect(moving(container)).toEqual(["3"]);
    expect(container.firstElementChild?.className).toContain("tabular-nums");
    expect(container.firstElementChild?.className).toContain("overflow-hidden");
  });

  it("flip renders the old and the new figure during the change, then only the new", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AnimatedNumber value={3} />);
    rerender(<AnimatedNumber value={4} />);
    expect(srText(container)).toBe("4"); // assistive tech has the final value at once
    expect(moving(container).sort()).toEqual(["3", "4"]);
    expect(container.querySelector(".kiwi-flip-out")?.textContent).toBe("3");
    expect(container.querySelector(".kiwi-flip-in")?.textContent).toBe("4");
    act(() => void vi.advanceTimersByTime(185));
    expect(moving(container)).toEqual(["4"]);
    expect(container.querySelector(".kiwi-flip-out")).toBeNull();
  });

  it("flip is instant under reduced motion", () => {
    reduce(true);
    const { container, rerender } = render(<AnimatedNumber value={3} />);
    rerender(<AnimatedNumber value={4} />);
    expect(moving(container)).toEqual(["4"]);
    expect(container.querySelector(".kiwi-flip-out")).toBeNull();
    expect(container.querySelector(".kiwi-flip-in")).toBeNull();
  });

  it("countUp starts from 0 (or from) and ends EXACTLY on the value", async () => {
    const { container } = render(<AnimatedNumber value={31} mode="countUp" duration={60} />);
    expect(srText(container)).toBe("31"); // from the first render
    expect(Number(moving(container)[0])).toBeLessThan(31);
    await waitFor(() => expect(moving(container)).toEqual(["31"]));
  });

  it("countUp respects from", async () => {
    const { container } = render(<AnimatedNumber value={20} from={10} mode="countUp" duration={40} />);
    expect(Number(moving(container)[0])).toBeGreaterThanOrEqual(10);
    await waitFor(() => expect(moving(container)).toEqual(["20"]));
  });

  it("is static under reduced motion: countUp shows the final number at once", () => {
    reduce(true);
    const { container } = render(<AnimatedNumber value={31} mode="countUp" duration={800} />);
    expect(moving(container)).toEqual(["31"]);
    expect(srText(container)).toBe("31");
  });
});
