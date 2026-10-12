import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SwipeCard from "./SwipeCard";

afterEach(cleanup);

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
});
