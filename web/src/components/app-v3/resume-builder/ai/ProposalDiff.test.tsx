import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiChange, AiProposal, ProposalResult } from "@/lib/resume-ai";
import ProposalDiff, { type ApplyProblem, type ProposalDiffProps, type ProposalSheetView } from "./ProposalDiff";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

afterEach(cleanup);

const change = (over: Partial<AiChange> & { ref: string }): AiChange => ({ section: "Engineer · Acme", before: "Led migration", after: "Drove the migration", reason: "Starts with a stronger verb", ...over });

const proposal = (changes: AiChange[], over: Partial<AiProposal> = {}): AiProposal => ({ id: 7, task: "rewrite", mode: "stronger", stale: false, changes, model: "flash-lite", aiCallId: 4812, ...over });

const result = (p: AiProposal, over: Partial<ProposalResult> = {}): ProposalSheetView => ({ phase: "result", result: { status: "ok", proposal: p, usage: { used: 12, limit: 100, resetsAt: "2026-11-01T00:00:00Z" }, ...over } });

const CHANGES: AiChange[] = [
  change({ ref: "b_1", alternatives: ["Drove the migration", "Ran the migration end to end", "Owned the migration"] }),
  change({ ref: "b_2", section: "Engineer · Acme (2)", before: "Cut latency", after: "Cut latency by [add a number]", alternatives: ["Cut latency by [add a number]", "Reduced latency"] }),
  change({ ref: "b_3", section: "Summary", before: "Engineer.", after: "Senior engineer.", formatted: true }),
];

function setup(over: Partial<ProposalDiffProps> = {}) {
  const props: ProposalDiffProps = {
    open: true,
    phone: false,
    scope: "Experience",
    view: result(proposal(CHANGES)),
    mode: "stronger",
    onMode: vi.fn(),
    applying: false,
    problem: null,
    onApply: vi.fn(),
    onDismiss: vi.fn(),
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onAskAgain: vi.fn(),
    onOpenTips: vi.fn(),
    ...over,
  };
  render(<ProposalDiff {...props} />);
  return props;
}

const check = (section: string) => screen.getByRole("checkbox", { name: `Apply change to ${section}` }) as HTMLInputElement;
const applyButton = () => screen.getByRole("button", { name: /^Apply \d+ selected$|^Applying/ }) as HTMLButtonElement;

describe("ProposalDiff - a proposal", () => {
  it("shows every change as a word diff, all ticked, with the usage line and the AI disclosure", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Rewrite with AI" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(dialog).getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);
    const first = dialog.querySelector('[data-change-ref="b_1"]')!;
    expect(first.querySelector("ins")?.textContent).toContain("Drove");
    expect(first.querySelector("del")?.textContent).toContain("Led");
    expect(applyButton().textContent).toBe("Apply 3 selected");
    expect(screen.getByText("12% of your Kiwiply AI used · resets November 1")).toBeTruthy();
    expect(screen.getByText("AI · review before you use it")).toBeTruthy();
    expect(screen.getByText("Made with Kiwiply AI")).toBeTruthy();
  });

  it("Why opens the model's reason", () => {
    setup();
    const why = screen.getAllByRole("button", { name: /Why/ })[0];
    expect(why.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Starts with a stronger verb")).toBeTruthy();
  });

  it("says when applying will reset a line's formatting", () => {
    setup();
    const li = document.querySelector('[data-change-ref="b_3"]')!;
    expect(within(li as HTMLElement).getByText("Formatting on this line will be reset.")).toBeTruthy();
    expect(document.querySelector('[data-change-ref="b_1"]')!.textContent).not.toContain("Formatting on this line");
  });

  it("Apply sends the ticked refs and the wording chosen for each (placeholder change unticked)", () => {
    const p = setup();
    fireEvent.click(check("Engineer · Acme (2)")); // the one with the [add a number] gap
    fireEvent.click(screen.getByRole("radio", { name: "Wording 2 of 3 for Engineer · Acme" }));
    expect(applyButton().textContent).toBe("Apply 2 selected");
    fireEvent.click(applyButton());
    expect(p.onApply).toHaveBeenCalledWith(["b_1", "b_3"], { b_1: 1, b_3: 0 });
  });

  it("choosing another wording redraws that change's diff", () => {
    setup();
    const li = document.querySelector('[data-change-ref="b_1"]') as HTMLElement;
    expect(li.querySelector("ins")?.textContent).not.toContain("end to end");
    fireEvent.click(within(li).getByRole("radio", { name: "Wording 2 of 3 for Engineer · Acme" }));
    expect(Array.from(li.querySelectorAll("ins")).map((n) => n.textContent).join(" ")).toContain("end to end");
    expect((within(li).getByRole("radio", { name: "Wording 2 of 3 for Engineer · Acme" }) as HTMLInputElement).checked).toBe(true);
  });

  it("a ticked change with [add a number] blocks Apply, with the reason; unticking it or picking another wording unblocks", () => {
    setup();
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Replace [add a number] before applying");
    fireEvent.click(check("Engineer · Acme (2)"));
    expect(applyButton().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(check("Engineer · Acme (2)")); // tick again: blocked again
    expect(applyButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Wording 2 of 2 for Engineer · Acme (2)" }));
    expect(applyButton().disabled).toBe(false);
  });

  it("Apply is off with nothing ticked; Select none / Select all toggles every change", () => {
    setup({ view: result(proposal([CHANGES[0], CHANGES[2]])) });
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(applyButton().disabled).toBe(true);
    expect(applyButton().textContent).toBe("Apply 0 selected");
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(applyButton().textContent).toBe("Apply 2 selected");
  });

  it("keyboard: Up / Down walk the checkboxes, Space ticks, Ctrl+Enter applies", () => {
    const p = setup({ view: result(proposal([CHANGES[0], CHANGES[2]])) });
    const first = check("Engineer · Acme");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(check("Summary"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    fireEvent.click(first); // Space on a checkbox is a click
    expect(first.checked).toBe(false);
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: "Enter", ctrlKey: true });
    expect(p.onApply).toHaveBeenCalledWith(["b_1", "b_3"], { b_1: 0, b_3: 0 });
  });

  it("Ctrl+Enter does nothing while Apply is blocked", () => {
    const p = setup();
    fireEvent.keyDown(check("Summary"), { key: "Enter", metaKey: true });
    expect(p.onApply).not.toHaveBeenCalled();
  });

  it("Dismiss discards, Close (the sheet's X) keeps it open for later", () => {
    const p = setup({ view: result(proposal([CHANGES[0]])) });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalled();
  });

  it("the mode picker re-runs with another mode, and is off while working", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Shorter" }));
    expect(p.onMode).toHaveBeenCalledWith("shorter");
    cleanup();
    setup({ applying: true });
    expect((screen.getByRole("radio", { name: "Shorter" }) as HTMLButtonElement).disabled).toBe(true);
    expect(applyButton().textContent).toBe("Applying…");
  });

  it("no picker for a summary proposal or when none is wired", () => {
    setup({ view: result(proposal([CHANGES[2]], { task: "summary" })) });
    expect(screen.queryByRole("radiogroup", { name: "Rewrite as" })).toBeNull();
  });

  it("a repeat is labelled as free", () => {
    setup({ view: { phase: "result", result: { status: "cached", proposal: proposal([CHANGES[0]]) } } });
    expect(screen.getByText(/same answer and it cost nothing/)).toBeTruthy();
  });

  it("a new proposal starts ticked again", () => {
    const first = setup({ view: result(proposal([CHANGES[0]], { id: 1 })) });
    fireEvent.click(check("Engineer · Acme"));
    expect(applyButton().disabled).toBe(true);
    cleanup();
    void first;
    setup({ view: result(proposal([CHANGES[0]], { id: 2 })) });
    expect(applyButton().disabled).toBe(false);
  });
});

describe("ProposalDiff - everything that is not a proposal", () => {
  it("loading names how many lines", () => {
    setup({ view: { phase: "loading", lines: 3 } });
    expect(screen.getByRole("status").textContent).toContain("Rewriting 3 lines");
  });

  it("402 is the lock card with See Pro", () => {
    setup({ view: { phase: "locked" } });
    expect(screen.getByText("AI rewriting is part of Pro")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
    expect(screen.queryByRole("radiogroup", { name: "Rewrite as" })).toBeNull();
  });

  it("an error says the resume is untouched and offers Try again", () => {
    const p = setup({ view: { phase: "error", message: "Too many AI requests in a row.", retry: true } });
    expect(screen.getByRole("alert").textContent).toContain("Too many AI requests in a row.");
    expect(screen.getByRole("alert").textContent).toContain("Your resume is untouched.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it("quota exhausted: the period sentence, the meter and the free alternative", () => {
    const p = setup({ view: { phase: "result", result: { status: "quotaExceeded", usage: { used: 100, limit: 100, resetsAt: "2026-11-01T00:00:00Z" } } } });
    expect(screen.getByText("This period's Kiwiply AI is used up")).toBeTruthy();
    expect(screen.getAllByText(/resets November 1/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Run the Resume Score tips" }));
    expect(p.onOpenTips).toHaveBeenCalled();
  });

  it("daily cap, disabled and nothing-to-change each have their own words", () => {
    setup({ view: { phase: "result", result: { status: "quotaExceeded", cap: "daily", usage: { used: 40, limit: 40 } } } });
    expect(screen.getByText("That's today's AI rewrites")).toBeTruthy();
    cleanup();
    setup({ view: { phase: "result", result: { status: "disabled" } } });
    expect(screen.getByText("Kiwiply AI is taking a short break.")).toBeTruthy();
    cleanup();
    setup({ view: { phase: "result", result: { status: "nothingToChange" } } });
    expect(screen.getByText("Nothing to change")).toBeTruthy();
    expect(screen.getByText(/kept your facts safe/)).toBeTruthy();
  });

  it("an ok answer with no changes reads as nothing to change, not an empty list", () => {
    setup({ view: { phase: "result", result: { status: "nothingToChange", proposal: undefined } } });
    expect(screen.queryByRole("list", { name: "Proposed changes" })).toBeNull();
  });
});

describe("ProposalDiff - when Apply does not go through", () => {
  const problem = (p: ApplyProblem) => setup({ problem: p, view: result(proposal([CHANGES[0]])) });

  it("stale: says the resume changed and offers Ask again", () => {
    const p = problem({ kind: "stale" });
    expect(screen.getByText("Your resume changed since this was made")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask again" }));
    expect(p.onAskAgain).toHaveBeenCalled();
  });

  it("closed, placeholder and a plain error each say so", () => {
    problem({ kind: "closed" });
    expect(screen.getByText("This suggestion was already used")).toBeTruthy();
    cleanup();
    problem({ kind: "placeholder" });
    expect(screen.getByText("Replace [add a number] before applying")).toBeTruthy();
    cleanup();
    problem({ kind: "error", message: "Couldn't reach Kiwiply." });
    expect(screen.getByText("Couldn't reach Kiwiply.")).toBeTruthy();
  });

  it("a 402 on Apply shows the lock card", () => {
    problem({ kind: "locked" });
    expect(screen.getByRole("link", { name: "See Pro" })).toBeTruthy();
  });
});
