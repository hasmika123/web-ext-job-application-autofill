import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Meter from "./Meter";

afterEach(cleanup);

describe("Meter", () => {
  it("bar: a role=meter with the value and a fill width", () => {
    render(<Meter value={32} label="AI used" />);
    const m = screen.getByRole("meter", { name: "AI used" });
    expect(m.getAttribute("aria-valuenow")).toBe("32");
    expect(m.getAttribute("aria-valuetext")).toBe("32 of 100");
    expect((m.firstElementChild as HTMLElement).style.width).toBe("32%");
  });

  it("ring: the same meter semantics, the percentage in the middle and a dash that follows the value", () => {
    const { container } = render(<Meter variant="ring" value={82} label="Resume score" valueText="82 percent" size={64} />);
    const m = screen.getByRole("meter", { name: "Resume score" });
    expect(m.getAttribute("aria-valuenow")).toBe("82");
    expect(m.getAttribute("aria-valuetext")).toBe("82 percent");
    expect(m.textContent).toBe("82%");
    expect((m as HTMLElement).style.width).toBe("64px");
    expect((m as HTMLElement).style.height).toBe("64px");
    const arc = container.querySelectorAll("circle")[1]!;
    const circumference = 2 * Math.PI * ((64 - 7) / 2);
    expect(Number(arc.getAttribute("stroke-dasharray")!.split(" ")[0])).toBeCloseTo(circumference * 0.82, 3);
  });

  it("ring: clamps, accepts children, never NaN", () => {
    const { rerender } = render(<Meter variant="ring" value={140} label="Score" />);
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("100");
    rerender(
      <Meter variant="ring" value={Number.NaN} label="Score">
        n/a
      </Meter>,
    );
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("meter").textContent).toBe("n/a");
  });
});
