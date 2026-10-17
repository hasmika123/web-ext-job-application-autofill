/**
 * Sidebar - category styled, profile `{ ...DESIGN_FREE, graphics: false }`, "Design first - less ATS-safe". Two columns:
 * a tinted sidebar on the LEFT (photo slot, stacked contact, skills as tags, languages, certifications, interests) and
 * the main column on the right (TEMPLATES-DESIGN 6.10). The DOM order is header, `main`, then `aside` (reading order and
 * the PDF text layer follow the DOM, so a parser reads the main column first); CSS grid places the aside on the left.
 * Under an admin override `columns: 1` everything is drawn in `main` in document order, contact moves into the header and
 * there is no aside. No icons or graphics anywhere. Rules live in the `tpl:sidebar` block of `styles/resume.css`.
 */
import { DESIGN_FREE, photoShown } from "../capabilities";
import { list, one, type Json } from "../doc";
import type { SectionKind, TemplateCapabilities, TemplateDefinition, TemplateProps } from "../types";
import { ContactLine, Photo, Section, renderSections } from "./shared";

/** `DESIGN_FREE` without graphics: no icons, no skill bars, no decorative art. */
export const SIDEBAR_CAPS: TemplateCapabilities = Object.freeze({ ...DESIGN_FREE, graphics: false });

function Render({ doc, theme, caps, photoSrc }: TemplateProps) {
  const twoColumns = caps.columns === 2;
  const inSide = (kind: SectionKind | null) => twoColumns && !!kind && (caps.sidebarSections as string[]).includes(kind);
  const main = renderSections(doc, theme, caps, { only: (k) => !inSide(k) });
  const side = twoColumns ? renderSections(doc, theme, caps, { only: inSide, skills: "list" }) : [];

  const name = one(doc.basics, "name");
  const headline = one(doc.basics, "headline");
  // The photo slot exists only when the profile, the theme, the document and the caller all provide one.
  const photo = photoSrc && photoShown(doc, theme, caps) ? <Photo doc={doc} theme={theme} caps={caps} src={photoSrc} /> : null;
  const contact = <ContactLine basics={doc.basics} stacked={twoColumns} />;
  const hasContact = hasContactEntries(doc.basics);
  const hasSide = twoColumns && (side.length > 0 || hasContact || photo !== null);

  return (
    <div className={hasSide ? "rz-page rz-tpl-sidebar" : "rz-page rz-tpl-sidebar rz-no-side"}>
      <header className="rz-header">
        {!twoColumns ? photo : null}
        {name ? <h1 className="rz-name">{name}</h1> : null}
        {headline ? <p className="rz-headline">{headline}</p> : null}
        {!twoColumns ? contact : null}
      </header>
      <main className="rz-main">
        {main.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
      {hasSide ? (
        <aside className="rz-side">
          {photo}
          {hasContact ? (
            <section className="rz-section rz-section-contact">
              <h2 className="rz-section-title">Contact</h2>
              <div className="rz-section-body">{contact}</div>
            </section>
          ) : null}
          {side.map((s) => (
            <Section key={s.id} section={s} />
          ))}
        </aside>
      ) : null}
    </div>
  );
}

/** Whether `ContactLine` would draw anything (email, phone, location or a link with a url). */
function hasContactEntries(basics: Json): boolean {
  return !!(one(basics, "email") || one(basics, "phone") || one(basics, "location") || list(basics, "links").some((l) => one(l, "url")));
}

export const sidebar: TemplateDefinition = {
  meta: {
    id: "sidebar",
    name: "Sidebar",
    description: "Two columns with a tinted sidebar for contact, skills and languages, and room for a photo. Made for portfolios and direct emails.",
    category: "styled",
    atsNote:
      "Two columns and a photo slot. Modern parsers usually cope, but column order and photos are the top causes of lost fields. Not for conservative employers.",
    capabilities: SIDEBAR_CAPS,
    thumb: "sidebar.png",
    defaults: { fontPair: "inter", spacing: "normal" },
  },
  Render,
};
