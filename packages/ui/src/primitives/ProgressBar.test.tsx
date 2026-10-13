import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ProgressBar from "./ProgressBar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("is a progressbar with a name, a percentage and the text a person hears", () => {
    render(<ProgressBar value={0.4} label="Profile setup" valueText="Step 3 of 7, about 1 minute left" />);
    const bar = screen.getByRole("progressbar", { name: "Profile setup" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("Step 3 of 7, about 1 minute left");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("40%");
  });

  it("falls back to a percentage as its text, and clamps what it is given", () => {
    const { rerender } = render(<ProgressBar value={2} label="x" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("100 percent");
    rerender(<ProgressBar value={-1} label="x" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    rerender(<ProgressBar value={Number.NaN} label="x" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("is 4 px tall with a line under the track for high-contrast mode", () => {
    render(<ProgressBar value={0.5} label="x" />);
    const cls = screen.getByRole("progressbar").className;
    expect(cls).toContain("h-1");
    expect(cls).toContain("shadow-[0_1px_0_var(--color-line)]");
  });
});
