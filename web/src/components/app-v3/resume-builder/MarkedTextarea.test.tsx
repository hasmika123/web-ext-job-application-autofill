import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeRichText } from "@kiwiply/ui";
import type { ResumeMark, ResumeMarkType } from "@kiwiply/ui";
import MarkedTextarea from "./MarkedTextarea";

afterEach(cleanup);

const ALL: ResumeMarkType[] = ["b", "i", "u", "a"];
const b = (s: number, e: number): ResumeMark => ({ s, e, t: "b" });

/** Holds the text and marks the way the reducer does, and records the calls. */
function Harness({
  text = "Cut page load time 40%",
  marks = [],
  allowed = ALL,
  onFormat,
  onLinkRequest,
}: {
  text?: string;
  marks?: ResumeMark[];
  allowed?: ResumeMarkType[];
  onFormat?: (m: ResumeMark[]) => void;
  onLinkRequest?: () => void;
}) {
  const [v, setV] = useState({ text, marks });
  return (
    <>
      <MarkedTextarea
        aria-label="Field"
        value={v.text}
        marks={v.marks}
        allowed={allowed}
        onChange={(t, m) => setV({ text: t, marks: m })}
        onFormat={(m) => {
          onFormat?.(m);
          setV((cur) => ({ ...cur, marks: m }));
        }}
        onLinkRequest={onLinkRequest}
      />
      <output data-testid="marks">{JSON.stringify(v.marks)}</output>
      <output data-testid="text">{v.text}</output>
    </>
  );
}

const box = () => document.querySelector("textarea") as HTMLTextAreaElement;
const marksOf = () => JSON.parse(document.querySelector('[data-testid="marks"]')!.textContent ?? "[]") as ResumeMark[];
const textOf = () => document.querySelector('[data-testid="text"]')!.textContent;
const mirror = () => document.querySelector("[data-mirror]") as HTMLElement;

/** What a browser does when the user types / pastes / deletes: the value changes and the caret lands at `caret`. */
function input(next: string, caret: number) {
  const el = box();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, next);
  el.setSelectionRange(caret, caret);
  fireEvent.input(el);
}
function select(s: number, e: number) {
  const el = box();
  el.setSelectionRange(s, e);
  fireEvent.select(el);
}
const key = (k: string, init: Partial<KeyboardEventInit> = { ctrlKey: true }) => fireEvent.keyDown(box(), { key: k, ...init });

describe("MarkedTextarea", () => {
  it("draws the mirror with the same markup as RichText (the renderer the template uses)", () => {
    const marks: ResumeMark[] = [b(0, 3), { s: 4, e: 8, t: "a", href: "https://x.dev" }, { s: 9, e: 13, t: "u" }];
    render(<Harness marks={marks} />);
    expect(mirror().innerHTML).toBe(renderToStaticMarkup(<ResumeRichText text="Cut page load time 40%" marks={marks} allowed={ALL} keepLines verbatim />));
    expect(mirror().getAttribute("aria-hidden")).toBe("true");
    expect(mirror().innerHTML).toContain("<strong>Cut</strong>");
  });

  it("the mirror only draws what the template allows (a stored mark it cannot print stays in the data)", () => {
    render(<Harness marks={[b(0, 3), { s: 4, e: 8, t: "i" }]} allowed={["b"]} />);
    expect(mirror().innerHTML).toBe("<strong>Cut</strong> page load time 40%");
    expect(marksOf()).toHaveLength(2);
  });

  it("the textarea carries the real text; the mirror is not a second form control", () => {
    render(<Harness marks={[b(0, 3)]} />);
    expect(box().value).toBe("Cut page load time 40%");
    expect(document.querySelectorAll("textarea")).toHaveLength(1);
    expect(mirror().querySelector("textarea, input")).toBeNull();
  });

  it("Ctrl+B bolds the selection, again unbolds it (one onFormat each)", () => {
    const onFormat = vi.fn();
    render(<Harness onFormat={onFormat} />);
    select(4, 8);
    key("b");
    expect(marksOf()).toEqual([b(4, 8)]);
    expect(mirror().innerHTML).toContain("<strong>page</strong>");
    key("b");
    expect(marksOf()).toEqual([]);
    expect(onFormat).toHaveBeenCalledTimes(2);
  });

  it("Cmd+I and Ctrl+U toggle italic and underline too", () => {
    render(<Harness />);
    select(0, 3);
    key("i", { metaKey: true });
    key("u", { ctrlKey: true });
    expect(marksOf()).toEqual([
      { s: 0, e: 3, t: "i" },
      { s: 0, e: 3, t: "u" },
    ]);
  });

  it("a shortcut for a mark the template does not allow is ignored", () => {
    const onFormat = vi.fn();
    render(<Harness allowed={["b"]} onFormat={onFormat} />);
    select(0, 3);
    const notPrevented = fireEvent.keyDown(box(), { key: "i", ctrlKey: true });
    key("u");
    key("k");
    expect(notPrevented).toBe(true); // the browser's own handling is not suppressed
    expect(onFormat).not.toHaveBeenCalled();
    expect(marksOf()).toEqual([]);
    key("b");
    expect(marksOf()).toEqual([b(0, 3)]);
  });

  it("no selection, no mark; shortcuts with Alt or Shift are not ours", () => {
    render(<Harness />);
    select(5, 5);
    key("b");
    select(0, 3);
    key("b", { ctrlKey: true, shiftKey: true });
    key("b", { ctrlKey: true, altKey: true });
    key("b", {});
    expect(marksOf()).toEqual([]);
  });

  it("Ctrl+K asks the host for its link popover only when links are allowed", () => {
    const onLinkRequest = vi.fn();
    const { unmount } = render(<Harness onLinkRequest={onLinkRequest} />);
    select(0, 3);
    key("k");
    expect(onLinkRequest).toHaveBeenCalledTimes(1);
    unmount();
    const none = vi.fn();
    render(<Harness allowed={["b", "i", "u"]} onLinkRequest={none} />);
    select(0, 3);
    key("k");
    expect(none).not.toHaveBeenCalled();
  });

  it("typing re-bases the marks: before a mark shifts it, inside it grows it, at its ends does not extend it", () => {
    render(<Harness text="hello bold world" marks={[b(6, 10)]} />);
    input("X" + "hello bold world", 1); // before
    expect(marksOf()).toEqual([b(7, 11)]);
    input("Xhello boZld world", 10); // inside "bold"
    expect(marksOf()).toEqual([b(7, 12)]);
    expect(textOf()).toBe("Xhello boZld world");
    input("Xhello boZld! world", 13); // right after the mark's end
    expect(marksOf()).toEqual([b(7, 12)]);
  });

  it("the caret settles an ambiguous repeat: where the character was typed decides whether it is in the run", () => {
    render(<Harness text="aa" marks={[b(0, 2)]} />);
    input("aaa", 2); // typed inside the bold run
    expect(marksOf()).toEqual([b(0, 3)]);
    cleanup();
    render(<Harness text="aa" marks={[b(1, 2)]} />);
    input("aaa", 1); // typed in front of the bold character (it ends at 1, so it began at 0)
    expect(marksOf()).toEqual([b(2, 3)]);
  });

  it("deleting across a mark trims it and a mark that loses all its text is dropped", () => {
    render(<Harness text="one two three" marks={[b(4, 7), { s: 8, e: 13, t: "i" }]} />);
    input("one three", 4); // "two " removed
    expect(marksOf()).toEqual([{ s: 4, e: 9, t: "i" }]);
  });

  it("a paste re-bases the marks as one insertion", () => {
    render(<Harness text="ab cd" marks={[b(3, 5)]} />);
    input("ab PASTED cd", 9);
    expect(textOf()).toBe("ab PASTED cd");
    expect(marksOf()).toEqual([b(10, 12)]);
  });

  it("IME composition keeps the marks attached while the composed text changes", () => {
    render(<Harness text="hello bold" marks={[b(6, 10)]} />);
    const el = box();
    fireEvent.compositionStart(el);
    input("hello bold" + "に", 11);
    input("hello bold" + "にほ", 12);
    input("hello bold" + "日本", 12);
    fireEvent.compositionEnd(el);
    expect(textOf()).toBe("hello bold日本");
    expect(marksOf()).toEqual([b(6, 10)]); // typed at the end of the run: not extended, not lost
    // composing in front of the bold word shifts it
    input("日hello bold日本", 1);
    expect(marksOf()).toEqual([b(7, 11)]);
  });

  it("reports the selection on select and key up", () => {
    const onSelection = vi.fn();
    render(<MarkedTextarea aria-label="Field" value="hello" allowed={ALL} onChange={() => {}} onSelection={onSelection} />);
    const el = document.querySelector("textarea")!;
    el.setSelectionRange(1, 4);
    fireEvent.select(el);
    expect(onSelection).toHaveBeenLastCalledWith(1, 4);
    el.setSelectionRange(2, 2);
    fireEvent.keyUp(el, { key: "ArrowLeft" });
    expect(onSelection).toHaveBeenLastCalledWith(2, 2);
  });

  it("passes the host's own key handling through (Enter and friends)", () => {
    const onKeyDown = vi.fn();
    render(<MarkedTextarea aria-label="Field" value="x" allowed={ALL} onChange={() => {}} onKeyDown={onKeyDown} />);
    fireEvent.keyDown(document.querySelector("textarea")!, { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
