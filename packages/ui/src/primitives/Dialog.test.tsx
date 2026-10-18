import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Dialog from "./Dialog";

afterEach(cleanup);

/** The note lives in the same component as the dialog and `onClose` is an inline arrow, so every keystroke gives Dialog a new `onClose`. */
function NoteDialog() {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">Behind</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Ask to negotiate?">
        <textarea aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("keeps focus in the field while the caller re-renders with a new onClose on every keystroke", () => {
    render(<NoteDialog />);
    screen.getByRole("button", { name: "Behind" }).focus();
    const note = screen.getByLabelText("Note");
    note.focus();
    for (const text of ["h", "he", "he "]) {
      fireEvent.change(note, { target: { value: text } });
      expect(document.activeElement).toBe(note);
    }
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("still closes on Escape through the latest handler", () => {
    render(<NoteDialog />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
