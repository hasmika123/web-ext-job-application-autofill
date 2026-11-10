/**
 * Classic - category ATS, `ATS_STRICT`, ATS-safe (strict). Centred serif header, ruled headings, the traditional
 * look recruiters have read for decades. One column, real text, standard headings, inline item heads, " · "
 * between contact entries (TEMPLATES-DESIGN 6.2). Rules live in the `tpl:classic` block of `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps);
  return (
    <div className="rz-page rz-tpl-classic">
      <Header basics={doc.basics} sep=" · " />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const classic: TemplateDefinition = {
  meta: {
    id: "classic",
    name: "Classic",
    description: "Centred serif header, ruled headings. The traditional look recruiters have read for decades.",
    category: "ats",
    atsNote: "One column, real text, standard headings.",
    capabilities: ATS_STRICT,
    thumb: "classic.png",
    defaults: { fontPair: "source-serif", spacing: "normal" },
  },
  Render,
};
