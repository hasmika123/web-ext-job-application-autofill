import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardStack from "./CardStack";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const reduce = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

const root = () => document.querySelector<HTMLElement>("[data-card-stack]")!;
const ghosts = () => [...document.querySelectorAll<HTMLElement>("[data-ghost]")];

describe("CardStack", () => {
  it("renders min(2, left - 1) ghosts: 0, 1 or 2, blank and hidden from assistive tech", () => {
    const { rerender } = render(
      <CardStack ghosts={2} cardKey="a">
        <p>Card</p>
      </CardStack>,
    );
    expect(ghosts()).toHaveLength(2);
    for (const g of ghosts()) {
      expect(g.getAttribute("aria-hidden")).toBe("true");
      expect(g.textContent).toBe(""); // nothing about the next card is in the DOM
    }
    rerender(
      <CardStack ghosts={1} cardKey="a">
        <p>Card</p>
      </CardStack>,
    );
    expect(ghosts()).toHaveLength(1);
    rerender(
      <CardStack ghosts={0} cardKey="a">
        <p>Card</p>
      </CardStack>,
    );
    expect(ghosts()).toHaveLength(0);
  });

  it("reserves pb-5 always, so the stack is the card + 20 px whatever the ghosts", () => {
    const { rerender } = render(
      <CardStack ghosts={2} cardKey="a">
        <p>Card</p>
      </CardStack>,
    );
    expect(root().className).toContain("pb-5");
    expect(root().className).toContain("relative");
    rerender(
      <CardStack ghosts={0} cardKey="a">
        <p>Card</p>
      </CardStack>,
    );
    expect(root().className).toContain("pb-5");
  });

  it("the ghosts are offset and scaled back in place: first .96 / 10 px / .75, second .92 / 20 px / .45", () => {
    render(
      <CardStack ghosts={2} cardKey="a">
        <p>Card</p>
      </CardStack>,
    );
    const [two, one] = ghosts();
    expect(one.getAttribute("data-ghost")).toBe("1");
    expect(one.style.transform).toBe("translateY(10px) scale(.96)");
    expect(one.style.opacity).toBe("0.75");
    expect(two.style.transform).toBe("translateY(20px) scale(.92)");
    expect(two.style.opacity).toBe("0.45");
  });

  it("the live card springs up when the key changes, not on arrival", () => {
    const { rerender } = render(
      <CardStack ghosts={2} cardKey="a">
        <p>A</p>
      </CardStack>,
    );
    const live = () => document.querySelector<HTMLElement>("[data-stack-live]")!;
    expect(live().className).not.toContain("kiwi-stack-in");
    rerender(
      <CardStack ghosts={1} cardKey="b">
        <p>B</p>
      </CardStack>,
    );
    expect(live().className).toContain("kiwi-stack-in");
    expect(ghosts().some((g) => g.className.includes("kiwi-ghost-1-in"))).toBe(true);
  });

  it("the leaving layer is aria-hidden and pointer-events none, carries data-fling, and calls onLeft after 240 ms", () => {
    const onLeft = vi.fn();
    render(
      <CardStack ghosts={1} cardKey="b" leaving={{ key: "a", node: <p>Old card</p>, dir: "keep" }} onLeft={onLeft}>
        <p>New card</p>
      </CardStack>,
    );
    const layer = document.querySelector<HTMLElement>("[data-fling]")!;
    expect(layer.getAttribute("data-fling")).toBe("keep");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).toContain("kiwi-fling-right");
    expect(layer.textContent).toBe("Old card");
    expect(screen.getByText("New card")).toBeTruthy(); // the live card is there from the first frame
    act(() => void vi.advanceTimersByTime(239));
    expect(onLeft).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2));
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("a skip flies left, and a swipe starts from the drag offset", () => {
    render(
      <CardStack ghosts={0} cardKey="b" leaving={{ key: "a", node: <p>Old</p>, dir: "skip", from: -133.4 }}>
        <p>New</p>
      </CardStack>,
    );
    const layer = document.querySelector<HTMLElement>("[data-fling]")!;
    expect(layer.className).toContain("kiwi-fling-left");
    expect(layer.style.getPropertyValue("--kiwi-fling-from")).toBe("-133");
  });

  it("a second decision during the fling replaces the layer and restarts the clock (the first never calls onLeft late)", () => {
    const onLeft = vi.fn();
    const { rerender } = render(
      <CardStack ghosts={1} cardKey="b" leaving={{ key: "a", node: <p>One</p>, dir: "keep" }} onLeft={onLeft}>
        <p>B</p>
      </CardStack>,
    );
    act(() => void vi.advanceTimersByTime(150));
    rerender(
      <CardStack ghosts={0} cardKey="c" leaving={{ key: "b", node: <p>Two</p>, dir: "skip" }} onLeft={onLeft}>
        <p>C</p>
      </CardStack>,
    );
    expect(document.querySelector("[data-fling]")?.textContent).toBe("Two");
    act(() => void vi.advanceTimersByTime(150)); // 300 ms after the first, 150 after the second
    expect(onLeft).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(100));
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("no fling classes under reduced motion: the leaving card is shown still for 120 ms, the incoming one crossfades", () => {
    reduce(true);
    const onLeft = vi.fn();
    const { rerender } = render(
      <CardStack ghosts={1} cardKey="a">
        <p>A</p>
      </CardStack>,
    );
    rerender(
      <CardStack ghosts={0} cardKey="b" leaving={{ key: "a", node: <p>Old</p>, dir: "keep" }} onLeft={onLeft}>
        <p>B</p>
      </CardStack>,
    );
    const layer = document.querySelector<HTMLElement>("[data-fling]")!;
    expect(layer.className).not.toContain("kiwi-fling");
    act(() => void vi.advanceTimersByTime(125));
    expect(onLeft).toHaveBeenCalledTimes(1);
    // the same class carries the crossfade (the CSS picks the 120 ms fade under reduced motion)
    expect(document.querySelector("[data-stack-live]")?.className).toContain("kiwi-stack-in");
    expect(ghosts()).toHaveLength(0);
  });

  it("clears its timer on unmount", () => {
    const { unmount } = render(
      <CardStack ghosts={0} cardKey="b" leaving={{ key: "a", node: <p>Old</p>, dir: "keep" }}>
        <p>B</p>
      </CardStack>,
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("draws an overlay inside its box without taking part in layout", () => {
    render(
      <CardStack ghosts={0} cardKey="a" overlay={<span data-testid="over">x</span>}>
        <p>A</p>
      </CardStack>,
    );
    expect(root().contains(screen.getByTestId("over"))).toBe(true);
  });
});
