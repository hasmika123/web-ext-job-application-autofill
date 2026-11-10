/**
 * The AI Suggestions tab as a view (R4.6, DESIGN 10.7, 13.3, 13.7): the badge, the carousel (arrows, dots, keys, swipe),
 * the card buttons, the stale and empty states and the Free lock. The editor-level behaviour (apply, undo, refresh) is in
 * `ResumeEditor.suggestions.test.tsx`.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiProposal } from "@/lib/resume-ai";
import AiSuggestionsTab, { type AiSuggestionsTabProps } from "./AiSuggestionsTab";
import type { Suggestions } from "./useSuggestions";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

afterEach(cleanup);

const card = (id: number, over: Partial<AiProposal> = {}): AiProposal => ({
  id,
  task: "suggest",
  kind: "bullets",
  title: `Suggestion ${id}`,
  body: `Body ${id}`,
  stale: false,
  changes: [{ ref: `b_${id}`, section: "Experience", before: "Led migration", after: "Drove the migration" }],
  ...over,
});

const state = (over: Partial<Suggestions> = {}): Suggestions => ({
  loaded: true,
  locked: false,
  cards: [card(1), card(2), card(3)],
  asking: false,
  settling: false,
  notice: null,
  stale: false,
  ask: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const setup = (s: Suggestions = state(), over: Partial<AiSuggestionsTabProps> = {}) => {
  const props: AiSuggestionsTabProps = { allowed: true, suggestions: s, applyingId: null, busy: false, onApply: vi.fn(), onPreview: vi.fn(), onSeeAll: vi.fn(), ...over };
  render(<AiSuggestionsTab {...props} />);
  return props;
};

describe("AiSuggestionsTab", () => {
  it("shows the count next to the title, the first card, See all and one dot per card", () => {
    setup();
    expect(screen.getByRole("heading", { name: /AI Suggestions/ }).textContent).toContain("3");
    expect(screen.getByLabelText("3 suggestions")).toBeTruthy();
    expect(screen.getByText("Suggestion 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /See all/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Suggestion \d of 3$/ })).toHaveLength(3);
    expect(document.querySelector("[data-carousel]")?.getAttribute("aria-roledescription")).toBe("carousel");
  });

  it("every icon-only control has a name and a tooltip (the arrows)", () => {
    setup();
    const iconOnly = Array.from(document.querySelectorAll<HTMLElement>("button, a[href]")).filter((el) => {
      if (!el.querySelector("svg")) return false;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("svg, .sr-only, [aria-hidden='true']").forEach((n) => n.remove());
      return (clone.textContent ?? "").trim() === "";
    });
    expect(iconOnly.map((el) => el.getAttribute("aria-label"))).toEqual(["Previous suggestion", "Next suggestion"]);
    for (const el of iconOnly) expect(el.closest("[data-tooltip-trigger]"), `${el.getAttribute("aria-label")} has no tooltip`).not.toBeNull();
  });

  it("the badge is hidden at 0 cards", () => {
    setup(state({ cards: [] }));
    expect(screen.queryByLabelText(/suggestions$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /See all/ })).toBeNull();
  });

  it("arrow buttons, dots, the arrow keys and a swipe move the carousel; it never auto-advances", () => {
    vi.useFakeTimers();
    try {
      setup();
      const root = document.querySelector("[data-carousel]") as HTMLElement;
      vi.advanceTimersByTime(60_000);
      expect(screen.getByText("Suggestion 1")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Next suggestion" }));
      expect(screen.getByText("Suggestion 2")).toBeTruthy();
      fireEvent.keyDown(root, { key: "ArrowRight" });
      expect(screen.getByText("Suggestion 3")).toBeTruthy();
      expect((screen.getByRole("button", { name: "Next suggestion" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Suggestion 1 of 3" }));
      expect(screen.getByText("Suggestion 1")).toBeTruthy();
      fireEvent.touchStart(root, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(root, { changedTouches: [{ clientX: 120 }] }); // a swipe left: the next card
      expect(screen.getByText("Suggestion 2")).toBeTruthy();
      fireEvent.touchStart(root, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(root, { changedTouches: [{ clientX: 110 }] }); // too short: a tap
      expect(screen.getByText("Suggestion 2")).toBeTruthy();
      fireEvent.touchStart(root, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(root, { changedTouches: [{ clientX: 180 }] }); // a swipe right: back
      expect(screen.getByText("Suggestion 1")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the card buttons hand the card to the editor; a gap in the wording makes Apply open the preview instead (editor decides)", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Apply Suggestion" }));
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(props.onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.any(HTMLElement));
    fireEvent.click(screen.getByRole("button", { name: /See all/ }));
    expect(props.onSeeAll).toHaveBeenCalled();
  });

  it("the card in flight shows 'Applying' and every card waits while another change is applied", () => {
    setup(state(), { applyingId: 1 });
    expect(screen.getByRole("button", { name: /Applying/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    setup(state(), { busy: true });
    expect((screen.getByRole("button", { name: "Apply Suggestion" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stale: says the resume changed, disables the card buttons and Refresh asks again for the same document", () => {
    const s = state({ stale: true });
    setup(s);
    expect(screen.getByText("Resume changed.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Apply Suggestion" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(s.ask).toHaveBeenCalledWith(true);
  });

  it("a card the server marks stale is disabled on its own", () => {
    setup(state({ cards: [card(1, { stale: true })], stale: false }));
    expect((screen.getByRole("button", { name: "Apply Suggestion" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("empty: 'No suggestions yet' and Get suggestions (a click, never automatic)", () => {
    const s = state({ cards: [] });
    setup(s);
    expect(screen.getByText("No suggestions yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get suggestions" }));
    expect(s.ask).toHaveBeenCalledWith(false);
  });

  it("empty while asking, and the first read still loading", () => {
    setup(state({ cards: [], asking: true }));
    expect(screen.getByText("Reading your resume…")).toBeTruthy();
    cleanup();
    setup(state({ cards: [], loaded: false }));
    expect(screen.queryByRole("button", { name: "Get suggestions" })).toBeNull();
  });

  it("notices: nothing to improve, kept your facts safe, disabled, error with Try again", () => {
    const s = state({ cards: [], notice: { kind: "nothing" } });
    setup(s);
    expect(screen.getByText("Nothing to improve right now")).toBeTruthy();
    cleanup();
    setup(state({ cards: [], notice: { kind: "safe" } }));
    expect(screen.getByText("Nothing safe to suggest")).toBeTruthy();
    expect(screen.getByText(/kept your facts safe/)).toBeTruthy();
    cleanup();
    setup(state({ cards: [], notice: { kind: "disabled" } }));
    expect(screen.getByText("Kiwiply AI is taking a short break.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Get suggestions|Check again/ })).toBeNull();
    cleanup();
    const e = state({ cards: [], notice: { kind: "error", message: "Couldn't reach Kiwiply AI right now - try again." } });
    setup(e);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(e.ask).toHaveBeenCalledWith(false);
  });

  it("Free: one locked card, See Pro, no badge and no requests", () => {
    const s = state();
    setup(s, { allowed: false });
    expect(screen.getByText("AI suggestions are part of Pro")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
    expect(screen.queryByLabelText(/suggestions$/)).toBeNull();
    expect(s.ask).not.toHaveBeenCalled();
  });

  it("shows the AI disclosure under the cards and the usage line", () => {
    setup(state({ cards: [card(1, { model: "flash-lite", aiCallId: 5 })] }), { aiUsageLine: { headline: "12% of your Kiwiply AI used", detail: "Resets Nov 1." } });
    expect(screen.getByText("AI · review before you use it")).toBeTruthy();
    expect(screen.getByText(/12% of your Kiwiply AI used/)).toBeTruthy();
    expect(within(document.body).queryByRole("button", { name: "Next suggestion" })).toBeNull(); // one card: no arrows
  });
});
