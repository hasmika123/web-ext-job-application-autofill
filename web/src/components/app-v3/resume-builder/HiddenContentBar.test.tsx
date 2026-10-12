import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import capsDoc from "../../../../../packages/ui/src/resume/__fixtures__/caps-doc.json";
import HiddenContentBar, { hiddenChipText, whyHidden } from "./HiddenContentBar";

const doc = capsDoc as unknown as ResumeDocument;
afterEach(cleanup);

describe("HiddenContentBar", () => {
  it("lists what an ATS template hides as chips, with counts and a Why? per chip", () => {
    render(<HiddenContentBar doc={doc} theme={null} caps={ATS_STRICT} />);
    const bar = screen.getByRole("region", { name: "Hidden in this template" });
    expect(bar.textContent).toContain("Hidden in this template:");
    const chips = within(bar).getAllByRole("listitem");
    const text = chips.map((c) => c.textContent ?? "");
    expect(text.some((t) => t.startsWith("photo"))).toBe(true);
    expect(text.some((t) => /italic|underline|links/.test(t))).toBe(true);
    // each chip carries its "Why?" in the tooltip and as its accessible name
    expect(within(bar).getByLabelText(/^photo\. Why: ATS parsers can't read photos$/)).toBeTruthy();
    expect(within(bar).getAllByRole("tooltip", { hidden: true }).length).toBe(chips.length);
  });

  it("renders nothing when the template shows everything (and when the capable template is active again)", () => {
    const { container } = render(<HiddenContentBar doc={doc} theme={null} caps={DESIGN_FREE} />);
    expect(container.firstChild).toBeNull();
  });

  it("notices a stored accent colour only an accent-capable template draws", () => {
    render(<HiddenContentBar doc={doc} theme={{ accent: "#16a34a", _touched: ["accent"] }} caps={ATS_STRICT} />);
    expect(screen.getByLabelText(/^accent colour\. Why: ATS templates are single-colour$/)).toBeTruthy();
  });
});

describe("hidden chips", () => {
  beforeEach(() => undefined);
  it("shows a count only when there is more than one", () => {
    expect(hiddenChipText({ kind: "marks", label: "italic", count: 3 })).toBe("italic (3)");
    expect(hiddenChipText({ kind: "section", label: "Interests", count: 1 })).toBe("Interests");
    expect(hiddenChipText({ kind: "photo", label: "photo" })).toBe("photo");
  });

  it("every kind has a short reason, worded for ATS or not", () => {
    for (const kind of ["photo", "marks", "lists", "section", "custom", "headingOverride", "accent", "font", "pages"] as const) {
      expect(whyHidden(kind, true).length).toBeGreaterThan(5);
      expect(whyHidden(kind, false).length).toBeGreaterThan(5);
    }
    expect(whyHidden("photo", true)).toMatch(/ATS/);
    expect(whyHidden("photo", false)).not.toMatch(/ATS/);
  });
});
