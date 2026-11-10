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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (navigator as unknown as { vibrate?: unknown }).vibrate;
});

// jsdom has no PointerEvent: a MouseEvent that also carries the pointer fields is enough for the swipe tests.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
}
/** The OS asks for less motion (or a coarse pointer, for the haptics tests). */
const media = (o: { reduce?: boolean; coarse?: boolean }) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: (o.reduce === true && q.includes("reduce")) || (o.coarse === true && q.includes("coarse")),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));

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
      expect(screen.getByTestId("card-counter").getAttribute("aria-label")).toBe("Card 3 of 3");
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
    // the live card's chips: the picture of the card that just left (aria-hidden, for 240 ms) is not the card
    const chips = () => [...document.querySelectorAll("[data-highlight]")].filter((c) => !c.closest("[aria-hidden=true]"));

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


  describe("the review as a game", () => {
    const five = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id, i): Candidate => ({ id, section: "EXPERIENCE", data: { title: `Role ${i + 1}`, org: "Acme", bullets: [{ text: "Worked on things", src: "parsed" }] } }));
    const game = (props: Parameters<typeof Harness>[0] = {}) => render(<Harness delight={{}} cards={five} {...props} />);
    const keep = () => fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    const skip = () => fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    const key = (k: string, init: KeyboardEventInit = {}, el?: Element) => fireEvent.keyDown(el ?? screen.getByRole("heading", { level: 1 }), { key: k, ...init });
    const eventsOf = (name: string) => track.mock.calls.filter(([n]) => n === name).map(([, p]) => p);
    const ghosts = () => document.querySelectorAll("[data-ghost]").length;
    const live = () => screen.getByRole("group", { name: /^Role/ });

    it("draws min(2, cards left - 1) ghosts: two, then one, then none on the last card", () => {
      game({ cards: five.slice(0, 3) });
      expect(ghosts()).toBe(2);
      keep();
      expect(ghosts()).toBe(1);
      keep();
      expect(ghosts()).toBe(0);
    });

    it("with the layer off there is no stack, no ghosts, no legend, no stamp: today's card", () => {
      render(<Harness cards={five} />);
      expect(document.querySelector("[data-card-stack]")).toBeNull();
      expect(ghosts()).toBe(0);
      expect(screen.queryByTestId("key-legend")).toBeNull();
      expect(live().getAttribute("aria-keyshortcuts")).toBe("ArrowRight ArrowLeft");
      expect(document.querySelector("[data-animated-number]")).toBeNull();
      expect(screen.getByTestId("card-counter").textContent).toBe("1 / 9");
    });

    it("the decision dispatches before the fling ends: state moves on at once and the next card is live underneath", () => {
      game();
      keep();
      expect(read().decisions).toEqual({ a: "keep" });
      expect(read().cursor).toBe(1);
      const layer = document.querySelector<HTMLElement>("[data-fling]")!;
      expect(layer.getAttribute("data-fling")).toBe("keep");
      expect(layer.getAttribute("aria-hidden")).toBe("true");
      expect(layer.className).toContain("pointer-events-none");
      expect(layer.textContent).toContain("Role 1");
      expect(live().getAttribute("aria-label")).toBe("Role 2 · Acme"); // the incoming card is the interactive one
      expect(layer.querySelector("[data-stamp]")?.textContent).toBe("Keep ✓"); // the stamp rides the fling
    });

    it("the layer goes after 240 ms", async () => {
      game();
      keep();
      expect(document.querySelector("[data-fling]")).not.toBeNull();
      await waitFor(() => expect(document.querySelector("[data-fling]")).toBeNull(), { timeout: 1500 });
    });

    it("two decisions within 240 ms both land", () => {
      game();
      keep();
      skip(); // the first card is still leaving
      expect(read().decisions).toEqual({ a: "keep", b: "skip" });
      expect(read().cursor).toBe(2);
      keep();
      expect(read().decisions).toEqual({ a: "keep", b: "skip", c: "keep" });
    });

    it("the counter is an AnimatedNumber with the same accessible name", () => {
      game();
      const p = screen.getByTestId("card-counter");
      expect(p.getAttribute("aria-label")).toBe("Card 1 of 9");
      expect(p.querySelector("[data-animated-number=flip]")).not.toBeNull();
      keep();
      expect(p.getAttribute("aria-label")).toBe("Card 2 of 9");
    });

    it("ArrowRight keeps and ArrowLeft skips from anywhere on the screen, not only the focused card", () => {
      game();
      key("ArrowRight");
      expect(read().decisions).toEqual({ a: "keep" });
      key("ArrowLeft", {}, screen.getByRole("button", { name: "Keep" }));
      expect(read().decisions).toEqual({ a: "keep", b: "skip" });
    });

    it("an arrow on the focused card is handled once (the card and the screen do not both fire)", () => {
      game();
      key("ArrowRight", {}, live());
      expect(read().decisions).toEqual({ a: "keep" });
      expect(read().cursor).toBe(1);
    });

    it("E opens the editor for the card on show", () => {
      game();
      key("e");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
      expect(read().decisions).toEqual({});
    });

    it("Z undoes the previous card (the toast's Undo): its decision is taken back and the cursor goes back", () => {
      game();
      key("z"); // nothing to undo on the first card
      expect(read().cursor).toBe(0);
      keep();
      key("z");
      expect(read()).toMatchObject({ decisions: {}, cursor: 0 });
    });

    it("keys are ignored inside the edit form, in a field, and with a modifier held", () => {
      game();
      key("ArrowRight", { ctrlKey: true });
      key("ArrowRight", { metaKey: true });
      key("ArrowRight", { altKey: true });
      key("e", { shiftKey: true });
      expect(read().decisions).toEqual({});
      key("e");
      const field = screen.getByLabelText(/Job title/);
      key("ArrowRight", {}, field);
      key("ArrowLeft", {}, field);
      key("e", {}, field);
      key("z", {}, field);
      expect(read().decisions).toEqual({});
      expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy(); // still editing
    });

    it("the keys do nothing with the layer off (today's screen)", () => {
      render(<Harness cards={five} />);
      key("ArrowRight");
      key("e");
      expect(read().decisions).toEqual({});
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    });

    it("the legend names the four keys, from sm up only", () => {
      game();
      const legend = screen.getByTestId("key-legend");
      expect([...legend.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["←", "→", "E", "Z"]);
      expect(legend.textContent).toContain("Skip");
      expect(legend.textContent).toContain("Undo");
      expect(legend.className).toContain("hidden");
      expect(legend.className).toContain("sm:flex");
      expect(live().getAttribute("aria-keyshortcuts")).toBe("ArrowRight ArrowLeft e z");
    });

    it('tap("decision") vibrates 10 ms on every Keep and Skip, button or key, on a coarse pointer', () => {
      media({ coarse: true });
      const vibrate = vi.fn(() => true);
      Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
      game();
      keep();
      skip();
      key("ArrowRight");
      expect(vibrate).toHaveBeenCalledTimes(3);
      expect(vibrate).toHaveBeenCalledWith(10);
    });

    it("nothing vibrates with haptics off or under reduced motion", () => {
      const vibrate = vi.fn(() => true);
      Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
      media({ coarse: true });
      game({ delight: { haptics: false } });
      keep();
      cleanup();
      media({ coarse: true, reduce: true });
      game();
      keep();
      expect(vibrate).not.toHaveBeenCalled();
    });

    it("Keep throws sparkles from the button; Skip does not", () => {
      game();
      const wrapper = () => screen.getByRole("button", { name: "Keep" }).parentElement!;
      expect(wrapper().querySelector("[data-sparkle-burst]")).toBeNull();
      skip();
      expect(document.querySelector("[data-sparkle-burst]")).toBeNull();
      keep();
      expect(wrapper().querySelector("[data-sparkle-burst]")).not.toBeNull();
      expect(wrapper().className).toContain("relative");
    });

    it("a swipe-keep flies from where the finger let go and throws sparkles from the card, not the button", () => {
      game();
      const card = live();
      fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 10 });
      fireEvent.pointerMove(card, { pointerId: 1, pointerType: "touch", clientX: 170, clientY: 12 });
      expect(document.querySelector("[data-stamp]")?.textContent).toBe("Keep ✓");
      fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch", clientX: 170, clientY: 12 });
      expect(read().decisions).toEqual({ a: "keep" });
      const layer = document.querySelector<HTMLElement>("[data-card-stack] > [data-fling]")!;
      expect(layer.style.getPropertyValue("--kiwi-fling-from")).toBe("150");
      expect(document.querySelector("[data-card-stack] [data-sparkle-burst]")).not.toBeNull();
      expect(screen.getByRole("button", { name: "Keep" }).parentElement!.querySelector("[data-sparkle-burst]")).toBeNull();
      expect(eventsOf("onboarding_delight_shortcut")).toEqual([]); // a swipe is not a shortcut
    });

    it("under reduced motion nothing flies or sparkles, and the stamp is still the feedback", () => {
      media({ reduce: true });
      game();
      keep();
      const layer = document.querySelector<HTMLElement>("[data-fling]")!;
      expect(layer.className).not.toContain("kiwi-fling");
      expect(layer.querySelector("[data-stamp]")).not.toBeNull();
      expect(document.querySelector("[data-sparkle-burst]")).toBeNull();
    });

    it("the shortcut event names the key and nothing else; buttons and swipes fire none", () => {
      game();
      keep();
      key("ArrowRight");
      key("ArrowLeft");
      key("z");
      key("e");
      expect(eventsOf("onboarding_delight_shortcut")).toEqual([{ key: "right" }, { key: "left" }, { key: "z" }, { key: "e" }]);
    });

    it("when the editor closes, focus goes back to the card's title so the keys carry on", () => {
      game();
      key("e");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(document.activeElement?.tagName).toBe("H2");
      expect(document.activeElement?.textContent).toBe("Role 1 · Acme");
    });

    it("the keys also work with nothing focused (the page body): a click on blank space does not strand the keyboard", () => {
      game();
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
      expect(read().decisions).toEqual({ a: "keep" });
      // but a focused control keeps its own keys: an arrow in a field outside the screen is not ours
      const stray = document.createElement("input");
      document.body.append(stray);
      fireEvent.keyDown(stray, { key: "ArrowRight" });
      expect(read().decisions).toEqual({ a: "keep" });
      stray.remove();
    });

    describe("the combo", () => {
      const chip = () => document.querySelector<HTMLElement>("[data-combo]");

      it('is hidden below three; three Keeps in a row show "🔥 3 in a row"', () => {
        game();
        keep();
        keep();
        expect(chip()).toBeNull();
        keep();
        expect(chip()?.getAttribute("data-combo")).toBe("3");
        expect(chip()?.textContent).toContain("🔥");
        expect(chip()?.textContent).toContain("in a row");
        expect(chip()?.getAttribute("aria-hidden")).toBe("true");
      });

      it("counts on, popping again with the new number", () => {
        game();
        for (let i = 0; i < 4; i++) keep();
        expect(chip()?.getAttribute("data-combo")).toBe("4");
      });

      it("a Skip fades it out quietly: no text, nothing announced", async () => {
        game();
        for (let i = 0; i < 3; i++) keep();
        skip();
        expect(chip()?.hasAttribute("data-fading")).toBe(true); // fading for 200 ms
        expect(chip()?.textContent).not.toMatch(/lost|broke|reset/i);
        await waitFor(() => expect(chip()).toBeNull(), { timeout: 1500 });
        expect(document.querySelector("[role=status]")?.textContent).not.toMatch(/row|🔥/u);
      });

      it("an Undo does not bring it back: it counts taps in a row", async () => {
        game();
        for (let i = 0; i < 3; i++) keep();
        skip();
        await waitFor(() => expect(chip()).toBeNull(), { timeout: 1500 });
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(chip()).toBeNull();
        keep();
        keep();
        expect(chip()).toBeNull(); // two since the Skip
        keep();
        expect(chip()?.getAttribute("data-combo")).toBe("3");
      });

      it("an edit that is then kept counts as a Keep", async () => {
        game();
        keep();
        keep();
        fireEvent.click(screen.getByRole("button", { name: /^Edit Role 3/ }));
        fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: "Role 3b" } });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(chip()?.getAttribute("data-combo")).toBe("3"));
      });

      it("is not drawn when delight.combo is off, and never persists (a fresh screen starts at none)", () => {
        const off = game({ delight: { combo: false } });
        for (let i = 0; i < 3; i++) keep();
        expect(chip()).toBeNull();
        off.unmount();
        game();
        expect(chip()).toBeNull();
      });

      it("the companion cheers with review.combo at three", () => {
        game({ companion: true });
        keep();
        keep();
        keep();
        expect(screen.getByTestId("companion-dock").textContent).toBe("Three in a row 🔥");
      });

      it("the combo event reports the longest run at the recap, 0 when it never reached three, and nothing else", () => {
        game({ cards: five.slice(0, 4) });
        keep();
        keep();
        keep();
        skip();
        expect(screen.getByRole("heading", { level: 1, name: "Nice. Here's what we'll add." })).toBeTruthy();
        expect(eventsOf("onboarding_delight_combo")).toEqual([{ max: 3 }]);
        cleanup();
        track.mockClear();
        game({ cards: five.slice(0, 3) });
        keep();
        skip();
        keep();
        expect(eventsOf("onboarding_delight_combo")).toEqual([{ max: 0 }]);
      });
    });
  });

});
