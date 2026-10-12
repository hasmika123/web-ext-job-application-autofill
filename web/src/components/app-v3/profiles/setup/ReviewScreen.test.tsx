import { useReducer } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Candidate } from "@/lib/profile-setup/draft";
import { INITIAL_STATE, reducer } from "@/lib/profile-setup/state";
import { DelightProvider } from "@/lib/onboarding/delight";
import { DEFAULT_BUILDER_CONFIG, DEFAULT_DELIGHT_CONFIG, type OnboardingDelightConfig } from "@/lib/resume-builder-config.shared";
import type { Persona } from "@/lib/profile-setup/state";
import { CompanionProvider } from "./delight/Companion";
import { CompanionDock } from "./delight/CompanionDock";
import ReviewScreen from "./ReviewScreen";

vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ track }));

beforeEach(() => {
  vi.useRealTimers();
  track.mockClear();
});
afterEach(cleanup);

const candidates: Candidate[] = [
  { id: "exp0", section: "EXPERIENCE", data: { title: "Senior Engineer", org: "Acme", start: "2020-01", current: true, bullets: [{ text: "Cut latency 40%", src: "parsed" }] } },
  { id: "edu0", section: "EDUCATION", data: { school: "MIT", degree: "BS" } },
  { id: "pro0", section: "PROJECT", data: { title: "Icon set", bullets: [{ text: "1.2k stars", src: "parsed" }] } },
];
const limits = { bullets: 8, bulletChars: 200 };

/** The wizard's real reducer drives the cards, so decisions, edits and the cursor behave as shipped. */
function Harness({
  onDone = vi.fn(),
  removed = 0,
  mascot = true,
  persona = null,
  companion = false,
  delight,
  cards = candidates,
}: {
  onDone?: (kept: number, skipped: number) => void;
  removed?: number;
  mascot?: boolean;
  persona?: Persona | null;
  /** Wrap it in the delight layer with the companion dock, as the setup flow does. */
  companion?: boolean;
  /** Wrap it in the delight layer (no companion dock) with these settings overridden, as the setup flow does. */
  delight?: Partial<OnboardingDelightConfig>;
  /** The cards to review (default: the three-card fixture). */
  cards?: Candidate[];
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    step: "review",
    parsed: { candidates: cards, parsedIdentity: {}, skills: [], suggestions: [], source: "ai", removed },
    skills: ["React", "Go"],
  });
  const screenEl = (
    <ToastProvider>
      <ReviewScreen
        candidates={cards}
        decisions={state.decisions}
        edits={state.edits}
        cursor={state.cursor}
        limits={limits}
        removed={removed}
        skillCount={state.skills.length}
        mascot={mascot}
        persona={persona}
        onDecide={(id, decision) => dispatch({ type: "decide", id, decision })}
        onUndecide={(id) => dispatch({ type: "undecide", id })}
        onEdit={(id, data) => dispatch({ type: "edit", id, data })}
        onKeepRemaining={() => dispatch({ type: "decideAll", decision: "keep" })}
        onDone={onDone}
      />
      <button type="button" onClick={() => dispatch({ type: "cursor", cursor: state.cursor - 1 })}>
        shell back
      </button>
      <output data-testid="state">{JSON.stringify({ decisions: state.decisions, edits: state.edits, cursor: state.cursor })}</output>
    </ToastProvider>
  );
  if (!companion && !delight) return screenEl;
  const cfg = { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, mascot, delight: { ...DEFAULT_DELIGHT_CONFIG, ...delight } } };
  return (
    <DelightProvider config={cfg}>
      <CompanionProvider>
        {companion && <CompanionDock screenKey="review" />}
        {screenEl}
      </CompanionProvider>
    </DelightProvider>
  );
}
const read = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}") as { decisions: Record<string, string>; edits: Record<string, Record<string, unknown>>; cursor: number };

describe("ReviewScreen", () => {
  it("one card per screen, under the one question, with its counter", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { level: 1, name: "Does this look right?" })).toBeTruthy();
    expect(screen.getByTestId("card-counter").textContent).toBe("1 / 3");
    expect(screen.getByText("Senior Engineer · Acme")).toBeTruthy();
    expect(screen.queryByText("MIT")).toBeNull();
    expect(screen.getByText("Cut latency 40%")).toBeTruthy();
    expect(screen.getByText("Work experience")).toBeTruthy();
  });

  it("Keep and Skip decide the card and move on", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByTestId("card-counter").textContent).toBe("2 / 3");
    expect(screen.getByText("MIT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Icon set")).toBeTruthy();
    expect(read().decisions).toEqual({ exp0: "keep", edu0: "skip" });
  });

  it("the arrow keys on the focused card keep and skip", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("group", { name: "Senior Engineer · Acme" }), { key: "ArrowRight" });
    expect(read().decisions).toEqual({ exp0: "keep" });
    fireEvent.keyDown(screen.getByRole("group", { name: "MIT" }), { key: "ArrowLeft" });
    expect(read().decisions).toEqual({ exp0: "keep", edu0: "skip" });
  });

  it("a Skip shows an Undo toast; Undo takes the decision back and the card is on screen again", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Skipped Senior Engineer · Acme")).toBeTruthy();
    expect(read()).toMatchObject({ decisions: { exp0: "skip" }, cursor: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(read()).toMatchObject({ decisions: {}, cursor: 0 });
    expect(screen.getByText("Cut latency 40%")).toBeTruthy();
    expect(screen.queryByText("Skipped Senior Engineer · Acme")).toBeNull();
  });

  it("a Keep shows no toast; the Skip toast is 4 s (the primitive's default)", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText(/^Skipped/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Skipped MIT")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.queryByText("Skipped MIT")).toBeNull();
  });

  it("Edit opens the form; saving applies the edit and keeps the entry", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Senior Engineer · Acme" }));
    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: "Staff Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("MIT")).toBeTruthy());
    expect(read().decisions.exp0).toBe("keep");
    expect(read().edits.exp0.title).toBe("Staff Engineer");
  });

  it("Cancel in the form changes nothing", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Senior Engineer · Acme" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Senior Engineer · Acme")).toBeTruthy();
    expect(read().decisions).toEqual({});
  });

  it("'Keep all the rest' appears from the 2nd card and decides every card left", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Keep all the rest" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" })); // back on the first card: not offered there
    expect(screen.queryByRole("button", { name: "Keep all the rest" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep all the rest" }));
    expect(read().decisions).toEqual({ exp0: "skip", edu0: "keep", pro0: "keep" });
  });

  it("the recap is its own screen: 'Nice. Here's what we'll add.', the line, what was kept, and Continue with the counts", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByRole("heading", { level: 1, name: "Nice. Here's what we'll add." })).toBeTruthy();
    expect(screen.getByTestId("recap-line").textContent).toBe("Adding 1 role, 1 project and 2 skills.");
    expect(screen.getByText("Icon set")).toBeTruthy();
    expect(screen.queryByText("MIT")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledWith(2, 1);
  });

  it("the shell's Back moves the cursor back a card", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "shell back" }));
    expect(screen.getByText("Senior Engineer · Acme")).toBeTruthy();
    expect(screen.getByText(/You chose: keep/)).toBeTruthy();
  });

  it("the sensitive-values line shows on the first card only", () => {
    render(<Harness removed={2} />);
    expect(screen.getByText(/We removed 2 sensitive values/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText(/We removed 2 sensitive values/)).toBeNull();
  });

  it("the card title takes focus after a decision, and the decision is announced", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(document.activeElement?.textContent).toBe("MIT");
    expect(screen.getByText(/Kept Senior Engineer · Acme\. Education 2 of 3\./)).toBeTruthy();
  });

  it("draws the clapping mascot on the recap only when the admin has mascots on", () => {
    const keepAll = () => {
      for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    };
    const on = render(<Harness />);
    keepAll();
    expect(on.container.querySelector("[data-mascot='/v2/mascot-clap.png']")).not.toBeNull();
    on.unmount();
    const off = render(<Harness mascot={false} />);
    keepAll();
    expect(off.container.querySelector("[data-mascot]")).toBeNull();
  });

  describe("with the delight companion", () => {
    const dock = () => screen.getByTestId("companion-dock");
    const line = () => dock().textContent;

    it("starts with a rotating idle line, and the persona line on the first card", () => {
      render(<Harness companion />);
      expect(line()).toBe("Swipe or tap — your call.");
      cleanup();
      render(<Harness companion persona="student" />);
      expect(line()).toBe("Internships and part-time count too.");
      cleanup();
      render(<Harness companion persona="experienced" />);
      expect(line()).toBe("You've got plenty. Let's move.");
    });

    it("Keep cheers with a review.keep line", () => {
      render(<Harness companion />);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(dock().getAttribute("data-react")).toBe("cheer");
      expect(["Nice one.", "That's a keeper.", "Adding that.", "Yep, that's going in.", "Solid."]).toContain(line());
      expect(line()).toBe("Nice one."); // seed = the card index (0), so the first line, and always the same one
    });

    it("Skip shrugs with a review.skip line", () => {
      render(<Harness companion />);
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(dock().getAttribute("data-react")).toBe("shrug");
      expect(line()).toBe("No worries.");
    });

    it("the lines rotate by the card, so the same card shows the same line after a Back", () => {
      render(<Harness companion />);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(line()).toBe("That's a keeper."); // card index 1
    });

    it("Edit saved cheers with review.edited; Undo of a Skip peeks with review.undo", async () => {
      render(<Harness companion />);
      fireEvent.click(screen.getByRole("button", { name: "Edit Senior Engineer · Acme" }));
      fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: "Staff Engineer" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(screen.getByText("MIT")).toBeTruthy());
      expect(dock().getAttribute("data-react")).toBe("cheer");
      expect(line()).toBe("Fixed and kept.");
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(dock().getAttribute("data-react")).toBe("peek");
      expect(line()).toBe("Back in the list.");
    });

    it("the last card says so once the reaction has passed", () => {
      vi.useFakeTimers();
      render(<Harness companion />);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(screen.getByTestId("card-counter").textContent).toBe("3 / 3");
      expect(line()).toBe("That's a keeper."); // the reaction to the second Keep
      act(() => void vi.advanceTimersByTime(3000));
      expect(line()).toBe("Last one.");
    });

    it("the recap no longer draws the extra clap: the companion is the one mascot", () => {
      const { container } = render(<Harness companion />);
      for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(screen.getByRole("heading", { level: 1, name: "Nice. Here's what we'll add." })).toBeTruthy();
      // every mascot picture is the companion's (the column at xl, the head below it): no v2 clap behind the card
      const pictures = [...container.querySelectorAll("[data-mascot]")];
      expect(pictures.length).toBe(3); // column (xl), mid tier, phone head: one is shown at a time
      for (const p of pictures) expect(p.closest("[data-testid^=companion-]")).not.toBeNull();
    });

    it("draws no companion at all with the mascot off", () => {
      render(<Harness companion mascot={false} />);
      expect(screen.queryByTestId("companion-dock")).toBeNull();
    });

    it("nothing the companion says is announced: the live region only has the decision", () => {
      render(<Harness companion />);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      const live = document.querySelector("[role=status]")!;
      expect(live.textContent).toMatch(/^Kept Senior Engineer · Acme. Education 2 of 3.$/);
      expect(screen.getByTestId("companion-dock").closest("[aria-live]")).toBeNull();
      expect(dock().getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("honest highlights", () => {
    const card = (id: string, section: Candidate["section"], bullets: string[], title = "Role"): Candidate => ({
      id,
      section,
      data: { title, org: "Acme", bullets: bullets.map((text) => ({ text, src: "parsed" })) },
    });
    const cardsWith = [
      card("a", "EXPERIENCE", ["Worked on the thing", "Led the weekly review", "Lifted activation 18%"], "Designer"),
      card("b", "EXPERIENCE", ["Led the weekly review", "Built the new flow"], "Lead"),
      { id: "c", section: "EDUCATION", data: { school: "MIT", degree: "BS" } } as Candidate,
      card("d", "PROJECT", ["Prototyped three landing pages"], "Landing"),
    ];
    const chips = () => [...document.querySelectorAll("[data-highlight]")];

    it("one chip per card, on the right bullet, as real text", () => {
      render(<Harness delight={{}} cards={cardsWith} />);
      expect(chips()).toHaveLength(1);
      const chip = chips()[0] as HTMLElement;
      expect(chip.getAttribute("data-highlight")).toBe("number");
      expect(chip.textContent).toBe("Numbers stand out to recruiters");
      expect(chip.closest("li")?.textContent).toContain("Lifted activation 18%");
      expect(chip.closest("[aria-hidden=true]")).toBeNull(); // read by a screen reader, after its bullet
    });

    it("the next card gets its own single chip (lead on the first matching bullet)", () => {
      render(<Harness delight={{}} cards={cardsWith} />);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(chips()).toHaveLength(1);
      expect(chips()[0].getAttribute("data-highlight")).toBe("lead");
      expect(chips()[0].closest("li")?.textContent).toContain("Led the weekly review");
    });

    it("the tip shows on an experience or project card with no number, and not when there is one", () => {
      render(<Harness delight={{}} cards={cardsWith} />);
      expect(screen.queryByTestId("number-tip")).toBeNull(); // card a has 18%
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(screen.getByTestId("number-tip").textContent).toBe("Tip: a number here (users, %, $) makes it stronger — easy to add later in your Resume Builder.");
      // a chip of another rule and the tip coexist
      expect(chips()).toHaveLength(1);
    });

    it("no tip on education, and none on a card with no bullets", () => {
      render(<Harness delight={{}} cards={cardsWith} />);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(screen.getByText("MIT")).toBeTruthy();
      expect(screen.queryByTestId("number-tip")).toBeNull();
      expect(chips()).toHaveLength(0);
    });

    it("is recomputed after an edit is saved", async () => {
      render(<Harness delight={{}} cards={[card("x", "EXPERIENCE", ["Led the weekly review"], "Lead")]} />);
      expect(chips()[0].getAttribute("data-highlight")).toBe("lead");
      expect(screen.getByTestId("number-tip")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
      const bullet = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value === "Led the weekly review") as HTMLTextAreaElement;
      fireEvent.change(bullet, { target: { value: "Led the weekly review for 12 designers, 40% faster" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Nice. Here's what we'll add." })).toBeTruthy());
      expect(chips()).toHaveLength(0); // the recap carries none
    });

    it("is hidden when delight.highlights is off, and with the whole layer off", () => {
      const off = render(<Harness delight={{ highlights: false }} cards={cardsWith} />);
      expect(chips()).toHaveLength(0);
      expect(screen.queryByTestId("number-tip")).toBeNull();
      off.unmount();
      render(<Harness cards={cardsWith} />); // no layer at all: today's card
      expect(chips()).toHaveLength(0);
      expect(screen.queryByTestId("number-tip")).toBeNull();
      cleanup();
      render(<Harness delight={{ enabled: false }} cards={cardsWith} />);
      expect(chips()).toHaveLength(0);
    });

    it("the highlight event fires once per card shown, with the rule id and nothing else", () => {
      render(<Harness delight={{}} cards={cardsWith} />);
      const events = () => track.mock.calls.filter(([name]) => name === "onboarding_delight_highlight");
      expect(events()).toEqual([["onboarding_delight_highlight", { rule: "number" }]]);
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(events()).toHaveLength(2);
      expect(events()[1]).toEqual(["onboarding_delight_highlight", { rule: "lead" }]);
      fireEvent.click(screen.getByRole("button", { name: "shell back" })); // back onto card a: not counted again
      expect(events()).toHaveLength(2);
      expect(JSON.stringify(track.mock.calls)).not.toMatch(/Lifted|Led the|Numbers stand/);
    });

    it("the admin's copy override wins for the chip and the tip", () => {
      render(<Harness delight={{ copy: { "highlight.number": "Big numbers", "highlight.tip": "Add a figure." } }} cards={cardsWith} />);
      expect(chips()[0].textContent).toBe("Big numbers");
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(screen.getByTestId("number-tip").textContent).toBe("Add a figure.");
    });
  });

});
