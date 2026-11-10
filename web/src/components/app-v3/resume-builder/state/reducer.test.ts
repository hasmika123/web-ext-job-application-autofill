import { describe, expect, it } from "vitest";
import type { ResumeDocument, ResumeSection } from "@kiwiply/ui";
import {
  MAX_BULLETS,
  MAX_BULLET_CHARS,
  MAX_ITEMS,
  canRedoEdit,
  canUndoEdit,
  currentDoc,
  editorReducer,
  hasUnsaved,
  saveStatus,
} from "./reducer";
import type { EditorAction, EditorState } from "./types";
import { testDoc, testState } from "./test-doc";

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const exp = (doc: ResumeDocument) => doc.sections.find((s) => s.id === "s_exp") as Extract<ResumeSection, { kind: "EXPERIENCE" }>;
const bulletsOf = (doc: ResumeDocument, itemId = "i_exp00001") => exp(doc).items.find((i) => i.id === itemId)!.bullets!;
const ids = (doc: ResumeDocument, itemId?: string) => bulletsOf(doc, itemId).map((b) => b.id);
const texts = (doc: ResumeDocument, itemId?: string) => bulletsOf(doc, itemId).map((b) => b.text);
const at = 1000;

describe("document edits", () => {
  it("edits the summary and marks the text as user-authored", () => {
    const s = run(testState(), { type: "summary/edit", sectionId: "s_sum", text: "Backend engineer.", newItemId: "i_new00001", at });
    const sum = currentDoc(s).sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>;
    expect(sum.items).toHaveLength(1);
    expect(sum.items[0]).toMatchObject({ id: "i_sum0001", text: "Backend engineer.", src: "user" });
    expect(hasUnsaved(s)).toBe(true);
  });

  it("creates the summary item (with the supplied id) when the section is empty", () => {
    const base = testState();
    const doc = testDoc();
    (doc.sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items = [];
    const s = run({ ...base, history: { ...base.history, present: doc } }, { type: "summary/edit", sectionId: "s_sum", text: "Hi", newItemId: "i_new00001", at });
    expect((currentDoc(s).sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items).toEqual([{ id: "i_new00001", text: "Hi", src: "user" }]);
  });

  it("clamps text to the server limits", () => {
    const s = run(
      testState(),
      { type: "summary/edit", sectionId: "s_sum", text: "x".repeat(5000), newItemId: "i_n", at },
      { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "y".repeat(900), at },
    );
    expect((currentDoc(s).sections[0] as Extract<ResumeSection, { kind: "SUMMARY" }>).items[0].text).toHaveLength(2000);
    expect(texts(currentDoc(s))[0]).toHaveLength(MAX_BULLET_CHARS);
  });

  it("edits item fields; empty dates become null; `current` toggles", () => {
    const s = run(
      testState(),
      { type: "item/field", sectionId: "s_exp", itemId: "i_exp00001", field: "title", value: "Staff Engineer", at },
      { type: "item/field", sectionId: "s_exp", itemId: "i_exp00001", field: "start", value: "", at },
      { type: "item/current", sectionId: "s_exp", itemId: "i_exp00001", current: false, at },
    );
    expect(exp(currentDoc(s)).items[0]).toMatchObject({ title: "Staff Engineer", start: null, current: false });
  });

  it("renames the resume (meta.title)", () => {
    const s = run(testState(), { type: "title/edit", title: "Platform SWE", at });
    expect(currentDoc(s).meta.title).toBe("Platform SWE");
  });

  it("adds an experience item on top with one empty bullet, and removes it", () => {
    let s = run(testState(), { type: "item/add", sectionId: "s_exp", itemId: "i_new00001", bulletId: "b_new00001", at });
    expect(exp(currentDoc(s)).items.map((i) => i.id)).toEqual(["i_new00001", "i_exp00001", "i_exp00002"]);
    expect(bulletsOf(currentDoc(s), "i_new00001")).toEqual([{ id: "b_new00001", text: "", src: "user" }]);
    s = run(s, { type: "item/remove", sectionId: "s_exp", itemId: "i_new00001", at });
    expect(exp(currentDoc(s)).items.map((i) => i.id)).toEqual(["i_exp00001", "i_exp00002"]);
  });

  it("refuses to add past the item cap", () => {
    const base = testState();
    const doc = testDoc();
    const e = exp(doc);
    e.items = Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `i_full${String(i).padStart(4, "0")}`, bullets: [] }));
    const s = run({ ...base, history: { ...base.history, present: doc } }, { type: "item/add", sectionId: "s_exp", itemId: "i_over0001", bulletId: "b_over0001", at });
    expect(s.rev).toBe(0);
    expect(exp(currentDoc(s)).items).toHaveLength(MAX_ITEMS);
  });

  it("keeps untouched sections and items by reference (structural sharing)", () => {
    const s0 = testState();
    const s1 = run(s0, { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "Changed", at });
    const before = currentDoc(s0);
    const after = currentDoc(s1);
    expect(after).not.toBe(before);
    expect(after.sections[0]).toBe(before.sections[0]);
    expect(after.sections[2]).toBe(before.sections[2]);
    expect(after.sections[1]).not.toBe(before.sections[1]);
    expect(exp(after).items[1]).toBe(exp(before).items[1]);
  });

  it("is a no-op (same state object, rev unchanged) when nothing changes", () => {
    const s0 = testState();
    const s1 = editorReducer(s0, { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "Led migration", at });
    expect(s1).toBe(s0);
    expect(editorReducer(s0, { type: "bullet/edit", sectionId: "nope", itemId: "x", bulletId: "y", text: "z", at })).toBe(s0);
  });
});

describe("bullet behaviour (Enter / Backspace)", () => {
  it("add appends an empty bullet (also to an item with none)", () => {
    const s = run(
      testState(),
      { type: "bullet/add", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_cccccccc", at },
      { type: "bullet/add", sectionId: "s_exp", itemId: "i_exp00002", bulletId: "b_dddddddd", at },
    );
    expect(ids(currentDoc(s))).toEqual(["b_aaaaaaaa", "b_bbbbbbbb", "b_cccccccc"]);
    expect(ids(currentDoc(s), "i_exp00002")).toEqual(["b_dddddddd"]);
  });

  it("add stops at the bullet cap", () => {
    let s = testState();
    for (let i = 0; i < MAX_BULLETS + 3; i++) {
      s = run(s, { type: "bullet/add", sectionId: "s_exp", itemId: "i_exp00001", bulletId: `b_extra${String(i).padStart(3, "0")}`, at });
    }
    expect(bulletsOf(currentDoc(s))).toHaveLength(MAX_BULLETS);
  });

  it("Enter splits at the caret: text before stays, text after moves to a new bullet below", () => {
    const s = run(testState(), {
      type: "bullet/split",
      sectionId: "s_exp",
      itemId: "i_exp00001",
      bulletId: "b_aaaaaaaa",
      before: "Led ",
      after: "migration",
      newBulletId: "b_newnewne",
      at,
    });
    expect(texts(currentDoc(s))).toEqual(["Led ", "migration", "Cut latency"]);
    expect(ids(currentDoc(s))).toEqual(["b_aaaaaaaa", "b_newnewne", "b_bbbbbbbb"]);
  });

  it("Enter at the end creates an empty bullet below", () => {
    const s = run(testState(), {
      type: "bullet/split", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_bbbbbbbb", before: "Cut latency", after: "", newBulletId: "b_newnewne", at,
    });
    expect(texts(currentDoc(s))).toEqual(["Led migration", "Cut latency", ""]);
  });

  it("Backspace on an empty bullet removes it", () => {
    const s = run(
      testState(),
      { type: "bullet/add", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_cccccccc", at },
      { type: "bullet/remove", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_cccccccc", at },
    );
    expect(ids(currentDoc(s))).toEqual(["b_aaaaaaaa", "b_bbbbbbbb"]);
  });

  it("Backspace at the start of a non-empty bullet merges it into the one above", () => {
    const s = run(testState(), { type: "bullet/mergeUp", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_bbbbbbbb", at });
    expect(texts(currentDoc(s))).toEqual(["Led migrationCut latency"]);
    expect(ids(currentDoc(s))).toEqual(["b_aaaaaaaa"]);
  });

  it("merge does nothing on the first bullet or when the result would exceed the cap", () => {
    const first = run(testState(), { type: "bullet/mergeUp", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", at });
    expect(first.rev).toBe(0);

    const base = testState();
    const doc = testDoc();
    bulletsOf(doc)[0].text = "a".repeat(400);
    bulletsOf(doc)[1].text = "b".repeat(400);
    const big = run({ ...base, history: { ...base.history, present: doc } }, { type: "bullet/mergeUp", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_bbbbbbbb", at });
    expect(bulletsOf(currentDoc(big))).toHaveLength(2);
  });
});

describe("undo / redo", () => {
  it("coalesces a burst of typing into one undo step", () => {
    let s = testState();
    for (const [i, t] of ["L", "Le", "Led", "Led it"].entries()) {
      s = run(s, { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: t, at: at + i * 50 });
    }
    expect(s.rev).toBe(4);
    s = run(s, { type: "history/undo" });
    expect(texts(currentDoc(s))[0]).toBe("Led migration");
    expect(canUndoEdit(s)).toBe(false);
    expect(canRedoEdit(s)).toBe(true);
    s = run(s, { type: "history/redo" });
    expect(texts(currentDoc(s))[0]).toBe("Led it");
  });

  it("undo and redo count as changes to save", () => {
    let s = run(testState(), { type: "title/edit", title: "A", at });
    s = { ...s, savedRev: s.rev };
    expect(hasUnsaved(s)).toBe(false);
    s = run(s, { type: "history/undo" });
    expect(hasUnsaved(s)).toBe(true);
    expect(currentDoc(s).meta.title).toBe("Backend SWE");
  });

  it("undo/redo with nothing to do returns the same state", () => {
    const s = testState();
    expect(editorReducer(s, { type: "history/undo" })).toBe(s);
    expect(editorReducer(s, { type: "history/redo" })).toBe(s);
  });
});

describe("save lifecycle", () => {
  const edited = () => run(testState(), { type: "title/edit", title: "A", at });

  it("shows saving while dirty, saved once the sent revision is confirmed", () => {
    let s = edited();
    expect(saveStatus(s)).toBe("saving"); // unsaved, not yet sent
    s = run(s, { type: "save/start" });
    expect(s.phase).toBe("saving");
    s = run(s, { type: "save/ok", rev: s.rev, version: 2, at: 5 });
    expect(saveStatus(s)).toBe("saved");
    expect(s.docVersion).toBe(2);
    expect(s.savedAt).toBe(5);
  });

  it("edits made while a save was in flight stay unsaved", () => {
    let s = run(edited(), { type: "save/start" });
    const sentRev = s.rev;
    s = run(s, { type: "title/edit", title: "AB", at: at + 5000 });
    s = run(s, { type: "save/ok", rev: sentRev, version: 2, at: 5 });
    expect(hasUnsaved(s)).toBe(true);
    expect(saveStatus(s)).toBe("saving");
  });

  it("retrying and failed phases surface in the status", () => {
    expect(saveStatus(run(edited(), { type: "save/retrying" }))).toBe("retrying");
    const failed = run(edited(), { type: "save/failed", message: "boom" });
    expect(saveStatus(failed)).toBe("error");
    expect(failed.error).toBe("boom");
    // The next edit is a fresh attempt: the error clears.
    const again = run(failed, { type: "title/edit", title: "AB", at });
    expect(again.phase).toBe("idle");
    expect(again.error).toBeNull();
  });

  describe("409 conflict", () => {
    const serverDoc = (): ResumeDocument => ({ ...testDoc(), meta: { title: "Server copy" } });
    const conflicted = () => run(edited(), { type: "save/start" }, { type: "save/conflict", serverVersion: 7, doc: serverDoc() });

    it("enters the conflict phase carrying the server's document", () => {
      const s = conflicted();
      expect(saveStatus(s)).toBe("conflict");
      expect(s.conflict?.serverVersion).toBe(7);
      // A retry timer firing meanwhile must not leave the conflict.
      expect(run(s, { type: "save/retrying" }).phase).toBe("conflict");
      expect(run(s, { type: "save/start" }).phase).toBe("conflict");
    });

    it("keep mine: my document stays, the next save targets the server's version", () => {
      const s = run(conflicted(), { type: "conflict/keepMine" });
      expect(s.conflict).toBeNull();
      expect(s.docVersion).toBe(7);
      expect(currentDoc(s).meta.title).toBe("A");
      expect(hasUnsaved(s)).toBe(true);
    });

    it("take theirs: the server's document replaces mine, history restarts, nothing left to save", () => {
      const s = run(conflicted(), { type: "conflict/takeTheirs" });
      expect(currentDoc(s).meta.title).toBe("Server copy");
      expect(s.docVersion).toBe(7);
      expect(s.conflict).toBeNull();
      expect(hasUnsaved(s)).toBe(false);
      expect(canUndoEdit(s)).toBe(false);
      expect(saveStatus(s)).toBe("saved");
    });

    it("resolving without a conflict is a no-op", () => {
      const s = testState();
      expect(editorReducer(s, { type: "conflict/keepMine" })).toBe(s);
      expect(editorReducer(s, { type: "conflict/takeTheirs" })).toBe(s);
    });
  });
});

describe("presentation (template + theme, R2.4)", () => {
  it("presentation/set changes the template and theme without touching the document, rev or undo history", () => {
    const s = testState();
    const next = editorReducer(s, { type: "presentation/set", templateId: "classic", theme: { accent: "#16a34a" } });
    expect(next.templateId).toBe("classic");
    expect(next.theme).toEqual({ accent: "#16a34a" });
    expect(currentDoc(next)).toBe(currentDoc(s));
    expect(next.rev).toBe(s.rev);
    expect(hasUnsaved(next)).toBe(false);
    expect(canUndoEdit(next)).toBe(false);
  });

  it("leaves what is not mentioned alone, and an identical value is a no-op", () => {
    const s = testState({ theme: { accent: "#2563eb" } });
    const themeOnly = editorReducer(s, { type: "presentation/set", theme: { accent: "#16a34a" } });
    expect(themeOnly.templateId).toBe("modern");
    const tplOnly = editorReducer(s, { type: "presentation/set", templateId: "classic" });
    expect(tplOnly.theme).toBe(s.theme);
    expect(editorReducer(s, { type: "presentation/set", templateId: "modern" })).toBe(s);
    expect(editorReducer(s, { type: "presentation/set", theme: s.theme })).toBe(s);
  });

  it("a null theme is a real value (back to the template's defaults)", () => {
    const s = testState({ theme: { accent: "#2563eb" } });
    expect(editorReducer(s, { type: "presentation/set", theme: null }).theme).toBeNull();
  });

  it("presentation/version adopts the PATCH's ETag without marking anything unsaved", () => {
    const s = testState({ docVersion: 3 });
    const next = editorReducer(s, { type: "presentation/version", version: 4 });
    expect(next.docVersion).toBe(4);
    expect(hasUnsaved(next)).toBe(false);
    expect(editorReducer(next, { type: "presentation/version", version: 4 })).toBe(next);
  });
});
