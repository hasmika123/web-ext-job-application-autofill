/**
 * Statement - category styled, `HYBRID`, "Mostly ATS-safe". A bold accent band for the name, accent-ruled headings,
 * rich text and lists. One column and real text, no icons, no photo, no second column; the header sits in a tinted
 * band, so it is labelled honestly and never carries the "ATS Friendly" chip (TEMPLATES-DESIGN 6.9). The band stays
 * inside the page margins (never bled into the `@page` margin, which print would clip). Rules live in the
 * `tpl:statement` block of `styles/resume.css`.
 */
import { HYBRID } from "../capabilities";
import type { TemplateDefinition, TemplateProps } from "../types";
import { Header, Section, renderSections } from "./shared";

function Render({ doc, theme, caps }: TemplateProps) {
  const sections = renderSections(doc, theme, caps);
  return (
    <div className="rz-page rz-tpl-statement">
      <Header basics={doc.basics} sep=" · " />
      <main className="rz-main">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
    </div>
  );
}

export const statement: TemplateDefinition = {
  meta: {
    id: "statement",
    name: "Statement",
    description: "A bold colour band for your name, accent headings, rich text and lists. Modern without columns or icons.",
    category: "styled",
    atsNote:
      "One column and real text, but colour, italics, links and lists are on and the header sits in a tinted band. Fine for text parsers; choose an ATS template for conservative employers.",
    capabilities: HYBRID,
    thumb: "statement.png",
    defaults: { fontPair: "inter", spacing: "normal" },
  },
  Render,
};
