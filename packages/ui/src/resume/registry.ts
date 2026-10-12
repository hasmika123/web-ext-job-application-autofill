/**
 * Template registry: `templateId -> { meta, Render }`. Adding a template = one `.tsx` file in
 * `templates/`, one entry here, a 240x340 thumbnail in `thumbs/` and a snapshot test.
 * `template_id` is stored as a free string; unknown ids fall back to `modern` on read.
 */
import { modern } from "./templates/modern";
import type { TemplateDefinition, TemplateMeta } from "./types";

export const DEFAULT_TEMPLATE_ID = "modern";

export const TEMPLATES: Readonly<Record<string, TemplateDefinition>> = Object.freeze({
  modern,
});

export const TEMPLATE_IDS: readonly string[] = Object.freeze(Object.keys(TEMPLATES));

export function hasTemplate(id: string | null | undefined): boolean {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, id);
}

/** The template for `id`, or the default (`modern`) when `id` is unknown. */
export function getTemplate(id: string | null | undefined): TemplateDefinition {
  return hasTemplate(id) ? TEMPLATES[id as string] : TEMPLATES[DEFAULT_TEMPLATE_ID];
}

export function listTemplates(): TemplateMeta[] {
  return TEMPLATE_IDS.map((id) => TEMPLATES[id].meta);
}
