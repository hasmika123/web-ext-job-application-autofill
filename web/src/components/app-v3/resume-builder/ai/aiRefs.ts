/**
 * Which lines of a document the AI can rewrite, and how a ref the server answers with finds its line again
 * (DESIGN 13.1 / 13.4). The refs are the ids the document already has: a bullet's id, or the id of a summary or
 * achievement item; the SUMMARY task answers with the literal ref `summary`. Hidden sections and items are never
 * sent (the server's digest skips them too), and an empty line has nothing to rewrite.
 */
import type { ResumeDocument, ResumeSection } from "@kiwiply/ui";
import type { TextRef } from "../state/types";

/** The ref the SUMMARY task answers with (the document's one summary item). */
export const SUMMARY_REF = "summary";

/** The Insights F4 tip's "Trim the longest bullets": this many of the longest lines, mode Shorter (the former R4.4). */
export const TRIM_LONGEST_COUNT = 4;

export interface AiLine {
  /** What the server calls the line. */
  ref: string;
  /** Where the line lives in the document, for `text/replace`. */
  at: TextRef;
  text: string;
  /** The block the line belongs to, e.g. "Senior Engineer" (for the diff's heading). */
  sectionKind: ResumeSection["kind"];
}

type AnyItem = Record<string, unknown> & { id: string; hidden?: boolean; text?: string; bullets?: Array<{ id: string; text: string }> };

/** The lines of one section that AI can rewrite, in document order. */
export function linesOfSection(section: ResumeSection): AiLine[] {
  if (section.hidden) return [];
  const out: AiLine[] = [];
  for (const raw of section.items as unknown[]) {
    const item = raw as AnyItem;
    if (item.hidden) continue;
    if (section.kind === "SUMMARY" || section.kind === "ACHIEVEMENTS") {
      const text = typeof item.text === "string" ? item.text : "";
      if (text.trim() !== "") out.push({ ref: item.id, at: { sectionId: section.id, itemId: item.id }, text, sectionKind: section.kind });
      continue;
    }
    for (const b of item.bullets ?? []) {
      if (typeof b.text === "string" && b.text.trim() !== "") out.push({ ref: b.id, at: { sectionId: section.id, itemId: item.id, bulletId: b.id }, text: b.text, sectionKind: section.kind });
    }
  }
  return out;
}

/** Every rewritable line of the document, in order. */
export function linesOfDoc(doc: ResumeDocument): AiLine[] {
  return doc.sections.flatMap(linesOfSection);
}

/** The `max` longest lines (longest first; document order breaks ties), as the section button and the F4 tip send them. */
export function longestFirst(lines: readonly AiLine[], max: number): AiLine[] {
  return lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => b.line.text.length - a.line.text.length || a.i - b.i)
    .slice(0, Math.max(0, max))
    .map((x) => x.line);
}

/** The `max` longest bullets of the whole document (the F4 tip's "Trim the longest bullets"). */
export function longestBullets(doc: ResumeDocument, max: number): AiLine[] {
  return longestFirst(linesOfDoc(doc).filter((l) => l.at.bulletId !== undefined), max);
}

/** Where a ref from the server lives in the document, or null when that line is gone (the editor then adopts the server's copy). */
export function resolveRef(doc: ResumeDocument, ref: string): TextRef | null {
  if (ref === SUMMARY_REF) {
    for (const s of doc.sections) {
      if (s.kind === "SUMMARY" && s.items[0]) return { sectionId: s.id, itemId: s.items[0].id };
    }
    return null;
  }
  for (const s of doc.sections) {
    for (const raw of s.items as unknown[]) {
      const item = raw as AnyItem;
      if ((s.kind === "SUMMARY" || s.kind === "ACHIEVEMENTS") && item.id === ref) return { sectionId: s.id, itemId: item.id };
      if (item.bullets?.some((b) => b.id === ref)) return { sectionId: s.id, itemId: item.id, bulletId: ref };
    }
  }
  return null;
}

/** The text a ref currently has in the document, or null. */
export function textOfRef(doc: ResumeDocument, ref: string): string | null {
  const at = resolveRef(doc, ref);
  if (!at) return null;
  const section = doc.sections.find((s) => s.id === at.sectionId);
  const item = (section?.items as unknown[] | undefined)?.find((x) => (x as AnyItem).id === at.itemId) as AnyItem | undefined;
  if (!item) return null;
  if (at.bulletId) return item.bullets?.find((b) => b.id === at.bulletId)?.text ?? null;
  return typeof item.text === "string" ? item.text : null;
}
