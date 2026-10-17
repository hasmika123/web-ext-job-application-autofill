/**
 * Template registry: `templateId -> { meta, Render }`. Adding a template = one `.tsx` file in
 * `templates/`, one entry here declaring `meta.capabilities`, a 240x340 thumbnail in `thumbs/` and
 * snapshot tests (see `packages/ui/README.md`, "Resume templates").
 * `template_id` is stored as a free string; unknown ids fall back to `modern` on read.
 */
import { tightenCapabilities } from "./capabilities";
import { consultant } from "./templates/consultant";
import { modern } from "./templates/modern";
import { scholar } from "./templates/scholar";
import { compact } from "./templates/compact";
import { classic } from "./templates/classic";
import type { TemplateCapabilities, TemplateDefinition, TemplateMeta } from "./types";

export const DEFAULT_TEMPLATE_ID = "modern";

export const TEMPLATES: Record<string, TemplateDefinition> = { modern, classic, compact, consultant, scholar };

export const TEMPLATE_IDS: string[] = Object.keys(TEMPLATES);

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

/**
 * The capabilities the editor and the renderer use for `templateId` (DESIGN 6.3): the registered profile
 * tightened by the admin overrides (`resume.templates.overrides`, as served by the builder config).
 * An override may only tighten; loosening entries are ignored and reported once with
 * `console.warn("resume.caps.override_ignored ...")`. `ats` can be demoted, never promoted.
 * An unknown id resolves like `getTemplate`: to the default template.
 */
export function resolveCapabilities(templateId: string | null | undefined, overrides?: Record<string, unknown> | null): TemplateCapabilities {
  const { meta } = getTemplate(templateId);
  const override = overrides && Object.prototype.hasOwnProperty.call(overrides, meta.id) ? overrides[meta.id] : undefined;
  return tightenCapabilities(meta.id, meta.capabilities, override);
}

/**
 * TEST ONLY: registers `def` until the returned function is called. Production code never registers a
 * template at runtime; the capability test vectors use it for the `DESIGN_FREE` fixture template.
 */
export function registerTemplateForTests(def: TemplateDefinition): () => void {
  TEMPLATES[def.meta.id] = def;
  TEMPLATE_IDS.push(def.meta.id);
  return () => {
    delete TEMPLATES[def.meta.id];
    const i = TEMPLATE_IDS.indexOf(def.meta.id);
    if (i >= 0) TEMPLATE_IDS.splice(i, 1);
  };
}
