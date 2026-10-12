/**
 * Renders a `ResumeDocument` as ATS-friendly plain text (the TXT export and the text the ATS score
 * reads). Port of `ResumeDocumentText.java`; the layout rules are its class comment:
 *
 * - Separators include their spaces: EM " — ", EN " – ", DOT " · ". Newline is "\n".
 * - Every value is `oneLine`d (trim + collapse U+0009-U+000D / U+0020 runs to one space).
 * - Header: name, headline, contacts (email | phone | location | links); empty lines omitted.
 * - Sections in document order, skipping hidden ones and ones with no body line: blank line (only if
 *   something precedes), TITLE (section title or the kind's default, upper-cased), then the body.
 * - Items of EXPERIENCE / EDUCATION / PROJECTS / CUSTOM are separated by a blank line.
 * - The text ends with exactly one "\n" when non-empty; an empty document renders "".
 */
import { flag, isObject, list, one, oneLine, parseKind, visibleItems, visibleSections, get, type Json } from "./doc";
import { DEFAULT_SECTION_TITLES, type SectionKind } from "./types";

const EM = " — ";
const EN = " – ";
const DOT = " · ";

export function renderText(doc: Json): string {
  const out: string[] = [];

  const basics = get(doc, "basics");
  add(out, one(basics, "name"));
  add(out, one(basics, "headline"));
  const contact: string[] = [one(basics, "email"), one(basics, "phone"), one(basics, "location")];
  for (const l of list(basics, "links")) {
    const url = one(l, "url");
    const label = one(l, "label");
    contact.push(!url ? "" : !label ? url : label + ": " + url);
  }
  add(out, join(" | ", contact));

  for (const s of visibleSections(doc, null)) {
    const kind = parseKind(s.kind);
    if (!kind) continue;
    const body = bodyOf(s, kind);
    if (body.length === 0) continue;
    if (out.length > 0) out.push("");
    const title = one(s, "title");
    out.push((title || DEFAULT_SECTION_TITLES[kind]).toUpperCase());
    out.push(...body);
  }
  return out.length === 0 ? "" : out.join("\n") + "\n";
}

function bodyOf(section: Json, kind: SectionKind): string[] {
  const block = kind === "EXPERIENCE" || kind === "EDUCATION" || kind === "PROJECTS" || kind === "CUSTOM";
  const body: string[] = [];
  for (const item of visibleItems(section)) {
    const lines = itemLines(item, kind);
    if (lines.length === 0) continue;
    if (block && body.length > 0) body.push("");
    body.push(...lines);
  }
  return body;
}

function itemLines(it: Json, kind: SectionKind): string[] {
  const lines: string[] = [];
  switch (kind) {
    case "SUMMARY":
      add(lines, one(it, "text"));
      break;
    case "EXPERIENCE":
    case "CUSTOM":
      add(lines, join(DOT, join(EM, one(it, "title"), one(it, "org")), one(it, "location"), dates(it)));
      bullets(lines, it);
      break;
    case "EDUCATION": {
      const degree = join(" in ", one(it, "degree"), one(it, "field"));
      const gpa = one(it, "gpa");
      add(lines, join(DOT, join(EM, degree, one(it, "school")), one(it, "location"), dates(it), gpa ? "GPA: " + gpa : ""));
      bullets(lines, it);
      break;
    }
    case "PROJECTS":
      add(lines, join(DOT, one(it, "title"), one(it, "url")));
      bullets(lines, it);
      break;
    case "SKILLS": {
      const skills = list(it, "skills").map((sk) => (typeof sk === "string" ? oneLine(sk) : ""));
      const joined = join(", ", skills);
      const group = one(it, "group");
      if (joined) add(lines, group ? group + ": " + joined : joined);
      break;
    }
    case "CERTIFICATIONS":
      add(lines, join(DOT, join(EM, one(it, "title"), one(it, "org")), one(it, "date"), one(it, "url")));
      break;
    case "LANGUAGES":
      add(lines, join(EM, one(it, "name"), one(it, "level")));
      break;
    case "ACHIEVEMENTS": {
      const line = join(DOT, one(it, "text"), one(it, "date"));
      if (line) lines.push("- " + line);
      break;
    }
  }
  return lines;
}

function bullets(lines: string[], item: Json): void {
  for (const b of list(item, "bullets")) {
    const t = isObject(b) ? one(b, "text") : "";
    if (t) lines.push("- " + t);
  }
}

function dates(it: Json): string {
  const start = one(it, "start");
  const end = one(it, "end");
  if (flag(it, "current")) return !start ? "Present" : start + EN + "Present";
  return start && end ? start + EN + end : start + end;
}

function add(lines: string[], s: string): void {
  if (s) lines.push(s);
}

function join(sep: string, ...parts: Array<string | string[]>): string {
  const flat = parts.length === 1 && Array.isArray(parts[0]) ? parts[0] : (parts as string[]);
  return flat.filter((p) => p).join(sep);
}
