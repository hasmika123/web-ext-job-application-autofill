import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@/lib/profile-setup/draft";
import { INITIAL_STATE, reducer } from "@/lib/profile-setup/state";
import ReviewCards from "./ReviewCards";

afterEach(cleanup);

const candidates: Candidate[] = [
  { id: "exp0", section: "EXPERIENCE", data: { title: "Senior Engineer", org: "Acme", start: "2020-01", current: true, bullets: [{ text: "Cut latency 40%", src: "parsed" }] } },
  { id: "edu0", section: "EDUCATION", data: { school: "MIT", degree: "BS" } },
  { id: "pro0", section: "PROJECT", data: { title: "Icon set", bullets: [{ text: "1.2k stars", src: "parsed" }] } },
];
const limits = { bullets: 8, bulletChars: 200 };

/** The wizard's real reducer drives the cards, so decisions, edits and the cursor behave as shipped. */
function Harness({ onDone = vi.fn() }: { onDone?: () => void }) {
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    step: "cards",
    parsed: { candidates, parsedIdentity: {}, skills: [], suggestions: [], source: "ai", removed: 0 },
  });
  return (
    <>
      <ReviewCards
        candidates={candidates}
        decisions={state.decisions}
        edits={state.edits}
        cursor={state.cursor}
        limits={limits}
        onDecide={(id, decision) => dispatch({ type: "decide", id, decision })}
        onEdit={(id, data) => dispatch({ type: "edit", id, data })}
        onCursor={(cursor) => dispatch({ type: "cursor", cursor })}
        onKeepRemaining={() => dispatch({ type: "decideAll", decision: "keep" })}
        onDone={onDone}
      />
      <output data-testid="state">{JSON.stringify({ decisions: state.decisions, edits: state.edits })}</output>
    </>
  );
}
const read = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}") as { decisions: Record<string, string>; edits: Record<string, Record<string, unknown>> };

describe("ReviewCards", () => {
  it("shows one card at a time with its progress", () => {
    render(<Harness />);
    expect(screen.getByText("Senior Engineer · Acme")).toBeTruthy();
    expect(screen.getByText("Work experience · 1 of 3")).toBeTruthy();
    expect(screen.queryByText("MIT")).toBeNull();
    expect(screen.getByText("Cut latency 40%")).toBeTruthy();
  });

  it("Keep and Skip decide the card and move on", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByText("MIT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Icon set")).toBeTruthy();
    expect(read().decisions).toEqual({ exp0: "keep", edu0: "skip" });
  });

  it("the arrow keys on the focused card keep and skip", () => {
    render(<Harness />);
    const card = screen.getByRole("group", { name: "Senior Engineer · Acme" });
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(read().decisions).toEqual({ exp0: "keep" });
    fireEvent.keyDown(screen.getByRole("group", { name: "MIT" }), { key: "ArrowLeft" });
    expect(read().decisions).toEqual({ exp0: "keep", edu0: "skip" });
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

  it("Back returns to the previous card, and the recap lists what was kept and continues", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Senior Engineer · Acme")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByText("You kept 2 of 3")).toBeTruthy();
    expect(screen.getByText("Icon set")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Keep all remaining decides every card left and shows the recap", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2 remaining" }));
    expect(read().decisions).toEqual({ exp0: "skip", edu0: "keep", pro0: "keep" });
    expect(screen.getByText("You kept 2 of 3")).toBeTruthy();
  });
});
