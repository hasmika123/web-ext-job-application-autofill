/**
 * A parsed resume turned into what the setup wizard shows and later imports (Resume Builder R1.4).
 * `toDraft` is the browser twin of the API's `ProfileSeed.fromStructured`: the same item shapes
 * (the resume-document item minus id / hidden: EXPERIENCE {title, org, location, start, end, current,
 * bullets}, EDUCATION {school, degree, field, location, start, end, gpa}, PROJECT {title, bullets},
 * LANGUAGE {name, level}, SKILL {group, skills}), the same date rules (`YYYY` / `YYYY-MM`, unreadable
 * dates dropped, "Present" sets `current`), so what the user confirms is what the API stores. Every
 * string is cleaned of never-collected values a second time on the way in. Pure.
 */
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import type { ItemData } from "@/lib/profile-items";
import { cleanParsedString } from "./sensitive";

export type CandidateSection = "EXPERIENCE" | "EDUCATION" | "PROJECT";

/** One parsed entry waiting for Keep / Edit / Skip. */
export interface Candidate {
  id: string;
  section: CandidateSection;
  data: ItemData;
}

export interface Language {
  name: string;
  level: string;
}

/** Flat bio keys the wizard confirms (identity and contact, plus the summary). All are import-allowed. */
export const IDENTITY_KEYS = ["firstName", "lastName", "email", "phone", "city", "state", "linkedin", "github", "website", "summary"] as const;
export type IdentityKey = (typeof IDENTITY_KEYS)[number];
export type Identity = Partial<Record<IdentityKey, string>>;

export interface ParsedDraft {
  candidates: Candidate[];
  skills: string[];
  /** Skill-looking terms the resume mentions that the parser did not list; offered as one-tap adds. */
  suggestions: string[];
  languages: Language[];
  identity: Identity;
  /** Sensitive values dropped from the PARSED output (the pre-parse count is added by the caller). */
  removed: number;
}

/** Longest text the API stores per field (ProfileSeed.MAX_TEXT) and per skill. */
export const MAX_TEXT = 2000; // config-literal-ok: mirrors ProfileSeed.MAX_TEXT, the API clips here too
export const MAX_SKILL_CHARS = 60;
/** Skills per SKILL item (ProfileSeed.SKILLS_PER_ROW). */
export const SKILLS_PER_ROW = 40;
export const SKILL_GROUP = "Skills";
/** Longest bio value an import writes; the summary is the one long one (ProfileItemService). */
export const MAX_BIO_VALUE = 500;
export const MAX_BIO_SUMMARY = 2000;

// ---- dates (ProfileSeed.date) ------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const PRESENT = new Set(["present", "current", "now", "ongoing", "today", "till date", "to date"]);

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY` / `YYYY-MM` from the usual ways a parser writes a date; "" when it cannot be read. */
export function toIsoDate(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "";
  let m = /^((?:19|20)\d{2})(?:-(0[1-9]|1[0-2]))?$/.exec(s);
  if (m) return m[2] ? `${m[1]}-${m[2]}` : m[1];
  m = /^([A-Za-z]{3,9})\.?,?\s+((?:19|20)\d{2})$/.exec(s);
  if (m) {
    const idx = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
    if (idx >= 0) return `${m[2]}-${pad(idx + 1)}`;
  }
  m = /^(0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})$/.exec(s);
  if (m) return `${m[2]}-${pad(Number(m[1]))}`;
  m = /^((?:19|20)\d{2})[/.](0?[1-9]|1[0-2])$/.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}`;
  return "";
}

const isPresent = (s: string) => PRESENT.has(s.trim().toLowerCase());

// ---- mapping -----------------------------------------------------------------------------------

type Counter = { removed: number };

function clean(key: string, value: unknown, c: Counter, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  const r = cleanParsedString(key, value.replace(/\s+/g, " ").trim());
  c.removed += r.removed;
  return Array.from(r.value).slice(0, max).join("");
}

function bulletsOf(list: unknown, c: Counter): { text: string; src: string }[] {
  if (!Array.isArray(list)) return [];
  const out: { text: string; src: string }[] = [];
  for (const b of list) {
    const text = clean("bullet", b, c);
    if (text) out.push({ text, src: "parsed" });
  }
  return out;
}

function put(d: ItemData, key: string, value: string): boolean {
  if (!value) return false;
  d[key] = value;
  return true;
}

export function toDraft(structured: StructuredResume, bio: ParsedBio, suggestions: string[] = []): ParsedDraft {
  const c: Counter = { removed: 0 };
  const candidates: Candidate[] = [];
  const next = (section: CandidateSection) => `${section.slice(0, 3).toLowerCase()}${candidates.filter((x) => x.section === section).length}`;

  for (const e of structured.experience ?? []) {
    const d: ItemData = {};
    let any = put(d, "title", clean("title", e.title, c));
    any = put(d, "org", clean("org", e.company, c)) || any;
    put(d, "location", clean("location", e.location, c));
    const endRaw = (e.endDate ?? "").trim();
    const current = e.current === true || isPresent(endRaw);
    const start = toIsoDate(e.startDate ?? "");
    const end = current ? "" : toIsoDate(endRaw);
    if (start) d.start = start;
    if (end) d.end = end;
    if (current) d.current = true;
    const bullets = bulletsOf(e.bullets, c);
    if (bullets.length > 0) {
      d.bullets = bullets;
      any = true;
    }
    if (any) candidates.push({ id: next("EXPERIENCE"), section: "EXPERIENCE", data: d });
  }

  for (const e of structured.education ?? []) {
    const d: ItemData = {};
    let any = put(d, "school", clean("school", e.school, c));
    any = put(d, "degree", clean("degree", e.degree, c)) || any;
    any = put(d, "field", clean("field", e.field, c)) || any;
    put(d, "location", clean("location", e.location, c));
    put(d, "gpa", clean("gpa", e.gpa, c));
    const start = toIsoDate(e.startDate ?? "");
    const end = toIsoDate(e.endDate ?? "");
    if (start) d.start = start;
    if (end) d.end = end;
    if (any) candidates.push({ id: next("EDUCATION"), section: "EDUCATION", data: d });
  }

  for (const p of structured.projects ?? []) {
    const d: ItemData = {};
    let any = put(d, "title", clean("title", p.name, c));
    const bullets = bulletsOf(p.bullets, c);
    if (bullets.length > 0) {
      d.bullets = bullets;
      any = true;
    }
    if (any) candidates.push({ id: next("PROJECT"), section: "PROJECT", data: d });
  }

  const languages: Language[] = [];
  for (const l of structured.languages ?? []) {
    const name = clean("language", l.name, c);
    if (name) languages.push({ name, level: clean("level", l.proficiency, c) });
  }

  const skills = uniqueSkills(structured.skills ?? [], c);
  const have = new Set(skills.map((s) => s.toLowerCase()));
  const extra = uniqueSkills(suggestions, c).filter((s) => !have.has(s.toLowerCase()));

  const identity: Identity = {};
  for (const k of IDENTITY_KEYS) {
    if (k === "summary") continue;
    const v = clean(k, (bio as Record<string, unknown>)[k], c, MAX_BIO_VALUE);
    if (v) identity[k] = v;
  }
  const summary = clean("summary", structured.summary, c, MAX_BIO_SUMMARY);
  if (summary) identity.summary = summary;

  return { candidates, skills, suggestions: extra, languages, identity, removed: c.removed };
}

/** Trimmed, de-duplicated (ignoring case) skill names, each clipped to the API's per-skill limit. */
function uniqueSkills(list: unknown[], c: Counter): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = clean("skill", raw, c, MAX_SKILL_CHARS);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}
