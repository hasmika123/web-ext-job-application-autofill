import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BarChart, DonutChart, Sparkline, chartColor, niceMax, shares, sparkPoints } from "./Charts";

afterEach(cleanup);

describe("pure helpers", () => {
  it("niceMax gives a tidy axis at least as high as the data", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(62)).toBe(80);
    expect(niceMax(80)).toBe(80);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(430)).toBe(800);
  });

  it("shares ignore non-positive and non-finite values and sum to 1", () => {
    expect(shares([18, 20, 14, 8, 4])[0]).toBeCloseTo(18 / 64);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([5, NaN, -3, 5])).toEqual([0.5, 0, 0, 0.5]);
  });

  it("sparkPoints needs two real points and keeps a flat series level", () => {
    expect(sparkPoints([3])).toEqual([]);
    expect(sparkPoints([NaN, 2])).toEqual([]);
    const flat = sparkPoints([2, 2, 2]);
    expect(new Set(flat.map((p) => p[1])).size).toBe(1);
    const up = sparkPoints([1, 2, 3]);
    expect(up[0][1]).toBeGreaterThan(up[2][1]); // higher values sit higher (smaller y)
  });

  it("chartColor wraps and only ever returns css variables (no hex)", () => {
    for (let i = -2; i < 12; i++) expect(chartColor(i)).toMatch(/^var\(--/);
  });
});

describe("Sparkline", () => {
  it("draws nothing for one point", () => {
    const { container } = render(<Sparkline values={[4]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
  it("is decorative unless it has a label", () => {
    const { container, rerender } = render(<Sparkline values={[1, 2, 3]} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<Sparkline values={[1, 2, 3]} label="Trend" />);
    expect(screen.getByRole("img", { name: "Trend" })).toBeTruthy();
  });
});

describe("BarChart", () => {
  it("has a text alternative holding every number", () => {
    render(<BarChart label="Applications by month" categories={["Jan", "Feb"]} series={[{ key: "a", label: "Applications", values: [40, 52] }, { key: "i", label: "Interviews", values: [30, 38] }]} />);
    const table = screen.getByRole("table", { name: "Applications by month" });
    expect(within(table).getByRole("row", { name: /Jan 40 30/ })).toBeTruthy();
    expect(within(table).getByRole("row", { name: /Feb 52 38/ })).toBeTruthy();
  });
  it("sizes bars against the axis maximum and says 'no data' for a missing value", () => {
    const { container } = render(<BarChart label="x" categories={["Jan", "Feb"]} series={[{ key: "a", label: "A", values: [40, NaN] }]} />);
    const bar = container.querySelector('[data-bar="a:Jan"]') as HTMLElement;
    expect(bar.style.height).toBe("100%"); // niceMax(40) = 40
    expect((container.querySelector('[data-bar="a:Feb"]') as HTMLElement).style.height).toBe("0px");
    expect(screen.getByText("no data")).toBeTruthy();
  });
});

describe("DonutChart", () => {
  it("names itself with its numbers, shows the total and the percentages", () => {
    render(<DonutChart label="Pipeline" totalLabel="Total applications" slices={[{ key: "n", label: "New", value: 18 }, { key: "r", label: "In Review", value: 20 }]} />);
    expect(screen.getByRole("img", { name: "Pipeline: New 18, In Review 20" })).toBeTruthy();
    expect(screen.getByText("38")).toBeTruthy();
    expect(screen.getByText("47%")).toBeTruthy();
  });
  it("an all-zero donut draws no coloured arc", () => {
    const { container } = render(<DonutChart label="Empty" slices={[{ key: "n", label: "New", value: 0 }]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1); // only the track
  });
});
