/**
 * Engineer - category employer format, `ATS_STRICT`, ATS-safe (strict). The one-page format tech recruiters see most:
 * centred small-caps header with a " | " contact line and underlined links, ruled small-cap headings, two-line roles
 * (role + dates, employer + location; school + location, degree + dates) and impact-first bullets
 * (TEMPLATES-DESIGN 6.5). One column, real text, standard headings. Rules live in the `tpl:engineer` block of
 * `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps, { layout: { experience: "title-org", education: "org-title" } });
  return (
    <div className="rz-page rz-tpl-engineer">
      <Header basics={doc.basics} sep=" | " />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const engineer: TemplateDefinition = {
  meta: {
    id: "engineer",
    name: "Engineer",
    description:
      "The one-page format tech recruiters see most: centred header, ruled small-cap headings, two-line roles, impact-first bullets (Accomplished X, measured by Y, by doing Z).",
    category: "employer",
    atsNote: "One column, real text, standard headings. Keep it to one page for product and engineering roles.",
    capabilities: ATS_STRICT,
    thumb: "engineer.png",
    defaults: { fontPair: "plex", spacing: "compact" },
  },
  Render,
};
