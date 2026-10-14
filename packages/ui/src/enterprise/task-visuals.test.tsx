import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlarmClockIcon, MiniBars } from "./index";

afterEach(cleanup);

describe("MiniBars", () => {
  it("draws at most the last six bars, scaled to the tallest, with a stub for zero", () => {
    const { container } = render(<MiniBars values={[1, 2, 3, 4, 5, 6, 0, 12]} />);
    const bars = [...container.querySelectorAll("[data-mini-bar]")] as HTMLElement[];
    expect(bars).toHaveLength(6);
    expect(bars[5].style.height).toBe("100%");
    expect(bars[4].style.height).toBe("14%"); // zero is still a visible stub
    expect(bars[0].style.height).toBe("25%"); // 3 / 12
  });

  it("is decorative unless it is given a label, and draws nothing for fewer than two values", () => {
    const { container, rerender } = render(<MiniBars values={[1, 2]} />);
    expect(container.querySelector("[data-mini-bars]")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<MiniBars values={[1, 2]} label="Tasks over the last days" />);
    expect(container.querySelector("[data-mini-bars]")?.getAttribute("role")).toBe("img");
    rerender(<MiniBars values={[5]} />);
    expect(container.querySelector("[data-mini-bars]")).toBeNull();
  });

  it("takes its colour from the caller (currentColor)", () => {
    const { container } = render(<MiniBars values={[1, 2, 3]} className="text-accent" />);
    expect(container.querySelector("[data-mini-bars]")?.className).toContain("text-accent");
    expect(container.querySelector("[data-mini-bar]")?.className).toContain("bg-current");
  });
});

describe("AlarmClockIcon", () => {
  it("is a currentColor svg of the requested size", () => {
    const { container } = render(<AlarmClockIcon size={30} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("30");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });
});
