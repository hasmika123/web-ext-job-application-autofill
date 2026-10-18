import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DeltaChip, { deltaOf } from "./DeltaChip";

afterEach(cleanup);

describe("deltaOf", () => {
  it("is null unless both numbers are real", () => {
    expect(deltaOf(10, null)).toBeNull();
    expect(deltaOf(10, undefined)).toBeNull();
    expect(deltaOf(null, 10)).toBeNull();
    expect(deltaOf(NaN, 10)).toBeNull();
    expect(deltaOf(10, Infinity)).toBeNull();
  });

  it("is the percent change from the previous value", () => {
    expect(deltaOf(112, 100)).toEqual({ dir: "up", text: "12%" });
    expect(deltaOf(90, 100)).toEqual({ dir: "down", text: "10%" });
    expect(deltaOf(103, 100)).toEqual({ dir: "up", text: "3%" });
    expect(deltaOf(1035, 1000)).toEqual({ dir: "up", text: "3.5%" });
  });

  it("is flat when nothing moved, and never infinite when the previous value was 0", () => {
    expect(deltaOf(7, 7)).toEqual({ dir: "flat", text: "0%" });
    expect(deltaOf(0, 0)).toEqual({ dir: "flat", text: "0%" });
    expect(deltaOf(12, 0)).toEqual({ dir: "up", text: "+12" });
    expect(deltaOf(0, 3)).toEqual({ dir: "down", text: "100%" });
  });

  it("caps a huge jump", () => {
    expect(deltaOf(100000, 10)).toEqual({ dir: "up", text: "999%+" });
  });

  it("points mode is the plain difference", () => {
    expect(deltaOf(63.5, 60, { mode: "points" })).toEqual({ dir: "up", text: "3.5 pts" });
    expect(deltaOf(58, 60, { mode: "points" })).toEqual({ dir: "down", text: "2 pts" });
    expect(deltaOf(60, 60, { mode: "points" })).toEqual({ dir: "flat", text: "0 pts" });
  });
});

describe("DeltaChip", () => {
  it("up is good by default and bad when lower is better", () => {
    const { rerender } = render(<DeltaChip delta={{ dir: "up", text: "12%" }} />);
    expect(screen.getByText("12%").closest("[data-delta]")?.getAttribute("data-good")).toBe("true");
    rerender(<DeltaChip delta={{ dir: "up", text: "12%" }} lowerIsBetter />);
    expect(screen.getByText("12%").closest("[data-delta]")?.getAttribute("data-good")).toBe("false");
  });

  it("flat is neutral and every chip says its direction to a screen reader", () => {
    render(<DeltaChip delta={{ dir: "flat", text: "0%" }} lowerIsBetter />);
    const chip = screen.getByText("0%").closest("[data-delta]")!;
    expect(chip.getAttribute("data-good")).toBeNull();
    expect(chip.textContent).toContain("No change");
  });
});
