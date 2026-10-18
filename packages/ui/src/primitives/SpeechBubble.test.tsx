import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SpeechBubble from "./SpeechBubble";

afterEach(cleanup);

const box = () => document.querySelector<HTMLElement>("[data-speech-bubble]")!;

describe("SpeechBubble", () => {
  it("reserves the height: two lines (48 px) by default, one line (18 px) when asked", () => {
    const { rerender } = render(<SpeechBubble>Nice one.</SpeechBubble>);
    expect(box().style.minHeight).toBe("48px");
    rerender(<SpeechBubble reservedLines={1}>Nice one.</SpeechBubble>);
    expect(box().style.minHeight).toBe("18px");
  });

  it("keeps the box when the text swaps, and re-keys the text so the new line crossfades", () => {
    const { rerender } = render(<SpeechBubble>Nice one.</SpeechBubble>);
    const first = screen.getByText("Nice one.");
    expect(first.className).toContain("kiwi-bubble-text");
    const wrapper = box();
    rerender(<SpeechBubble>That&apos;s a keeper.</SpeechBubble>);
    expect(box()).toBe(wrapper); // the same box stays: nothing around it moves
    expect(box().style.minHeight).toBe("48px");
    expect(screen.queryByText("Nice one.")).toBeNull();
    expect(screen.getByText("That's a keeper.")).not.toBe(first); // a new span, so the animation replays
  });

  it("is tinted by default so it reads as the mascot speaking; \"paper\" is the plain white card", () => {
    const { rerender } = render(<SpeechBubble>Hi</SpeechBubble>);
    expect(box().getAttribute("data-tone")).toBe("tint");
    expect(box().className).toContain("bg-accent-soft");
    rerender(<SpeechBubble tone="paper">Hi</SpeechBubble>);
    expect(box().className).toContain("bg-paper");
    expect(box().className).not.toContain("bg-accent-soft");
  });

  it("the tail points where it is told: up, up-right, right", () => {
    const tail = () => document.querySelector<HTMLElement>("[data-speech-tail]")!;
    const { rerender } = render(<SpeechBubble tail="up">Hi</SpeechBubble>);
    expect(tail().className).toContain("left-1/2");
    rerender(<SpeechBubble tail="up-right">Hi</SpeechBubble>);
    expect(tail().className).toContain("right-5");
    rerender(<SpeechBubble tail="right">Hi</SpeechBubble>);
    expect(tail().className).toContain("-right-[6px]");
  });

  it("has no role of its own and a decorative tail; the tail follows the prop", () => {
    const { rerender } = render(<SpeechBubble>Hi</SpeechBubble>);
    expect(box().getAttribute("role")).toBeNull();
    const tail = () => document.querySelector<HTMLElement>("[data-speech-tail]")!;
    expect(tail().getAttribute("aria-hidden")).toBe("true");
    expect(tail().className).toContain("left-5");
    rerender(<SpeechBubble tail="left">Hi</SpeechBubble>);
    expect(tail().className).toContain("top-3");
  });
});
