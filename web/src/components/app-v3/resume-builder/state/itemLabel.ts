/**
 * What an item is called, everywhere it is named (DESIGN 10.3.3, DECISIONS #31): the Swap Section panel's
 * rows, the canvas grips' and menus' `aria-label`s and the drag announcements. One pure function, so
 * the words never drift between the panel (left) and the document (middle).
 *
 *   itemLabel("EXPERIENCE", item, 0)
 *     -> { primary: "Software Engineer", secondary: "Acme Inc. · Mar 2022 – Present", name: "Software Engineer · Acme Inc.", ... }
 *
 * The label is the item's own content, never "Experience 1". When the main field is empty it falls
 * back to the next non-empty one (the org, the school, the first bullet); when everything is empty it is
 * "Untitled role 1" (`empty: true`, drawn muted and italic). It reads the item as the reducer holds it,
 * so it follows the user's typing.
 */
import type { ResumeSectionKind } from "@kiwiply/ui";
import { formatDate } from "../dates";

export interface ItemLabel {
  /** The headline: the item's main field, else the next non-empty field, else "Untitled <noun> <n>". */
  primary: string;
  /** The second line: the org / school / issuer / level and the date range ("Acme Inc. · Mar 2022 – Present"). "" if none. */
  secondary: string;
  /** What is said aloud and put in `aria-label`s and announcements: the primary and the org, without dates ("Software Engineer · Acme Inc."). */
  name: string;
  /** Everything on one line (`primary · secondary`), for tooltips and the panel row's accessible name. */
  text: string;
  /** Nothing to go on: `primary` is the "Untitled ..." placeholder. */
  empty: boolean;
}

/** A loosely typed item: the reducer owns the shapes, the label reads fields by name. */
type Item = Record<string, unknown>;

/** Bullet-derived text is cut here (the label of an item that only has text). */
const MAX_BULLET_CHARS = 40; // config-literal-ok: label length, not a limit (no settings key)

const NOUN: Record<ResumeSectionKind, string> = {
  SUMMARY: "summary",
  EXPERIENCE: "role",
  EDUCATION: "degree",
  SKILLS: "skill group",
  PROJECTS: "project",
  CERTIFICATIONS: "certification",
  LANGUAGES: "language",
  ACHIEVEMENTS: "achievement",
  INTERESTS: "interest",
  CUSTOM: "entry",
};

const str = (it: Item, key: string): string => {
  const v = it[key];
  return typeof v === "string" ? v.trim() : "";
};

/** The first non-empty line of the item's own text: `text`, else its bullets. Cut at ~40 characters. */
function firstLine(it: Item): string {
  const lines: string[] = [];
  const text = str(it, "text");
  if (text) lines.push(...text.split(/\r?\n/));
  if (Array.isArray(it.bullets)) for (const b of it.bullets) lines.push(...(typeof (b as Item)?.text === "string" ? ((b as Item).text as string).split(/\r?\n/) : []));
  const line = lines.map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > MAX_BULLET_CHARS ? `${line.slice(0, MAX_BULLET_CHARS).trimEnd()}…` : line;
}

/** "Mar 2022 – Mar 2024", "Mar 2022 – Present", "2019", "" (the dated kinds: start / end / current). */
function dateRange(it: Item): string {
  const start = formatDate(str(it, "start"));
  const end = it.current === true ? "Present" : formatDate(str(it, "end"));
  return start && end ? `${start} – ${end}` : start || end;
}

const join = (...parts: string[]): string => parts.filter(Boolean).join(" · ");

/**
 * The label of one item. `index` (0-based) numbers the "Untitled ..." fallback; it is the only time the
 * position appears.
 */
export function itemLabel(kind: ResumeSectionKind, item: unknown, index = 0): ItemLabel {
  const it = (item && typeof item === "object" ? item : {}) as Item;
  let primary = "";
  let secondary = "";
  let org = ""; // the part of `secondary` that is not a date: it belongs in the spoken name

  switch (kind) {
    case "EXPERIENCE":
    case "CUSTOM": {
      const fromOrg = str(it, "title") === "";
      primary = str(it, "title") || str(it, "org") || firstLine(it);
      org = fromOrg ? "" : str(it, "org");
      secondary = join(org, dateRange(it));
      break;
    }
    case "EDUCATION": {
      const degree = str(it, "degree");
      const field = str(it, "field");
      const school = str(it, "school");
      primary = degree && field ? `${degree} in ${field}` : degree || field || school || firstLine(it);
      org = degree || field ? school : "";
      secondary = join(org, dateRange(it));
      break;
    }
    case "PROJECTS": {
      primary = str(it, "title") || str(it, "name") || firstLine(it);
      org = str(it, "role");
      secondary = join(org, dateRange(it));
      break;
    }
    case "CERTIFICATIONS": {
      const fromIssuer = str(it, "title") === "";
      primary = str(it, "title") || str(it, "org") || firstLine(it);
      org = fromIssuer ? "" : str(it, "org");
      secondary = join(org, formatDate(str(it, "date")));
      break;
    }
    case "LANGUAGES": {
      primary = str(it, "name");
      org = str(it, "level");
      secondary = org;
      break;
    }
    case "SKILLS": {
      const skills = Array.isArray(it.skills) ? it.skills.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
      const group = str(it, "group");
      const rest = group ? skills : skills.slice(1);
      primary = group || skills[0] || "";
      secondary = rest.slice(0, 3).join(", ") + (rest.length > 3 ? ` +${rest.length - 3}` : "");
      break;
    }
    case "ACHIEVEMENTS": {
      primary = firstLine(it);
      secondary = formatDate(str(it, "date"));
      break;
    }
    case "SUMMARY":
    case "INTERESTS":
    default: {
      primary = firstLine(it);
      break;
    }
  }

  const empty = primary === "";
  if (empty) primary = `Untitled ${NOUN[kind] ?? "item"} ${index + 1}`;
  return { primary, secondary, name: empty ? primary : join(primary, org), text: join(primary, secondary), empty };
}
