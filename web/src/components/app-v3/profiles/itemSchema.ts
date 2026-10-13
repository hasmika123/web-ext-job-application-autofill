/**
 * What each kind of profile item looks like in the form: its fields, which are required, how a
 * stored item turns into a card heading / meta line, and how a draft is validated and cleaned before
 * it is sent. Pure (no React, no network) so it is unit-tested directly.
 *
 * The item shapes are the resume-document item shapes (DESIGN v2 3.2) minus `id` / `hidden`:
 * EXPERIENCE {title, org, location, start, end, current, bullets}, EDUCATION {school, degree, field,
 * location, start, end, gpa, bullets}, PROJECT {title, url, start, end, bullets}, CERTIFICATION
 * {title, org, date, url}, LANGUAGE {name, level}, ACHIEVEMENT {text, date}, CUSTOM like EXPERIENCE.
 * SKILL items ({group, skills}) have their own editor (`SkillsChips`).
 */
import { SENSITIVE_LABELS, scanSensitiveField, type SensitiveClass } from "@kiwiply/ui";
import type { ItemBullet, ItemData, ProfileSection } from "@/lib/profile-items";

/** The kinds the item form edits (SKILL is edited as chips). */
export type FormSection = "EXPERIENCE" | "EDUCATION" | "PROJECT" | "CERTIFICATION" | "LANGUAGE" | "ACHIEVEMENT" | "CUSTOM";

export type FieldKind = "text" | "date" | "url" | "textarea" | "checkbox" | "bullets";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  /** Spans the whole row on desktop. */
  wide?: boolean;
}

export interface SectionDef {
  /** "Role", "School" ... used in "Add role" / "Edit role". */
  noun: string;
  fields: FieldDef[];
}

const T = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", ...extra });
const D = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "date", placeholder: "YYYY-MM", ...extra });

export const SECTION_DEFS: Record<FormSection, SectionDef> = {
  EXPERIENCE: {
    noun: "role",
    fields: [
      T("title", "Job title", { required: true }),
      T("org", "Company", { required: true }),
      T("location", "Location"),
      D("start", "Start"),
      D("end", "End"),
      { key: "current", label: "I currently work here", kind: "checkbox", wide: true },
      { key: "bullets", label: "Bullets", kind: "bullets", wide: true },
    ],
  },
  EDUCATION: {
    noun: "school",
    fields: [
      T("school", "School", { required: true }),
      T("degree", "Degree"),
      T("field", "Field of study"),
      T("location", "Location"),
      D("start", "Start"),
      D("end", "End"),
      T("gpa", "GPA"),
      { key: "bullets", label: "Highlights", kind: "bullets", wide: true },
    ],
  },
  PROJECT: {
    noun: "project",
    fields: [
      T("title", "Project name", { required: true }),
      { key: "url", label: "Link", kind: "url", placeholder: "https://" },
      D("start", "Start"),
      D("end", "End"),
      { key: "bullets", label: "Bullets", kind: "bullets", wide: true },
    ],
  },
  CERTIFICATION: {
    noun: "certification",
    fields: [
      T("title", "Certification", { required: true }),
      T("org", "Issuer"),
      D("date", "Date"),
      { key: "url", label: "Credential link", kind: "url", placeholder: "https://" },
    ],
  },
  LANGUAGE: {
    noun: "language",
    fields: [T("name", "Language", { required: true }), T("level", "Level", { placeholder: "Fluent, Native ..." })],
  },
  ACHIEVEMENT: {
    noun: "award",
    fields: [{ key: "text", label: "Award or achievement", kind: "textarea", required: true, wide: true }, D("date", "Date")],
  },
  CUSTOM: {
    noun: "entry",
    fields: [
      T("title", "Title", { required: true }),
      T("org", "Organization"),
      T("location", "Location"),
      D("start", "Start"),
      D("end", "End"),
      { key: "bullets", label: "Bullets", kind: "bullets", wide: true },
    ],
  },
};

export function isFormSection(s: ProfileSection): s is FormSection {
  return s in SECTION_DEFS;
}

// ---- dates -------------------------------------------------------------------------------------

/** Same rule as the API: `YYYY` or `YYYY-MM`. */
export const DATE_OK = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;

/** `MM/YYYY`, `M/YYYY` and `YYYY/MM` become `YYYY-MM`; anything else is returned trimmed. */
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  const mdy = /^(\d{1,2})[/.](\d{4})$/.exec(s);
  if (mdy) return `${mdy[2]}-${mdy[1].padStart(2, "0")}`;
  const ymd = /^(\d{4})[/.](\d{1,2})$/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}`;
  return s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2020-03" -> "Mar 2020"; "2020" -> "2020"; anything else unchanged. */
export function formatMonth(v: string): string {
  const m = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/.exec(v);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v;
}

/** "Mar 2020 - Present". */
export function formatRange(start: string, end: string, current: boolean): string {
  const a = start ? formatMonth(start) : "";
  const b = current ? "Present" : end ? formatMonth(end) : "";
  return [a, b].filter(Boolean).join(" – ");
}

// ---- reading a stored item ---------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function itemString(data: ItemData, key: string): string {
  return str(data[key]);
}

/** The bullets of an item as objects (strings are accepted too). */
export function itemBullets(data: ItemData): ItemBullet[] {
  const raw = data.bullets;
  if (!Array.isArray(raw)) return [];
  const out: ItemBullet[] = [];
  for (const b of raw) {
    if (typeof b === "string") out.push({ text: b });
    else if (b && typeof b === "object" && typeof (b as ItemBullet).text === "string") out.push(b as ItemBullet);
  }
  return out;
}

/** Card heading + meta line for an item of `section` ("Engineer · Acme", "Mar 2020 - Present · Berlin"). */
export function describeItem(section: ProfileSection, data: ItemData): { heading: string; meta: string } {
  const range = formatRange(itemString(data, "start"), itemString(data, "end"), data.current === true);
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  switch (section) {
    case "EXPERIENCE":
    case "CUSTOM":
      return { heading: join(itemString(data, "title"), itemString(data, "org")) || "Untitled", meta: join(range, itemString(data, "location")) };
    case "EDUCATION":
      return {
        heading: itemString(data, "school") || "School",
        meta: join(join(itemString(data, "degree"), itemString(data, "field")), range, itemString(data, "gpa") && `GPA ${itemString(data, "gpa")}`),
      };
    case "PROJECT":
      return { heading: itemString(data, "title") || "Project", meta: join(range, itemString(data, "url")) };
    case "CERTIFICATION":
      return { heading: itemString(data, "title") || "Certification", meta: join(itemString(data, "org"), formatMonth(itemString(data, "date"))) };
    case "LANGUAGE":
      return { heading: itemString(data, "name") || "Language", meta: itemString(data, "level") };
    case "ACHIEVEMENT":
      return { heading: itemString(data, "text") || "Award", meta: formatMonth(itemString(data, "date")) };
    default:
      return { heading: itemString(data, "title") || itemString(data, "name") || "Entry", meta: "" };
  }
}

/** The skills of a SKILL item (`skills` may hold strings or `{name}`). */
export function skillList(data: ItemData): string[] {
  const raw = data.skills;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === "string" ? s : s && typeof s === "object" ? str((s as { name?: unknown }).name) : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---- drafts: validate + clean ------------------------------------------------------------------

export interface DraftLimits {
  /** Most bullets one item may carry (builder setting `limits.bullets`). */
  bullets: number;
  /** Longest bullet in characters (builder setting `limits.bulletChars`). */
  bulletChars: number;
}

/** field key -> message. A key of "_" is a message for the whole form. */
export type DraftErrors = Record<string, string>;

export function sensitiveMessage(cls: string): string {
  const label = SENSITIVE_LABELS[cls as SensitiveClass] ?? "that kind of value";
  return `We never store ${label} — please remove it.`;
}

/** Drops blanks, trims, keeps bullet provenance, removes `end` for a current role. */
export function cleanDraft(section: FormSection, draft: ItemData): ItemData {
  const out: ItemData = {};
  for (const f of SECTION_DEFS[section].fields) {
    const v = draft[f.key];
    if (f.kind === "checkbox") {
      if (v === true) out[f.key] = true;
    } else if (f.kind === "bullets") {
      const bullets = itemBullets(draft)
        .map((b) => ({ ...b, text: b.text.trim() }))
        .filter((b) => b.text !== "");
      if (bullets.length > 0) out[f.key] = bullets.map((b) => ({ text: b.text, src: b.src ?? "user" }));
    } else if (typeof v === "string" && v.trim() !== "") {
      out[f.key] = f.kind === "date" ? normalizeDate(v) : v.trim();
    }
  }
  if (out.current === true) delete out.end;
  return out;
}

/** Field errors for a draft (empty object = valid). Required, date shape, link shape, bullet limits, never-collected values. */
export function validateDraft(section: FormSection, draft: ItemData, limits: DraftLimits): DraftErrors {
  const errors: DraftErrors = {};
  const cleaned = cleanDraft(section, draft);
  for (const f of SECTION_DEFS[section].fields) {
    const v = cleaned[f.key];
    if (f.required && (typeof v !== "string" || v === "")) {
      errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.kind === "date" && typeof v === "string" && !DATE_OK.test(v)) errors[f.key] = "Use YYYY-MM or YYYY.";
    if (f.kind === "url" && typeof v === "string" && !/^https?:\/\/\S+$/i.test(v)) errors[f.key] = "Use a full link starting with https://";
    if (f.kind === "bullets" && Array.isArray(v)) {
      if (v.length > limits.bullets) errors[f.key] = `At most ${limits.bullets} bullets.`;
      else if (v.some((b) => (b as ItemBullet).text.length > limits.bulletChars)) errors[f.key] = `Keep each bullet under ${limits.bulletChars} characters.`;
    }
    if (errors[f.key]) continue;
    // Never-collected values (SSN, bank numbers, passport ...): refuse before the API has to.
    const strings: string[] = typeof v === "string" ? [v] : Array.isArray(v) ? (v as ItemBullet[]).map((b) => b.text) : [];
    for (const s of strings) {
      const hit = scanSensitiveField(f.key, s)[0];
      if (hit) {
        errors[f.key] = sensitiveMessage(hit.cls);
        break;
      }
    }
  }
  const start = cleaned.start;
  const end = cleaned.end;
  if (!errors.end && typeof start === "string" && typeof end === "string" && DATE_OK.test(start) && DATE_OK.test(end)) {
    // A bare year is the whole year: it starts in January and ends in December.
    const from = start.length === 4 ? `${start}-01` : start;
    const to = end.length === 4 ? `${end}-12` : end;
    if (to < from) errors.end = "End can't be before the start.";
  }
  return errors;
}

/** A blank draft for "+ Add". */
export function emptyDraft(section: FormSection): ItemData {
  return SECTION_DEFS[section].fields.some((f) => f.kind === "bullets") ? { bullets: [{ text: "", src: "user" }] } : {};
}
