/**
 * Simple - category ATS, `ATS_STRICT`, ATS-safe (strict). Plain and quiet, like a well-made Word document:
 * left-aligned name in the display face, sentence-case bold headings with no rule, no colour, inline item heads,
 * dates in ink. One column, real text, standard headings (TEMPLATES-DESIGN 6.4). Rules live in the `tpl:simple`
 * block of `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps);
  return (
    <div className="rz-page rz-tpl-simple">
      <Header basics={doc.basics} />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const simple: TemplateDefinition = {
  meta: {
    id: "simple",
    name: "Simple",
    description: "Plain and quiet, like a well-made Word document. Nothing between the reader and the words.",
    category: "ats",
    atsNote: "One column, no rules or colour, standard headings. The most conservative choice.",
    capabilities: ATS_STRICT,
    thumb: "simple.png",
    defaults: { fontPair: "georgia-arial", spacing: "normal" },
  },
  Render,
};
