/**
 * `<ResumePreview doc theme templateId caps />` = a scoped `<style>` with the theme variables + the
 * template's render. The editor mounts it inside a page frame; the PDF route passes it to
 * `renderToStaticMarkup` and prepends `styles/resume.css` + the font faces. There are no hooks and
 * no client state, so both are the same string for the same inputs.
 *
 * The capabilities (registry profile, tightened by the admin overrides) decide what is drawn; the
 * caller resolves them with `resolveCapabilities(templateId, config.templates.overrides)`. Without
 * `caps` the template's own registered profile is used.
 *
 * `resume.css` must be on the page (web imports `@kiwiply/ui/styles/resume.css`).
 */
import { getTemplate } from "./registry";
import { resolveTheme } from "./fit";
import { applyCapabilities, sanitizeTheme, themeCss, themeScope } from "./theme";
import type { ResumeDocument, TemplateCapabilities, Theme } from "./types";

export interface ResumePreviewProps {
  doc: ResumeDocument;
  theme?: Partial<Theme> | null;
  templateId?: string | null;
  /** Resolved capabilities (registry + admin overrides). Default: the template's registered profile. */
  caps?: TemplateCapabilities;
  /** Where the photo is drawn from (a BFF route in the editor, a `data:` URI in the PDF). No URL, no photo. */
  photoSrc?: string | null;
  /**
   * Apply the theme's fit ladder step (`theme.fit.step`) before rendering. Default true: the stored
   * step is what the preview and the PDF both show. Pass false to render the Spacing preset itself (step 0).
   */
  applyFit?: boolean;
}

export default function ResumePreview({ doc, theme, templateId, caps, photoSrc, applyFit = true }: ResumePreviewProps) {
  const { Render, meta } = getTemplate(templateId);
  const resolvedCaps = caps ?? meta.capabilities;
  const base = sanitizeTheme(theme);
  const resolved = resolveTheme(base, applyFit ? base.fit.step : 0);
  const drawn = applyCapabilities(resolved, resolvedCaps);
  return (
    <div className="rz-root" data-rz-theme={themeScope(resolved, resolvedCaps)} data-rz-template={meta.id}>
      <style>{themeCss(resolved, resolvedCaps)}</style>
      <Render doc={doc} theme={drawn} caps={resolvedCaps} photoSrc={photoSrc} />
    </div>
  );
}
