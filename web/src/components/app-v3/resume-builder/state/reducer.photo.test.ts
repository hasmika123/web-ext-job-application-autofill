import { describe, expect, it } from "vitest";
import { canUndoEdit, currentDoc, editorReducer, hasUnsaved } from "./reducer";
import type { EditorAction, EditorState } from "./types";
import { testState } from "./test-doc";

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const PHOTO = { key: "resume-photos/3/7-abc-photo.jpg", updatedAt: "2026-10-17T10:00:00Z" };

describe("photo/set (R7.4): server-owned content, not an edit", () => {
  it("puts basics.photo in the document and adopts the version, without an undo step or anything unsaved", () => {
    const before = testState();
    const s = run(before, { type: "photo/set", photo: PHOTO, version: 5 });

    expect(currentDoc(s).basics.photo).toEqual(PHOTO);
    expect(s.docVersion).toBe(5);
    expect(canUndoEdit(s)).toBe(false);
    expect(hasUnsaved(s)).toBe(false);
    expect(s.rev).toBe(before.rev);
    expect(s.savedRev).toBe(before.savedRev);
    expect(currentDoc(before).basics.photo).toBeUndefined(); // the old snapshot is untouched
  });

  it("keeps unsaved typing unsaved, and Undo of the typing does not take the photo away", () => {
    const typed = run(testState(), { type: "title/edit", title: "Renamed", at: 1000 });
    expect(hasUnsaved(typed)).toBe(true);

    const withPhoto = run(typed, { type: "photo/set", photo: PHOTO, version: 6 });
    expect(hasUnsaved(withPhoto)).toBe(true); // the typing still has to be saved
    const undone = run(withPhoto, { type: "history/undo" });
    expect(currentDoc(undone).meta.title).not.toBe("Renamed"); // the undo happened...
    expect(currentDoc(undone).basics.photo).toEqual(PHOTO); // ...and the photo is still there
    const redone = run(undone, { type: "history/redo" });
    expect(currentDoc(redone).meta.title).toBe("Renamed");
    expect(currentDoc(redone).basics.photo).toEqual(PHOTO);
  });

  it("removing the photo clears it from every snapshot, so Undo can never bring back a deleted file's key", () => {
    const s = run(
      testState(),
      { type: "photo/set", photo: PHOTO, version: 5 },
      { type: "title/edit", title: "A", at: 1000 },
      { type: "title/edit", title: "B", at: 9000 },
      { type: "history/undo" },
      { type: "photo/set", photo: null, version: 6 },
    );
    expect(currentDoc(s).basics.photo).toBeNull();
    expect(s.docVersion).toBe(6);
    const allDocs = [...s.history.past, s.history.present, ...s.history.future];
    expect(allDocs.length).toBeGreaterThan(2);
    for (const d of allDocs) expect(d.basics.photo).toBeNull();
    expect(JSON.stringify(allDocs)).not.toContain("resume-photos");
  });
});
