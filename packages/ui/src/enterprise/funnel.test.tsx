// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FunnelChart, SourceLogo, funnelWidths } from "./funnel";

afterEach(cleanup);

describe("funnel", () => {
  it("widths are proportional to the first stage and never below the floor", () => {
    expect(funnelWidths([142, 108, 64, 28, 20])).toEqual([100, 76, 45, 28, 28]);
    expect(funnelWidths([0, 0])).toEqual([100, 100]);
  });
  it("names every stage for assistive tech and draws its count", () => {
    const { container, getByRole } = render(<FunnelChart label="Pipeline" stages={[{ key: "a", label: "Review", count: 5 }, { key: "b", label: "Placed", count: 1 }]} />);
    expect(getByRole("img").getAttribute("aria-label")).toBe("Pipeline: Review 5, Placed 1");
    expect(container.querySelectorAll("[data-funnel-stage]")).toHaveLength(2);
  });
  it("SourceLogo falls back to the first letter", () => {
    const { container } = render(<SourceLogo source="Monster" />);
    expect(container.textContent).toBe("M");
  });
});
