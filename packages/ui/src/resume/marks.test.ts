import { describe, expect, it } from "vitest";
import { isCovered, isLinkHref, shiftMarks, sortMarks, toggleMark } from "./marks";
import type { Mark } from "./types";

const b = (s: number, e: number): Mark => ({ s, e, t: "b" });
const i = (s: number, e: number): Mark => ({ s, e, t: "i" });
const a = (s: number, e: number, href = "https://x.dev"): Mark => ({ s, e, t: "a", href });

describe("sortMarks", () => {
  it("sorts by (s, e, t) without mutating", () => {
    const input: Mark[] = [{ s: 4, e: 9, t: "u" }, i(0, 5), b(0, 5), b(0, 2)];
    const out = sortMarks(input);
    expect(out).toEqual([b(0, 2), b(0, 5), i(0, 5), { s: 4, e: 9, t: "u" }]);
    expect(input[0]).toEqual({ s: 4, e: 9, t: "u" });
  });
});

describe("isCovered", () => {
  it("needs the whole range covered by marks of that type", () => {
    expect(isCovered([b(2, 8)], 3, 6, "b")).toBe(true);
    expect(isCovered([b(2, 8)], 2, 8, "b")).toBe(true);
    expect(isCovered([b(2, 8)], 1, 6, "b")).toBe(false);
    expect(isCovered([b(2, 8)], 3, 9, "b")).toBe(false);
    expect(isCovered([b(2, 8)], 3, 6, "i")).toBe(false);
  });

  it("sees through touching and overlapping marks of the same type, but not gaps", () => {
    expect(isCovered([b(0, 3), b(3, 6)], 1, 5, "b")).toBe(true);
    expect(isCovered([b(0, 3), b(4, 6)], 1, 5, "b")).toBe(false);
  });

  it("an empty or inverted range is never covered", () => {
    expect(isCovered([b(0, 9)], 4, 4, "b")).toBe(false);
    expect(isCovered([b(0, 9)], 5, 2, "b")).toBe(false);
  });
});

describe("toggleMark", () => {
  it("adds a mark over an unmarked range", () => {
    expect(toggleMark([], 2, 5, "b")).toEqual([b(2, 5)]);
  });

  it("removes the coverage when the whole range is already covered", () => {
    expect(toggleMark([b(2, 5)], 2, 5, "b")).toEqual([]);
  });

  it("splits a longer mark around a covered sub-range", () => {
    expect(toggleMark([b(0, 10)], 3, 6, "b")).toEqual([b(0, 3), b(6, 10)]);
    expect(toggleMark([b(0, 10)], 0, 4, "b")).toEqual([b(4, 10)]);
    expect(toggleMark([b(0, 10)], 6, 10, "b")).toEqual([b(0, 6)]);
  });

  it("adds over a partially covered range and merges into one mark", () => {
    expect(toggleMark([b(0, 4)], 2, 8, "b")).toEqual([b(0, 8)]);
    expect(toggleMark([b(0, 4), b(6, 9)], 3, 7, "b")).toEqual([b(0, 9)]);
  });

  it("merges with an adjacent mark of the same type", () => {
    expect(toggleMark([b(0, 3)], 3, 6, "b")).toEqual([b(0, 6)]);
    expect(toggleMark([b(5, 8)], 2, 5, "b")).toEqual([b(2, 8)]);
  });

  it("leaves other types alone (they may overlap)", () => {
    expect(toggleMark([b(0, 6)], 3, 9, "i")).toEqual([b(0, 6), i(3, 9)]);
    expect(toggleMark([b(0, 6), i(3, 9)], 3, 6, "b")).toEqual([b(0, 3), i(3, 9)]);
  });

  it("returns a sorted result", () => {
    expect(toggleMark([i(6, 9)], 0, 2, "b")).toEqual([b(0, 2), i(6, 9)]);
  });

  it("a link needs a valid href; links to different targets do not merge", () => {
    expect(toggleMark([], 0, 4, "a")).toEqual([]);
    expect(toggleMark([], 0, 4, "a", "javascript:alert(1)")).toEqual([]);
    expect(toggleMark([], 0, 4, "a", "https://x.dev")).toEqual([a(0, 4)]);
    expect(toggleMark([a(0, 4)], 4, 8, "a", "https://x.dev")).toEqual([a(0, 8)]);
    expect(toggleMark([a(0, 4, "https://one.dev")], 4, 8, "a", "https://two.dev")).toEqual([a(0, 4, "https://one.dev"), a(4, 8, "https://two.dev")]);
  });

  it("re-linking a partly linked range replaces the overlapped part", () => {
    expect(toggleMark([a(0, 6, "https://one.dev")], 4, 9, "a", "https://two.dev")).toEqual([
      a(0, 4, "https://one.dev"),
      a(4, 9, "https://two.dev"),
    ]);
  });

  it("toggling a link off ignores its target", () => {
    expect(toggleMark([a(2, 6)], 2, 6, "a")).toEqual([]);
  });

  it("ignores empty, inverted and negative ranges, and does not mutate", () => {
    const marks = [b(0, 3)];
    expect(toggleMark(marks, 5, 5, "b")).toEqual([b(0, 3)]);
    expect(toggleMark(marks, 6, 2, "b")).toEqual([b(0, 3)]);
    expect(toggleMark(marks, -2, 2, "b")).toEqual([b(0, 3)]);
    toggleMark(marks, 3, 6, "b");
    expect(marks).toEqual([b(0, 3)]);
  });
});

describe("shiftMarks (text edits)", () => {
  it("leaves marks before the edit alone and moves marks after it", () => {
    expect(shiftMarks([b(0, 3), i(8, 12)], 5, 0, 4)).toEqual([b(0, 3), i(12, 16)]);
    expect(shiftMarks([b(0, 3), i(8, 12)], 5, 2, 0)).toEqual([b(0, 3), i(6, 10)]);
  });

  it("an insert inside a mark grows it, a delete inside shrinks it", () => {
    expect(shiftMarks([b(2, 8)], 5, 0, 3)).toEqual([b(2, 11)]);
    expect(shiftMarks([b(2, 8)], 4, 2, 0)).toEqual([b(2, 6)]);
  });

  it("an insert exactly at either end of a mark does not extend it", () => {
    expect(shiftMarks([b(2, 8)], 8, 0, 3)).toEqual([b(2, 8)]);
    expect(shiftMarks([b(2, 8)], 2, 0, 3)).toEqual([b(5, 11)]);
  });

  it("replacing text inside a mark keeps the mark around the new text", () => {
    expect(shiftMarks([b(2, 10)], 4, 3, 5)).toEqual([b(2, 12)]);
  });

  it("deleting across the start or the end of a mark trims it", () => {
    expect(shiftMarks([b(4, 10)], 2, 4, 0)).toEqual([b(2, 6)]);
    expect(shiftMarks([b(2, 6)], 4, 4, 0)).toEqual([b(2, 4)]);
  });

  it("a replacement overlapping the mark's edge keeps the inserted text outside the mark", () => {
    expect(shiftMarks([b(2, 6)], 4, 4, 2)).toEqual([b(2, 4)]);
    expect(shiftMarks([b(6, 10)], 4, 4, 2)).toEqual([b(6, 8)]);
  });

  it("a mark around the edit (deleting it all) is dropped when no character is left", () => {
    expect(shiftMarks([b(3, 5)], 3, 2, 0)).toEqual([]);
    expect(shiftMarks([b(3, 5)], 2, 5, 0)).toEqual([]);
    expect(shiftMarks([b(3, 5)], 2, 5, 2)).toEqual([]);
  });

  it("a mark that spans the whole edit grows or shrinks with it", () => {
    expect(shiftMarks([b(0, 10)], 3, 4, 1)).toEqual([b(0, 7)]);
    expect(shiftMarks([b(0, 10)], 3, 4, 9)).toEqual([b(0, 15)]);
  });

  it("merges marks that end up touching", () => {
    expect(shiftMarks([b(0, 3), b(5, 8)], 3, 2, 0)).toEqual([b(0, 6)]);
    expect(shiftMarks([a(0, 3, "https://one.dev"), a(5, 8, "https://two.dev")], 3, 2, 0)).toEqual([
      a(0, 3, "https://one.dev"),
      a(3, 6, "https://two.dev"),
    ]);
  });

  it("keeps href and type, does not mutate", () => {
    const marks = [a(2, 6)];
    expect(shiftMarks(marks, 0, 0, 2)).toEqual([a(4, 8)]);
    expect(marks).toEqual([a(2, 6)]);
  });

  it("a no-op edit changes nothing", () => {
    expect(shiftMarks([b(1, 4), i(2, 9)], 5, 0, 0)).toEqual([b(1, 4), i(2, 9)]);
  });
});

describe("isLinkHref", () => {
  it("accepts http(s) and mailto after trim, nothing else", () => {
    for (const ok of ["http://a.dev", "https://a.dev/x", "mailto:a@b.dev", "  https://a.dev "]) expect(isLinkHref(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "ftp://a.dev", "//a.dev", "a.dev", "", undefined, 5]) expect(isLinkHref(bad)).toBe(false);
  });
});
