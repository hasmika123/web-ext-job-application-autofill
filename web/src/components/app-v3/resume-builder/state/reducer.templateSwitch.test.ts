import { describe, expect, it } from "vitest";
import type { ResumeTheme } from "@kiwiply/ui";
import { canRedoEdit, canUndoEdit, currentDoc, editorReducer } from "./reducer";
import type { EditorAction, EditorState } from "./types";
import { testState } from "./test-doc";

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const edit = (title: string): EditorAction => ({ type: "title/edit", title, at: 1000 });
const THEMED: Partial<ResumeTheme> = { accent: "#2563eb", fontPair: "inter", _touched: ["accent"] };
const AFTER: Partial<ResumeTheme> = { accent: "#2563eb", fontPair: "source-serif", _touched: ["accent"] };
const sw = (templateId: string, theme = AFTER): EditorAction => ({ type: "template/switch", templateId, theme });

describe("template switch safety net (R3.4): the switch is one undo step that restores template AND theme", () => {
  it("a switch sets both and records before / after; the document and the save counters do not move", () => {
    const s0 = testState({ theme: THEMED });
    const s1 = run(s0, sw("classic"));
    expect(s1.templateId).toBe("classic");
    expect(s1.theme).toEqual(AFTER);
    expect(s1.templateUndo).toHaveLength(1);
    expect(s1.templateUndo[0]).toMatchObject({ before: { templateId: "modern", theme: THEMED }, after: { templateId: "classic", theme: AFTER } });
    expect(currentDoc(s1)).toBe(currentDoc(s0));
    expect(s1.rev).toBe(s0.rev); // the content is untouched: nothing for the autosave to send
    expect(canUndoEdit(s1)).toBe(true);
  });

  it("switching to the template already shown records nothing", () => {
    const s0 = testState({ theme: THEMED });
    expect(run(s0, sw("modern"))).toBe(s0);
  });

  it("Ctrl+Z restores the template and the theme together; Redo puts both back", () => {
    const s1 = run(testState({ theme: THEMED }), sw("classic"));
    const undone = run(s1, { type: "history/undo" });
    expect(undone.templateId).toBe("modern");
    expect(undone.theme).toEqual(THEMED);
    expect(canUndoEdit(undone)).toBe(false);
    expect(canRedoEdit(undone)).toBe(true);

    const redone = run(undone, { type: "history/redo" });
    expect(redone.templateId).toBe("classic");
    expect(redone.theme).toEqual(AFTER);
    expect(canRedoEdit(redone)).toBe(false);
    expect(canUndoEdit(redone)).toBe(true);
  });

  it("a theme that was never set comes back as null", () => {
    const undone = run(testState(), sw("classic", { fontPair: "source-serif" }), { type: "history/undo" });
    expect(undone.theme).toBeNull();
  });

  it("keeps the order things happened in: typing after a switch is undone first, then the switch, then earlier typing", () => {
    let s = testState({ theme: THEMED });
    s = run(s, edit("One"), sw("classic"), edit("Two"));
    s = run(s, { type: "history/undo" });
    expect(currentDoc(s).meta.title).toBe("One");
    expect(s.templateId).toBe("classic"); // the switch is still in force

    s = run(s, { type: "history/undo" });
    expect(s.templateId).toBe("modern");
    expect(currentDoc(s).meta.title).toBe("One"); // and the typing before it stays

    s = run(s, { type: "history/undo" });
    expect(currentDoc(s).meta.title).not.toBe("One");

    // and back up in the same order
    s = run(s, { type: "history/redo" });
    expect(currentDoc(s).meta.title).toBe("One");
    expect(s.templateId).toBe("modern");
    s = run(s, { type: "history/redo" });
    expect(s.templateId).toBe("classic");
    s = run(s, { type: "history/redo" });
    expect(currentDoc(s).meta.title).toBe("Two");
  });

  it("an edit after an undone switch ends its redo (as it ends the document's)", () => {
    const undone = run(testState({ theme: THEMED }), sw("classic"), { type: "history/undo" });
    expect(undone.templateRedo).toHaveLength(1);
    const edited = run(undone, edit("New"));
    expect(edited.templateRedo).toHaveLength(0);
    expect(run(edited, { type: "history/redo" }).templateId).toBe("modern");
  });

  it("a switch clears the document's redo; two switches undo one at a time, newest first", () => {
    let s = run(testState({ theme: THEMED }), edit("One"), { type: "history/undo" });
    expect(canRedoEdit(s)).toBe(true);
    s = run(s, sw("classic"));
    expect(s.history.future).toHaveLength(0);

    s = run(s, sw("compact", { accent: "#16a34a" }));
    s = run(s, { type: "history/undo" });
    expect(s.templateId).toBe("classic");
    expect(s.theme).toEqual(AFTER);
    s = run(s, { type: "history/undo" });
    expect(s.templateId).toBe("modern");
    expect(s.theme).toEqual(THEMED);
  });

  it("the toast's Undo takes the newest switch back even after typing, and Redo then works at once", () => {
    let s = run(testState({ theme: THEMED }), sw("classic"), edit("Typed after"));
    s = run(s, { type: "template/undo" });
    expect(s.templateId).toBe("modern");
    expect(s.theme).toEqual(THEMED);
    expect(currentDoc(s).meta.title).toBe("Typed after"); // the typing is not undone

    const redone = run(s, { type: "history/redo" });
    expect(redone.templateId).toBe("classic");
  });

  it("the toast's Undo does nothing once the template is no longer the one the switch chose", () => {
    const s = run(testState({ theme: THEMED }), sw("classic"), { type: "presentation/set", templateId: "compact" });
    expect(run(s, { type: "template/undo" })).toBe(s);
  });

  it("a refused switch drops its undo entry", () => {
    const s = run(testState({ theme: THEMED }), sw("classic"), { type: "template/forget", templateId: "classic" });
    expect(s.templateUndo).toHaveLength(0);
    expect(run(s, { type: "template/forget", templateId: "classic" })).toBe(s);
  });

  it("taking the other copy in a conflict forgets the switches (they belonged to the old document)", () => {
    const s = run(testState({ theme: THEMED }), sw("classic"), {
      type: "save/conflict",
      serverVersion: 7,
      doc: currentDoc(testState()),
    });
    const taken = run(s, { type: "conflict/takeTheirs" });
    expect(taken.templateUndo).toHaveLength(0);
    expect(taken.templateRedo).toHaveLength(0);
    expect(taken.templateId).toBe("classic"); // the presentation itself is the server's and stays
  });
});
