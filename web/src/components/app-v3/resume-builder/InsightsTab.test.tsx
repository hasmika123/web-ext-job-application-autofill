import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DEFAULT_THEME, DESIGN_FREE, scoreResume } from "@kiwiply/ui";
import type { ResumeDocument, ResumeScoreReport, TemplateCapabilities } from "@kiwiply/ui";
import InsightsTab, { atsCheckCounts } from "./InsightsTab";
import TipsSheet, { tipGroups } from "./TipsSheet";

afterEach(cleanup);

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/ui/src/resume/__fixtures__");
const doc = (name: string) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8")) as ResumeDocument;
const report = (name: string, caps: TemplateCapabilities = DESIGN_FREE, showPhoto: boolean | null = null): ResumeScoreReport =>
  scoreResume(doc(name), { caps, theme: { ...DEFAULT_THEME, showPhoto }, pages: 1, jobExtract: null, now: "2026-10" });

describe("InsightsTab", () => {
  it("shows the ring, the band copy and the five checklist lines of a strong resume", () => {
    const r = report("score-strong");
    render(<InsightsTab report={r} good onViewTips={() => {}} />);
    const ring = screen.getByRole("meter", { name: "Resume score" });
    expect(ring.getAttribute("aria-valuenow")).toBe("100");
    expect(ring.textContent).toBe("100%");
    expect(screen.getByText("Great match!")).toBeTruthy();
    expect(screen.getByText("Your resume is well-optimized and ready to impress.")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Resume checklist" });
    const lines = within(list).getAllByRole("listitem");
    expect(lines.map((l) => l.getAttribute("data-pass"))).toEqual(["true", "true", "true", "true", "true"]);
    for (const label of ["Clear and compelling summary", "Relevant work experience", "Good use of keywords", "Well-structured format", "Measurable results included"]) {
      expect(within(list).getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Rules-based score — no AI used")).toBeTruthy();
    expect(screen.queryByText(/ATS checks need attention/)).toBeNull();
  });

  it("an empty resume fails every line with the fail labels and the Needs work band", () => {
    const r = report("score-empty");
    render(<InsightsTab report={r} good={false} onViewTips={() => {}} />);
    expect(screen.getByRole("meter", { name: "Resume score" }).textContent).toBe("13%");
    expect(screen.getByText("Needs work")).toBeTruthy();
    for (const label of ["Make your summary clearer", "Add relevant work experience", "Add more keywords", "Fix the structure", "Add more measurable results"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-pass="false"]')).toHaveLength(5);
  });

  it("the mid resume passes the groups the vectors say it passes", () => {
    const r = report("score-mid", DESIGN_FREE, true);
    render(<InsightsTab report={r} good onViewTips={() => {}} />);
    const pass = (id: string) => document.querySelector(`[data-group="${id}"]`)!.getAttribute("data-pass");
    expect([pass("G1"), pass("G2"), pass("G3"), pass("G4"), pass("G5")]).toEqual(["false", "true", "false", "true", "true"]);
    expect(screen.getByText("Good progress")).toBeTruthy();
  });

  it("View tips opens the tips; the ATS line shows only on an ATS template with failures and opens the ATS tips", () => {
    const onViewTips = vi.fn();
    const ats = report("score-mid", ATS_STRICT, true);
    render(<InsightsTab report={ats} good onViewTips={onViewTips} />);
    expect(document.querySelectorAll("[data-group]")).toHaveLength(6); // the sixth line: ATS
    expect(screen.getByText("Fix ATS formatting")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /View tips/ }));
    expect(onViewTips).toHaveBeenCalledWith();
    expect(atsCheckCounts(ats)).toEqual({ failing: 2, total: 5 });
    fireEvent.click(screen.getByText(/ATS checks need attention/));
    expect(onViewTips).toHaveBeenLastCalledWith("G6");
    expect(screen.getByText("2 of 5", { exact: false })).toBeTruthy();
  });

  it("a clean ATS resume has the sixth line passing and no ATS warning", () => {
    render(<InsightsTab report={report("score-strong", ATS_STRICT)} good onViewTips={() => {}} />);
    expect(screen.getByText("ATS-ready formatting")).toBeTruthy();
    expect(screen.queryByText(/ATS checks need attention/)).toBeNull();
  });

  it("announces the score politely, debounced (live region present)", () => {
    render(<InsightsTab report={report("score-strong")} good onViewTips={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("Score 100%");
  });
});

describe("TipsSheet", () => {
  const open = (r: ResumeScoreReport, over: Partial<Parameters<typeof TipsSheet>[0]> = {}) => {
    const onGoTo = vi.fn();
    const onClose = vi.fn();
    render(<TipsSheet open mode="overlay" report={r} only={null} onClose={onClose} onGoTo={onGoTo} {...over} />);
    return { onGoTo, onClose };
  };

  it("lists every failing rule under its group with the tip copy, heaviest first", () => {
    const r = report("score-mid", DESIGN_FREE);
    open(r);
    const dialog = screen.getByRole("dialog", { name: "Tips to improve" });
    expect(within(dialog).getByText("Add a 2–3 sentence summary saying what you do and for whom.")).toBeTruthy();
    expect(within(dialog).getByText("Replace buzzwords (team player, passionate…) with specifics.")).toBeTruthy();
    expect(within(dialog).getByText("Add your LinkedIn or portfolio link.")).toBeTruthy();
    const groups = tipGroups(r);
    expect(groups.map((g) => g.group.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    const g1 = within(dialog).getByRole("region", { name: "Summary" });
    expect(within(g1).getAllByRole("listitem")[0]!.getAttribute("data-rule")).toBe("S1"); // weight 4 first
  });

  it("Go to hands the rule's target ref over", () => {
    const { onGoTo } = open(report("score-mid", DESIGN_FREE));
    const f2 = document.querySelector('[data-rule="F2"]')!;
    fireEvent.click(within(f2 as HTMLElement).getByRole("button", { name: /Go to/ }));
    expect(onGoTo).toHaveBeenCalledWith("basics.link.0.url");
  });

  it("an empty resume's missing-section tips point at 'add this section'", () => {
    const { onGoTo } = open(report("score-empty"));
    const s1 = document.querySelector('[data-rule="S1"]')!;
    fireEvent.click(within(s1 as HTMLElement).getByRole("button", { name: /Go to/ }));
    expect(onGoTo).toHaveBeenCalledWith("add:SUMMARY");
  });

  it("filters to the ATS group and says so in the title", () => {
    open(report("score-mid", ATS_STRICT, true), { only: "G6" });
    const dialog = screen.getByRole("dialog", { name: "ATS checks" });
    expect(within(dialog).getByText("Remove italic/underline/links — ATS parsers drop them.")).toBeTruthy();
    expect(within(dialog).getByText("Turn the photo off for ATS templates.")).toBeTruthy();
    expect(within(dialog).queryByText("Add your LinkedIn or portfolio link.")).toBeNull();
  });

  it("nothing failing: a friendly empty state", () => {
    open(report("score-strong"));
    expect(screen.getByText(/Every check passes/)).toBeTruthy();
  });

  it("Escape closes it", () => {
    const { onClose } = open(report("score-mid"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
