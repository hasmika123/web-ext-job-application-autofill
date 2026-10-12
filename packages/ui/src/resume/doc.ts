/**
 * Tolerant readers shared by the projection, the text export and the templates - the TypeScript twin
 * of the static helpers in `ResumeDocument.java`. A missing, null or wrongly typed field reads as
 * empty, because these run on stored documents and must never throw; strictness lives server-side in
 * `ResumeDocumentValidator`.
 */
import { SECTION_KINDS, type SectionKind } from "./types";

export type Json = unknown;
export type JsonObject = Record<string, unknown>;

export function isObject(v: Json): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const WS_EDGE = /^[\t-\r ]+|[\t-\r ]+$/g;
const WS_RUN = /[\t-\r ]+/g;

/**
 * Strips leading and trailing U+0009-U+000D and U+0020, nothing else. (Not `String.prototype.trim()`:
 * that also strips NBSP, BOM and the Unicode space separators, which Java's `trim()` does not.)
 */
export function trimWs(s: string | null | undefined): string {
  return s == null ? "" : s.replace(WS_EDGE, "");
}

/** `trimWs`, then every internal run of U+0009-U+000D / U+0020 becomes one space. */
export function oneLine(s: string | null | undefined): string {
  return trimWs(s).replace(WS_RUN, " ");
}

/** `node[field]` when `node` is an object, else `undefined` (mirrors Jackson's `node.get(field)`). */
export function get(node: Json, field: string): Json {
  return isObject(node) ? node[field] : undefined;
}

/** The trimmed text of `node[field]`; `""` when missing, null or not a string. */
export function str(node: Json, field: string): string {
  const v = get(node, field);
  return typeof v === "string" ? trimWs(v) : "";
}

/** `node[field]` as a single cleaned line (`oneLine`); `""` when absent or not a string. */
export function one(node: Json, field: string): string {
  const v = get(node, field);
  return typeof v === "string" ? oneLine(v) : "";
}

/** True only when `node[field]` is the boolean `true`. */
export function flag(node: Json, field: string): boolean {
  return get(node, field) === true;
}

export function isHidden(node: Json): boolean {
  return flag(node, "hidden");
}

/** The elements of `node[field]` when it is an array, otherwise `[]`. */
export function list(node: Json, field: string): Json[] {
  const v = get(node, field);
  return Array.isArray(v) ? v : [];
}

/** Sections that are objects, not hidden and (when `kind` is given) of that kind, in document order. */
export function visibleSections(doc: Json, kind?: SectionKind | null): JsonObject[] {
  const out: JsonObject[] = [];
  for (const s of list(doc, "sections")) {
    if (!isObject(s) || isHidden(s)) continue;
    if (kind && s.kind !== kind) continue;
    out.push(s);
  }
  return out;
}

/** Items of `section` that are objects and not hidden, in order. */
export function visibleItems(section: Json): JsonObject[] {
  const out: JsonObject[] = [];
  for (const i of list(section, "items")) {
    if (isObject(i) && !isHidden(i)) out.push(i);
  }
  return out;
}

/** Non-empty trimmed bullet texts of `item.bullets`, in order. */
export function bulletTexts(item: Json): string[] {
  const out: string[] = [];
  for (const b of list(item, "bullets")) {
    const t = isObject(b) ? str(b, "text") : "";
    if (t) out.push(t);
  }
  return out;
}

/** The known kind named by `s` (exact, case-sensitive), or `null`. */
export function parseKind(s: Json): SectionKind | null {
  return typeof s === "string" && (SECTION_KINDS as readonly string[]).includes(s) ? (s as SectionKind) : null;
}
