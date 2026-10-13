/**
 * The template gallery's rules (R3.13, DESIGN 10.17): which templates it lists and the capability chips under each, kept
 * apart from the markup so they are unit-testable. Nothing here knows a template by name: the list is the registry
 * intersected with the admin setting `resume.templates.enabled`, the chips are read off the template's RESOLVED
 * capabilities (registry + the admin overrides of `resume.templates.overrides`, which may only tighten).
 */
import { getTemplate, listTemplates, resolveCapabilities } from "@kiwiply/ui";
import type { TemplateCapabilities, TemplateMeta } from "@kiwiply/ui";

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

/** The resolved capabilities of one gallery template under the admin overrides. */
export const galleryCapabilities = (templateId: string, overrides: Record<string, Record<string, unknown>>): TemplateCapabilities => resolveCapabilities(templateId, overrides);

/** Where "Use this template" goes: the list page, which opens the start chooser with this template preselected (cap check first). */
export const templateHref = (templateId: string): string => `/resume-builder?template=${encodeURIComponent(templateId)}`;
