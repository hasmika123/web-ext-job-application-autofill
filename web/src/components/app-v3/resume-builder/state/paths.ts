/**
 * Validator path to canvas field (DESIGN 10.10): a save answered `422 DOC_INVALID {path}` names the
 * first thing the server refused (`$.sections[1].items[0].start`); the canvas rings the matching
 * field. Every editable control on the canvas carries a `data-field` id from this vocabulary:
 *
 *   meta.title                        the resume name
 *   basics.<name|headline|email|phone|location>
 *   basics.link.<index>.<label|url>   (`basics.links` for the list as a whole)
 *   <sectionId>                       a section block      <sectionId>.title   its heading
 *   <itemId>                          an item row          <itemId>.<field>    one of its fields
 *   <itemId>.skills                   a skills group's chips
 *   <itemId>.text                     the summary / an achievement / an interest text
 *   <bulletId>                        one bullet
 *
 * A path that points below something the canvas has no control for resolves to the nearest thing it
 * does show (the row, then the block); a path that matches nothing (the document changed since) is null.
 */
import type { ResumeDocument } from "@kiwiply/ui";

/** `$.a.b[2].c` -> ["a", "b", 2, "c"]. */
function tokens(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path.replace(/^\$/, ""))) !== null) out.push(m[1] !== undefined ? m[1] : Number(m[2]));
  return out;
}

/** Fields whose control shows the text with its marks (a path into `marks` rings the text). */
const TEXT_FIELDS = new Set(["text", "marks", "list"]);

export function fieldIdForPath(doc: ResumeDocument, path: string): string | null {
  const t = tokens(path);
  if (t.length === 0) return null;
  const [root, ...rest] = t;

  if (root === "meta") return typeof rest[0] === "string" && rest[0] === "title" ? "meta.title" : null;

  if (root === "basics") {
    const f = rest[0];
    if (f === "links") {
      if (typeof rest[1] !== "number") return "basics.links";
      const field = rest[2] === "label" ? "label" : "url";
      return `basics.link.${rest[1]}.${field}`;
    }
    if (f === "photo") return "basics.photo";
    return typeof f === "string" ? `basics.${f}` : null;
  }

  if (root !== "sections" || typeof rest[0] !== "number") return null;
  const section = doc.sections[rest[0]];
  if (!section) return null;
  const [, key, ...afterKey] = rest;
  if (key === undefined || key === "kind" || key === "hidden") return section.id;
  if (key === "title") return `${section.id}.title`;
  if (key !== "items" || typeof afterKey[0] !== "number") return section.id;

  const item = (section.items as Array<{ id: string; bullets?: Array<{ id: string }> }>)[afterKey[0]];
  if (!item) return section.id;
  const [, field, ...afterField] = afterKey;
  if (field === undefined) return item.id;
  if (field === "bullets") {
    const bullet = typeof afterField[0] === "number" ? item.bullets?.[afterField[0]] : undefined;
    return bullet ? bullet.id : item.id;
  }
  if (field === "skills") return `${item.id}.skills`;
  if (typeof field !== "string") return item.id;
  return `${item.id}.${TEXT_FIELDS.has(field) ? "text" : field}`;
}
