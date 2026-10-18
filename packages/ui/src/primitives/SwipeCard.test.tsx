import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SwipeCard from "./SwipeCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const reduce = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

// jsdom has no PointerEvent: a MouseEvent that also carries the pointer fields is enough for the card.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
}

function setup(props: { mouse?: boolean; disabled?: boolean } = {}) {
  const onKeep = vi.fn();
  const onSkip = vi.fn();
  render(
    <SwipeCard aria-label="Engineer" onKeep={onKeep} onSkip={onSkip} {...props}>
      <p>Engineer at Acme</p>
      <button type="button">Inside</button>
      <input aria-label="field" />
    </SwipeCard>,
  );
  return { card: screen.getByRole("group", { name: "Engineer" }), onKeep, onSkip };
}

const drag = (el: Element, from: number, to: number, pointerType = "touch") => {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: from, clientY: 10 });
  fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: to, clientY: 12 });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: to, clientY: 12 });
};

describe("SwipeCard", () => {
  it("a long swipe right keeps and a long swipe left skips", () => {
    const { card, onKeep, onSkip } = setup();
    drag(card, 20, 200);
    expect(onKeep).toHaveBeenCalledTimes(1);
    drag(card, 200, 20);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("a short drag does nothing", () => {
    const { card, onKeep, onSkip } = setup();
    drag(card, 100, 150);
    expect(onKeep).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("ignores a mouse drag unless asked, and never starts on a control inside the card", () => {
    const { card, onKeep } = setup();
    drag(card, 20, 300, "mouse");
    drag(screen.getByRole("button", { name: "Inside" }), 20, 300);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("accepts a mouse drag when mouse is on", () => {
    const { card, onKeep } = setup({ mouse: true });
    drag(card, 20, 300, "mouse");
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("arrow keys on the card keep and skip; arrows inside a field do not", () => {
    const { card, onKeep, onSkip } = setup();
    fireEvent.keyDown(card, { key: "ArrowRight" });
    fireEvent.keyDown(card, { key: "ArrowLeft" });
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "ArrowRight" });
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled", () => {
    const { card, onKeep } = setup({ disabled: true });
    drag(card, 20, 300);
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(onKeep).not.toHaveBeenCalled();
  });

  describe("the game look (stamp / fling)", () => {
    function game(props: { stamp?: boolean; fling?: "keep" | "skip" | null; onFlingEnd?: () => void; keyShortcuts?: string } = {}) {
      const onKeep = vi.fn();
      const onSkip = vi.fn();
      render(
        <SwipeCard aria-label="Engineer" onKeep={onKeep} onSkip={onSkip} {...props}>
          <p>Engineer at Acme</p>
        </SwipeCard>,
      );
      return { card: screen.getByRole("group", { name: "Engineer" }), onKeep, onSkip };
    }

    it("defaults are unchanged: no stamp, no fling attributes, today's shortcuts, no will-change, plain callbacks", () => {
      const { card, onKeep } = game();
      expect(card.getAttribute("data-fling")).toBeNull();
      expect(card.getAttribute("aria-keyshortcuts")).toBe("ArrowRight ArrowLeft");
      expect(card.className).not.toContain("kiwi-fling");
      fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 10 });
      fireEvent.pointerMove(card, { pointerId: 1, pointerType: "touch", clientX: 70, clientY: 10 });
      expect(card.style.willChange).toBe("");
      expect(document.querySelector("[data-stamp]")).toBeNull();
      expect(document.querySelector("[data-swipe-hint]")).not.toBeNull(); // the old pill
      fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 10 });
      expect(onKeep).toHaveBeenCalledWith(undefined);
    });

    it("the stamp renders rotated KEEP ✓ (right) and SKIP (left), tracking the drag, and is hidden from assistive tech", () => {
      const { card } = game({ stamp: true });
      fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 10 });
      fireEvent.pointerMove(card, { pointerId: 1, pointerType: "touch", clientX: 148, clientY: 10 });
      let stamp = document.querySelector<HTMLElement>("[data-stamp]")!;
      expect(stamp.textContent).toBe("Keep ✓");
      expect(stamp.getAttribute("aria-hidden")).toBe("true");
      expect(stamp.getAttribute("data-swipe-hint")).toBe("keep");
      expect(stamp.style.opacity).toBe("0.5"); // 48 of 96 px
      expect(stamp.style.transform).toBe("rotate(12deg)");
      expect(stamp.className).toContain("uppercase");
      expect(stamp.className).toContain("border-[2.5px]");
      expect(stamp.className).toContain("tracking-[.08em]");
      expect(card.style.willChange).toBe("transform"); // only while dragging
      fireEvent.pointerMove(card, { pointerId: 1, pointerType: "touch", clientX: 4, clientY: 10 });
      stamp = document.querySelector<HTMLElement>("[data-stamp]")!;
      expect(stamp.textContent).toBe("Skip");
      expect(stamp.style.transform).toBe("rotate(-12deg)");
      expect(stamp.style.opacity).toBe("1");
      fireEvent.pointerCancel(card, { pointerId: 1, pointerType: "touch" });
      expect(card.style.willChange).toBe("");
    });

    it("release past the threshold flings from where the finger let go instead of snapping back", () => {
      const { card, onKeep, onSkip } = game({ stamp: true });
      fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 10 });
      fireEvent.pointerMove(card, { pointerId: 1, pointerType: "touch", clientX: 160, clientY: 10 });
      fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch", clientX: 160, clientY: 10 });
      expect(onKeep).toHaveBeenCalledWith({ dx: 140 });
      expect(onSkip).not.toHaveBeenCalled();
      expect(card.getAttribute("data-fling")).toBe("keep");
      expect(card.className).toContain("kiwi-fling-right");
      expect(card.style.getPropertyValue("--kiwi-fling-from")).toBe("140");
      expect(card.style.transform).toBe(""); // not snapped back to a drag position either
    });

    it("a short release still snaps back and decides nothing", () => {
      const { card, onKeep, onSkip } = game({ stamp: true });
      fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 10 });
      fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch", clientX: 70, clientY: 10 });
      expect(onKeep).not.toHaveBeenCalled();
      expect(onSkip).not.toHaveBeenCalled();
      expect(card.getAttribute("data-fling")).toBeNull();
    });

    it("the fling prop sets data-fling, shows the stamp at full strength and calls onFlingEnd after 240 ms", () => {
      vi.useFakeTimers();
      const onFlingEnd = vi.fn();
      const { card } = game({ stamp: true, fling: "skip", onFlingEnd });
      expect(card.getAttribute("data-fling")).toBe("skip");
      expect(card.className).toContain("kiwi-fling-left");
      const stamp = document.querySelector<HTMLElement>("[data-stamp]")!;
      expect(stamp.textContent).toBe("Skip");
      expect(stamp.style.opacity).toBe("1");
      act(() => void vi.advanceTimersByTime(239));
      expect(onFlingEnd).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(2));
      expect(onFlingEnd).toHaveBeenCalledTimes(1);
    });

    it("under reduced motion nothing flies or tilts: the stamp appears (opacity only) and the end comes after 120 ms", () => {
      reduce(true);
      vi.useFakeTimers();
      const onFlingEnd = vi.fn();
      const { card } = game({ stamp: true, fling: "keep", onFlingEnd });
      expect(card.className).not.toContain("kiwi-fling");
      expect(card.getAttribute("data-fling")).toBe("keep");
      expect(document.querySelector<HTMLElement>("[data-stamp]")!.style.opacity).toBe("1");
      act(() => void vi.advanceTimersByTime(125));
      expect(onFlingEnd).toHaveBeenCalledTimes(1);
      // and a drag does not move the card
      cleanup();
      const { card: c2 } = game({ stamp: true });
      fireEvent.pointerDown(c2, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 10 });
      fireEvent.pointerMove(c2, { pointerId: 1, pointerType: "touch", clientX: 90, clientY: 10 });
      expect(c2.style.transform).toBe("");
    });

    it("the card advertises the review's keys when asked", () => {
      const { card } = game({ keyShortcuts: "ArrowRight ArrowLeft e z" });
      expect(card.getAttribute("aria-keyshortcuts")).toBe("ArrowRight ArrowLeft e z");
    });

    it("a card that is flying ignores a new touch", () => {
      const { card, onSkip } = game({ stamp: true, fling: "keep" });
      fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 10 });
      fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch", clientX: 0, clientY: 10 });
      expect(onSkip).not.toHaveBeenCalled();
    });
  });
});
