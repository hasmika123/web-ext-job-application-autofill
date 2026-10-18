import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseIcon, FolderIcon, StackedBarChart, stackTotals } from "./index";

afterEach(cleanup);

const CATS = ["Apr 21", "Apr 22", "Apr 23"];
const SERIES = [
  { key: "a", label: "LinkedIn", values: [10, 20, 0] },
  { key: "b", label: "Indeed", values: [5, Number.NaN, 30] },
];

describe("StackedBarChart", () => {
  it("stackTotals adds every series per category and ignores non-finite / negative values", () => {
    expect(stackTotals(CATS, SERIES)).toEqual([15, 20, 30]);
    expect(stackTotals(["x"], [{ key: "k", label: "K", values: [-4] }])).toEqual([0]);
  });

  it("draws one stacked column per category with a segment per non-zero series", () => {
    const { container } = render(<StackedBarChart categories={CATS} series={SERIES} label="Openings captured" />);
    expect(container.querySelectorAll("[data-stack]")).toHaveLength(3);
    expect(container.querySelector('[data-segment="a:Apr 21"]')).not.toBeNull();
    expect(container.querySelector('[data-segment="b:Apr 21"]')).not.toBeNull();
    expect(container.querySelector('[data-segment="a:Apr 23"]')).toBeNull(); // zero draws nothing
    expect(container.querySelector('[data-segment="b:Apr 22"]')).toBeNull(); // NaN draws nothing
  });

  it("puts the numbers in a screen-reader table and the legend under the plot", () => {
    render(<StackedBarChart categories={CATS} series={SERIES} label="Openings captured" />);
    const table = screen.getByRole("table", { name: "Openings captured" });
    const apr22 = within(table).getByRole("row", { name: /Apr 22/ }).textContent;
    expect(apr22).toContain("20");
    expect(apr22).toContain("no data");
    expect(screen.getAllByText("LinkedIn").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Indeed").length).toBeGreaterThan(0);
  });

  it("an empty chart still renders its axis without dividing by zero", () => {
    const { container } = render(<StackedBarChart categories={CATS} series={[]} label="Empty" />);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(0);
  });
});

describe("stream icons", () => {
  it("render decorative svgs at the requested size", () => {
    const { container } = render(
      <>
        <DatabaseIcon size={20} />
        <FolderIcon />
      </>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[0].getAttribute("width")).toBe("20");
    expect(svgs[1].getAttribute("width")).toBe("16");
    expect(svgs[0].getAttribute("aria-hidden")).toBe("true");
  });
});
