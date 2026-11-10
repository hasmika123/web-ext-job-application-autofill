import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LineChart, spreadBubbles } from "./index";

afterEach(cleanup);

const SERIES = [
  { key: "s", label: "Submissions", values: [70, 90, 142] },
  { key: "i", label: "Interviews", values: [10, 30, 46] },
  { key: "o", label: "Offers", values: [5, 12, Number.NaN] },
];

describe("LineChart", () => {
  it("draws a line per series with enough points and a dot per finite value", () => {
    const { container } = render(<LineChart series={SERIES} xLabels={["Aug", "", "Oct"]} label="Interviews vs Offers" />);
    expect(container.querySelectorAll("[data-line]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-point]")).toHaveLength(8); // the NaN leaves a gap
    expect(container.querySelector('[data-point="o:2"]')).toBeNull();
  });

  it("puts a value bubble at the end of each line (the last finite value)", () => {
    const { container } = render(<LineChart series={SERIES} xLabels={["Aug", "", "Oct"]} label="Interviews vs Offers" />);
    expect(container.querySelector('[data-end-bubble="s"]')?.textContent).toBe("142");
    expect(container.querySelector('[data-end-bubble="i"]')?.textContent).toBe("46");
    expect(container.querySelector('[data-end-bubble="o"]')?.textContent).toBe("12");
  });

  it("names every row of the screen-reader table from rowLabels when the axis is sparse (never 'Point 2')", () => {
    const { container } = render(<LineChart series={SERIES} xLabels={["Aug", "", "Oct"]} rowLabels={["Aug 26", "Sep 30", "Oct 14"]} label="Interviews vs Offers" />);
    const rows = [...container.querySelectorAll("tbody th[scope=row]")].map((th) => th.textContent);
    expect(rows).toEqual(["Aug 26", "Sep 30", "Oct 14"]);
  });

  it("labels the x axis only where a label is given and keeps every number in a screen-reader table", () => {
    const { container } = render(<LineChart series={SERIES} xLabels={["Aug", "", "Oct"]} label="Interviews vs Offers" />);
    expect(screen.getAllByText("Aug").length).toBeGreaterThan(0);
    const table = screen.getByRole("table", { name: "Interviews vs Offers" });
    expect(within(table).getByRole("row", { name: /Oct/ }).textContent).toContain("142");
    expect(within(table).getByRole("row", { name: /Point 2/ }).textContent).toContain("90");
    expect(container.textContent).toContain("no data");
  });

  it("an empty chart renders its axis without dividing by zero", () => {
    const { container } = render(<LineChart series={[]} xLabels={[]} label="Empty" />);
    expect(container.querySelectorAll("[data-line]")).toHaveLength(0);
    expect(container.querySelector("[data-line-chart]")).not.toBeNull();
  });
});

describe("spreadBubbles", () => {
  it("keeps bubbles that are far apart where they are", () => {
    expect(spreadBubbles([20, 100, 160], 20, 190)).toEqual([20, 100, 160]);
  });

  it("pushes close bubbles apart, preserving their order", () => {
    const out = spreadBubbles([100, 104, 108], 26, 190);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(26);
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(26);
    expect(out[0]).toBeLessThan(out[1]);
  });

  it("slides a stack back up when it would pass the bottom edge", () => {
    const out = spreadBubbles([185, 186, 188], 26, 190);
    expect(Math.max(...out)).toBeLessThanOrEqual(190 - 13);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(26);
  });
});
