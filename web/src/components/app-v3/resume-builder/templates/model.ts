/**
 * The template gallery's rules (R3.13, DESIGN 10.17): which templates it lists and the capability chips under each, kept
 * apart from the markup so they are unit-testable. Nothing here knows a template by name: the list is the registry
 * intersected with the admin setting `resume.templates.enabled`, the chips are read off the template's RESOLVED
 * capabilities (registry + the admin overrides of `resume.templates.overrides`, which may only tighten).
 */
import { getTemplate, listTemplates, resolveCapabilities } from "@kiwiply/ui";
import type { TemplateCapabilities, TemplateCategory, TemplateMeta } from "@kiwiply/ui";

/** Every enabled template of the registry, in the order the admin enabled them. If the two share nothing, the default template (never an empty page). */
export function galleryTemplates(enabled: readonly string[], defaultId: string): TemplateMeta[] {
  const byId = new Map(listTemplates().map((t) => [t.id, t]));
  const ids: string[] = [];
  for (const id of enabled) if (byId.has(id) && !ids.includes(id)) ids.push(id);
  if (ids.length === 0) ids.push(getTemplate(defaultId).meta.id);
  return ids.map((id) => byId.get(id) as TemplateMeta);
}

export interface CapabilityChip {
  /** Stable key (and a test hook). */
  id: "ats" | "photo" | "columns" | "marks";
  label: string;
}

/**
 * The chips of one template, in the board's order: ATS Friendly (iff `ats`) · Photo (iff `photo`) · 2 columns (iff two) ·
 * the formatting it renders: "Bold only" (just bold), "Rich text" (bold plus italic / underline / links), "Plain text" (none).
 */
export function capabilityChips(caps: TemplateCapabilities): CapabilityChip[] {
  const chips: CapabilityChip[] = [];
  if (caps.ats) chips.push({ id: "ats", label: "ATS Friendly" });
  if (caps.photo) chips.push({ id: "photo", label: "Photo" });
  if (caps.columns === 2) chips.push({ id: "columns", label: "2 columns" });
  const marks = caps.marks;
  chips.push({ id: "marks", label: marks.length === 0 ? "Plain text" : marks.length === 1 && marks[0] === "b" ? "Bold only" : "Rich text" });
  return chips;
}

export type AtsRating = "strict" | "mostly" | "design";

/**
 * How parser-friendly a template is, from its RESOLVED capabilities (TEMPLATES-DESIGN 9.3): `ats` is "strict"; one column
 * with no photo and no graphics is "mostly"; anything else is "design". An admin override that tightens the profile
 * therefore promotes the label honestly, and demoting `ats` demotes it.
 */
export function atsRating(caps: TemplateCapabilities): AtsRating {
  if (caps.ats) return "strict";
  if (caps.columns === 1 && !caps.photo && !caps.graphics) return "mostly";
  return "design";
}

export const ATS_RATING_LABEL: Record<AtsRating, string> = {
  strict: "ATS-safe",
  mostly: "Mostly ATS-safe",
  design: "Design first — less ATS-safe",
};

/** Gallery groups, in display order. */
export const CATEGORY_ORDER: readonly TemplateCategory[] = ["ats", "employer", "styled"];
/** Group heading and filter-chip label. */
export const CATEGORY_LABEL: Record<TemplateCategory, string> = { ats: "ATS-safe", employer: "Employer formats", styled: "Styled" };
/** The word under a template name in the editor's Pick Template grid. */
export const CATEGORY_WORD: Record<TemplateCategory, string> = { ats: "ATS", employer: "Employer format", styled: "Styled" };
/** One-line sub-caption under a group heading. */
export const CATEGORY_CAPTION: Record<TemplateCategory, string> = {
  ats: "One column, real text, standard headings — safe for every parser.",
  employer: "The layouts recruiters in tech, consulting, finance and academia expect.",
  styled: "More personality; honestly labelled where parsers may struggle.",
};

export interface CategoryGroup {
  category: TemplateCategory;
  label: string;
  caption: string;
  templates: TemplateMeta[];
}

/** Templates grouped by `meta.category` in ATS, Employer, Styled order; the order inside a group is the input's. A group with no template is omitted. */
export function groupByCategory(metas: readonly TemplateMeta[]): CategoryGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    caption: CATEGORY_CAPTION[category],
    templates: metas.filter((t) => t.category === category),
  })).filter((g) => g.templates.length > 0);
}

/** The resolved capabilities of one gallery template under the admin overrides. */
export const galleryCapabilities = (templateId: string, overrides: Record<string, Record<string, unknown>>): TemplateCapabilities => resolveCapabilities(templateId, overrides);

/** Where "Use this template" goes: the list page, which opens the start chooser with this template preselected (cap check first). */
export const templateHref = (templateId: string): string => `/resume-builder?template=${encodeURIComponent(templateId)}`;
