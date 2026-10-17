/**
 * Executive - category employer, `ATS_STRICT`, ATS-safe (strict). Two-page leadership format: left-aligned name with an
 * uppercase headline over a heavy rule, summary and skills up top, roles as title + dates then organisation +
 * location (`title-org`), education on one line (`inline`), generous spacing. For 10+ years of experience
 * (TEMPLATES-DESIGN 6.8). Rules live in the `tpl:executive` block of `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps, { layout: { experience: "title-org", education: "inline" } });
  return (
    <div className="rz-page rz-tpl-executive">
      <Header basics={doc.basics} />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const executive: TemplateDefinition = {
  meta: {
    id: "executive",
    name: "Executive",
    description: "Two-page leadership format: summary and skills up top, roles with scope and results. For 10+ years of experience.",
    category: "employer",
    atsNote: "One column, real text, standard headings. Comfortable on two pages.",
    capabilities: ATS_STRICT,
    thumb: "executive.png",
    defaults: { fontPair: "georgia-arial", spacing: "spacious" },
  },
  Render,
};
