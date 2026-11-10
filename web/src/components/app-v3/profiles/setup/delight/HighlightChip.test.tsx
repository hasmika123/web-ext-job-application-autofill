import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DelightProvider, useDelight } from "@/lib/onboarding/delight";
import { DEFAULT_BUILDER_CONFIG, DEFAULT_DELIGHT_CONFIG } from "@/lib/resume-builder-config.shared";
import HighlightChip from "./HighlightChip";

afterEach(cleanup);

function Chip() {
  const d = useDelight();
  return <HighlightChip rule="number" label={d.copy("highlight.number")} />;
}
const wrap = (copy: Record<string, string | string[]> = {}) => (
  <DelightProvider config={{ ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, delight: { ...DEFAULT_DELIGHT_CONFIG, copy } } }}>
    <Chip />
  </DelightProvider>
);

describe("HighlightChip", () => {
  it("renders the rule's copy as real text (not hidden from a screen reader)", () => {
    render(wrap());
    const chip = screen.getByText("Numbers stand out to recruiters").closest("[data-highlight]")!;
    expect(chip.getAttribute("data-highlight")).toBe("number");
    expect(chip.getAttribute("aria-hidden")).toBeNull();
    expect(chip.closest("[aria-hidden]")).toBeNull();
    // the sparkle beside it is decoration
    expect(chip.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("the admin's override copy wins", () => {
    render(wrap({ "highlight.number": "Big numbers" }));
    expect(screen.getByText("Big numbers")).toBeTruthy();
    expect(screen.queryByText("Numbers stand out to recruiters")).toBeNull();
  });

  it("wraps as a unit: inline-flex, a label that never breaks, never wider than its line, and it pops in", () => {
    render(wrap());
    const chip = document.querySelector<HTMLElement>("[data-highlight]")!;
    for (const c of ["inline-flex", "max-w-full", "rounded-full", "ob-chip-pop", "text-[11.5px]", "font-semibold", "text-accent-deep"]) expect(chip.className).toContain(c);
    expect(screen.getByText("Numbers stand out to recruiters").className).toContain("whitespace-nowrap");
  });
});
