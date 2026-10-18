/**
 * Consulting & Finance - category employer, `ATS_STRICT` tightened to one page with a fixed Page Length, ATS-safe
 * (strict). The dense one-page classic of consulting, banking and MBA recruiting: firm and school in bold, titles in
 * italics, numbers first. Centred uppercase serif name, ruled sections, `org-title` two-line heads for experience and
 * education, location and dates in ink at the body size (TEMPLATES-DESIGN 6.6). Education first is the convention for
 * recent graduates (the user's Swap Section order; the description says so). Rules live in the `tpl:consultant` block
 * of `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateCapabilities, TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

/** `ATS_STRICT` tightened: strictly one page, Page Length fixed. A frozen spread, never `tightenCapabilities` at load. */
export const CONSULTANT_CAPS: TemplateCapabilities = Object.freeze({
  ...ATS_STRICT,
  maxPages: 1,
  theme: Object.freeze({ ...ATS_STRICT.theme, pageLength: false }),
});

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps, { layout: { experience: "org-title", education: "org-title" } });
  return (
    <div className="rz-page rz-tpl-consultant">
      <Header basics={doc.basics} />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const consultant: TemplateDefinition = {
  meta: {
    id: "consultant",
    name: "Consulting & Finance",
    description:
      "The dense one-page classic used in consulting, banking and MBA recruiting: firm and school in bold, titles in italics, numbers first. Put Education first if you graduated in the last three years.",
    category: "employer",
    atsNote: "One column, real text, standard headings, strictly one page.",
    capabilities: CONSULTANT_CAPS,
    thumb: "consultant.png",
    defaults: { fontPair: "garamond", spacing: "compact" },
  },
  Render,
};
