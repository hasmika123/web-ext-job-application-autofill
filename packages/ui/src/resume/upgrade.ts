/**
 * Upgrades an older `ResumeDocument` to the current schema (DESIGN 3.6) - the TypeScript twin of
 * `ResumeDocumentUpgrader.java`. Pure and total: never mutates its input, never throws, and returns
 * anything it does not recognise as an unchanged deep copy (the server validator then rejects it
 * with a proper path).
 *
 * schema 1 -> 2:
 * - `schema` becomes 2.
 * - `basics.photoKey` (a non-blank string) becomes `basics.photo = { key: photoKey }`, at the same
 *   position in the object, and `photoKey` is removed. A null, blank or non-string `photoKey` is just
 *   removed. If `basics` already has a `photo` key, that wins and `photoKey` is removed.
 * - nothing else changes (marks absent = none; `list` / `listStyle` absent = plain; unknown keys survive).
 */
import { isObject, trimWs, type Json } from "./doc";
import type { ResumeDocument } from "./types";

function clone(v: Json): Json {
  if (Array.isArray(v)) return v.map(clone);
  if (isObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  }
  return v;
}

export function upgradeDocument(doc: unknown): ResumeDocument {
  const copy = clone(doc);
  if (!isObject(copy) || copy.schema !== 1) return copy as ResumeDocument;

  const out: Record<string, unknown> = { ...copy, schema: 2 };
  const basics = out.basics;
  if (isObject(basics) && "photoKey" in basics) {
    const next: Record<string, unknown> = {};
    for (const k of Object.keys(basics)) {
      if (k !== "photoKey") {
        next[k] = basics[k];
        continue;
      }
      const key = basics.photoKey;
      if (!("photo" in basics) && typeof key === "string" && trimWs(key) !== "") next.photo = { key };
    }
    out.basics = next;
  }
  return out as unknown as ResumeDocument;
}
