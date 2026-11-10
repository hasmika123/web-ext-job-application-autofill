import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useReducedMotion, { prefersReducedMotion } from "./useReducedMotion";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A matchMedia stub whose `reduce` answer can be flipped, notifying listeners like the browser does. */
function stubMedia(initial: boolean) {
  let reduce = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() {
      return reduce && q.includes("reduce");
    },
    media: q,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return {
    set(next: boolean) {
      reduce = next;
      act(() => listeners.forEach((fn) => fn()));
    },
    listeners,
  };
}

function Probe() {
  return <p data-testid="probe">{useReducedMotion() ? "still" : "moving"}</p>;
}

describe("useReducedMotion", () => {
  it("is false without matchMedia (and on the server)", () => {
    expect(prefersReducedMotion()).toBe(false);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("moving");
  });

  it("reads prefers-reduced-motion", () => {
    stubMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("still");
  });

  it("follows the OS setting live and lets go of the listener on unmount", () => {
    const media = stubMedia(false);
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("moving");
    media.set(true);
    expect(screen.getByTestId("probe").textContent).toBe("still");
    media.set(false);
    expect(screen.getByTestId("probe").textContent).toBe("moving");
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
