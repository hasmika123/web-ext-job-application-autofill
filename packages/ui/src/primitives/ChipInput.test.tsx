import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChipInput from "./ChipInput";
import SourceChip from "./SourceChip";
import { ToastProvider, useToast } from "./Toast";

afterEach(cleanup);

function Harness({ initial = [], maxChips }: { initial?: string[]; maxChips?: number }) {
  const [v, setV] = useState<string[]>(initial);
  return (
    <>
      <ChipInput label="Skills" value={v} onChange={setV} maxChips={maxChips} />
      <output data-testid="out">{JSON.stringify(v)}</output>
    </>
  );
}
const out = () => JSON.parse(screen.getByTestId("out").textContent ?? "[]") as string[];
const box = () => screen.getByLabelText("Skills") as HTMLInputElement;

describe("ChipInput", () => {
  it("Enter and comma add a chip; the box is cleared", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "React" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.change(box(), { target: { value: "Go" } });
    fireEvent.keyDown(box(), { key: "," });
    expect(out()).toEqual(["React", "Go"]);
    expect(box().value).toBe("");
  });

  it("drops blanks and case-insensitive duplicates", () => {
    render(<Harness initial={["React"]} />);
    fireEvent.change(box(), { target: { value: "react" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(out()).toEqual(["React"]);
  });

  it("Backspace in the empty box removes the last chip", () => {
    render(<Harness initial={["a", "b"]} />);
    fireEvent.keyDown(box(), { key: "Backspace" });
    expect(out()).toEqual(["a"]);
  });

  it("each chip has a remove button", () => {
    render(<Harness initial={["a", "b"]} />);
    fireEvent.click(screen.getByLabelText("Remove a"));
    expect(out()).toEqual(["b"]);
  });

  it("leaving the box adds what was typed; a pasted list adds one chip each", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "Rust" } });
    fireEvent.blur(box());
    fireEvent.paste(box(), { clipboardData: { getData: () => "Go, Kotlin\nSQL" } });
    expect(out()).toEqual(["Rust", "Go", "Kotlin", "SQL"]);
  });

  it("stops adding at maxChips", () => {
    render(<Harness initial={["a"]} maxChips={2} />);
    fireEvent.paste(box(), { clipboardData: { getData: () => "b, c, d" } });
    expect(out()).toEqual(["a", "b"]);
  });
});

describe("ChipInput count", () => {
  it("describes the box with 'n of max' when there is a cap, and not otherwise", () => {
    const { rerender } = render(<ChipInput label="Skills" value={["a", "b"]} onChange={() => {}} maxChips={40} />);
    const id = box().getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe("2 of 40");
    rerender(<ChipInput label="Skills" value={["a"]} onChange={() => {}} />);
    expect(box().getAttribute("aria-describedby")).toBeNull();
  });
});

describe("SourceChip", () => {
  it("shows the plain-language source for either casing and nothing for unknown values", () => {
    const { rerender } = render(<SourceChip provenance="PARSED" />);
    expect(screen.getByText("From your resume")).toBeTruthy();
    rerender(<SourceChip provenance="learned" />);
    expect(screen.getByText("Learned while applying")).toBeTruthy();
    rerender(<SourceChip provenance="USER" />);
    expect(screen.getByText("You added")).toBeTruthy();
    rerender(<SourceChip provenance="weird" />);
    expect(screen.queryByText("You added")).toBeNull();
  });
});

describe("Toast action", () => {
  it("runs the action and dismisses the toast", () => {
    const undo = vi.fn();
    function Fire() {
      const toast = useToast();
      return <button onClick={() => toast({ title: "Deleted", duration: 0, action: { label: "Undo", onClick: undo } })}>go</button>;
    }
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    fireEvent.click(screen.getByText("Undo"));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Deleted")).toBeNull();
  });
});
