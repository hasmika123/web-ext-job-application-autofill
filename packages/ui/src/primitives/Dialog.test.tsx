import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import Dialog from "./Dialog";

afterEach(cleanup);

/** A caller like the Bulk Invite sheet: it keeps the typed text in state and hands the dialog a NEW onClose function on every render. */
function Host({ onEscape }: { onEscape?: () => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  function close() {
    onEscape?.();
    setOpen(false);
  }
  return (
    <Dialog open={open} onClose={close} title="Bulk Invite">
      <textarea aria-label="Addresses" value={text} onChange={(e) => setText(e.target.value)} />
    </Dialog>
  );
}

describe("Dialog focus", () => {
  it("keeps focus in the field being typed in while the caller re-renders with a new onClose", () => {
    render(<Host />);
    const field = screen.getByLabelText("Addresses") as HTMLTextAreaElement;
    field.focus();
    expect(document.activeElement).toBe(field);
    for (const text of ["a", "ab", "abc"]) {
      fireEvent.change(field, { target: { value: text } });
      expect(document.activeElement).toBe(field); // the first focusable control is the close button: focus must not jump to it
    }
    expect(field.value).toBe("abc");
  });

  it("still closes on Escape through the latest onClose", () => {
    let closed = 0;
    render(<Host onEscape={() => closed++} />);
    fireEvent.change(screen.getByLabelText("Addresses"), { target: { value: "x" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

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

describe("Dialog with an inline onClose arrow (offer note)", () => {
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
