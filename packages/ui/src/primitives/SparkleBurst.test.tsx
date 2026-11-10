import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SparkleBurst from "./SparkleBurst";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});

const media = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

describe("SparkleBurst", () => {
  it("nothing under reduced motion", () => {
    media(true);
    const { container } = render(<SparkleBurst />);
    expect(container.querySelector("[data-sparkle-burst]")).toBeNull();
  });

  it("plays once: eight pieces (two of them stars), one animation each of 320 ms, 48 px out, scaling and fading to nothing", () => {
    media(false);
    const animate = vi.fn((_k: unknown, _o: unknown) => ({ cancel() {} }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const { container } = render(<SparkleBurst />);
    const host = container.querySelector("[data-sparkle-burst]")!;
    expect(host.children).toHaveLength(8);
    expect(host.querySelectorAll("[data-sparkle=star]")).toHaveLength(2);
    expect(host.querySelectorAll("[data-sparkle=dot]")).toHaveLength(6);
    expect(animate).toHaveBeenCalledTimes(8);
    const [frames, opts] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(opts.duration).toBe(320);
    expect(frames[0]).toMatchObject({ opacity: 1 });
    expect(frames[1]).toMatchObject({ opacity: 0 });
    expect(String(frames[1].transform)).toContain("scale(0)");
    // the first piece goes straight up, 48 px
    expect(String(frames[1].transform)).toContain("-48px");
  });

  it("is decoration: aria-hidden, no pointer events, absolutely positioned (never part of layout)", () => {
    media(false);
    const { container } = render(<SparkleBurst />);
    const host = container.querySelector<HTMLElement>("[data-sparkle-burst]")!;
    expect(host.getAttribute("aria-hidden")).toBe("true");
    for (const c of ["pointer-events-none", "absolute", "h-0", "w-0"]) expect(host.className).toContain(c);
  });

  it("is deterministic: the same angles every time", () => {
    media(false);
    const calls: string[][] = [];
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = vi.fn((k: Keyframe[]) => {
      calls[calls.length - 1].push(String(k[1].transform));
      return { cancel() {} };
    });
    for (let run = 0; run < 2; run++) {
      calls.push([]);
      render(<SparkleBurst />);
      cleanup();
    }
    expect(calls[0]).toEqual(calls[1]);
  });

  it("cancels its animations on unmount", () => {
    media(false);
    const cancel = vi.fn();
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ cancel }));
    const { unmount } = render(<SparkleBurst />);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(8);
  });
});
