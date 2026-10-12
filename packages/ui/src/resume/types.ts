/**
 * The Resume Builder contract (DESIGN sections 3 and 4), mirrored in Java by
 * `com.dossier.api.service.resume.*`. Pure types and constants - no runtime deps - so the web editor,
 * the templates, the PDF route and the tests all agree on one shape.
 *
 * The *document* is data the user owns; the *theme* and *template id* are presentation. Switching a
 * template or theme never reads or writes the document body.
 */
import type { ReactElement } from "react";

export type { StructuredResume } from "../parser-core-types";

export const SCHEMA_VERSION = 2;

/** Section kinds in the order the design lists them. */
export const SECTION_KINDS = [
  "SUMMARY",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "PROJECTS",
  "CERTIFICATIONS",
  "LANGUAGES",
  "ACHIEVEMENTS",
  "INTERESTS",
  "CUSTOM",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** The title used when a section has none (identical to `ResumeDocument.Kind#defaultTitle` in Java). */
export const DEFAULT_SECTION_TITLES: Record<SectionKind, string> = {
  SUMMARY: "Summary",
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  SKILLS: "Skills",
  PROJECTS: "Projects",
  CERTIFICATIONS: "Certifications",
  LANGUAGES: "Languages",
  ACHIEVEMENTS: "Achievements",
  INTERESTS: "Interests",
  CUSTOM: "Additional Information",
};

/** Provenance of a bullet / summary text. */
export type Src = "parsed" | "user" | "ai" | "learned";

/** `YYYY` or `YYYY-MM`, or empty/null. */
export type DocDate = string | null;

/** Inline formatting: bold, italic, underline, link. */
export const MARK_TYPES = ["b", "i", "u", "a"] as const;
export type MarkType = (typeof MARK_TYPES)[number];

/**
 * An inline mark: a range of the plain `text` it sits next to (`s` inclusive, `e` exclusive, UTF-16
 * code units, `0 <= s < e <= text.length`). The text is the single source of truth - a mark never
 * changes what the text says. Two marks of the same `t` never overlap; `href` is present iff `t === "a"`.
 */
export interface Mark {
  s: number;
  e: number;
  t: MarkType;
  /** `http(s)://` or `mailto:` only. */
  href?: string;
}

/** A list setting: bullets or `1.` numbering (`null`/absent = plain). */
export type ListStyle = "bullet" | "number";

export interface Bullet {
  id: string;
  text: string;
  src?: Src;
  marks?: Mark[];
}

export interface DocLink {
  label?: string | null;
  url?: string | null;
}

/** The job a tailored copy was made for. Server-written (a save may only echo it). */
export interface JobRef {
  source: "application" | "saved_job" | "pasted" | "extension";
  applicationId?: number | null;
  title: string;
  company: string;
  /** sha256 of the normalised JD text, lowercase hex. */
  jdHash: string;
}

export interface TailoredFrom {
  resumeId: number;
  job: JobRef;
  createdAt?: string;
}

export interface DocMeta {
  title: string;
  target?: string | null;
  language?: string | null;
  profileSyncedAt?: string | null;
  originalFileKey?: string | null;
  /** Server-written; a PUT may not introduce, change or drop it. */
  tailoredFrom?: TailoredFrom | null;
}

/** The profile photo. `key` is a `FileStorage` key the server set; the client only echoes it. */
export interface DocPhoto {
  key: string;
  updatedAt?: string;
}

export interface DocBasics {
  name?: string | null;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: DocLink[];
  photo?: DocPhoto | null;
}

interface ItemBase {
  /** Stable id `[a-z]_[A-Za-z0-9]{6,12}`, unique across the document. */
  id: string;
  hidden?: boolean;
  /** Links a doc item to its profile source (R1). */
  profileItemId?: number | null;
}

export interface SummaryItem extends ItemBase {
  text?: string | null;
  src?: Src;
  marks?: Mark[];
  /** Renders each 
 line of the text as a list item. */
  list?: ListStyle | null;
}
export interface ExperienceItem extends ItemBase {
  title?: string | null;
  org?: string | null;
  location?: string | null;
  start?: DocDate;
  end?: DocDate;
  current?: boolean;
  bullets?: Bullet[];
  listStyle?: ListStyle | null;
}
export interface EducationItem extends ItemBase {
  school?: string | null;
  degree?: string | null;
  field?: string | null;
  location?: string | null;
  start?: DocDate;
  end?: DocDate;
  gpa?: string | null;
  bullets?: Bullet[];
  listStyle?: ListStyle | null;
}
export interface SkillsItem extends ItemBase {
  group?: string | null;
  skills?: string[];
}
export interface ProjectItem extends ItemBase {
  title?: string | null;
  url?: string | null;
  start?: DocDate;
  end?: DocDate;
  bullets?: Bullet[];
  listStyle?: ListStyle | null;
}
export interface CertificationItem extends ItemBase {
  title?: string | null;
  org?: string | null;
  date?: DocDate;
  url?: string | null;
}
export interface LanguageItem extends ItemBase {
  name?: string | null;
  level?: string | null;
}
export interface AchievementItem extends ItemBase {
  text?: string | null;
  date?: DocDate;
  marks?: Mark[];
}
/** One interest, at most 80 characters; the section renders as a comma list. */
export interface InterestsItem extends ItemBase {
  text?: string | null;
}
/** CUSTOM items have the same shape as EXPERIENCE items. */
export type CustomItem = ExperienceItem;

interface SectionBase<K extends SectionKind, I> {
  id: string;
  kind: K;
  title?: string | null;
  hidden?: boolean;
  items: I[];
}

export type Section =
  | SectionBase<"SUMMARY", SummaryItem>
  | SectionBase<"EXPERIENCE", ExperienceItem>
  | SectionBase<"EDUCATION", EducationItem>
  | SectionBase<"SKILLS", SkillsItem>
  | SectionBase<"PROJECTS", ProjectItem>
  | SectionBase<"CERTIFICATIONS", CertificationItem>
  | SectionBase<"LANGUAGES", LanguageItem>
  | SectionBase<"ACHIEVEMENTS", AchievementItem>
  | SectionBase<"INTERESTS", InterestsItem>
  | SectionBase<"CUSTOM", CustomItem>;

export interface ResumeDocument {
  schema: 2;
  meta: DocMeta;
  basics: DocBasics;
  sections: Section[];
}

/**
 * A stored v1 document: the same shape but `schema: 1` and the photo as a bare `basics.photoKey`.
 * `upgradeDocument` turns it into a {@link ResumeDocument}.
 */
export type ResumeDocumentV1 = Omit<ResumeDocument, "schema" | "basics"> & {
  schema: 1;
  basics: Omit<DocBasics, "photo"> & { photoKey?: string | null };
};

/** What a read or a PUT may carry: schema 1 or 2 in, always schema 2 out (DESIGN 3.6). */
export type ResumeDocumentAnySchema = ResumeDocumentV1 | ResumeDocument;

/* The projection output is the `StructuredResume` the ResumeUpload form already uses (re-exported below). */

/* ── Theme ────────────────────────────────────────────────────────────────────────────────── */

export type FontPair = "inter" | "source-serif" | "ibm-plex" | "georgia-arial";
export type PageSize = "letter" | "a4";
export type DateStyle = "range" | "year";

export interface FitState {
  mode: "auto" | "manual";
  /** Page budget the auto mode aims for. */
  target: 1 | 2;
  /** Position on the 7-step ladder, 0-6 (see `fit.ts`). */
  step: number;
}

export interface Theme {
  /** `#rgb` / `#rrggbb` hex. */
  accent: string;
  fontPair: FontPair;
  /** Body size in pt, 9.5-12. */
  size: number;
  /** Vertical rhythm multiplier, 0.7-1.1. */
  density: number;
  /** Page margin in inches, 0.4-1.0. */
  margin: number;
  pageSize: PageSize;
  dateStyle: DateStyle;
  fit: FitState;
  /** Theme keys the user changed by hand; template `defaults` only apply to the rest. */
  _touched?: string[];
}

/* ── Templates ────────────────────────────────────────────────────────────────────────────── */

export interface TemplateSupports {
  columns: 1 | 2;
  /** Sections the template can host in a sidebar; any other kind renders in the main column. */
  sidebarSections: SectionKind[];
  photo: boolean;
  /** Max skill groups drawn before the rest collapse into the last group; `0` = unlimited. */
  maxSkillGroups: number;
  dateStyle: DateStyle[];
}

export interface TemplateMeta {
  /** Registry key and the value stored in `resume_doc.template_id`. */
  id: string;
  name: string;
  description: string;
  /** `true` passes every ATS-safe rule; `"caution"` (e.g. two columns) is flagged in the picker. */
  atsSafe: boolean | "caution";
  supports: TemplateSupports;
  /** File name under `packages/ui/src/resume/thumbs/` (240x340 PNG). */
  thumb: string;
  /** Applied on a template switch only to theme keys that are not in `theme._touched`. */
  defaults?: Partial<Omit<Theme, "_touched" | "fit">>;
}

export interface TemplateProps {
  doc: ResumeDocument;
  /** The resolved theme (ladder step already applied). */
  theme: Theme;
}

export interface TemplateDefinition {
  meta: TemplateMeta;
  /** Pure function of its props: no hooks, no effects, survives `renderToStaticMarkup`. */
  Render: (props: TemplateProps) => ReactElement;
}
