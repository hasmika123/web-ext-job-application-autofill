import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WeekBarChart } from "./index";

afterEach(cleanup);

const CATS = [["Aug 26", "Sep 1"], ["Sep 2", "Sep 8"]];
const SERIES = [
  { key: "s", label: "Total Submissions", values: [40, 52] },
  { key: "i", label: "Interviews", values: [20, Number.NaN] },
];

describe("WeekBarChart", () => {
  it("draws a bar per series per week and skips non-finite values' height", () => {
    const { container } = render(<WeekBarChart categories={CATS} series={SERIES} label="Submissions by week" />);
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(4);
    expect((container.querySelector('[data-bar="i:1"]') as HTMLElement).style.height).toMatch(/^0/);
  });

  it("shows each week label on two lines", () => {
    const { container } = render(<WeekBarChart categories={CATS} series={SERIES} label="Submissions by week" />);
    const first = container.querySelector('[data-week-label="0"]') as HTMLElement;
    expect(first.children).toHaveLength(2);
    expect(first.children[0].textContent).toBe("Aug 26");
    expect(first.children[1].textContent).toBe("Sep 1");
  });

  it("repeats the numbers in a screen-reader table and the legend above the plot", () => {
    render(<WeekBarChart categories={CATS} series={SERIES} label="Submissions by week" />);
    const table = screen.getByRole("table", { name: "Submissions by week" });
    expect(within(table).getByRole("row", { name: /Aug 26 to Sep 1/ }).textContent).toContain("40");
    expect(within(table).getByRole("row", { name: /Sep 2 to Sep 8/ }).textContent).toContain("no data");
    expect(screen.getAllByText("Total Submissions").length).toBeGreaterThan(0);
  });

  it("an empty chart renders its axis", () => {
    const { container } = render(<WeekBarChart categories={[]} series={[]} label="Empty" />);
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(0);
    expect(container.querySelector("[data-week-bar-chart]")).not.toBeNull();
  });
});
