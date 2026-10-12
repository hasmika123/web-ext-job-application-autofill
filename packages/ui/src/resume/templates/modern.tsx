/**
 * Modern - single column, sans. ATS-friendly: one reading order, real text, conventional section
 * titles, no tables, contact info in the body (not a header). Its capability profile is `ATS_STRICT`
 * (bold only, no photo, no lists, plain colours, standard headings): the shared renderer applies it.
 *
 * A template is `(doc, theme, caps) -> markup` and nothing else: no hooks, no effects, no inline styles,
 * only `.rz-*` classes from `styles/resume.css`.
 */
import { ATS_STRICT } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps);
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
    description: "Clean single column with a rule under each heading. Safe for every ATS.",
    capabilities: ATS_STRICT,
    thumb: "modern.png",
  },
  Render,
};
