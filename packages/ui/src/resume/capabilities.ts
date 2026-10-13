/**
 * The template capability model (Resume Builder DESIGN 6): what a template can show, how admin
 * overrides tighten it, what a template switch hides, and what the editor's controls do for it.
 *
 * Pure and dependency-free (no registry import: `templates/*` import this file, and the registry
 * imports the templates, so `resolveCapabilities(templateId, overrides)` - which needs the registry -
 * lives in `registry.ts`). The Java twin is `service/resume/TemplateCapabilities.java`; the two
 * profiles are compared byte-for-byte against `__fixtures__/capabilities.json` on both sides.
 */
import { isListed, isObject, list, one, parseKind, visibleItems, visibleSections, type Json, type JsonObject } from "./doc";
import { DEFAULT_THEME } from "./theme";
import {
  DEFAULT_SECTION_TITLES,
  FONT_PAIRS,
  MARK_TYPES,
  SECTION_KINDS,
  type CustomMode,
  type DateStyle,
  type FontPair,
  type HeadingsMode,
  type MarkType,
  type SectionKind,
  type TemplateCapabilities,
  type Theme,
} from "./types";

function freeze<T extends TemplateCapabilities>(c: T): T {
  Object.freeze(c.sidebarSections);
  Object.freeze(c.marks);
  Object.freeze(c.theme.fontPairs);
  Object.freeze(c.theme);
  Object.freeze(c.sections);
  Object.freeze(c.dateStyles);
  return Object.freeze(c);
}

/** The profile an ATS-friendly template declares (it may only tighten). */
export const ATS_STRICT: TemplateCapabilities = freeze({
  ats: true,
  columns: 1,
  sidebarSections: [],
  photo: false,
  photoDefault: false,
  marks: ["b"], // bold survives every parser; italic / underline / links are dropped by some
  lists: false,
  graphics: false,
  theme: { accent: false, fontPairs: ["inter", "georgia-arial"], spacing: true, pageLength: true },
  maxPages: 2,
  sections: ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "PROJECTS", "CERTIFICATIONS", "LANGUAGES", "ACHIEVEMENTS"],
  custom: "limited",
  customLimit: 1,
  headings: "standard",
  dateStyles: ["range"],
  maxSkillGroups: 6,
});

/** The loosest profile a non-ATS template may declare. */
export const DESIGN_FREE: TemplateCapabilities = freeze({
  ats: false,
  columns: 2,
  sidebarSections: ["SKILLS", "LANGUAGES", "CERTIFICATIONS", "INTERESTS"],
  photo: true,
  photoDefault: false,
  marks: ["b", "i", "u", "a"],
  lists: true,
  graphics: true,
  theme: { accent: true, fontPairs: ["inter", "source-serif", "georgia-arial"], spacing: true, pageLength: true },
  maxPages: 2,
  sections: [...SECTION_KINDS],
  custom: "any",
  customLimit: 99,
  headings: "free",
  dateStyles: ["range", "year"],
  maxSkillGroups: 0,
});

/* ── strictness ───────────────────────────────────────────────────────────────────────────── */

const subset = <T>(a: readonly T[], b: readonly T[]) => a.every((x) => b.includes(x));
const CUSTOM_RANK: Record<CustomMode, number> = { none: 0, limited: 1, any: 2 };
const HEADINGS_RANK: Record<HeadingsMode, number> = { standard: 0, free: 1 };
/** `maxSkillGroups` 0 means unlimited, i.e. the loosest. */
const groupsCap = (n: number) => (n > 0 ? n : Number.POSITIVE_INFINITY);

/**
 * `a` is at least as strict as `b`: every boolean is <=, every list a subset, every number <=,
 * `columns` and the headings/custom modes no looser. `ats: true` counts as stricter than `ats: false`.
 * (The registry test: an `ats: true` template satisfies `isAtLeastAsStrictAs(caps, ATS_STRICT)`, any
 * other satisfies it against `DESIGN_FREE`.)
 */
export function isAtLeastAsStrictAs(a: TemplateCapabilities, b: TemplateCapabilities): boolean {
  if (!a.ats && b.ats) return false;
  if (a.columns > b.columns) return false;
  if (!subset(a.sidebarSections, b.sidebarSections)) return false;
  if (a.photo && !b.photo) return false;
  if (a.photoDefault && !b.photoDefault) return false;
  if (!subset(a.marks, b.marks)) return false;
  if (a.lists && !b.lists) return false;
  if (a.graphics && !b.graphics) return false;
  if (a.theme.accent && !b.theme.accent) return false;
  if (!subset(a.theme.fontPairs, b.theme.fontPairs)) return false;
  if (a.theme.spacing && !b.theme.spacing) return false;
  if (a.theme.pageLength && !b.theme.pageLength) return false;
  if (a.maxPages > b.maxPages) return false;
  if (!subset(a.sections, b.sections)) return false;
  if (CUSTOM_RANK[a.custom] > CUSTOM_RANK[b.custom]) return false;
  if (a.custom === "limited" && b.custom === "limited" && a.customLimit > b.customLimit) return false;
  if (HEADINGS_RANK[a.headings] > HEADINGS_RANK[b.headings]) return false;
  if (!subset(a.dateStyles, b.dateStyles)) return false;
  if (groupsCap(a.maxSkillGroups) > groupsCap(b.maxSkillGroups)) return false;
  return true;
}

/* ── admin overrides: tighten only (DESIGN 6.3) ───────────────────────────────────────────── */

const warned = new Set<string>();

/** Test hook: forget which ignored overrides were already reported. */
export function resetOverrideWarnings(): void {
  warned.clear();
}

function ignored(templateId: string, field: string, detail: string): void {
  const key = `${templateId}:${field}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`resume.caps.override_ignored: template "${templateId}" field "${field}" - ${detail}`);
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * `base` tightened by an admin override (setting `resume.templates.overrides[templateId]`, a partial
 * `TemplateCapabilities`). Only tightening is applied: photo true to false, marks / sections / fontPairs /
 * dateStyles / sidebarSections to a subset, custom any to limited to none, headings free to standard,
 * maxPages 2 to 1, theme.* true to false, columns 2 to 1, smaller `customLimit` / `maxSkillGroups`.
 * Anything that would loosen, a wrong type, or an unknown value is ignored and reported once per
 * template and field with a `console.warn("resume.caps.override_ignored ...")`.
 * `ats` can be demoted by an override (`false`), never promoted.
 */
export function tightenCapabilities(templateId: string, base: TemplateCapabilities, override: unknown): TemplateCapabilities {
  if (!isObject(override)) {
    if (override !== undefined && override !== null) ignored(templateId, "*", "override is not an object");
    return base;
  }
  const out: TemplateCapabilities = {
    ...base,
    sidebarSections: [...base.sidebarSections],
    marks: [...base.marks],
    theme: { ...base.theme, fontPairs: [...base.theme.fontPairs] },
    sections: [...base.sections],
    dateStyles: [...base.dateStyles],
  };

  const bool = (field: string, cur: boolean, v: unknown, set: (b: boolean) => void) => {
    if (v === undefined) return;
    if (typeof v !== "boolean") return ignored(templateId, field, "expected a boolean");
    if (v && !cur) return ignored(templateId, field, "would loosen the template");
    set(cur && v);
  };

  /** Keeps `current` entries that the override also lists; unknown / loosening entries are reported. */
  const subsetOf = <T extends string>(field: string, current: readonly T[], v: unknown, allowed: readonly string[], minLen: number): T[] | null => {
    if (v === undefined) return null;
    if (!isStringArray(v)) {
      ignored(templateId, field, "expected an array of strings");
      return null;
    }
    const kept = current.filter((x) => v.includes(x));
    if (v.some((x) => !current.includes(x as T))) {
      ignored(templateId, field, `lists values the template does not allow (${v.filter((x) => !current.includes(x as T)).join(", ")})`);
    }
    if (v.some((x) => !allowed.includes(x))) return null;
    if (kept.length < minLen) {
      ignored(templateId, field, `would leave fewer than ${minLen} value(s)`);
      return null;
    }
    return kept;
  };

  bool("ats", base.ats, override.ats, (b) => (out.ats = b));
  bool("photo", base.photo, override.photo, (b) => (out.photo = b));
  bool("photoDefault", base.photoDefault, override.photoDefault, (b) => (out.photoDefault = b));
  bool("lists", base.lists, override.lists, (b) => (out.lists = b));
  bool("graphics", base.graphics, override.graphics, (b) => (out.graphics = b));

  if (override.columns !== undefined) {
    if (override.columns !== 1 && override.columns !== 2) ignored(templateId, "columns", "expected 1 or 2");
    else if (override.columns > base.columns) ignored(templateId, "columns", "would loosen the template");
    else out.columns = override.columns;
  }
  if (override.maxPages !== undefined) {
    if (override.maxPages !== 1 && override.maxPages !== 2) ignored(templateId, "maxPages", "expected 1 or 2");
    else if (override.maxPages > base.maxPages) ignored(templateId, "maxPages", "would loosen the template");
    else out.maxPages = override.maxPages;
  }

  const sidebar = subsetOf<SectionKind>("sidebarSections", base.sidebarSections, override.sidebarSections, SECTION_KINDS, 0);
  if (sidebar) out.sidebarSections = sidebar;
  const marks = subsetOf<MarkType>("marks", base.marks, override.marks, MARK_TYPES, 0);
  if (marks) out.marks = marks;
  const sections = subsetOf<SectionKind>("sections", base.sections, override.sections, SECTION_KINDS, 0);
  if (sections) out.sections = sections;
  const dateStyles = subsetOf<DateStyle>("dateStyles", base.dateStyles, override.dateStyles, ["range", "year"], 1);
  if (dateStyles) out.dateStyles = dateStyles;

  if (override.custom !== undefined) {
    if (override.custom !== "any" && override.custom !== "limited" && override.custom !== "none") ignored(templateId, "custom", "expected any, limited or none");
    else if (CUSTOM_RANK[override.custom] > CUSTOM_RANK[base.custom]) ignored(templateId, "custom", "would loosen the template");
    else out.custom = override.custom;
  }
  if (override.customLimit !== undefined) {
    if (typeof override.customLimit !== "number" || !Number.isInteger(override.customLimit) || override.customLimit < 0) ignored(templateId, "customLimit", "expected a non-negative integer");
    else if (override.customLimit > base.customLimit) ignored(templateId, "customLimit", "would loosen the template");
    else out.customLimit = override.customLimit;
  }
  if (override.headings !== undefined) {
    if (override.headings !== "standard" && override.headings !== "free") ignored(templateId, "headings", "expected standard or free");
    else if (HEADINGS_RANK[override.headings] > HEADINGS_RANK[base.headings]) ignored(templateId, "headings", "would loosen the template");
    else out.headings = override.headings;
  }
  if (override.maxSkillGroups !== undefined) {
    const v = override.maxSkillGroups;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) ignored(templateId, "maxSkillGroups", "expected a non-negative integer");
    else if (groupsCap(v) > groupsCap(base.maxSkillGroups)) ignored(templateId, "maxSkillGroups", "would loosen the template");
    else out.maxSkillGroups = v;
  }

  if (override.theme !== undefined) {
    if (!isObject(override.theme)) ignored(templateId, "theme", "expected an object");
    else {
      const t = override.theme as JsonObject;
      bool("theme.accent", base.theme.accent, t.accent, (b) => (out.theme.accent = b));
      bool("theme.spacing", base.theme.spacing, t.spacing, (b) => (out.theme.spacing = b));
      bool("theme.pageLength", base.theme.pageLength, t.pageLength, (b) => (out.theme.pageLength = b));
      const fonts = subsetOf<FontPair>("theme.fontPairs", base.theme.fontPairs, t.fontPairs, FONT_PAIRS, 1);
      if (fonts) out.theme.fontPairs = fonts;
    }
  }
  return out;
}

/* ── marks ────────────────────────────────────────────────────────────────────────────────── */

/** The inline marks the template renders and the toolbar offers. */
export function allowedMarks(caps: TemplateCapabilities): readonly MarkType[] {
  return caps.marks;
}

/* ── which sections a template draws ──────────────────────────────────────────────────────── */

export type SectionVerdict = "shown" | "kind" | "custom";

export interface PlannedSection {
  section: JsonObject;
  kind: SectionKind | null;
  /** `shown`, or why the template hides it: `kind` (not in `caps.sections`) or `custom` (over the limit / not allowed). */
  verdict: SectionVerdict;
}

/**
 * Every non-hidden section of `doc` in document order with the template's verdict. CUSTOM sections are
 * governed by `caps.custom` (the first `customLimit` that have content are shown), every other kind by
 * `caps.sections`; a section of an unknown kind is left alone. The renderer and `hiddenContent` share this.
 */
export function planSections(doc: Json, caps: TemplateCapabilities): PlannedSection[] {
  const out: PlannedSection[] = [];
  let customShown = 0;
  for (const section of visibleSections(doc, null)) {
    const kind = parseKind(section.kind);
    let verdict: SectionVerdict = "shown";
    if (kind === "CUSTOM") {
      if (visibleItems(section).length > 0) {
        if (caps.custom === "none" || (caps.custom === "limited" && customShown >= caps.customLimit)) verdict = "custom";
        else customShown += 1;
      }
    } else if (kind && !caps.sections.includes(kind)) {
      verdict = "kind";
    }
    out.push({ section, kind, verdict });
  }
  return out;
}

/** The title the template draws for a section: standard headings ignore a stored override (CUSTOM keeps its own title). */
export function headingFor(section: Json, kind: SectionKind | null, caps: TemplateCapabilities): string {
  const stored = one(section, "title");
  if (caps.headings === "standard" && kind && kind !== "CUSTOM") return DEFAULT_SECTION_TITLES[kind];
  return stored || (kind ? DEFAULT_SECTION_TITLES[kind] : "Additional Information");
}

/** Whether the photo is drawn: the template allows it, the theme (or the template default) wants it and the document has one. */
export function photoShown(doc: Json, theme: Pick<Theme, "showPhoto">, caps: TemplateCapabilities): boolean {
  const photo = isObject(doc) && isObject(doc.basics) ? doc.basics.photo : null;
  const has = isObject(photo) && typeof photo.key === "string" && photo.key.length > 0;
  return has && caps.photo && (theme.showPhoto ?? caps.photoDefault);
}

/* ── lossless switching: what this template hides (DESIGN 6.5) ────────────────────────────── */

export type HiddenKind = "photo" | "marks" | "lists" | "section" | "custom" | "headingOverride" | "accent" | "font" | "pages";

export interface HiddenItem {
  kind: HiddenKind;
  label: string;
  count?: number;
}

const MARK_LABEL: Record<MarkType, string> = { b: "bold", i: "italic", u: "underline", a: "links" };

/**
 * What the document + theme contain that this template does not draw. Nothing is deleted - switching
 * back to a capable template shows it all again. Order is fixed:
 * photo, marks, lists, section (one per hidden section), custom, headingOverride, accent, font, pages.
 * User-hidden sections / items are not counted (they are not drawn anywhere).
 */
export function hiddenContent(doc: Json, theme: Theme, caps: TemplateCapabilities): HiddenItem[] {
  const out: HiddenItem[] = [];
  const basics = isObject(doc) ? doc.basics : null;
  const photo = isObject(basics) ? basics.photo : null;
  if (!caps.photo && isObject(photo) && typeof photo.key === "string" && photo.key.length > 0) out.push({ kind: "photo", label: "photo" });

  const plan = planSections(doc, caps);
  const drawn = plan.filter((p) => p.verdict === "shown");

  // Marks and lists in the content the template does draw.
  const lostMarks = new Map<MarkType, number>();
  let lostLists = 0;
  const countMarks = (marks: Json) => {
    for (const m of Array.isArray(marks) ? marks : []) {
      if (!isObject(m) || typeof m.t !== "string" || !(MARK_TYPES as readonly string[]).includes(m.t)) continue;
      const t = m.t as MarkType;
      if (!caps.marks.includes(t)) lostMarks.set(t, (lostMarks.get(t) ?? 0) + 1);
    }
  };
  for (const { section } of drawn) {
    for (const item of visibleItems(section)) {
      countMarks(item.marks);
      for (const b of list(item, "bullets")) if (isObject(b)) countMarks(b.marks);
      if (!caps.lists && (isListed(item, "list") || isListed(item, "listStyle"))) lostLists += 1;
    }
  }
  if (lostMarks.size > 0) {
    const order = MARK_TYPES.filter((t) => lostMarks.has(t));
    out.push({ kind: "marks", label: order.map((t) => MARK_LABEL[t]).join(", "), count: order.reduce((n, t) => n + (lostMarks.get(t) ?? 0), 0) });
  }
  if (lostLists > 0) out.push({ kind: "lists", label: "lists", count: lostLists });

  for (const p of plan) {
    if (p.verdict === "kind" && p.kind && visibleItems(p.section).length > 0) {
      out.push({ kind: "section", label: one(p.section, "title") || DEFAULT_SECTION_TITLES[p.kind] });
    }
  }
  const overCustom = plan.filter((p) => p.verdict === "custom");
  if (overCustom.length > 0) {
    out.push({ kind: "custom", label: overCustom.map((p) => one(p.section, "title") || DEFAULT_SECTION_TITLES.CUSTOM).join(", "), count: overCustom.length });
  }

  if (caps.headings === "standard") {
    const overridden = drawn.filter((p) => {
      if (!p.kind || p.kind === "CUSTOM") return false;
      const t = one(p.section, "title");
      return t !== "" && t !== DEFAULT_SECTION_TITLES[p.kind];
    });
    if (overridden.length > 0) out.push({ kind: "headingOverride", label: "custom headings", count: overridden.length });
  }

  if (!caps.theme.accent && (theme.accent.toLowerCase() !== DEFAULT_THEME.accent || (theme._touched ?? []).includes("accent"))) {
    out.push({ kind: "accent", label: "accent colour" });
  }
  if (!caps.theme.fontPairs.includes(theme.fontPair)) out.push({ kind: "font", label: "font" });
  if (theme.fit.target > caps.maxPages) out.push({ kind: "pages", label: "two pages" });
  return out;
}

/** "Hidden in this ATS template: photo, italic, Interests." - the toast text (DESIGN 6.5); `null` when nothing is hidden. */
export function hiddenNotice(items: readonly HiddenItem[], caps: Pick<TemplateCapabilities, "ats">): string | null {
  if (items.length === 0) return null;
  return `Hidden in this ${caps.ats ? "ATS " : ""}template: ${items.map((i) => i.label).join(", ")}.`;
}

/* ── the editor adapts: control by control (DESIGN 6.4) ───────────────────────────────────── */

export type ToolbarButton = "b" | "i" | "u" | "bullet" | "number" | "a";

export interface ControlState {
  enabled: boolean;
  /** Button / row text when it differs from the default ("Add to resume"). */
  label?: string;
  /** The hover hint explaining a disabled control. */
  hint?: string;
}

export interface EditorControls {
  /** Photo slot shown in the header block. */
  photoSlot: boolean;
  /** Toolbar buttons in order; `[]` = the toolbar is not rendered at all. */
  toolbar: ToolbarButton[];
  accent: ControlState;
  /** Font Family options offered. */
  fontPairs: FontPair[];
  spacing: ControlState;
  /** Page Length: `twoPages` = "Two Pages" is offered. */
  pageLength: ControlState & { twoPages: boolean };
  /** The small Month Year / Year segmented control; hidden when only one style is offered. */
  dateStyleControl: boolean;
  /** Inline rename of a section title. */
  sectionTitleEditable: ControlState;
  /** Custom section titles must match this when `custom == "limited"`. */
  customTitlePattern: RegExp | null;
  /** Insights: the ATS rules group (G6) is shown and weighted. */
  atsRulesGroup: boolean;
  /** Add Section panel row per kind. */
  addSection: Record<SectionKind, ControlState>;
}

/** Custom section titles under `custom: "limited"`: plain headings ATS parsers recognise. */
export const LIMITED_CUSTOM_TITLE = /^[A-Za-z][A-Za-z ]{1,29}$/;

/**
 * The state of every capability-dependent control for `doc` under `caps` (the table in DESIGN 6.4).
 * Editor components render from this and never test `caps.ats` themselves.
 */
export function controlStates(doc: Json, caps: TemplateCapabilities): EditorControls {
  const tag = caps.ats ? "ATS " : "";
  const notIn = caps.ats ? "Not in this ATS template" : "Not in this template";

  const toolbar: ToolbarButton[] = [];
  if (caps.marks.includes("b")) toolbar.push("b");
  if (caps.marks.includes("i")) toolbar.push("i");
  if (caps.marks.includes("u")) toolbar.push("u");
  if (caps.lists) toolbar.push("bullet", "number");
  if (caps.marks.includes("a")) toolbar.push("a");

  const present = new Set<SectionKind>();
  let customCount = 0;
  for (const s of list(doc, "sections")) {
    if (!isObject(s)) continue;
    const kind = parseKind(s.kind);
    if (!kind) continue;
    if (kind === "CUSTOM") customCount += 1;
    else present.add(kind);
  }

  const addSection = {} as Record<SectionKind, ControlState>;
  for (const kind of SECTION_KINDS) {
    if (kind === "CUSTOM") {
      if (caps.custom === "none") addSection[kind] = { enabled: false, label: notIn, hint: "ATS parsers only read standard sections" };
      else if (caps.custom === "limited" && customCount >= caps.customLimit) {
        addSection[kind] = { enabled: false, label: caps.ats ? "Limit reached (ATS)" : "Limit reached", hint: "Keep it to a standard section" };
      } else addSection[kind] = { enabled: true, label: "Add to resume" };
    } else if (!caps.sections.includes(kind)) {
      addSection[kind] = { enabled: false, label: notIn, hint: caps.ats ? "ATS parsers only read standard sections" : undefined };
    } else if (present.has(kind)) {
      addSection[kind] = { enabled: false, label: "Already added" };
    } else {
      addSection[kind] = { enabled: true, label: "Add to resume" };
    }
  }

  return {
    photoSlot: caps.photo,
    toolbar,
    accent: caps.theme.accent
      ? { enabled: true }
      : { enabled: false, hint: `(${caps.ats ? "ATS" : "template"}) colours are not used by this template` },
    fontPairs: [...caps.theme.fontPairs],
    spacing: caps.theme.spacing ? { enabled: true } : { enabled: false, hint: "(fixed by this template)" },
    pageLength: {
      enabled: caps.theme.pageLength,
      twoPages: caps.maxPages === 2,
      hint: caps.theme.pageLength ? undefined : "(fixed by this template)",
    },
    dateStyleControl: caps.dateStyles.length > 1,
    sectionTitleEditable:
      caps.headings === "free" ? { enabled: true } : { enabled: false, hint: `Standard heading (${tag.trim() || "template"})` },
    customTitlePattern: caps.custom === "limited" ? LIMITED_CUSTOM_TITLE : null,
    atsRulesGroup: caps.ats,
    addSection,
  };
}
