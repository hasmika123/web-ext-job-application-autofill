/**
 * Academic (Harvard-style) - category employer, `ATS_STRICT`, ATS-safe (strict). The university career-centre format:
 * centred name and headings (no rules), " • " between contact entries, organisation and title both in bold with the
 * location and dates right-aligned on their own rows (`org-title` heads for experience and education). Education
 * first for students and new graduates is the user's Swap Section order; the description says so (TEMPLATES-DESIGN
 * 6.7). Rules live in the `tpl:scholar` block of `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps, { layout: { experience: "org-title", education: "org-title" } });
  return (
    <div className="rz-page rz-tpl-scholar">
      <Header basics={doc.basics} sep=" • " />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const scholar: TemplateDefinition = {
  meta: {
    id: "scholar",
    name: "Academic",
    description:
      "The university career-centre format: centred headings, organisation and title in bold with locations and dates on the right. Education first for students and new graduates.",
    category: "employer",
    atsNote: "One column, real text, standard headings.",
    capabilities: ATS_STRICT,
    thumb: "scholar.png",
    defaults: { fontPair: "source-serif", spacing: "normal" },
  },
  Render,
};
