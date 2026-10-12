import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfettiBurst from "./ConfettiBurst";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const media = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

describe("ConfettiBurst", () => {
  it("renders nothing under prefers-reduced-motion", () => {
    media(true);
    const { container } = render(<ConfettiBurst />);
    expect(container.querySelector("[data-confetti]")).toBeNull();
  });

  it("renders the pieces once, hidden from assistive tech, and plays one animation per piece", () => {
    media(false);
    const animate = vi.fn(() => ({ cancel() {} }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const { container } = render(<ConfettiBurst count={10} />);
    const host = container.querySelector("[data-confetti]");
    expect(host?.getAttribute("aria-hidden")).toBe("true");
    expect(host?.children).toHaveLength(10);
    expect(animate).toHaveBeenCalledTimes(10);
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });
});
