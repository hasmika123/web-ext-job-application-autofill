/**
 * Renders a `ResumeDocument` as ATS-friendly plain text (the TXT export and the text the ATS score
 * reads). Port of `ResumeDocumentText.java`; the layout rules are its class comment:
 *
 * - Separators include their spaces: EM " — ", EN " – ", DOT " · ". Newline is "\n".
 * - Every value is `oneLine`d (trim + collapse U+0009-U+000D / U+0020 runs to one space).
 * - Header: name, headline, contacts (email | phone | location | links); empty lines omitted.
 * - Sections in document order, skipping hidden ones and ones with no body line: blank line (only if
 *   something precedes), TITLE (section title or the kind's default, upper-cased), then the body.
 * - v2: a summary with `list` renders one "- " / "1. " prefixed line per non-empty "\n" line (the literal
 *   "1. " on every line, not a counter); bullets are "1. " when the item has `listStyle: "number"`;
 *   after the end of every link mark whose text is not already its URL, " (<href>)" is inserted;
 *   INTERESTS is one line "A, B, C". Other marks are ignored (plain text).
 * - Items of EXPERIENCE / EDUCATION / PROJECTS / CUSTOM are separated by a blank line.
 * - The text ends with exactly one "\n" when non-empty; an empty document renders "".
 */
import { flag, isListed, isObject, list, one, oneLine, parseKind, str, trimWs, visibleItems, visibleSections, get, type Json } from "./doc";
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
  if (kind === "INTERESTS") {
    const line = join(", ", visibleItems(section).map((it) => one(it, "text")));
    return line ? [line] : [];
  }
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
      summary(lines, it);
      break;
    case "INTERESTS":
      add(lines, one(it, "text")); // bodyOf() normally joins the whole section onto one line
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
      const line = join(DOT, marked(it), one(it, "date"));
      if (line) lines.push("- " + line);
      break;
    }
  }
  return lines;
}

function bullets(lines: string[], item: Json): void {
  const mark = marker(str(item, "listStyle"));
  for (const b of list(item, "bullets")) {
    const t = isObject(b) ? marked(b) : "";
    if (t) lines.push(mark + t);
  }
}

/** SUMMARY: one line, or - when `list` is set - one marker-prefixed line per non-empty "\n" line. */
function summary(lines: string[], it: Json): void {
  const text = withLinks(it);
  if (!isListed(it, "list")) {
    add(lines, oneLine(text));
    return;
  }
  const mark = marker(str(it, "list"));
  for (const line of text.split("\n")) {
    const t = oneLine(line);
    if (t) lines.push(mark + t);
  }
}

/** `"number"` -> "1. " (the literal prefix on every line); anything else -> "- ". */
function marker(style: string): string {
  return style === "number" ? "1. " : "- ";
}

/** `node.text` with link suffixes, as a single cleaned line. */
function marked(node: Json): string {
  return oneLine(withLinks(node));
}

/**
 * `node.text` (raw, uncleaned) with " (<href>)" inserted right after the end of every link mark
 * (`t === "a"`) whose covered text (trimmed) is not already its href. Offsets are UTF-16 units into the
 * raw text, so this runs before whitespace is collapsed. Malformed or out-of-range marks are ignored
 * (this never throws); other mark types are plain text. Twin of `ResumeDocumentText.withLinks`.
 */
export function withLinks(node: Json): string {
  const t = get(node, "text");
  const raw = typeof t === "string" ? t : "";
  const links: Array<{ e: number; href: string }> = [];
  for (const m of list(node, "marks")) {
    if (!isObject(m)) continue;
    const { s, e, t: type, href } = m;
    if (!isInt32(s) || !isInt32(e) || typeof type !== "string" || type !== "a" || typeof href !== "string") continue;
    if (s < 0 || s >= e || e > raw.length) continue;
    const url = trimWs(href);
    if (!url || trimWs(raw.slice(s, e)) === url) continue;
    links.push({ e, href: url });
  }
  if (links.length === 0) return raw;
  links.sort((a, b) => a.e - b.e); // stable, like the Java List.sort
  let out = "";
  let at = 0;
  for (const l of links) {
    out += raw.slice(at, l.e) + " (" + l.href + ")";
    at = l.e;
  }
  return out + raw.slice(at);
}

const isInt32 = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;

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
