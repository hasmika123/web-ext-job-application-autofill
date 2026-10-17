/**
 * Compact - category ATS, `ATS_STRICT`, ATS-safe (strict). Tight sans layout that fits a full career on one page
 * without shrinking the font below 9 pt: small headings on a thin grey rule, tight rhythm, 1.3 line height. One
 * column, real text, standard headings, inline item heads (TEMPLATES-DESIGN 6.3). Rules live in the `tpl:compact`
 * block of `styles/resume.css`; every vertical gap scales with `--rz-density`, so the fit ladder bites.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps);
  return (
    <div className="rz-page rz-tpl-compact">
      <Header basics={doc.basics} />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const compact: TemplateDefinition = {
  meta: {
    id: "compact",
    name: "Compact",
    description: "Tight sans layout that fits a full career on one page without shrinking the font below 9 pt.",
    category: "ats",
    atsNote: "One column, real text, standard headings. Dense but every line is parseable.",
    capabilities: ATS_STRICT,
    thumb: "compact.png",
    defaults: { fontPair: "inter", spacing: "compact" },
  },
  Render,
};
