/**
 * A word diff for Compare (Resume Builder R3.10, DESIGN 10.16): the ATS text of an older version against the
 * current one, as parts `@kiwiply/ui`'s `DiffText` draws. No dependency: common prefix and suffix are cut off
 * first (most resumes differ in a few places), the middle is an LCS over word and whitespace tokens, and a
 * middle too big for the table (more than `MAX_CELLS` cells) degrades to one removed block and one added block
 * rather than freezing the tab. Whitespace is kept inside the parts, so `parts.map(p => p.text).join("")` of the
 * non-added parts is the old text and of the non-removed parts the new one.
 */
import type { DiffPart } from "@kiwiply/ui";

// config-literal-ok: an algorithm guard (table size for the LCS), not a builder tunable
const MAX_CELLS = 4_000_000;

/** Words and the whitespace between them, as separate tokens ("a  b\n" is "a", "  ", "b", "\n"). */
export function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/gu) ?? [];
}

function push(parts: DiffPart[], type: DiffPart["type"], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const parts: DiffPart[] = [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  push(parts, "same", a.slice(0, start).join(""));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) {
    push(parts, "del", midA.join(""));
    push(parts, "ins", midB.join(""));
  } else {
    // lcs[i][j]: length of the LCS of midA[i..] and midB[j..]
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = midA[i] === midB[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        push(parts, "same", midA[i]);
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
        push(parts, "del", midA[i++]);
      } else {
        push(parts, "ins", midB[j++]);
      }
    }
    push(parts, "del", midA.slice(i).join(""));
    push(parts, "ins", midB.slice(j).join(""));
  }

  push(parts, "same", a.slice(endA).join(""));
  return parts;
}

/** True when the two texts have no word-level difference (whitespace aside). */
export function sameWords(before: string, after: string): boolean {
  return diffWords(before, after).every((p) => p.type === "same" || p.text.trim() === "");
}
