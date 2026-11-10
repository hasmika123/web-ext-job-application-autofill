/** The mark toolbar on the document canvas (R2.11): Summary + bullets, toolbar and shortcuts, undo, ATS limits. */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "@kiwiply/ui";
import type { ResumeDocument, ResumeMark, ResumeSection } from "@kiwiply/ui";
import { CanvasHarness, liveDoc } from "./test-canvas";
import { testDoc, testState } from "./state/test-doc";
import { currentDoc, editorReducer } from "./state/reducer";

afterEach(cleanup);

const SUMMARY = "Software engineer with 5+ years of experience building web apps.";
const doc = (): ResumeDocument => {
  const d = testDoc();
  (d.sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items[0].text = SUMMARY;
  return d;
};
const summaryItem = () => (liveDoc().sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items[0];
const expItem = () => (liveDoc().sections[1] as Extract<ResumeSection, { kind: "EXPERIENCE" }>).items[0];
const block = (id: string) => document.getElementById(`rb-${id}`)!;
const summaryBox = () => screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement;
const bullet = (n: number) => screen.getByRole("textbox", { name: `Bullet ${n}` }) as HTMLTextAreaElement;
const btn = (name: string, scope: HTMLElement = document.body) => within(scope).getByRole("button", { name }) as HTMLButtonElement;

const focus = (el: HTMLElement) => act(() => el.focus());
function select(el: HTMLTextAreaElement, s: number, e: number) {
  focus(el);
  el.setSelectionRange(s, e);
  fireEvent.select(el);
}
function undo() {
  fireEvent.click(within(block("s_sum")).getByRole("button", { name: /^More actions for/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Undo" }));
}

describe("the Summary's toolbar", () => {
  it("sits in the Summary header; an ATS template gets only Bold, a design template all six", () => {
    const { unmount } = render(<CanvasHarness doc={doc()} caps={ATS_STRICT} />);
    const bar = within(block("s_sum")).getByRole("toolbar");
    expect(within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Bold"]);
    unmount();
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    expect(within(within(block("s_sum")).getByRole("toolbar")).getAllByRole("button")).toHaveLength(6);
    // the toolbar belongs to the Summary block; item sections get theirs only while a bullet has focus
    expect(within(block("s_exp")).queryByRole("toolbar")).toBeNull();
  });

  it("Bold on the selection stores a mark; the pressed state follows; a second click removes it", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    const at = SUMMARY.indexOf("5+ years");
    select(summaryBox(), at, at + 8);
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn("Bold"));
    expect(summaryItem().marks).toEqual([{ s: at, e: at + 8, t: "b" }]);
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-mirror] strong")!.textContent).toBe("5+ years");
    fireEvent.click(btn("Bold"));
    expect(summaryItem().marks).toBeUndefined();
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("false");
  });

  it("Italic and Underline work from the toolbar and from Ctrl+I / Ctrl+U", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    select(summaryBox(), 0, 8);
    fireEvent.click(btn("Italic"));
    fireEvent.keyDown(summaryBox(), { key: "u", ctrlKey: true });
    expect(summaryItem().marks).toEqual([
      { s: 0, e: 8, t: "i" },
      { s: 0, e: 8, t: "u" },
    ]);
  });

  it("a formatting change is its own undo step: typing stays, the bold goes", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    fireEvent.change(summaryBox(), { target: { value: SUMMARY + " Go." } }); // typing
    select(summaryBox(), 0, 8);
    fireEvent.keyDown(summaryBox(), { key: "b", ctrlKey: true });
    expect(summaryItem().marks).toEqual([{ s: 0, e: 8, t: "b" }]);
    undo();
    expect(summaryItem().marks).toBeUndefined();
    expect(summaryItem().text).toBe(SUMMARY + " Go.");
  });

  it("typing keeps the marks on the right characters (edit before, inside)", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    select(summaryBox(), 9, 17);
    fireEvent.click(btn("Bold"));
    expect(summaryItem().marks).toEqual([{ s: 9, e: 17, t: "b" }]);
    const el = summaryBox();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "Senior " + SUMMARY);
    el.setSelectionRange(7, 7);
    fireEvent.input(el);
    expect(summaryItem().marks).toEqual([{ s: 16, e: 24, t: "b" }]);
  });

  it("the link button validates the URL and stores an `a` mark with its href; Remove clears it", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    select(summaryBox(), 0, 17);
    fireEvent.click(btn("Link"));
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(btn("Apply"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(summaryItem().marks).toBeUndefined();
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "https://example.com/priya" } });
    fireEvent.click(btn("Apply"));
    expect(summaryItem().marks).toEqual([{ s: 0, e: 17, t: "a", href: "https://example.com/priya" }]);
    expect(btn("Link").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn("Link"));
    fireEvent.click(btn("Remove link"));
    expect(summaryItem().marks).toBeUndefined();
  });

  it("Ctrl+K opens the link popover on the selection", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    select(summaryBox(), 0, 8);
    fireEvent.keyDown(summaryBox(), { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Link" })).toBeTruthy();
  });

  it("the list buttons set and clear the summary's list", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    fireEvent.click(btn("Bulleted list"));
    expect(summaryItem().list).toBe("bullet");
    expect(btn("Bulleted list").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn("Numbered list"));
    expect(summaryItem().list).toBe("number");
    fireEvent.click(btn("Numbered list"));
    expect(summaryItem().list ?? null).toBeNull();
  });

  it("an ATS template ignores Ctrl+I / Ctrl+U / Ctrl+K and offers no lists", () => {
    render(<CanvasHarness doc={doc()} caps={ATS_STRICT} />);
    select(summaryBox(), 0, 8);
    for (const k of ["i", "u", "k"]) fireEvent.keyDown(summaryBox(), { key: k, ctrlKey: true });
    expect(summaryItem().marks).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Bulleted list" })).toBeNull();
    fireEvent.keyDown(summaryBox(), { key: "b", ctrlKey: true });
    expect(summaryItem().marks).toEqual([{ s: 0, e: 8, t: "b" }]);
  });

  it("a stored mark the template cannot print stays in the document but is not drawn", () => {
    const d = doc();
    (d.sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items[0].marks = [{ s: 0, e: 8, t: "i" }];
    render(<CanvasHarness doc={d} caps={ATS_STRICT} />);
    expect(document.querySelector("[data-mirror] em")).toBeNull();
    expect(summaryItem().marks).toEqual([{ s: 0, e: 8, t: "i" }]);
  });
});

describe("the toolbar on bullets", () => {
  it("appears over a bullet's item while one of its bullets has focus, and goes when focus leaves", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    const exp = block("s_exp");
    expect(within(exp).queryByRole("toolbar")).toBeNull();
    focus(bullet(1));
    expect(within(exp).getByRole("toolbar")).toBeTruthy();
    focus(summaryBox());
    expect(within(exp).queryByRole("toolbar")).toBeNull();
  });

  it("bolds a part of a bullet; the mark lands on that bullet only", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    select(bullet(1), 0, 3);
    fireEvent.click(btn("Bold", block("s_exp")));
    expect(expItem().bullets![0].marks).toEqual([{ s: 0, e: 3, t: "b" }]);
    expect(expItem().bullets![1].marks).toBeUndefined();
    expect(bullet(1).value).toBe("Led migration");
  });

  it("Ctrl+B works in a bullet too", () => {
    render(<CanvasHarness doc={doc()} caps={ATS_STRICT} />);
    select(bullet(2), 4, 11);
    fireEvent.keyDown(bullet(2), { key: "b", ctrlKey: true });
    expect(expItem().bullets![1].marks).toEqual([{ s: 4, e: 11, t: "b" }]);
  });

  it("the list buttons set the item's list style (and the numbered bullets show 1. 2.)", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    focus(bullet(1));
    fireEvent.click(btn("Numbered list", block("s_exp")));
    expect(expItem().listStyle).toBe("number");
    expect(within(block("s_exp")).getByText("1.")).toBeTruthy();
    fireEvent.click(btn("Numbered list", block("s_exp")));
    expect(expItem().listStyle ?? null).toBeNull();
  });

  it("Enter still splits a bullet and the marks go with the text", () => {
    const d = doc();
    (d.sections[1] as Extract<ResumeSection, { kind: "EXPERIENCE" }>).items[0].bullets![0].marks = [{ s: 4, e: 13, t: "b" }];
    render(<CanvasHarness doc={d} caps={ATS_STRICT} />);
    const el = bullet(1);
    focus(el);
    el.setSelectionRange(3, 3);
    fireEvent.keyDown(el, { key: "Enter" });
    expect(expItem().bullets!.map((b) => b.text)).toEqual(["Led", " migration", "Cut latency"]);
    expect(expItem().bullets![0].marks).toBeUndefined();
    expect(expItem().bullets![1].marks).toEqual([{ s: 1, e: 10, t: "b" }]);
  });
});

describe("reducer: formatting vs typing", () => {
  const at = 1000;
  const marks: ResumeMark[] = [{ s: 0, e: 4, t: "b" }];

  it("a `format` edit is not coalesced with the typing before it; a plain edit still is", () => {
    let s = testState();
    s = editorReducer(s, { type: "summary/edit", sectionId: "s_sum", text: "Engineer.!", newItemId: "i_n", at });
    s = editorReducer(s, { type: "summary/edit", sectionId: "s_sum", text: "Engineer.!", newItemId: "i_n", marks, format: true, at: at + 10 });
    expect((currentDoc(s).sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items[0].marks).toEqual(marks);
    s = editorReducer(s, { type: "history/undo" });
    const first = (currentDoc(s).sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items[0];
    expect(first.text).toBe("Engineer.!");
    expect(first.marks).toBeUndefined();
  });

  it("bullet formatting is its own step too", () => {
    let s = testState();
    s = editorReducer(s, { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "Led the migration", at });
    s = editorReducer(s, { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "Led the migration", marks, format: true, at: at + 10 });
    s = editorReducer(s, { type: "history/undo" });
    const b = (currentDoc(s).sections[1] as Extract<ResumeSection, { kind: "EXPERIENCE" }>).items[0].bullets![0];
    expect(b.text).toBe("Led the migration");
    expect(b.marks).toBeUndefined();
  });
});
