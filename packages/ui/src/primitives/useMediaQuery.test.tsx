import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useMediaQuery from "./useMediaQuery";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe({ query, fallback }: { query: string; fallback?: boolean }) {
  return <p data-testid="out">{String(useMediaQuery(query, fallback))}</p>;
}

describe("useMediaQuery", () => {
  it("uses the fallback where matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Probe query="(max-width: 10px)" fallback />);
    expect(screen.getByTestId("out").textContent).toBe("true");
  });

  it("reads the query and follows changes", () => {
    let on = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (q: string) => ({
      get matches() {
        return on;
      },
      media: q,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));
    render(<Probe query="(max-width: 10px)" />);
    expect(screen.getByTestId("out").textContent).toBe("false");
    on = true;
    act(() => listeners.forEach((fn) => fn()));
    expect(screen.getByTestId("out").textContent).toBe("true");
  });
});
