/**
 * Modern - single column, sans, an accent rule under each section heading. ATS-safe: one reading
 * order, real text, conventional section titles, no tables, contact info in the body (not a header).
 *
 * A template is `(doc, theme) -> markup` and nothing else: no hooks, no effects, no inline styles,
 * only `.rz-*` classes from `styles/resume.css`.
 */
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme }: TemplateProps) {
  const sections = renderSections(doc, theme.dateStyle);
  return (
    <div className="rz-page rz-tpl-modern">
      <Header basics={doc.basics} />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const modern: TemplateDefinition = {
  meta: {
    id: "modern",
    name: "Modern",
    description: "Clean single column with an accent rule under each heading. Safe for every ATS.",
    atsSafe: true,
    supports: {
      columns: 1,
      sidebarSections: [],
      photo: false,
      maxSkillGroups: 0,
      dateStyle: ["range", "year"],
    },
    thumb: "modern.png",
  },
  Render,
};
