import { describe, expect, it } from "vitest";
import { COALESCE_MS, HISTORY_CAP, canRedo, canUndo, createHistory, record, redo, undo } from "./history";

describe("history", () => {
  it("records steps and undoes/redoes them", () => {
    let h = createHistory("a");
    h = record(h, "b", { at: 0 });
    h = record(h, "c", { at: 0 });
    expect(h.present).toBe("c");
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);

    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h); // nothing left: same object

    h = redo(h);
    expect(h.present).toBe("b");
    h = redo(redo(h));
    expect(h.present).toBe("c");
    expect(redo(h)).toBe(h);
  });

  it("a new record after an undo clears the redo stack", () => {
    let h = record(record(createHistory(1), 2, { at: 0 }), 3, { at: 0 });
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = record(h, 9, { at: 0 });
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([1, 2]);
  });

  it("ignores a record identical to the present", () => {
    const h = createHistory({ x: 1 });
    expect(record(h, h.present, { at: 5 })).toBe(h);
  });

  describe("coalescing", () => {
    it("merges typing in the same field within the window into one step", () => {
      let h = createHistory("");
      h = record(h, "h", { key: "f", at: 0 });
      h = record(h, "he", { key: "f", at: 100 });
      h = record(h, "hel", { key: "f", at: 250 });
      expect(h.past).toEqual([""]); // one undo step
      expect(h.present).toBe("hel");
      expect(undo(h).present).toBe("");
    });

    it("keeps merging while each keystroke is within the window of the previous one", () => {
      let h = createHistory("");
      let t = 0;
      for (const v of ["a", "ab", "abc", "abcd"]) {
        h = record(h, v, { key: "f", at: t });
        t += COALESCE_MS - 1;
      }
      expect(h.past).toEqual([""]);
    });

    it("starts a new step after a pause longer than the window", () => {
      let h = createHistory("");
      h = record(h, "a", { key: "f", at: 0 });
      h = record(h, "ab", { key: "f", at: COALESCE_MS + 1 });
      expect(h.past).toEqual(["", "a"]);
    });

    it("starts a new step for a different field or an unkeyed (structural) change", () => {
      let h = createHistory("");
      h = record(h, "a", { key: "f", at: 0 });
      h = record(h, "ab", { key: "g", at: 10 });
      h = record(h, "abc", { at: 20 });
      h = record(h, "abcd", { key: "g", at: 30 });
      expect(h.past).toEqual(["", "a", "ab", "abc"]);
    });

    it("does not coalesce across an undo", () => {
      let h = createHistory("");
      h = record(h, "a", { key: "f", at: 0 });
      h = record(h, "ab", { key: "f", at: 10 });
      h = undo(h);
      h = record(h, "x", { key: "f", at: 20 });
      expect(h.past).toEqual([""]);
      expect(h.present).toBe("x");
      expect(canRedo(h)).toBe(false);
      h = record(h, "xy", { key: "f", at: 30 });
      expect(h.past).toEqual([""]); // merged into the post-undo step
    });
  });

  describe("cap", () => {
    it("keeps at most HISTORY_CAP undo steps, dropping the oldest", () => {
      let h = createHistory(0);
      for (let i = 1; i <= HISTORY_CAP + 25; i++) h = record(h, i, { at: 0 });
      expect(h.past.length).toBe(HISTORY_CAP);
      expect(h.past[0]).toBe(25); // 0..24 fell off
      expect(h.present).toBe(HISTORY_CAP + 25);
      // Undo all the way: lands on the oldest retained snapshot.
      let back = h;
      while (canUndo(back)) back = undo(back);
      expect(back.present).toBe(25);
    });

    it("honours a custom cap", () => {
      let h = createHistory(0);
      for (let i = 1; i <= 10; i++) h = record(h, i, { at: 0, cap: 3 });
      expect(h.past).toEqual([7, 8, 9]);
    });
  });
});
