/**
 * Pure functions over inline marks (DESIGN 3.3): the model behind the editor's B / I / U / link
 * toolbar and the text edits that must keep marks attached to the right characters.
 *
 * A mark is `{ s, e, t, href? }` on the plain text next to it (`s` inclusive, `e` exclusive, UTF-16
 * code units - JS string indexes and Java `String` agree). The text is the single source of truth.
 * Invariants every function here maintains and assumes: `0 <= s < e`, two marks of the same `t` never
 * overlap, `href` only on `t === "a"`, and the result is sorted by `(s, e, t)`. No function mutates
 * its arguments.
 */
import { MARK_TYPES, type Mark, type MarkType } from "./types";

/** `^(https?://|mailto:)` after trim - the only link targets a mark may carry. */
export const LINK_HREF = /^(https?:\/\/|mailto:)/;

export function isLinkHref(href: unknown): href is string {
  return typeof href === "string" && LINK_HREF.test(href.replace(/^[\t-\r ]+|[\t-\r ]+$/g, ""));
}

/** Sorted by `(s, e, t)`: ints ascending, then `t` by UTF-16 code unit (same order as the canonicaliser). */
export function sortMarks(marks: readonly Mark[]): Mark[] {
  return [...marks].sort((a, b) => a.s - b.s || a.e - b.e || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}

/** True when marks of type `t` cover every character of `[s, e)` (and `s < e`). */
export function isCovered(marks: readonly Mark[], s: number, e: number, t: MarkType): boolean {
  if (!(s < e)) return false;
  let at = s;
  for (const m of sortMarks(marks.filter((x) => x.t === t))) {
    if (m.e <= at) continue;
    if (m.s > at) return false;
    at = m.e;
    if (at >= e) return true;
  }
  return false;
}

/** Same type, touching or overlapping, and (for links) the same target -> one mark. */
function mergeable(a: Mark, b: Mark): boolean {
  return a.t === b.t && b.s <= a.e && (a.t !== "a" || a.href === b.href);
}

function merge(marks: readonly Mark[]): Mark[] {
  const out: Mark[] = [];
  for (const m of sortMarks(marks)) {
    const last = out[out.length - 1];
    if (last && mergeable(last, m)) {
      out[out.length - 1] = { ...last, e: Math.max(last.e, m.e) };
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** Removes `[s, e)` from every mark of type `t`, keeping the pieces on either side. */
function cut(marks: readonly Mark[], s: number, e: number, t: MarkType): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.t !== t || m.e <= s || m.s >= e) {
      out.push(m);
      continue;
    }
    if (m.s < s) out.push({ ...m, e: s });
    if (m.e > e) out.push({ ...m, s: e });
  }
  return out;
}

/** Removes every `t` mark from `[s, e)` (a longer mark keeps the pieces outside it). Used for "Remove link". */
export function clearMark(marks: readonly Mark[], s: number, e: number, t: MarkType): Mark[] {
  if (!(s < e) || s < 0) return sortMarks(marks);
  return merge(cut(marks, s, e, t));
}

/** The mark of type `t` that contains offset `at` (`s <= at < e`, or `at == e` when `touchEnd`), or null. */
export function markAt(marks: readonly Mark[], at: number, t: MarkType, touchEnd = false): Mark | null {
  return marks.find((m) => m.t === t && m.s <= at && (at < m.e || (touchEnd && at === m.e))) ?? null;
}

/**
 * The toolbar action. If `[s, e)` is entirely covered by `t` the coverage is removed from the range
 * (the rest of a longer mark survives on either side); otherwise `t` is added over the whole range,
 * absorbing what it overlaps, and merged with touching marks of the same type. For a link, `href` is
 * required and links only merge when they point at the same place. An empty or inverted range (or a
 * link without a valid `href`) changes nothing.
 */
export function toggleMark(marks: readonly Mark[], s: number, e: number, t: MarkType, href?: string): Mark[] {
  if (!(s < e) || s < 0 || !MARK_TYPES.includes(t)) return sortMarks(marks);
  if (isCovered(marks, s, e, t)) return merge(cut(marks, s, e, t));
  if (t === "a" && !isLinkHref(href)) return sortMarks(marks);
  const added: Mark = t === "a" ? { s, e, t, href } : { s, e, t };
  return merge([...cut(marks, s, e, t), added]);
}

/**
 * Keeps marks attached when the text is edited: `removed` characters at offset `at` were replaced by
 * `inserted` characters. A mark entirely before the edit is untouched; one entirely after it moves by
 * the length difference; one that spans the edit point (starts before it and ends after it) grows or
 * shrinks with it - typing inside a bold run stays bold, while typing exactly at either end of a mark
 * does not extend it. A mark that loses all its characters is dropped; pieces left touching are merged.
 */
export function shiftMarks(marks: readonly Mark[], at: number, removed: number, inserted: number): Mark[] {
  const a = at;
  const b = at + removed;
  const delta = inserted - removed;
  const out: Mark[] = [];
  for (const m of marks) {
    const s = m.s < a ? m.s : m.s >= b ? m.s + delta : a + inserted;
    const e = m.e <= a ? m.e : m.e > b ? m.e + delta : a;
    if (e > s) out.push({ ...m, s, e });
  }
  return merge(out);
}
