import { useReducer } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Candidate } from "@/lib/profile-setup/draft";
import { INITIAL_STATE, reducer } from "@/lib/profile-setup/state";
import ReviewScreen from "./ReviewScreen";

vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));

beforeEach(() => vi.useRealTimers());
afterEach(cleanup);

const candidates: Candidate[] = [
  { id: "exp0", section: "EXPERIENCE", data: { title: "Senior Engineer", org: "Acme", start: "2020-01", current: true, bullets: [{ text: "Cut latency 40%", src: "parsed" }] } },
  { id: "edu0", section: "EDUCATION", data: { school: "MIT", degree: "BS" } },
  { id: "pro0", section: "PROJECT", data: { title: "Icon set", bullets: [{ text: "1.2k stars", src: "parsed" }] } },
];
const limits = { bullets: 8, bulletChars: 200 };

/** The wizard's real reducer drives the cards, so decisions, edits and the cursor behave as shipped. */
function Harness({ onDone = vi.fn(), removed = 0, mascot = true }: { onDone?: (kept: number, skipped: number) => void; removed?: number; mascot?: boolean }) {
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    step: "review",
    parsed: { candidates, parsedIdentity: {}, skills: [], suggestions: [], source: "ai", removed },
    skills: ["React", "Go"],
  });
  return (
    <ToastProvider>
      <ReviewScreen
        candidates={candidates}
        decisions={state.decisions}
        edits={state.edits}
        cursor={state.cursor}
        limits={limits}
        removed={removed}
        skillCount={state.skills.length}
        mascot={mascot}
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
});
