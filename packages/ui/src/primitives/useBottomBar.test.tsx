import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useBottomBar, { BOTTOM_INSET_VAR, bottomInsetOf } from "./useBottomBar";

const root = () => document.documentElement;

/** A bar that `getBoundingClientRect` reports at `top` (jsdom has no layout). */
function Bar({ top, height = 100, position = "sticky" }: { top: number; height?: number; position?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useBottomBar(ref);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el) el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      }}
      data-testid="bar"
      style={{ position }}
    />
  );
}

beforeEach(() => {
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useBottomBar", () => {
  it("publishes how far the stuck bar reaches up from the bottom edge, and marks the page", () => {
    render(<Bar top={700} />);
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("100px");
    expect(root().hasAttribute("data-bottom-bar")).toBe(true);
  });

  it("clears both when the bar goes away", () => {
    const { unmount } = render(<Bar top={700} />);
    unmount();
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("");
    expect(root().hasAttribute("data-bottom-bar")).toBe(false);
  });

  it("a bar that is in the flow (not sticky or fixed, e.g. the footer from `sm` up) covers nothing", () => {
    render(<Bar top={700} position="static" />);
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("");
    expect(root().hasAttribute("data-bottom-bar")).toBe(false);
  });

  it("with two bars the taller reach wins, and the other leaving does not clear it", () => {
    const a = render(<Bar top={740} height={60} />);
    const b = render(<Bar top={680} height={120} position="fixed" />);
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("120px");
    b.unmount();
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("60px");
    a.unmount();
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("");
  });

  it("follows the window: a resize re-measures", async () => {
    const view = render(<Bar top={700} />);
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("100px");
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(root().style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("200px");
    view.unmount();
  });

  it("bottomInsetOf is 0 for a hidden bar and never negative", () => {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.display = "none";
    document.body.append(el);
    expect(bottomInsetOf(el)).toBe(0);
    el.style.display = "block";
    el.getBoundingClientRect = () => ({ top: 900, height: 50 }) as DOMRect; // below the window
    expect(bottomInsetOf(el)).toBe(0);
    el.remove();
  });
});
