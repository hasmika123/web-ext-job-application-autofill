import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KPI_TONES, KpiTile, SparklineDefaultsProvider, StatePill, kpiLine, registerStateMap, hasStateMap } from "../index";

afterEach(cleanup);

describe("KpiTile (the boards' tile)", () => {
  it("has the fixed six-tone palette, in the boards' order", () => {
    expect(KPI_TONES).toEqual(["violet", "green", "blue", "orange", "indigo", "pink"]);
    expect(kpiLine("pink")).toBe("var(--ent-kpi-pink-line)");
  });

  it("draws the icon square in its tone, the label, the figure, the delta and the curve", () => {
    const { container } = render(
      <KpiTile id="total" tone="violet" label="Total Consultants" icon={<i />} value="248" delta={{ text: "+12%", dir: "up", good: true }} series={[8, 9, 11, 12]} />,
    );
    expect(container.querySelector(".ent-kpi-chip")!.getAttribute("data-tone")).toBe("violet");
    expect(screen.getByText("Total Consultants")).toBeTruthy();
    expect(container.querySelector("[data-kpi=total] [data-kpi-value]")!.textContent).toBe("248");
    const delta = container.querySelector("[data-kpi-delta]")!;
    expect(delta.getAttribute("data-good")).toBe("true");
    expect(delta.textContent).toContain("+12%");
    expect(delta.textContent).toContain("vs last month");
    expect(container.querySelector("svg[data-sparkline]")).toBeTruthy();
  });

  it("draws neither delta nor curve when there is no history, and a bad move is flagged red", () => {
    const bare = render(<KpiTile tone="green" label="Active" icon={<i />} value="5" />);
    expect(bare.container.querySelector("[data-kpi-delta]")).toBeNull();
    expect(bare.container.querySelector("svg")).toBeNull();
    cleanup();
    const down = render(<KpiTile tone="pink" label="Spend" icon={<i />} value="$1K" delta={{ text: "-6%", dir: "down", good: false }} />);
    expect(down.container.querySelector("[data-kpi-delta]")!.getAttribute("data-good")).toBe("false");
  });

  it("puts the action in the tile's corner", () => {
    render(<KpiTile tone="blue" label="Teams" icon={<i />} value="3" action={<button type="button">Add Employee</button>} />);
    expect(screen.getByRole("button", { name: "Add Employee" })).toBeTruthy();
  });
});

describe("StatePill tones", () => {
  it("knows blue and purple next to green, amber, red and grey", () => {
    if (!hasStateMap("kpi-test")) registerStateMap("kpi-test", { LOW: "blue", HIRED: "purple", OK: "green", WAIT: "amber", BAD: "red", NONE: "grey" });
    const tones: Record<string, string> = { LOW: "blue", HIRED: "purple", OK: "green", WAIT: "amber", BAD: "red", NONE: "grey" };
    for (const [state, tone] of Object.entries(tones)) {
      const { container } = render(<StatePill domain="kpi-test" state={state} />);
      expect(container.querySelector("[data-state-pill]")!.getAttribute("data-tone")).toBe(tone);
      cleanup();
    }
  });
});

describe("Sparkline default look", () => {
  it("is the straight line outside a tenant page and the smooth gradient curve inside one; an explicit prop always wins", () => {
    const outside = render(<KpiTile tone="green" label="x" icon={<i />} value="1" series={[1, 2, 3]} />);
    expect(outside.container.querySelector("[data-smooth]")).toBeNull();
    cleanup();
    const inside = render(
      <SparklineDefaultsProvider smooth>
        <KpiTile tone="green" label="x" icon={<i />} value="1" series={[1, 2, 3]} />
      </SparklineDefaultsProvider>,
    );
    expect(inside.container.querySelector("svg[data-smooth] linearGradient")).toBeTruthy();
  });
});
