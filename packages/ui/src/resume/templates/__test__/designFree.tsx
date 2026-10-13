/**
 * TEST ONLY - never registered in production (`registerTemplateForTests` in `registry.ts`). A
 * `DESIGN_FREE` template (two columns, photo slot, every mark, lists, free headings) so the capability
 * test vectors (DESIGN 6.6) can render the same document under both profiles. Only `.rz-*` classes.
 */
import { DESIGN_FREE } from "../../capabilities";
import type { TemplateDefinition, TemplateProps } from "../../types";
import { Header, Photo, Section, renderSections } from "../shared";

function Render({ doc, theme, caps, photoSrc }: TemplateProps) {
  const inSide = (kind: string | null) => !!kind && (caps.sidebarSections as string[]).includes(kind);
  const main = renderSections(doc, theme, caps, (k) => !inSide(k));
  const side = caps.columns === 2 ? renderSections(doc, theme, caps, (k) => inSide(k)) : [];
  return (
    <div className="rz-page rz-tpl-design-free">
      <Photo doc={doc} theme={theme} caps={caps} src={photoSrc} />
      <Header basics={doc.basics} />
      <main className="rz-main">
        {main.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </main>
      <aside className="rz-side">
        {side.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </aside>
    </div>
  );
}

export const designFree: TemplateDefinition = {
  meta: {
    id: "design-free-test",
    name: "Design Free (test)",
    description: "Test-only template declaring the DESIGN_FREE profile.",
    capabilities: DESIGN_FREE,
    thumb: "modern.png",
  },
  Render,
};
