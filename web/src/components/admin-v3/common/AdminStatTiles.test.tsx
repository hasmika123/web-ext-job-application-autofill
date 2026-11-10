import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminStatTiles from "./AdminStatTiles";
import type { AdminStat } from "./AdminStatTiles";

afterEach(cleanup);

const base: AdminStat = { label: "Total users", value: "112", icon: <span />, tone: "blue" };
const chips = (c: HTMLElement) => c.querySelectorAll("[data-delta]");

describe("AdminStatTiles", () => {
  it("draws a delta chip only when the previous value is a number", () => {
    const { container, rerender } = render(<AdminStatTiles stats={[{ ...base, delta: { value: 112, previous: 100 } }]} />);
    expect(chips(container)).toHaveLength(1);
    expect(screen.getByText("12%")).toBeTruthy();

    rerender(<AdminStatTiles stats={[{ ...base, delta: { value: 112, previous: null } }]} />);
    expect(chips(container)).toHaveLength(0);

    rerender(<AdminStatTiles stats={[{ ...base, delta: { value: 112 } }]} />);
    expect(chips(container)).toHaveLength(0);

    rerender(<AdminStatTiles stats={[base]} />);
    expect(chips(container)).toHaveLength(0);
  });

  it("a previous of 0 is a real number: it reads as '+n', never as an infinite percent", () => {
    const { container } = render(<AdminStatTiles stats={[{ ...base, delta: { value: 5, previous: 0 } }]} />);
    expect(chips(container)).toHaveLength(1);
    expect(screen.getByText("+5")).toBeTruthy();
  });

  it("up is good by default, down is good for lowerIsBetter, flat is neutral", () => {
    const { container } = render(
      <AdminStatTiles
        stats={[
          { ...base, label: "A", delta: { value: 120, previous: 100 } },
          { ...base, label: "B", delta: { value: 120, previous: 100, lowerIsBetter: true } },
          { ...base, label: "C", delta: { value: 100, previous: 100 } },
          { ...base, label: "D", delta: { value: 80, previous: 100, lowerIsBetter: true } },
        ]}
      />,
    );
    const good = [...chips(container)].map((c) => c.getAttribute("data-good"));
    expect(good).toEqual(["true", "false", null, "true"]);
    expect(chips(container)[0].getAttribute("data-delta")).toBe("up");
    expect(chips(container)[3].getAttribute("data-delta")).toBe("down");
  });

  it("points mode compares percentages as a plain difference", () => {
    render(<AdminStatTiles stats={[{ ...base, value: "63%", delta: { value: 63, previous: 60, mode: "points" } }]} />);
    expect(screen.getByText("3 pts")).toBeTruthy();
  });

  it("the delta label rides with the chip only; a caption stands alone", () => {
    const { rerender } = render(<AdminStatTiles stats={[{ ...base, delta: { value: 112, previous: 100, label: "vs previous 30 days" } }]} />);
    expect(screen.getByText("vs previous 30 days")).toBeTruthy();

    rerender(<AdminStatTiles stats={[{ ...base, delta: { value: 112, previous: null, label: "vs previous 30 days" }, caption: "of 12 sources" }]} />);
    expect(screen.queryByText("vs previous 30 days")).toBeNull();
    expect(screen.getByText("of 12 sources")).toBeTruthy();
  });

  it("draws no sparkline (the prop is gone) and shows label and value", () => {
    const { container } = render(<AdminStatTiles stats={[{ ...base, delta: { value: 1, previous: 1 } }]} />);
    expect(container.querySelectorAll("polyline, path[d]")).toHaveLength(0);
    expect(screen.getByText("Total users")).toBeTruthy();
    expect(screen.getByText("112")).toBeTruthy();
  });
});
