/**
 * `<ResumePreview doc theme templateId />` = a scoped `<style>` with the theme variables + the
 * template's render. The editor mounts it inside a page frame; the PDF route passes it to
 * `renderToStaticMarkup` and prepends `styles/resume.css` + the font faces. There are no hooks and
 * no client state, so both are the same string for the same inputs.
 *
 * `resume.css` must be on the page (web imports `@kiwiply/ui/styles/resume.css`).
 */
import { getTemplate } from "./registry";
import { resolveTheme } from "./fit";
import { sanitizeTheme, themeCss, themeScope } from "./theme";
import type { ResumeDocument, Theme } from "./types";

export interface ResumePreviewProps {
  doc: ResumeDocument;
  theme?: Partial<Theme> | null;
  templateId?: string | null;
  /**
   * Apply the theme's fit ladder step (`theme.fit.step`) before rendering. Default true: the stored
   * step is what the preview and the PDF both show. Pass false to render the raw theme values.
   */
  applyFit?: boolean;
}

export default function ResumePreview({ doc, theme, templateId, applyFit = true }: ResumePreviewProps) {
  const base = sanitizeTheme(theme);
  const resolved = applyFit ? resolveTheme(base, base.fit.step) : base;
  const { Render, meta } = getTemplate(templateId);
  return (
    <div className="rz-root" data-rz-theme={themeScope(resolved)} data-rz-template={meta.id}>
      <style>{themeCss(resolved)}</style>
      <Render doc={doc} theme={resolved} />
    </div>
  );
}
